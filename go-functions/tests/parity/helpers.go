// Package parity provides API parity testing helpers for comparing Go and Node.js/Rust implementations.
//
// Requirements: 7.2, 7.3, 7.5
//   - Go実装とNode.js/Rust実装のレスポンス比較
//   - HTTPステータスコード検証
//   - レスポンスボディ構造検証
//   - エラーメッセージ形式検証
//   - 詳細な差分出力機能
package parity

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"

	"github.com/aws/aws-lambda-go/events"
)

// DiffType represents the type of difference found
type DiffType string

const (
	// DiffTypeStatusCode indicates status code mismatch
	DiffTypeStatusCode DiffType = "STATUS_CODE"
	// DiffTypeBodyStructure indicates body structure mismatch
	DiffTypeBodyStructure DiffType = "BODY_STRUCTURE"
	// DiffTypeErrorMessage indicates error message format mismatch
	DiffTypeErrorMessage DiffType = "ERROR_MESSAGE"
	// DiffTypeHeader indicates header mismatch
	DiffTypeHeader DiffType = "HEADER"
	// DiffTypeMissingField indicates a missing field
	DiffTypeMissingField DiffType = "MISSING_FIELD"
	// DiffTypeExtraField indicates an extra field
	DiffTypeExtraField DiffType = "EXTRA_FIELD"
	// DiffTypeTypeMismatch indicates a type mismatch
	DiffTypeTypeMismatch DiffType = "TYPE_MISMATCH"
	// DiffTypeArrayLength indicates array length difference
	DiffTypeArrayLength DiffType = "ARRAY_LENGTH"
)

// Diff represents a single difference between expected and actual values
type Diff struct {
	Type     DiffType
	Path     string
	Expected string
	Actual   string
	Message  string
}

// CompareResult contains the result of comparing two responses
type CompareResult struct {
	HasDiff bool
	Diffs   []Diff
}

// String formats the CompareResult as a human-readable string
func (r CompareResult) String() string {
	if !r.HasDiff {
		return ""
	}

	var sb strings.Builder
	for _, diff := range r.Diffs {
		sb.WriteString(FormatDiff(diff))
		sb.WriteString("\n")
	}
	return strings.TrimSuffix(sb.String(), "\n")
}

// CompareOptions provides options for comparison
type CompareOptions struct {
	IgnoreFields []string
}

// CompareResponses compares two API Gateway responses and returns the differences
func CompareResponses(goResp, nodeResp events.APIGatewayProxyResponse) CompareResult {
	return CompareResponsesWithOptions(goResp, nodeResp, CompareOptions{})
}

// CompareResponsesWithOptions compares two responses with custom options
func CompareResponsesWithOptions(goResp, nodeResp events.APIGatewayProxyResponse, opts CompareOptions) CompareResult {
	result := CompareResult{
		HasDiff: false,
		Diffs:   []Diff{},
	}

	// Compare status codes
	if goResp.StatusCode != nodeResp.StatusCode {
		result.HasDiff = true
		result.Diffs = append(result.Diffs, Diff{
			Type:     DiffTypeStatusCode,
			Path:     "statusCode",
			Expected: fmt.Sprintf("%d", nodeResp.StatusCode),
			Actual:   fmt.Sprintf("%d", goResp.StatusCode),
			Message:  fmt.Sprintf("Status code mismatch: expected %d, got %d", nodeResp.StatusCode, goResp.StatusCode),
		})
	}

	// Compare bodies
	if goResp.Body != "" && nodeResp.Body != "" {
		bodyDiffs := compareJSONBodies(goResp.Body, nodeResp.Body, opts)
		if len(bodyDiffs) > 0 {
			result.HasDiff = true
			result.Diffs = append(result.Diffs, bodyDiffs...)
		}
	}

	return result
}

// compareJSONBodies compares two JSON bodies and returns differences
func compareJSONBodies(goBody, nodeBody string, opts CompareOptions) []Diff {
	var goData, nodeData interface{}

	if err := json.Unmarshal([]byte(goBody), &goData); err != nil {
		return []Diff{{
			Type:    DiffTypeBodyStructure,
			Path:    "body",
			Message: fmt.Sprintf("Go response body is not valid JSON: %v", err),
		}}
	}

	if err := json.Unmarshal([]byte(nodeBody), &nodeData); err != nil {
		return []Diff{{
			Type:    DiffTypeBodyStructure,
			Path:    "body",
			Message: fmt.Sprintf("Node response body is not valid JSON: %v", err),
		}}
	}

	// Remove ignored fields
	goData = removeIgnoredFields(goData, opts.IgnoreFields)
	nodeData = removeIgnoredFields(nodeData, opts.IgnoreFields)

	return compareValues(goData, nodeData, "body")
}

// removeIgnoredFields removes specified fields from the data structure
func removeIgnoredFields(data interface{}, fields []string) interface{} {
	if len(fields) == 0 {
		return data
	}

	fieldSet := make(map[string]bool)
	for _, f := range fields {
		fieldSet[f] = true
	}

	return removeFieldsRecursive(data, fieldSet)
}

// removeFieldsRecursive recursively removes fields from nested structures
func removeFieldsRecursive(data interface{}, fields map[string]bool) interface{} {
	switch v := data.(type) {
	case map[string]interface{}:
		result := make(map[string]interface{})
		for key, val := range v {
			if !fields[key] {
				result[key] = removeFieldsRecursive(val, fields)
			}
		}
		return result
	case []interface{}:
		result := make([]interface{}, len(v))
		for i, item := range v {
			result[i] = removeFieldsRecursive(item, fields)
		}
		return result
	default:
		return data
	}
}

// compareValues recursively compares two values and returns differences
func compareValues(actual, expected interface{}, path string) []Diff {
	var diffs []Diff

	// Check for type mismatches (special handling for error responses)
	if isErrorResponse(path, expected) && isErrorResponse(path, actual) {
		return compareErrorMessages(actual, expected, path)
	}

	// Check type match
	actualType := reflect.TypeOf(actual)
	expectedType := reflect.TypeOf(expected)

	if actualType != expectedType {
		// Handle nil cases
		if actual == nil && expected != nil {
			return []Diff{{
				Type:     DiffTypeMissingField,
				Path:     path,
				Expected: fmt.Sprintf("%T", expected),
				Actual:   "nil",
				Message:  fmt.Sprintf("Missing value at %s", path),
			}}
		}
		if actual != nil && expected == nil {
			return []Diff{{
				Type:     DiffTypeExtraField,
				Path:     path,
				Expected: "nil",
				Actual:   fmt.Sprintf("%T", actual),
				Message:  fmt.Sprintf("Extra value at %s", path),
			}}
		}

		return []Diff{{
			Type:     DiffTypeTypeMismatch,
			Path:     path,
			Expected: fmt.Sprintf("%T", expected),
			Actual:   fmt.Sprintf("%T", actual),
			Message:  fmt.Sprintf("Type mismatch at %s: expected %T, got %T", path, expected, actual),
		}}
	}

	switch actualVal := actual.(type) {
	case map[string]interface{}:
		expectedMap := expected.(map[string]interface{})
		diffs = append(diffs, compareMaps(actualVal, expectedMap, path)...)
	case []interface{}:
		expectedArr := expected.([]interface{})
		diffs = append(diffs, compareArrays(actualVal, expectedArr, path)...)
	default:
		// Primitive values - just check equality
		// For parity tests, we don't care about exact values, just structure
	}

	return diffs
}

// isErrorResponse checks if this is an error response path
func isErrorResponse(_ string, data interface{}) bool {
	if data == nil {
		return false
	}
	m, ok := data.(map[string]interface{})
	if !ok {
		return false
	}
	_, hasMessage := m["message"]
	return hasMessage && len(m) == 1
}

// compareErrorMessages compares error message format
func compareErrorMessages(actual, expected interface{}, path string) []Diff {
	var diffs []Diff

	actualMap := actual.(map[string]interface{})
	expectedMap := expected.(map[string]interface{})

	actualMsg, _ := actualMap["message"].(string)
	expectedMsg, _ := expectedMap["message"].(string)

	if actualMsg != expectedMsg {
		diffs = append(diffs, Diff{
			Type:     DiffTypeErrorMessage,
			Path:     path + ".message",
			Expected: expectedMsg,
			Actual:   actualMsg,
			Message:  fmt.Sprintf("Error message mismatch: expected %q, got %q", expectedMsg, actualMsg),
		})
	}

	return diffs
}

// compareMaps compares two maps and returns differences
func compareMaps(actual, expected map[string]interface{}, path string) []Diff {
	var diffs []Diff

	// Check for missing fields
	for key := range expected {
		if _, ok := actual[key]; !ok {
			diffs = append(diffs, Diff{
				Type:     DiffTypeBodyStructure,
				Path:     path + "." + key,
				Expected: "exists",
				Actual:   "missing",
				Message:  fmt.Sprintf("Missing field at %s.%s", path, key),
			})
		}
	}

	// Check for extra fields
	for key := range actual {
		if _, ok := expected[key]; !ok {
			diffs = append(diffs, Diff{
				Type:     DiffTypeBodyStructure,
				Path:     path + "." + key,
				Expected: "missing",
				Actual:   "exists",
				Message:  fmt.Sprintf("Extra field at %s.%s", path, key),
			})
		}
	}

	// Compare common fields
	for key := range expected {
		if actualVal, ok := actual[key]; ok {
			childDiffs := compareValues(actualVal, expected[key], path+"."+key)
			diffs = append(diffs, childDiffs...)
		}
	}

	return diffs
}

// compareArrays compares two arrays and returns differences
func compareArrays(actual, expected []interface{}, path string) []Diff {
	var diffs []Diff

	if len(actual) != len(expected) {
		diffs = append(diffs, Diff{
			Type:     DiffTypeArrayLength,
			Path:     path,
			Expected: fmt.Sprintf("%d", len(expected)),
			Actual:   fmt.Sprintf("%d", len(actual)),
			Message:  fmt.Sprintf("Array length mismatch at %s: expected %d, got %d", path, len(expected), len(actual)),
		})
	}

	// Compare elements up to the shorter length
	minLen := len(actual)
	if len(expected) < minLen {
		minLen = len(expected)
	}

	for i := 0; i < minLen; i++ {
		childDiffs := compareValues(actual[i], expected[i], fmt.Sprintf("%s[%d]", path, i))
		diffs = append(diffs, childDiffs...)
	}

	return diffs
}

// FormatDiff formats a single diff as a human-readable string
func FormatDiff(diff Diff) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("[%s] %s\n", diff.Type, diff.Path))
	if diff.Message != "" {
		sb.WriteString(fmt.Sprintf("  %s\n", diff.Message))
	}
	if diff.Expected != "" || diff.Actual != "" {
		sb.WriteString(fmt.Sprintf("  Expected: %s\n", diff.Expected))
		sb.WriteString(fmt.Sprintf("  Actual:   %s", diff.Actual))
	}
	return sb.String()
}

// CompareJSONStructure compares two JSON strings and returns structural differences
func CompareJSONStructure(expected, actual string) []Diff {
	var expectedData, actualData interface{}

	if err := json.Unmarshal([]byte(expected), &expectedData); err != nil {
		return []Diff{{
			Type:    DiffTypeBodyStructure,
			Path:    "",
			Message: fmt.Sprintf("Expected JSON is invalid: %v", err),
		}}
	}

	if err := json.Unmarshal([]byte(actual), &actualData); err != nil {
		return []Diff{{
			Type:    DiffTypeBodyStructure,
			Path:    "",
			Message: fmt.Sprintf("Actual JSON is invalid: %v", err),
		}}
	}

	return compareValues(actualData, expectedData, "")
}

// NormalizeJSON normalizes a JSON string for comparison by sorting keys
func NormalizeJSON(jsonStr string) (string, error) {
	var data interface{}
	if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
		return "", err
	}

	normalized := normalizeValue(data)
	result, err := json.Marshal(normalized)
	if err != nil {
		return "", err
	}

	return string(result), nil
}

// normalizeValue recursively normalizes values for comparison
func normalizeValue(data interface{}) interface{} {
	switch v := data.(type) {
	case map[string]interface{}:
		// Sort keys and normalize values
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		sort.Strings(keys)

		result := make(map[string]interface{})
		for _, k := range keys {
			result[k] = normalizeValue(v[k])
		}
		return result
	case []interface{}:
		result := make([]interface{}, len(v))
		for i, item := range v {
			result[i] = normalizeValue(item)
		}
		return result
	default:
		return v
	}
}
