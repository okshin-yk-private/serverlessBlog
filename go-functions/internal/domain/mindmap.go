// Package domain provides shared type definitions for the serverless blog.
package domain

import (
	"encoding/json"
	"errors"
	"unicode/utf8"
)

// Mindmap validation constants
// Requirements: 4.5, 4.6
const (
	MindmapMaxNodesJSONSize = 350 * 1024 // 350KB
	MindmapMaxNodeCount     = 500
	MindmapMaxNoteLength    = 1000
)

// Mindmap represents a mindmap entity.
// JSON tags use camelCase for API compatibility.
// Requirements: 4.1, 4.2, 4.4
type Mindmap struct {
	ID            string  `json:"id" dynamodbav:"id"`
	Title         string  `json:"title" dynamodbav:"title"`
	Nodes         string  `json:"nodes" dynamodbav:"nodes"`
	PublishStatus string  `json:"publishStatus" dynamodbav:"publishStatus"`
	AuthorID      string  `json:"authorId" dynamodbav:"authorId"`
	CreatedAt     string  `json:"createdAt" dynamodbav:"createdAt"`
	UpdatedAt     string  `json:"updatedAt" dynamodbav:"updatedAt"`
	PublishedAt   *string `json:"publishedAt,omitempty" dynamodbav:"publishedAt,omitempty"`
}

// MindmapNode represents a node in the mindmap tree structure.
// Requirements: 4.2
type MindmapNode struct {
	ID       string        `json:"id"`
	Text     string        `json:"text"`
	Color    *string       `json:"color,omitempty"`
	LinkURL  *string       `json:"linkUrl,omitempty"`
	Note     *string       `json:"note,omitempty"`
	Children []MindmapNode `json:"children"`
}

// CreateMindmapRequest represents the request body for creating a mindmap.
// Requirements: 1.1, 8.1
type CreateMindmapRequest struct {
	Title         string `json:"title"`
	Nodes         string `json:"nodes"`
	PublishStatus string `json:"publishStatus"`
}

// Validate validates the CreateMindmapRequest.
// Requirements: 4.5, 4.6, 8.9
func (r *CreateMindmapRequest) Validate() error {
	if r.Title == "" {
		return errors.New("title is required")
	}
	if r.Nodes == "" {
		return errors.New("nodes is required")
	}
	if r.PublishStatus != PublishStatusDraft && r.PublishStatus != PublishStatusPublished {
		return errors.New("publishStatus must be draft or published")
	}

	return validateNodesJSON(r.Nodes)
}

// UpdateMindmapRequest represents the request body for updating a mindmap.
// Requirements: 1.4, 8.4
type UpdateMindmapRequest struct {
	Title         *string `json:"title,omitempty"`
	Nodes         *string `json:"nodes,omitempty"`
	PublishStatus *string `json:"publishStatus,omitempty"`
}

// Validate validates the UpdateMindmapRequest.
// Requirements: 4.5, 4.6, 8.9
func (r *UpdateMindmapRequest) Validate() error {
	if r.Title != nil && *r.Title == "" {
		return errors.New("title cannot be empty")
	}
	if r.PublishStatus != nil && *r.PublishStatus != PublishStatusDraft && *r.PublishStatus != PublishStatusPublished {
		return errors.New("publishStatus must be draft or published")
	}

	if r.Nodes != nil {
		return validateNodesJSON(*r.Nodes)
	}

	return nil
}

// ListMindmapsResponse represents the paginated list response for mindmaps.
// Requirements: 8.2, 8.6
type ListMindmapsResponse struct {
	Items     []Mindmap `json:"items"`
	Count     int       `json:"count"`
	NextToken *string   `json:"nextToken,omitempty"`
}

// CountMindmapNodes counts the total number of nodes in the tree.
func CountMindmapNodes(node *MindmapNode) int {
	count := 1
	for i := range node.Children {
		count += CountMindmapNodes(&node.Children[i])
	}
	return count
}

// ValidateMindmapNodes validates the node tree constraints.
// Checks id/text required, note text length for each node recursively.
func ValidateMindmapNodes(node *MindmapNode) error {
	if node.ID == "" {
		return errors.New("node id is required")
	}
	if node.Text == "" {
		return errors.New("node text is required")
	}
	if node.Note != nil && utf8.RuneCountInString(*node.Note) > MindmapMaxNoteLength {
		return errors.New("note text exceeds maximum length of 1000 characters")
	}
	for i := range node.Children {
		if err := ValidateMindmapNodes(&node.Children[i]); err != nil {
			return err
		}
	}
	return nil
}

// validateNodesJSON parses and validates the nodes JSON string.
func validateNodesJSON(nodesJSON string) error {
	// Check size constraint
	if len(nodesJSON) > MindmapMaxNodesJSONSize {
		return errors.New("mindmap data exceeds maximum size of 350KB")
	}

	// Reject JSON null literal
	if nodesJSON == "null" {
		return errors.New("nodes must be valid JSON")
	}

	// Parse JSON
	var root MindmapNode
	if err := json.Unmarshal([]byte(nodesJSON), &root); err != nil {
		return errors.New("nodes must be valid JSON")
	}

	// Check node count
	if CountMindmapNodes(&root) > MindmapMaxNodeCount {
		return errors.New("mindmap exceeds maximum node count of 500")
	}

	// Validate node tree (id/text required, note text lengths, etc.)
	return ValidateMindmapNodes(&root)
}
