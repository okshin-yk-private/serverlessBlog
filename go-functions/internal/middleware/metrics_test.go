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
	"bytes"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// emfDocument represents the parsed EMF JSON structure for testing
type emfDocument struct {
	raw       map[string]interface{}
	aws       map[string]interface{}
	directive map[string]interface{}
}

// parseEMF parses EMF output and returns a structured document for testing
func parseEMF(t *testing.T, output string) *emfDocument {
	t.Helper()

	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(output), &raw); err != nil {
		t.Fatalf("Failed to parse EMF output: %v", err)
	}

	awsObj, ok := raw["_aws"].(map[string]interface{})
	if !ok {
		t.Fatal("_aws metadata object not found or invalid type")
	}

	cwMetrics, ok := awsObj["CloudWatchMetrics"].([]interface{})
	if !ok || len(cwMetrics) == 0 {
		t.Fatal("CloudWatchMetrics array not found or empty")
	}

	directive, ok := cwMetrics[0].(map[string]interface{})
	if !ok {
		t.Fatal("MetricDirective not found or invalid type")
	}

	return &emfDocument{
		raw:       raw,
		aws:       awsObj,
		directive: directive,
	}
}

// getTimestamp extracts the timestamp from the EMF document
func (e *emfDocument) getTimestamp(t *testing.T) int64 {
	t.Helper()
	ts, ok := e.aws["Timestamp"].(float64)
	if !ok {
		t.Fatal("Timestamp not found or invalid type")
	}
	return int64(ts)
}

// getMetricValue extracts a metric value from the EMF document
func (e *emfDocument) getMetricValue(t *testing.T, name string) float64 {
	t.Helper()
	val, ok := e.raw[name].(float64)
	if !ok {
		t.Fatalf("Metric %q not found or invalid type", name)
	}
	return val
}

// getDimensionValue extracts a dimension value from the EMF document
func (e *emfDocument) getDimensionValue(t *testing.T, name string) string {
	t.Helper()
	val, ok := e.raw[name].(string)
	if !ok {
		t.Fatalf("Dimension %q not found or invalid type", name)
	}
	return val
}

// getNamespace extracts the namespace from the directive
func (e *emfDocument) getNamespace(t *testing.T) string {
	t.Helper()
	ns, ok := e.directive["Namespace"].(string)
	if !ok {
		t.Fatal("Namespace not found or invalid type")
	}
	return ns
}

// getDimensionKeys extracts dimension keys from the directive
func (e *emfDocument) getDimensionKeys(t *testing.T) map[string]bool {
	t.Helper()
	dims, ok := e.directive["Dimensions"].([]interface{})
	if !ok || len(dims) == 0 {
		t.Fatal("Dimensions array not found or empty")
	}

	dimSet, ok := dims[0].([]interface{})
	if !ok {
		t.Fatal("DimensionSet not found or invalid type")
	}

	keys := make(map[string]bool)
	for _, d := range dimSet {
		key, ok := d.(string)
		if !ok {
			t.Fatal("Dimension key is not a string")
		}
		keys[key] = true
	}
	return keys
}

// getMetricDefinitions extracts metric definitions from the directive
func (e *emfDocument) getMetricDefinitions(t *testing.T) map[string]string {
	t.Helper()
	metrics, ok := e.directive["Metrics"].([]interface{})
	if !ok {
		t.Fatal("Metrics array not found or invalid type")
	}

	defs := make(map[string]string)
	for _, m := range metrics {
		def, ok := m.(map[string]interface{})
		if !ok {
			t.Fatal("MetricDefinition not found or invalid type")
		}
		name, ok := def["Name"].(string)
		if !ok {
			t.Fatal("Metric Name not found or invalid type")
		}
		unit, ok := def["Unit"].(string)
		if !ok {
			t.Fatal("Metric Unit not found or invalid type")
		}
		defs[name] = unit
	}
	return defs
}

// getMetricsCount returns the number of metrics in the directive
func (e *emfDocument) getMetricsCount(t *testing.T) int {
	t.Helper()
	metrics, ok := e.directive["Metrics"].([]interface{})
	if !ok {
		t.Fatal("Metrics array not found or invalid type")
	}
	return len(metrics)
}

// TestNewMetrics verifies that NewMetrics creates a properly configured metrics instance
func TestNewMetrics(t *testing.T) {
	tests := []struct {
		name        string
		namespace   string
		serviceName string
		wantNs      string
		wantSvc     string
	}{
		{
			name:        "with valid namespace and service",
			namespace:   "ServerlessBlog",
			serviceName: "CreatePost",
			wantNs:      "ServerlessBlog",
			wantSvc:     "CreatePost",
		},
		{
			name:        "with empty namespace uses default",
			namespace:   "",
			serviceName: "Login",
			wantNs:      "Lambda",
			wantSvc:     "Login",
		},
		{
			name:        "with empty service name uses unknown",
			namespace:   "TestNs",
			serviceName: "",
			wantNs:      "TestNs",
			wantSvc:     "unknown",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := NewMetrics(tt.namespace, tt.serviceName)
			if m == nil {
				t.Fatal("NewMetrics returned nil")
			}
			if m.Namespace() != tt.wantNs {
				t.Errorf("Namespace() = %q, want %q", m.Namespace(), tt.wantNs)
			}
			if m.ServiceName() != tt.wantSvc {
				t.Errorf("ServiceName() = %q, want %q", m.ServiceName(), tt.wantSvc)
			}
		})
	}
}

// TestMetricsAddMetric verifies adding metrics with different units
func TestMetricsAddMetric(t *testing.T) {
	tests := []struct {
		name   string
		metric string
		value  float64
		unit   MetricUnit
	}{
		{
			name:   "add count metric",
			metric: "RequestCount",
			value:  1,
			unit:   UnitCount,
		},
		{
			name:   "add latency metric",
			metric: "Latency",
			value:  150.5,
			unit:   UnitMilliseconds,
		},
		{
			name:   "add error rate metric",
			metric: "ErrorRate",
			value:  0.05,
			unit:   UnitPercent,
		},
		{
			name:   "add zero value metric",
			metric: "ZeroMetric",
			value:  0,
			unit:   UnitCount,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			m := NewMetricsWithWriter("TestNs", "TestSvc", &buf)
			m.AddMetric(tt.metric, tt.value, tt.unit)
			m.Flush()

			output := buf.String()
			if output == "" {
				t.Fatal("Flush produced no output")
			}

			emf := parseEMF(t, output)
			val := emf.getMetricValue(t, tt.metric)
			if val != tt.value {
				t.Errorf("Metric value = %v, want %v", val, tt.value)
			}
		})
	}
}

// TestMetricsAddDimension verifies adding dimensions
func TestMetricsAddDimension(t *testing.T) {
	var buf bytes.Buffer
	m := NewMetricsWithWriter("TestNs", "TestSvc", &buf)
	m.AddDimension("Operation", "CreatePost")
	m.AddDimension("Environment", "production")
	m.AddMetric("RequestCount", 1, UnitCount)
	m.Flush()

	emf := parseEMF(t, buf.String())

	// Verify dimensions are present as top-level members
	if emf.getDimensionValue(t, "Operation") != "CreatePost" {
		t.Errorf("Dimension Operation = %v, want CreatePost", emf.raw["Operation"])
	}
	if emf.getDimensionValue(t, "Environment") != "production" {
		t.Errorf("Dimension Environment = %v, want production", emf.raw["Environment"])
	}

	// Check that dimensions array contains our dimension keys
	dimKeys := emf.getDimensionKeys(t)
	if !dimKeys["Operation"] {
		t.Error("Dimension 'Operation' not found in DimensionSet")
	}
	if !dimKeys["Environment"] {
		t.Error("Dimension 'Environment' not found in DimensionSet")
	}
}

// TestMetricsEMFFormat verifies the complete EMF output format
func TestMetricsEMFFormat(t *testing.T) {
	var buf bytes.Buffer
	m := NewMetricsWithWriter("ServerlessBlog", "GetPost", &buf)
	m.AddDimension("FunctionName", "GetPost")
	m.AddMetric("Latency", 25.5, UnitMilliseconds)
	m.AddMetric("RequestCount", 1, UnitCount)
	m.Flush()

	emf := parseEMF(t, buf.String())

	// Verify Timestamp exists and is a valid number
	timestamp := emf.getTimestamp(t)
	if timestamp <= 0 {
		t.Error("Timestamp should be positive")
	}

	// Verify Namespace
	if emf.getNamespace(t) != "ServerlessBlog" {
		t.Errorf("Namespace = %v, want ServerlessBlog", emf.getNamespace(t))
	}

	// Verify Dimensions array is not empty
	dimKeys := emf.getDimensionKeys(t)
	if len(dimKeys) == 0 {
		t.Error("Dimensions array is empty")
	}

	// Verify Metrics array
	metricDefs := emf.getMetricDefinitions(t)
	if len(metricDefs) != 2 {
		t.Errorf("Metrics length = %d, want 2", len(metricDefs))
	}

	// Verify metric definitions
	if metricDefs["Latency"] != "Milliseconds" {
		t.Errorf("Latency unit = %v, want Milliseconds", metricDefs["Latency"])
	}
	if metricDefs["RequestCount"] != "Count" {
		t.Errorf("RequestCount unit = %v, want Count", metricDefs["RequestCount"])
	}
}

// TestMetricsFlushClearsState verifies that Flush clears the metrics state
func TestMetricsFlushClearsState(t *testing.T) {
	var buf bytes.Buffer
	m := NewMetricsWithWriter("TestNs", "TestSvc", &buf)
	m.AddMetric("FirstMetric", 1, UnitCount)
	m.Flush()

	// Clear buffer and add new metric
	buf.Reset()
	m.AddMetric("SecondMetric", 2, UnitCount)
	m.Flush()

	var emf map[string]interface{}
	if err := json.Unmarshal(buf.Bytes(), &emf); err != nil {
		t.Fatalf("Failed to parse EMF output: %v", err)
	}

	// Should only have SecondMetric, not FirstMetric
	if _, ok := emf["FirstMetric"]; ok {
		t.Error("FirstMetric should not be present after Flush")
	}
	if _, ok := emf["SecondMetric"]; !ok {
		t.Error("SecondMetric should be present")
	}
}

// TestMetricsNoFlushOnEmpty verifies that Flush does nothing when no metrics are added
func TestMetricsNoFlushOnEmpty(t *testing.T) {
	var buf bytes.Buffer
	m := NewMetricsWithWriter("TestNs", "TestSvc", &buf)
	m.Flush()

	if buf.Len() != 0 {
		t.Error("Flush should not produce output when no metrics are added")
	}
}

// TestMetricUnits verifies all supported metric units
func TestMetricUnits(t *testing.T) {
	tests := []struct {
		unit MetricUnit
		want string
	}{
		{UnitSeconds, "Seconds"},
		{UnitMicroseconds, "Microseconds"},
		{UnitMilliseconds, "Milliseconds"},
		{UnitBytes, "Bytes"},
		{UnitKilobytes, "Kilobytes"},
		{UnitMegabytes, "Megabytes"},
		{UnitGigabytes, "Gigabytes"},
		{UnitTerabytes, "Terabytes"},
		{UnitBits, "Bits"},
		{UnitKilobits, "Kilobits"},
		{UnitMegabits, "Megabits"},
		{UnitGigabits, "Gigabits"},
		{UnitTerabits, "Terabits"},
		{UnitPercent, "Percent"},
		{UnitCount, "Count"},
		{UnitBytesPerSecond, "Bytes/Second"},
		{UnitKilobytesPerSecond, "Kilobytes/Second"},
		{UnitMegabytesPerSecond, "Megabytes/Second"},
		{UnitGigabytesPerSecond, "Gigabytes/Second"},
		{UnitTerabytesPerSecond, "Terabytes/Second"},
		{UnitBitsPerSecond, "Bits/Second"},
		{UnitKilobitsPerSecond, "Kilobits/Second"},
		{UnitMegabitsPerSecond, "Megabits/Second"},
		{UnitGigabitsPerSecond, "Gigabits/Second"},
		{UnitTerabitsPerSecond, "Terabits/Second"},
		{UnitCountPerSecond, "Count/Second"},
		{UnitNone, "None"},
	}

	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			if tt.unit.String() != tt.want {
				t.Errorf("Unit.String() = %q, want %q", tt.unit.String(), tt.want)
			}
		})
	}
}

// TestEmitMetric verifies the standalone EmitMetric function
func TestEmitMetric(t *testing.T) {
	var buf bytes.Buffer

	EmitMetricWithWriter("TestNamespace", "Latency", 100.5, UnitMilliseconds, &buf)

	output := buf.String()
	if output == "" {
		t.Fatal("EmitMetric produced no output")
	}

	emf := parseEMF(t, output)

	// Verify metric value
	if emf.getMetricValue(t, "Latency") != 100.5 {
		t.Errorf("Latency = %v, want 100.5", emf.raw["Latency"])
	}

	// Verify namespace
	if emf.getNamespace(t) != "TestNamespace" {
		t.Errorf("Namespace = %v, want TestNamespace", emf.getNamespace(t))
	}
}

// TestMetricsTimestamp verifies that timestamp is set correctly
func TestMetricsTimestamp(t *testing.T) {
	var buf bytes.Buffer
	m := NewMetricsWithWriter("TestNs", "TestSvc", &buf)

	beforeMs := time.Now().UnixMilli()
	m.AddMetric("Test", 1, UnitCount)
	m.Flush()
	afterMs := time.Now().UnixMilli()

	emf := parseEMF(t, buf.String())
	timestamp := emf.getTimestamp(t)

	if timestamp < beforeMs || timestamp > afterMs {
		t.Errorf("Timestamp %d not in expected range [%d, %d]", timestamp, beforeMs, afterMs)
	}
}

// TestMetricsServiceDimension verifies that service name is automatically added as dimension
func TestMetricsServiceDimension(t *testing.T) {
	var buf bytes.Buffer
	m := NewMetricsWithWriter("TestNs", "MyService", &buf)
	m.AddMetric("Test", 1, UnitCount)
	m.Flush()

	emf := parseEMF(t, buf.String())

	// Service should be present as a dimension value
	if emf.getDimensionValue(t, "Service") != "MyService" {
		t.Errorf("Service dimension = %v, want MyService", emf.raw["Service"])
	}
}

// TestMetricsOutputIsValidJSON verifies output is valid single-line JSON (required for CloudWatch Logs)
func TestMetricsOutputIsValidJSON(t *testing.T) {
	var buf bytes.Buffer
	m := NewMetricsWithWriter("TestNs", "TestSvc", &buf)
	m.AddDimension("Key", "Value")
	m.AddMetric("Metric1", 1, UnitCount)
	m.AddMetric("Metric2", 2, UnitMilliseconds)
	m.Flush()

	output := buf.String()

	// Should be single line (no embedded newlines in the JSON)
	if strings.Count(output, "\n") > 1 {
		t.Error("EMF output should be single-line JSON")
	}

	// Should be valid JSON
	var emf map[string]interface{}
	if err := json.Unmarshal([]byte(strings.TrimSpace(output)), &emf); err != nil {
		t.Fatalf("EMF output is not valid JSON: %v", err)
	}
}

// TestMetricsMaxMetrics verifies handling of maximum metrics limit
func TestMetricsMaxMetrics(t *testing.T) {
	var buf bytes.Buffer
	m := NewMetricsWithWriter("TestNs", "TestSvc", &buf)

	// Add 100 metrics (EMF limit)
	for i := 0; i < 100; i++ {
		m.AddMetric("Metric"+string(rune('A'+i%26))+string(rune('0'+i/26)), float64(i), UnitCount)
	}
	m.Flush()

	emf := parseEMF(t, buf.String())
	metricsCount := emf.getMetricsCount(t)

	// Should have at most 100 metrics per EMF spec
	if metricsCount > 100 {
		t.Errorf("Metrics count = %d, should not exceed 100", metricsCount)
	}
}
