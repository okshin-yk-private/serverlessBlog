// Package parity provides API parity testing between Go and Node.js/Rust implementations.
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
	"testing"

	"github.com/aws/aws-lambda-go/events"
)

// TestCompareResponses tests the response comparison functionality
func TestCompareResponses(t *testing.T) {
	t.Run("should return no diff when responses are identical", func(t *testing.T) {
		goResp := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       `{"id":"123","title":"Test"}`,
		}
		nodeResp := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       `{"id":"123","title":"Test"}`,
		}

		result := CompareResponses(goResp, nodeResp)

		if result.HasDiff {
			t.Errorf("expected no diff, got: %v", result.Diffs)
		}
	})

	t.Run("should detect status code difference", func(t *testing.T) {
		goResp := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       `{"id":"123"}`,
		}
		nodeResp := events.APIGatewayProxyResponse{
			StatusCode: 201,
			Body:       `{"id":"123"}`,
		}

		result := CompareResponses(goResp, nodeResp)

		if !result.HasDiff {
			t.Error("expected diff for status code mismatch")
		}
		if !containsDiffType(result.Diffs, DiffTypeStatusCode) {
			t.Error("expected status code diff type")
		}
	})

	t.Run("should detect body structure difference", func(t *testing.T) {
		goResp := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       `{"id":"123","name":"Test"}`,
		}
		nodeResp := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       `{"id":"123","title":"Test"}`,
		}

		result := CompareResponses(goResp, nodeResp)

		if !result.HasDiff {
			t.Error("expected diff for body structure mismatch")
		}
		if !containsDiffType(result.Diffs, DiffTypeBodyStructure) {
			t.Error("expected body structure diff type")
		}
	})

	t.Run("should detect error message format difference", func(t *testing.T) {
		goResp := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"title is required"}`,
		}
		nodeResp := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"Title field is required"}`,
		}

		result := CompareResponses(goResp, nodeResp)

		if !result.HasDiff {
			t.Error("expected diff for error message mismatch")
		}
		if !containsDiffType(result.Diffs, DiffTypeErrorMessage) {
			t.Error("expected error message diff type")
		}
	})

	t.Run("should handle JSON field order differences", func(t *testing.T) {
		goResp := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       `{"title":"Test","id":"123"}`,
		}
		nodeResp := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       `{"id":"123","title":"Test"}`,
		}

		result := CompareResponses(goResp, nodeResp)

		if result.HasDiff {
			t.Errorf("expected no diff for JSON field order, got: %v", result.Diffs)
		}
	})
}

// TestFormatDiff tests the detailed diff output functionality
func TestFormatDiff(t *testing.T) {
	t.Run("should format status code diff clearly", func(t *testing.T) {
		diff := Diff{
			Type:     DiffTypeStatusCode,
			Path:     "statusCode",
			Expected: "201",
			Actual:   "200",
		}

		output := FormatDiff(diff)

		if output == "" {
			t.Error("expected non-empty diff output")
		}
		if !containsString(output, "statusCode") {
			t.Error("expected output to contain path")
		}
		if !containsString(output, "201") {
			t.Error("expected output to contain expected value")
		}
		if !containsString(output, "200") {
			t.Error("expected output to contain actual value")
		}
	})

	t.Run("should format body structure diff with JSON path", func(t *testing.T) {
		diff := Diff{
			Type:     DiffTypeBodyStructure,
			Path:     "body.items[0].title",
			Expected: "exists",
			Actual:   "missing",
		}

		output := FormatDiff(diff)

		if !containsString(output, "body.items[0].title") {
			t.Error("expected output to contain JSON path")
		}
	})
}

// TestCompareJSONStructure tests JSON structure comparison
func TestCompareJSONStructure(t *testing.T) {
	t.Run("should detect missing field", func(t *testing.T) {
		expected := `{"id":"123","title":"Test","category":"tech"}`
		actual := `{"id":"123","title":"Test"}`

		diffs := CompareJSONStructure(expected, actual)

		if len(diffs) == 0 {
			t.Error("expected diffs for missing field")
		}
		found := false
		for _, d := range diffs {
			if containsString(d.Path, "category") {
				found = true
				break
			}
		}
		if !found {
			t.Error("expected diff for missing category field")
		}
	})

	t.Run("should detect extra field", func(t *testing.T) {
		expected := `{"id":"123"}`
		actual := `{"id":"123","extra":"field"}`

		diffs := CompareJSONStructure(expected, actual)

		if len(diffs) == 0 {
			t.Error("expected diffs for extra field")
		}
	})

	t.Run("should detect nested object differences", func(t *testing.T) {
		expected := `{"data":{"id":"123","nested":{"a":1}}}`
		actual := `{"data":{"id":"123","nested":{"b":2}}}`

		diffs := CompareJSONStructure(expected, actual)

		if len(diffs) == 0 {
			t.Error("expected diffs for nested object differences")
		}
	})

	t.Run("should detect array length differences", func(t *testing.T) {
		expected := `{"items":[{"id":"1"},{"id":"2"}]}`
		actual := `{"items":[{"id":"1"}]}`

		diffs := CompareJSONStructure(expected, actual)

		if len(diffs) == 0 {
			t.Error("expected diffs for array length differences")
		}
	})

	t.Run("should detect type mismatches", func(t *testing.T) {
		expected := `{"count":10}`
		actual := `{"count":"10"}`

		diffs := CompareJSONStructure(expected, actual)

		if len(diffs) == 0 {
			t.Error("expected diffs for type mismatch")
		}
	})
}

// TestCompareResult tests the CompareResult formatting
func TestCompareResult_String(t *testing.T) {
	t.Run("should format all diffs", func(t *testing.T) {
		result := CompareResult{
			HasDiff: true,
			Diffs: []Diff{
				{Type: DiffTypeStatusCode, Path: "statusCode", Expected: "201", Actual: "200"},
				{Type: DiffTypeBodyStructure, Path: "body.id", Expected: "string", Actual: "number"},
			},
		}

		output := result.String()

		if !containsString(output, "statusCode") {
			t.Error("expected status code diff in output")
		}
		if !containsString(output, "body.id") {
			t.Error("expected body diff in output")
		}
	})

	t.Run("should return empty for no diff", func(t *testing.T) {
		result := CompareResult{HasDiff: false}

		output := result.String()

		if output != "" {
			t.Errorf("expected empty output for no diff, got: %s", output)
		}
	})
}

// TestNormalizeJSON tests JSON normalization for comparison
func TestNormalizeJSON(t *testing.T) {
	t.Run("should normalize equivalent JSON", func(t *testing.T) {
		json1 := `{"b":"2","a":"1"}`
		json2 := `{"a":"1","b":"2"}`

		norm1, err1 := NormalizeJSON(json1)
		norm2, err2 := NormalizeJSON(json2)

		if err1 != nil || err2 != nil {
			t.Fatalf("unexpected error: %v, %v", err1, err2)
		}
		if norm1 != norm2 {
			t.Errorf("expected normalized JSON to be equal:\n%s\n!=\n%s", norm1, norm2)
		}
	})

	t.Run("should handle arrays", func(t *testing.T) {
		jsonStr := `{"items":[{"id":"1"},{"id":"2"}]}`

		norm, err := NormalizeJSON(jsonStr)

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if norm == "" {
			t.Error("expected non-empty normalized JSON")
		}
	})

	t.Run("should return error for invalid JSON", func(t *testing.T) {
		invalidJSON := `{invalid json}`

		_, err := NormalizeJSON(invalidJSON)

		if err == nil {
			t.Error("expected error for invalid JSON")
		}
	})
}

// TestIgnoreFields tests field ignoring functionality for comparison
func TestIgnoreFields(t *testing.T) {
	t.Run("should ignore specified fields", func(t *testing.T) {
		goResp := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       `{"id":"go-uuid-123","createdAt":"2024-01-01T00:00:00Z","title":"Test"}`,
		}
		nodeResp := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       `{"id":"node-uuid-456","createdAt":"2024-01-01T00:00:01Z","title":"Test"}`,
		}

		result := CompareResponsesWithOptions(goResp, nodeResp, CompareOptions{
			IgnoreFields: []string{"id", "createdAt"},
		})

		if result.HasDiff {
			t.Errorf("expected no diff when ignoring fields, got: %v", result.Diffs)
		}
	})
}

// Helper functions for tests
func containsDiffType(diffs []Diff, diffType DiffType) bool {
	for _, d := range diffs {
		if d.Type == diffType {
			return true
		}
	}
	return false
}

func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || s != "" && containsSubstring(s, substr))
}

func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// Ensure json package is used
var _ = json.Marshal
