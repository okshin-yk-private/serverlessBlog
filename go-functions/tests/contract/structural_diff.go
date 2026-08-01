// Package contract provides API contract tests that verify Go Lambda response structures
// match the MSW mock response structures used in frontend E2E tests.
//
// structural_diff.go contains the JSON structural comparison utilities used by the
// contract tests. This code previously lived in go-functions/tests/parity, which also
// contained tests comparing Go responses against now-deleted Node.js/Rust
// implementations. That directory was removed as dead weight (see issue #482), but the
// structural comparison engine itself is still actively used here, so it was extracted
// into this package instead of being deleted along with it.
package contract

import (
	"encoding/json"
	"fmt"
	"reflect"
)

// DiffType represents the type of difference found
type DiffType string

const (
	// DiffTypeBodyStructure indicates body structure mismatch
	DiffTypeBodyStructure DiffType = "BODY_STRUCTURE"
	// DiffTypeErrorMessage indicates error message format mismatch
	DiffTypeErrorMessage DiffType = "ERROR_MESSAGE"
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

// FormatDiff formats a single diff as a human-readable string
func FormatDiff(diff Diff) string {
	msg := fmt.Sprintf("[%s] %s", diff.Type, diff.Path)
	if diff.Message != "" {
		msg += fmt.Sprintf("\n  %s", diff.Message)
	}
	if diff.Expected != "" || diff.Actual != "" {
		msg += fmt.Sprintf("\n  Expected: %s\n  Actual:   %s", diff.Expected, diff.Actual)
	}
	return msg
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
		// For structural comparison, we don't care about exact values, just structure
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
