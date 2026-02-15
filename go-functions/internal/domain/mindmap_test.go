// Package domain provides shared type definitions for the serverless blog.
package domain

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

// =============================================================================
// Mindmap Types Tests
// Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
// =============================================================================

// TestMindmapJSONMarshal tests Mindmap JSON serialization with camelCase fields
func TestMindmapJSONMarshal(t *testing.T) {
	mindmap := Mindmap{
		ID:            "test-mindmap-id",
		Title:         "Test Mindmap",
		Nodes:         `{"id":"root","text":"Root","children":[]}`,
		PublishStatus: PublishStatusDraft,
		AuthorID:      "author-123",
		CreatedAt:     "2026-02-14T00:00:00Z",
		UpdatedAt:     "2026-02-14T00:00:00Z",
		PublishedAt:   nil,
	}

	data, err := json.Marshal(mindmap)
	if err != nil {
		t.Fatalf("Failed to marshal Mindmap: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	// Verify camelCase field names
	expectedFields := []string{"id", "title", "nodes", "publishStatus", "authorId", "createdAt", "updatedAt"}
	for _, field := range expectedFields {
		if _, ok := result[field]; !ok {
			t.Errorf("Expected field %q not found in JSON", field)
		}
	}

	// Verify publishedAt is omitted when nil
	if _, ok := result["publishedAt"]; ok {
		t.Error("Expected publishedAt to be omitted when nil")
	}

	// Verify values
	if result["id"] != "test-mindmap-id" {
		t.Errorf("Expected id 'test-mindmap-id', got %v", result["id"])
	}
	if result["publishStatus"] != "draft" {
		t.Errorf("Expected publishStatus 'draft', got %v", result["publishStatus"])
	}
}

// TestMindmapJSONUnmarshal tests Mindmap JSON deserialization
func TestMindmapJSONUnmarshal(t *testing.T) {
	jsonData := `{
		"id": "test-mindmap-id",
		"title": "Test Mindmap",
		"nodes": "{\"id\":\"root\",\"text\":\"Root\",\"children\":[]}",
		"publishStatus": "published",
		"authorId": "author-123",
		"createdAt": "2026-02-14T00:00:00Z",
		"updatedAt": "2026-02-14T00:00:00Z",
		"publishedAt": "2026-02-14T01:00:00Z"
	}`

	var mindmap Mindmap
	if err := json.Unmarshal([]byte(jsonData), &mindmap); err != nil {
		t.Fatalf("Failed to unmarshal Mindmap: %v", err)
	}

	if mindmap.ID != "test-mindmap-id" {
		t.Errorf("Expected ID 'test-mindmap-id', got %v", mindmap.ID)
	}
	if mindmap.Title != "Test Mindmap" {
		t.Errorf("Expected Title 'Test Mindmap', got %v", mindmap.Title)
	}
	if mindmap.PublishStatus != PublishStatusPublished {
		t.Errorf("Expected PublishStatus 'published', got %v", mindmap.PublishStatus)
	}
	if mindmap.PublishedAt == nil || *mindmap.PublishedAt != "2026-02-14T01:00:00Z" {
		t.Errorf("Expected PublishedAt '2026-02-14T01:00:00Z', got %v", mindmap.PublishedAt)
	}
	if mindmap.AuthorID != "author-123" {
		t.Errorf("Expected AuthorID 'author-123', got %v", mindmap.AuthorID)
	}
}

// TestMindmapPublishedAtIncluded verifies publishedAt is included when set
func TestMindmapPublishedAtIncluded(t *testing.T) {
	publishedAt := "2026-02-14T01:00:00Z"
	mindmap := Mindmap{
		ID:          "test-id",
		PublishedAt: &publishedAt,
	}

	data, err := json.Marshal(mindmap)
	if err != nil {
		t.Fatalf("Failed to marshal Mindmap: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	if _, ok := result["publishedAt"]; !ok {
		t.Error("Expected publishedAt to be included when set")
	}
}

// TestMindmapNodeJSONMarshal tests MindmapNode JSON serialization
func TestMindmapNodeJSONMarshal(t *testing.T) {
	color := "#FF5733"
	linkURL := "https://example.com"
	note := "This is a note"
	node := MindmapNode{
		ID:      "node-1",
		Text:    "Root Node",
		Color:   &color,
		LinkURL: &linkURL,
		Note:    &note,
		Children: []MindmapNode{
			{
				ID:       "node-2",
				Text:     "Child Node",
				Children: []MindmapNode{},
			},
		},
	}

	data, err := json.Marshal(node)
	if err != nil {
		t.Fatalf("Failed to marshal MindmapNode: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	expectedFields := []string{"id", "text", "color", "linkUrl", "note", "children"}
	for _, field := range expectedFields {
		if _, ok := result[field]; !ok {
			t.Errorf("Expected field %q not found in JSON", field)
		}
	}

	if result["color"] != "#FF5733" {
		t.Errorf("Expected color '#FF5733', got %v", result["color"])
	}
	if result["linkUrl"] != "https://example.com" {
		t.Errorf("Expected linkUrl 'https://example.com', got %v", result["linkUrl"])
	}

	// Verify children
	children := result["children"].([]interface{})
	if len(children) != 1 {
		t.Errorf("Expected 1 child, got %d", len(children))
	}
}

// TestMindmapNodeOptionalFieldsOmitted tests that optional fields are omitted when nil
func TestMindmapNodeOptionalFieldsOmitted(t *testing.T) {
	node := MindmapNode{
		ID:       "node-1",
		Text:     "Simple Node",
		Children: []MindmapNode{},
	}

	data, err := json.Marshal(node)
	if err != nil {
		t.Fatalf("Failed to marshal MindmapNode: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	for _, field := range []string{"color", "linkUrl", "note"} {
		if _, ok := result[field]; ok {
			t.Errorf("Expected %s to be omitted when nil", field)
		}
	}
}

// TestMindmapNodeJSONUnmarshal tests MindmapNode JSON deserialization
func TestMindmapNodeJSONUnmarshal(t *testing.T) {
	jsonData := `{
		"id": "node-1",
		"text": "Root",
		"color": "#FF5733",
		"linkUrl": "https://example.com",
		"note": "A note",
		"children": [
			{"id": "node-2", "text": "Child", "children": []}
		]
	}`

	var node MindmapNode
	if err := json.Unmarshal([]byte(jsonData), &node); err != nil {
		t.Fatalf("Failed to unmarshal MindmapNode: %v", err)
	}

	if node.ID != "node-1" {
		t.Errorf("Expected ID 'node-1', got %v", node.ID)
	}
	if node.Color == nil || *node.Color != "#FF5733" {
		t.Errorf("Expected Color '#FF5733', got %v", node.Color)
	}
	if node.LinkURL == nil || *node.LinkURL != "https://example.com" {
		t.Errorf("Expected LinkURL 'https://example.com', got %v", node.LinkURL)
	}
	if node.Note == nil || *node.Note != "A note" {
		t.Errorf("Expected Note 'A note', got %v", node.Note)
	}
	if len(node.Children) != 1 {
		t.Errorf("Expected 1 child, got %d", len(node.Children))
	}
}

// TestCountMindmapNodes tests the node counting helper function
func TestCountMindmapNodes(t *testing.T) {
	tests := []struct {
		name     string
		node     MindmapNode
		expected int
	}{
		{
			name:     "single root node",
			node:     MindmapNode{ID: "root", Text: "Root", Children: []MindmapNode{}},
			expected: 1,
		},
		{
			name: "root with one child",
			node: MindmapNode{
				ID: "root", Text: "Root",
				Children: []MindmapNode{
					{ID: "child-1", Text: "Child 1", Children: []MindmapNode{}},
				},
			},
			expected: 2,
		},
		{
			name: "three levels deep",
			node: MindmapNode{
				ID: "root", Text: "Root",
				Children: []MindmapNode{
					{ID: "child-1", Text: "Child 1",
						Children: []MindmapNode{
							{ID: "grandchild-1", Text: "Grandchild 1", Children: []MindmapNode{}},
						},
					},
					{ID: "child-2", Text: "Child 2", Children: []MindmapNode{}},
				},
			},
			expected: 4,
		},
		{
			name: "wide tree with many children",
			node: func() MindmapNode {
				root := MindmapNode{ID: "root", Text: "Root", Children: make([]MindmapNode, 10)}
				for i := range root.Children {
					root.Children[i] = MindmapNode{ID: fmt.Sprintf("c-%d", i), Text: "C", Children: []MindmapNode{}}
				}
				return root
			}(),
			expected: 11,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			count := CountMindmapNodes(&tt.node)
			if count != tt.expected {
				t.Errorf("CountMindmapNodes() = %d, expected %d", count, tt.expected)
			}
		})
	}
}

// =============================================================================
// CreateMindmapRequest Validation Tests
// =============================================================================

func TestCreateMindmapRequestValidation(t *testing.T) {
	validNodes := `{"id":"root","text":"Root","children":[]}`

	tests := []struct {
		name    string
		request CreateMindmapRequest
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid request with draft status",
			request: CreateMindmapRequest{
				Title:         "Test Mindmap",
				Nodes:         validNodes,
				PublishStatus: "draft",
			},
			wantErr: false,
		},
		{
			name: "valid request with published status",
			request: CreateMindmapRequest{
				Title:         "Test Mindmap",
				Nodes:         validNodes,
				PublishStatus: "published",
			},
			wantErr: false,
		},
		{
			name: "missing title",
			request: CreateMindmapRequest{
				Title:         "",
				Nodes:         validNodes,
				PublishStatus: "draft",
			},
			wantErr: true,
			errMsg:  "title is required",
		},
		{
			name: "missing nodes",
			request: CreateMindmapRequest{
				Title:         "Test",
				Nodes:         "",
				PublishStatus: "draft",
			},
			wantErr: true,
			errMsg:  "nodes is required",
		},
		{
			name: "invalid nodes JSON",
			request: CreateMindmapRequest{
				Title:         "Test",
				Nodes:         "invalid json",
				PublishStatus: "draft",
			},
			wantErr: true,
			errMsg:  "nodes must be valid JSON",
		},
		{
			name: "node count exceeds 500",
			request: func() CreateMindmapRequest {
				root := generateNodeTree(501)
				data, _ := json.Marshal(root)
				return CreateMindmapRequest{
					Title:         "Test",
					Nodes:         string(data),
					PublishStatus: "draft",
				}
			}(),
			wantErr: true,
			errMsg:  "mindmap exceeds maximum node count of 500",
		},
		{
			name: "node count exactly 500 is valid",
			request: func() CreateMindmapRequest {
				root := generateNodeTree(500)
				data, _ := json.Marshal(root)
				return CreateMindmapRequest{
					Title:         "Test",
					Nodes:         string(data),
					PublishStatus: "draft",
				}
			}(),
			wantErr: false,
		},
		{
			name: "note text exceeds 1000 characters",
			request: func() CreateMindmapRequest {
				longNote := strings.Repeat("a", 1001)
				root := MindmapNode{
					ID: "root", Text: "Root", Note: &longNote,
					Children: []MindmapNode{},
				}
				data, _ := json.Marshal(root)
				return CreateMindmapRequest{
					Title:         "Test",
					Nodes:         string(data),
					PublishStatus: "draft",
				}
			}(),
			wantErr: true,
			errMsg:  "note text exceeds maximum length of 1000 characters",
		},
		{
			name: "note text exactly 1000 characters is valid",
			request: func() CreateMindmapRequest {
				exactNote := strings.Repeat("a", 1000)
				root := MindmapNode{
					ID: "root", Text: "Root", Note: &exactNote,
					Children: []MindmapNode{},
				}
				data, _ := json.Marshal(root)
				return CreateMindmapRequest{
					Title:         "Test",
					Nodes:         string(data),
					PublishStatus: "draft",
				}
			}(),
			wantErr: false,
		},
		{
			name: "note text exceeds 1000 in nested child",
			request: func() CreateMindmapRequest {
				longNote := strings.Repeat("b", 1001)
				root := MindmapNode{
					ID: "root", Text: "Root",
					Children: []MindmapNode{
						{ID: "child-1", Text: "Child", Note: &longNote, Children: []MindmapNode{}},
					},
				}
				data, _ := json.Marshal(root)
				return CreateMindmapRequest{
					Title:         "Test",
					Nodes:         string(data),
					PublishStatus: "draft",
				}
			}(),
			wantErr: true,
			errMsg:  "note text exceeds maximum length of 1000 characters",
		},
		{
			name: "nodes JSON exceeds 350KB",
			request: func() CreateMindmapRequest {
				// Generate nodes that exceed 350KB when serialized
				largeText := strings.Repeat("x", 1000)
				root := MindmapNode{
					ID: "root", Text: "Root",
					Children: make([]MindmapNode, 0, 400),
				}
				for i := 0; i < 400; i++ {
					root.Children = append(root.Children, MindmapNode{
						ID:       fmt.Sprintf("node-%d", i),
						Text:     largeText,
						Children: []MindmapNode{},
					})
				}
				data, _ := json.Marshal(root)
				return CreateMindmapRequest{
					Title:         "Test",
					Nodes:         string(data),
					PublishStatus: "draft",
				}
			}(),
			wantErr: true,
			errMsg:  "mindmap data exceeds maximum size of 350KB",
		},
		{
			name: "valid request with node metadata",
			request: func() CreateMindmapRequest {
				color := "#FF5733"
				linkURL := "https://example.com"
				note := "A short note"
				root := MindmapNode{
					ID: "root", Text: "Root", Color: &color, LinkURL: &linkURL, Note: &note,
					Children: []MindmapNode{},
				}
				data, _ := json.Marshal(root)
				return CreateMindmapRequest{
					Title:         "Test",
					Nodes:         string(data),
					PublishStatus: "draft",
				}
			}(),
			wantErr: false,
		},
		{
			name: "nodes JSON is null literal",
			request: CreateMindmapRequest{
				Title:         "Test",
				Nodes:         "null",
				PublishStatus: "draft",
			},
			wantErr: true,
			errMsg:  "nodes must be valid JSON",
		},
		{
			name: "root node missing id",
			request: CreateMindmapRequest{
				Title:         "Test",
				Nodes:         `{"id":"","text":"Root","children":[]}`,
				PublishStatus: "draft",
			},
			wantErr: true,
			errMsg:  "node id is required",
		},
		{
			name: "root node missing text",
			request: CreateMindmapRequest{
				Title:         "Test",
				Nodes:         `{"id":"root","text":"","children":[]}`,
				PublishStatus: "draft",
			},
			wantErr: true,
			errMsg:  "node text is required",
		},
		{
			name: "child node missing id",
			request: CreateMindmapRequest{
				Title:         "Test",
				Nodes:         `{"id":"root","text":"Root","children":[{"id":"","text":"Child","children":[]}]}`,
				PublishStatus: "draft",
			},
			wantErr: true,
			errMsg:  "node id is required",
		},
		{
			name: "child node missing text",
			request: CreateMindmapRequest{
				Title:         "Test",
				Nodes:         `{"id":"root","text":"Root","children":[{"id":"c1","text":"","children":[]}]}`,
				PublishStatus: "draft",
			},
			wantErr: true,
			errMsg:  "node text is required",
		},
		{
			name: "invalid publishStatus",
			request: CreateMindmapRequest{
				Title:         "Test",
				Nodes:         validNodes,
				PublishStatus: "archived",
			},
			wantErr: true,
			errMsg:  "publishStatus must be draft or published",
		},
		{
			name: "empty publishStatus",
			request: CreateMindmapRequest{
				Title:         "Test",
				Nodes:         validNodes,
				PublishStatus: "",
			},
			wantErr: true,
			errMsg:  "publishStatus must be draft or published",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.request.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr && err != nil && tt.errMsg != "" {
				if err.Error() != tt.errMsg {
					t.Errorf("Expected error message %q, got %q", tt.errMsg, err.Error())
				}
			}
		})
	}
}

// =============================================================================
// UpdateMindmapRequest Validation Tests
// =============================================================================

func TestUpdateMindmapRequestValidation(t *testing.T) {
	validNodes := `{"id":"root","text":"Root","children":[]}`

	tests := []struct {
		name    string
		request UpdateMindmapRequest
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid request with all fields",
			request: UpdateMindmapRequest{
				Title:         strPtr("Updated Title"),
				Nodes:         &validNodes,
				PublishStatus: strPtr("published"),
			},
			wantErr: false,
		},
		{
			name:    "empty request is valid (no updates)",
			request: UpdateMindmapRequest{},
			wantErr: false,
		},
		{
			name: "valid request with title only",
			request: UpdateMindmapRequest{
				Title: strPtr("New Title"),
			},
			wantErr: false,
		},
		{
			name: "valid request with nodes only",
			request: UpdateMindmapRequest{
				Nodes: &validNodes,
			},
			wantErr: false,
		},
		{
			name: "valid request with publishStatus only",
			request: UpdateMindmapRequest{
				PublishStatus: strPtr("draft"),
			},
			wantErr: false,
		},
		{
			name: "empty title is invalid",
			request: UpdateMindmapRequest{
				Title: strPtr(""),
			},
			wantErr: true,
			errMsg:  "title cannot be empty",
		},
		{
			name: "invalid nodes JSON",
			request: UpdateMindmapRequest{
				Nodes: strPtr("invalid json"),
			},
			wantErr: true,
			errMsg:  "nodes must be valid JSON",
		},
		{
			name: "node count exceeds 500",
			request: func() UpdateMindmapRequest {
				root := generateNodeTree(501)
				data, _ := json.Marshal(root)
				nodes := string(data)
				return UpdateMindmapRequest{Nodes: &nodes}
			}(),
			wantErr: true,
			errMsg:  "mindmap exceeds maximum node count of 500",
		},
		{
			name: "note text exceeds 1000 characters",
			request: func() UpdateMindmapRequest {
				longNote := strings.Repeat("c", 1001)
				root := MindmapNode{
					ID: "root", Text: "Root", Note: &longNote,
					Children: []MindmapNode{},
				}
				data, _ := json.Marshal(root)
				nodes := string(data)
				return UpdateMindmapRequest{Nodes: &nodes}
			}(),
			wantErr: true,
			errMsg:  "note text exceeds maximum length of 1000 characters",
		},
		{
			name: "nodes JSON exceeds 350KB",
			request: func() UpdateMindmapRequest {
				largeText := strings.Repeat("y", 1000)
				root := MindmapNode{
					ID: "root", Text: "Root",
					Children: make([]MindmapNode, 0, 400),
				}
				for i := 0; i < 400; i++ {
					root.Children = append(root.Children, MindmapNode{
						ID:       fmt.Sprintf("node-%d", i),
						Text:     largeText,
						Children: []MindmapNode{},
					})
				}
				data, _ := json.Marshal(root)
				nodes := string(data)
				return UpdateMindmapRequest{Nodes: &nodes}
			}(),
			wantErr: true,
			errMsg:  "mindmap data exceeds maximum size of 350KB",
		},
		{
			name: "nodes JSON is null literal",
			request: UpdateMindmapRequest{
				Nodes: strPtr("null"),
			},
			wantErr: true,
			errMsg:  "nodes must be valid JSON",
		},
		{
			name: "node missing id in update",
			request: UpdateMindmapRequest{
				Nodes: strPtr(`{"id":"","text":"Root","children":[]}`),
			},
			wantErr: true,
			errMsg:  "node id is required",
		},
		{
			name: "node missing text in update",
			request: UpdateMindmapRequest{
				Nodes: strPtr(`{"id":"root","text":"","children":[]}`),
			},
			wantErr: true,
			errMsg:  "node text is required",
		},
		{
			name: "invalid publishStatus in update",
			request: UpdateMindmapRequest{
				PublishStatus: strPtr("archived"),
			},
			wantErr: true,
			errMsg:  "publishStatus must be draft or published",
		},
		{
			name: "empty publishStatus in update",
			request: UpdateMindmapRequest{
				PublishStatus: strPtr(""),
			},
			wantErr: true,
			errMsg:  "publishStatus must be draft or published",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.request.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr && err != nil && tt.errMsg != "" {
				if err.Error() != tt.errMsg {
					t.Errorf("Expected error message %q, got %q", tt.errMsg, err.Error())
				}
			}
		})
	}
}

// =============================================================================
// ListMindmapsResponse Tests
// =============================================================================

func TestListMindmapsResponseJSONMarshal(t *testing.T) {
	response := ListMindmapsResponse{
		Items:     []Mindmap{{ID: "test-id", Title: "Test"}},
		Count:     1,
		NextToken: nil,
	}

	data, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("Failed to marshal ListMindmapsResponse: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	if _, ok := result["items"]; !ok {
		t.Error("Expected items to be present")
	}
	if _, ok := result["count"]; !ok {
		t.Error("Expected count to be present")
	}
	if _, ok := result["nextToken"]; ok {
		t.Error("Expected nextToken to be omitted when nil")
	}

	if result["count"] != float64(1) {
		t.Errorf("Expected count 1, got %v", result["count"])
	}
}

func TestListMindmapsResponseWithNextToken(t *testing.T) {
	nextToken := "abc123"
	response := ListMindmapsResponse{
		Items:     []Mindmap{{ID: "test-id"}},
		Count:     1,
		NextToken: &nextToken,
	}

	data, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("Failed to marshal ListMindmapsResponse: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	if _, ok := result["nextToken"]; !ok {
		t.Error("Expected nextToken to be present when set")
	}
	if result["nextToken"] != "abc123" {
		t.Errorf("Expected nextToken 'abc123', got %v", result["nextToken"])
	}
}

// =============================================================================
// Validation Helper Tests
// =============================================================================

func TestValidateMindmapNodes(t *testing.T) {
	tests := []struct {
		name    string
		node    MindmapNode
		wantErr bool
		errMsg  string
	}{
		{
			name:    "valid simple node",
			node:    MindmapNode{ID: "root", Text: "Root", Children: []MindmapNode{}},
			wantErr: false,
		},
		{
			name: "valid node with metadata",
			node: func() MindmapNode {
				color := "#FF5733"
				note := "short note"
				return MindmapNode{
					ID: "root", Text: "Root", Color: &color, Note: &note,
					Children: []MindmapNode{},
				}
			}(),
			wantErr: false,
		},
		{
			name: "note too long in root",
			node: func() MindmapNode {
				longNote := strings.Repeat("z", 1001)
				return MindmapNode{
					ID: "root", Text: "Root", Note: &longNote,
					Children: []MindmapNode{},
				}
			}(),
			wantErr: true,
			errMsg:  "note text exceeds maximum length of 1000 characters",
		},
		{
			name: "note too long in deeply nested child",
			node: func() MindmapNode {
				longNote := strings.Repeat("z", 1001)
				return MindmapNode{
					ID: "root", Text: "Root",
					Children: []MindmapNode{
						{ID: "c1", Text: "C1",
							Children: []MindmapNode{
								{ID: "gc1", Text: "GC1", Note: &longNote, Children: []MindmapNode{}},
							},
						},
					},
				}
			}(),
			wantErr: true,
			errMsg:  "note text exceeds maximum length of 1000 characters",
		},
		{
			name:    "empty id in root node",
			node:    MindmapNode{ID: "", Text: "Root", Children: []MindmapNode{}},
			wantErr: true,
			errMsg:  "node id is required",
		},
		{
			name:    "empty text in root node",
			node:    MindmapNode{ID: "root", Text: "", Children: []MindmapNode{}},
			wantErr: true,
			errMsg:  "node text is required",
		},
		{
			name: "empty id in child node",
			node: MindmapNode{
				ID: "root", Text: "Root",
				Children: []MindmapNode{
					{ID: "", Text: "Child", Children: []MindmapNode{}},
				},
			},
			wantErr: true,
			errMsg:  "node id is required",
		},
		{
			name: "empty text in child node",
			node: MindmapNode{
				ID: "root", Text: "Root",
				Children: []MindmapNode{
					{ID: "c1", Text: "", Children: []MindmapNode{}},
				},
			},
			wantErr: true,
			errMsg:  "node text is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateMindmapNodes(&tt.node)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateMindmapNodes() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr && err != nil && tt.errMsg != "" {
				if err.Error() != tt.errMsg {
					t.Errorf("Expected error message %q, got %q", tt.errMsg, err.Error())
				}
			}
		})
	}
}

// =============================================================================
// Mindmap Constants Tests
// =============================================================================

func TestMindmapMaxConstants(t *testing.T) {
	if MindmapMaxNodesJSONSize != 350*1024 {
		t.Errorf("Expected MindmapMaxNodesJSONSize to be %d, got %d", 350*1024, MindmapMaxNodesJSONSize)
	}
	if MindmapMaxNodeCount != 500 {
		t.Errorf("Expected MindmapMaxNodeCount to be 500, got %d", MindmapMaxNodeCount)
	}
	if MindmapMaxNoteLength != 1000 {
		t.Errorf("Expected MindmapMaxNoteLength to be 1000, got %d", MindmapMaxNoteLength)
	}
}

// =============================================================================
// Test Helpers
// =============================================================================

// generateNodeTree creates a MindmapNode tree with exactly n total nodes.
// Uses a flat structure: root + (n-1) children.
func generateNodeTree(n int) MindmapNode {
	root := MindmapNode{
		ID:       "root",
		Text:     "Root",
		Children: make([]MindmapNode, 0, n-1),
	}
	for i := 1; i < n; i++ {
		root.Children = append(root.Children, MindmapNode{
			ID:       fmt.Sprintf("node-%d", i),
			Text:     fmt.Sprintf("Node %d", i),
			Children: []MindmapNode{},
		})
	}
	return root
}
