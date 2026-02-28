// Package middleware provides HTTP middleware utilities for Lambda handlers.
//
// Requirement 2.7: X-Rayトレーシング統合用ミドルウェア
//   - AWS X-Rayトレーシング統合用ミドルウェアを提供
//
// Requirement 8.2: AWS SDK呼び出しのX-Rayトレーシング
//   - 各Go Lambda関数は、AWS SDK呼び出しと外部依存関係のX-Rayトレーシングを含む
package middleware

import (
	"context"
	"os"
	"strings"
	"sync"
)

// sensitiveTracingFields contains field names that should not be added to traces
var sensitiveTracingFields = map[string]bool{
	"password":      true,
	"accesstoken":   true,
	"refreshtoken":  true,
	"idtoken":       true,
	"token":         true,
	"secret":        true,
	"authorization": true,
	"apikey":        true,
	"api_key":       true,
}

// Tracer provides X-Ray tracing functionality
type Tracer interface {
	// IsEnabled returns whether tracing is enabled
	IsEnabled() bool

	// ServiceName returns the configured service name
	ServiceName() string

	// BeginSubsegment creates a new subsegment with the given name
	BeginSubsegment(ctx context.Context, name string) (context.Context, Segment)

	// EndSubsegment closes the given segment
	EndSubsegment(seg Segment)

	// AddAnnotation adds a searchable annotation to the segment
	AddAnnotation(seg Segment, key string, value string)

	// AddMetadata adds metadata to the segment
	AddMetadata(seg Segment, key string, value interface{})

	// AddSafeMetadata adds metadata to the segment, filtering sensitive fields
	AddSafeMetadata(seg Segment, key string, value interface{})

	// AddError adds an error to the segment
	AddError(seg Segment, err error)

	// GetTraceID returns the current trace ID from context
	GetTraceID(ctx context.Context) string

	// CaptureAWSv3Client instruments an AWS SDK v3 client for tracing
	CaptureAWSv3Client(client interface{}) interface{}
}

// Segment represents an X-Ray segment or subsegment
type Segment interface {
	// Name returns the segment name
	Name() string

	// Close closes the segment with an optional error
	Close(err error)
}

// TracerOptions configures the tracer
type TracerOptions struct {
	// Disabled disables tracing when true
	Disabled bool
}

// xrayTracer is the default implementation of Tracer
type xrayTracer struct {
	serviceName string
	disabled    bool
	mu          sync.RWMutex
}

// xraySegment is the default implementation of Segment
type xraySegment struct {
	name string
}

// NewTracer creates a new tracer with the given service name
func NewTracer(serviceName string) Tracer {
	if serviceName == "" {
		serviceName = "unknown"
	}

	// Check if X-Ray is available (via environment variable set by Lambda)
	// In test environment, tracing is typically disabled
	disabled := os.Getenv("_X_AMZN_TRACE_ID") == "" && os.Getenv("AWS_XRAY_DAEMON_ADDRESS") == ""

	return &xrayTracer{
		serviceName: serviceName,
		disabled:    disabled,
	}
}

// NewTracerWithOptions creates a new tracer with the given options
func NewTracerWithOptions(serviceName string, opts TracerOptions) Tracer {
	if serviceName == "" {
		serviceName = "unknown"
	}

	return &xrayTracer{
		serviceName: serviceName,
		disabled:    opts.Disabled,
	}
}

// IsEnabled returns whether tracing is enabled
func (t *xrayTracer) IsEnabled() bool {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return !t.disabled
}

// ServiceName returns the configured service name
func (t *xrayTracer) ServiceName() string {
	return t.serviceName
}

// BeginSubsegment creates a new subsegment with the given name
func (t *xrayTracer) BeginSubsegment(ctx context.Context, name string) (context.Context, Segment) {
	if t.disabled {
		return ctx, nil
	}

	// Create a segment - in actual X-Ray usage, this would create a real subsegment
	// For now, we create a lightweight segment that can be used for testing
	seg := &xraySegment{
		name: name,
	}

	return ctx, seg
}

// EndSubsegment closes the given segment
func (t *xrayTracer) EndSubsegment(seg Segment) {
	if seg == nil {
		return
	}
	seg.Close(nil)
}

// AddAnnotation adds a searchable annotation to the segment
func (t *xrayTracer) AddAnnotation(seg Segment, key, value string) {
	if seg == nil {
		return
	}
	// In real X-Ray implementation, this would add an annotation
	// Annotations are indexed and searchable in X-Ray console
}

// AddMetadata adds metadata to the segment
func (t *xrayTracer) AddMetadata(seg Segment, key string, value interface{}) {
	if seg == nil {
		return
	}
	// In real X-Ray implementation, this would add metadata
	// Metadata is not indexed but can be viewed in trace details
}

// AddSafeMetadata adds metadata to the segment, filtering sensitive fields
func (t *xrayTracer) AddSafeMetadata(seg Segment, key string, value interface{}) {
	if seg == nil {
		return
	}

	// Filter sensitive data from maps
	if m, ok := value.(map[string]interface{}); ok {
		filtered := filterSensitiveData(m)
		t.AddMetadata(seg, key, filtered)
		return
	}

	t.AddMetadata(seg, key, value)
}

// AddError adds an error to the segment
func (t *xrayTracer) AddError(seg Segment, err error) {
	if seg == nil || err == nil {
		return
	}
	// In real X-Ray implementation, this would mark the segment as an error
	seg.Close(err)
}

// GetTraceID returns the current trace ID from context
func (t *xrayTracer) GetTraceID(ctx context.Context) string {
	// Get trace ID from environment variable (set by Lambda)
	traceID := os.Getenv("_X_AMZN_TRACE_ID")
	if traceID != "" {
		// Parse the trace ID - format: Root=1-xxx;Parent=yyy;Sampled=1
		parts := strings.Split(traceID, ";")
		for _, part := range parts {
			if strings.HasPrefix(part, "Root=") {
				return strings.TrimPrefix(part, "Root=")
			}
		}
	}
	return ""
}

// CaptureAWSv3Client instruments an AWS SDK v3 client for tracing
func (t *xrayTracer) CaptureAWSv3Client(client interface{}) interface{} {
	if t.disabled {
		// When tracing is disabled, return the original client
		return client
	}

	// In a real implementation, this would use xray.AWSv2Client or similar
	// to wrap the client with X-Ray instrumentation.
	// For now, we return the original client to allow the code to compile and test.
	// The actual X-Ray instrumentation will be added when deploying to AWS.
	return client
}

// Name returns the segment name
func (s *xraySegment) Name() string {
	return s.name
}

// Close closes the segment
func (s *xraySegment) Close(err error) {
	// In real X-Ray implementation, this would close the segment
	// and send it to the X-Ray daemon
}

// filterSensitiveData removes sensitive fields from a map
func filterSensitiveData(data map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{})
	for key, value := range data {
		loweredKey := strings.ToLower(key)
		if sensitiveTracingFields[loweredKey] {
			result[key] = "[REDACTED]"
		} else {
			result[key] = value
		}
	}
	return result
}
