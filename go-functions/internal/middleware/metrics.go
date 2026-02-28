// Package middleware provides HTTP middleware utilities for Lambda handlers.
//
// Requirement 2.8: CloudWatch Embedded Metrics Format（EMF）出力用ミドルウェア
//   - リクエスト数、レイテンシ、エラー率のカスタムメトリクス出力
//
// Requirement 8.3: CloudWatch EMFを使用したカスタムメトリクス
//   - 各Go Lambda関数は、リクエスト数、レイテンシ、エラー率のために
//     CloudWatch EMFを使用してカスタムメトリクスを出力
package middleware

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"
	"time"
)

// MaxMetricsPerEMF is the maximum number of metrics allowed per EMF document
const MaxMetricsPerEMF = 100

// defaultServiceName is the default service name used when not specified
const defaultServiceName = "unknown"

// MetricUnit represents CloudWatch metric units
type MetricUnit string

// CloudWatch metric units as defined in AWS documentation
const (
	UnitSeconds            MetricUnit = "Seconds"
	UnitMicroseconds       MetricUnit = "Microseconds"
	UnitMilliseconds       MetricUnit = "Milliseconds"
	UnitBytes              MetricUnit = "Bytes"
	UnitKilobytes          MetricUnit = "Kilobytes"
	UnitMegabytes          MetricUnit = "Megabytes"
	UnitGigabytes          MetricUnit = "Gigabytes"
	UnitTerabytes          MetricUnit = "Terabytes"
	UnitBits               MetricUnit = "Bits"
	UnitKilobits           MetricUnit = "Kilobits"
	UnitMegabits           MetricUnit = "Megabits"
	UnitGigabits           MetricUnit = "Gigabits"
	UnitTerabits           MetricUnit = "Terabits"
	UnitPercent            MetricUnit = "Percent"
	UnitCount              MetricUnit = "Count"
	UnitBytesPerSecond     MetricUnit = "Bytes/Second"
	UnitKilobytesPerSecond MetricUnit = "Kilobytes/Second"
	UnitMegabytesPerSecond MetricUnit = "Megabytes/Second"
	UnitGigabytesPerSecond MetricUnit = "Gigabytes/Second"
	UnitTerabytesPerSecond MetricUnit = "Terabytes/Second"
	UnitBitsPerSecond      MetricUnit = "Bits/Second"
	UnitKilobitsPerSecond  MetricUnit = "Kilobits/Second"
	UnitMegabitsPerSecond  MetricUnit = "Megabits/Second"
	UnitGigabitsPerSecond  MetricUnit = "Gigabits/Second"
	UnitTerabitsPerSecond  MetricUnit = "Terabits/Second"
	UnitCountPerSecond     MetricUnit = "Count/Second"
	UnitNone               MetricUnit = "None"
)

// String returns the string representation of the MetricUnit
func (u MetricUnit) String() string {
	return string(u)
}

// metricDefinition represents a single metric definition in EMF format
type metricDefinition struct {
	Name string `json:"Name"`
	Unit string `json:"Unit"`
}

// metricDirective represents the MetricDirective in EMF format
type metricDirective struct {
	Namespace  string             `json:"Namespace"`
	Dimensions [][]string         `json:"Dimensions"`
	Metrics    []metricDefinition `json:"Metrics"`
}

// awsMetadata represents the _aws metadata object in EMF format
type awsMetadata struct {
	Timestamp         int64             `json:"Timestamp"`
	CloudWatchMetrics []metricDirective `json:"CloudWatchMetrics"`
}

// Metrics provides CloudWatch EMF metrics functionality
type Metrics struct {
	namespace   string
	serviceName string
	writer      io.Writer
	mu          sync.Mutex

	// Current metrics batch
	dimensions  map[string]string
	metrics     map[string]metricEntry
	metricOrder []string // Preserve order for consistent output
}

// metricEntry stores a metric value and its unit
type metricEntry struct {
	value float64
	unit  MetricUnit
}

// NewMetrics creates a new Metrics instance with the given namespace and service name
func NewMetrics(namespace, serviceName string) *Metrics {
	return NewMetricsWithWriter(namespace, serviceName, os.Stdout)
}

// NewMetricsWithWriter creates a new Metrics instance with a custom writer (for testing)
func NewMetricsWithWriter(namespace, serviceName string, w io.Writer) *Metrics {
	if namespace == "" {
		namespace = "Lambda"
	}
	if serviceName == "" {
		serviceName = defaultServiceName
	}

	m := &Metrics{
		namespace:   namespace,
		serviceName: serviceName,
		writer:      w,
		dimensions:  make(map[string]string),
		metrics:     make(map[string]metricEntry),
		metricOrder: make([]string, 0),
	}

	// Add service name as a default dimension
	m.dimensions["Service"] = serviceName

	return m
}

// Namespace returns the configured namespace
func (m *Metrics) Namespace() string {
	return m.namespace
}

// ServiceName returns the configured service name
func (m *Metrics) ServiceName() string {
	return m.serviceName
}

// AddDimension adds a dimension to the metrics
func (m *Metrics) AddDimension(key, value string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.dimensions[key] = value
}

// AddMetric adds a metric with the specified name, value, and unit
func (m *Metrics) AddMetric(name string, value float64, unit MetricUnit) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Track order for consistent output
	if _, exists := m.metrics[name]; !exists {
		m.metricOrder = append(m.metricOrder, name)
	}

	// Enforce max metrics limit
	if len(m.metrics) >= MaxMetricsPerEMF {
		return
	}

	m.metrics[name] = metricEntry{
		value: value,
		unit:  unit,
	}
}

// Flush writes the EMF document to the writer and clears the current metrics
func (m *Metrics) Flush() {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Don't output anything if there are no metrics
	if len(m.metrics) == 0 {
		return
	}

	// Build the EMF document
	emf := m.buildEMFDocument()

	// Serialize to JSON (single line for CloudWatch Logs)
	jsonBytes, err := json.Marshal(emf)
	if err != nil {
		// Log error but don't fail
		return
	}

	// Write to output with newline
	// Error is intentionally ignored as there's no recovery path for log output
	//nolint:errcheck // Best-effort logging to stdout
	fmt.Fprintln(m.writer, string(jsonBytes))

	// Clear metrics for next batch (keep dimensions)
	m.metrics = make(map[string]metricEntry)
	m.metricOrder = make([]string, 0)
}

// buildEMFDocument creates the EMF JSON structure
func (m *Metrics) buildEMFDocument() map[string]interface{} {
	// Build dimension keys array
	dimKeys := make([]string, 0, len(m.dimensions))
	for key := range m.dimensions {
		dimKeys = append(dimKeys, key)
	}

	// Build metric definitions
	metricDefs := make([]metricDefinition, 0, len(m.metrics))
	for _, name := range m.metricOrder {
		entry := m.metrics[name]
		metricDefs = append(metricDefs, metricDefinition{
			Name: name,
			Unit: entry.unit.String(),
		})
	}

	// Build the EMF structure
	emf := map[string]interface{}{
		"_aws": awsMetadata{
			Timestamp: time.Now().UnixMilli(),
			CloudWatchMetrics: []metricDirective{
				{
					Namespace:  m.namespace,
					Dimensions: [][]string{dimKeys},
					Metrics:    metricDefs,
				},
			},
		},
	}

	// Add dimension values as top-level members
	for key, value := range m.dimensions {
		emf[key] = value
	}

	// Add metric values as top-level members
	for name, entry := range m.metrics {
		emf[name] = entry.value
	}

	return emf
}

// EmitMetric is a convenience function to emit a single metric immediately
func EmitMetric(namespace, name string, value float64, unit MetricUnit) {
	EmitMetricWithWriter(namespace, name, value, unit, os.Stdout)
}

// EmitMetricWithWriter emits a single metric to the specified writer
func EmitMetricWithWriter(namespace, name string, value float64, unit MetricUnit, w io.Writer) {
	m := NewMetricsWithWriter(namespace, defaultServiceName, w)
	m.AddMetric(name, value, unit)
	m.Flush()
}
