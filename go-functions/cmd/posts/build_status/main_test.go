package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
	"github.com/aws/aws-sdk-go-v2/service/codebuild/types"

	"serverless-blog/go-functions/internal/buildtrigger"
	"serverless-blog/go-functions/internal/domain"
)

const (
	testPostID      = "post-123"
	testUserID      = "user-456"
	testProjectName = "blog-astro-build-dev"
)

// mockCodeBuild satisfies buildtrigger.CodeBuildClientInterface.
// StartBuild is unused by the build_status handler but is required by the
// interface, so we provide a simple stub.
type mockCodeBuild struct {
	listFunc  func(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error)
	batchFunc func(ctx context.Context, params *codebuild.BatchGetBuildsInput, optFns ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error)
}

func (m *mockCodeBuild) StartBuild(_ context.Context, _ *codebuild.StartBuildInput, _ ...func(*codebuild.Options)) (*codebuild.StartBuildOutput, error) {
	return nil, errors.New("StartBuild not expected in build_status tests")
}

func (m *mockCodeBuild) ListBuildsForProject(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
	if m.listFunc == nil {
		return nil, errors.New("listFunc not set")
	}
	return m.listFunc(ctx, params, optFns...)
}

func (m *mockCodeBuild) BatchGetBuilds(ctx context.Context, params *codebuild.BatchGetBuildsInput, optFns ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
	if m.batchFunc == nil {
		return nil, errors.New("batchFunc not set")
	}
	return m.batchFunc(ctx, params, optFns...)
}

func setupTest(t *testing.T) func() {
	t.Helper()
	t.Setenv("CODEBUILD_PROJECT_NAME", testProjectName)
	original := codebuildClientGetter
	return func() {
		codebuildClientGetter = original
	}
}

func authedRequest(postID string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": postID},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": testUserID,
				},
			},
		},
	}
}

// --- success paths ---

func TestHandler_ReturnsLatestInProgressBuild(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	start := time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC)
	mock := &mockCodeBuild{
		listFunc: func(_ context.Context, params *codebuild.ListBuildsForProjectInput, _ ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			if aws.ToString(params.ProjectName) != testProjectName {
				t.Errorf("expected project %q, got %q", testProjectName, aws.ToString(params.ProjectName))
			}
			if params.SortOrder != types.SortOrderTypeDescending {
				t.Errorf("expected descending sort order, got %v", params.SortOrder)
			}
			return &codebuild.ListBuildsForProjectOutput{
				Ids: []string{"build-newest", "build-older"},
			}, nil
		},
		batchFunc: func(_ context.Context, params *codebuild.BatchGetBuildsInput, _ ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
			if len(params.Ids) != 1 || params.Ids[0] != "build-newest" {
				t.Errorf("expected only newest build id requested, got %v", params.Ids)
			}
			return &codebuild.BatchGetBuildsOutput{
				Builds: []types.Build{
					{
						Id:           aws.String("build-newest"),
						BuildStatus:  types.StatusTypeInProgress,
						CurrentPhase: aws.String("BUILD"),
						StartTime:    &start,
					},
				},
			}, nil
		},
	}
	codebuildClientGetter = func() (buildtrigger.CodeBuildClientInterface, error) {
		return mock, nil
	}

	resp, err := Handler(context.Background(), authedRequest(testPostID))
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d (body=%s)", resp.StatusCode, resp.Body)
	}

	var body BuildStatusResponse
	if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if body.BuildID != "build-newest" {
		t.Errorf("expected buildId build-newest, got %q", body.BuildID)
	}
	if body.Status != "in-progress" {
		t.Errorf("expected status in-progress, got %q", body.Status)
	}
	if body.Phase != "BUILD" {
		t.Errorf("expected phase BUILD, got %q", body.Phase)
	}
	if body.StartTime == nil || *body.StartTime != "2026-05-01T10:00:00Z" {
		t.Errorf("expected startTime 2026-05-01T10:00:00Z, got %v", body.StartTime)
	}
	if body.EndTime != nil {
		t.Errorf("expected endTime nil for in-progress build, got %v", *body.EndTime)
	}
}

func TestHandler_ReturnsIdleWhenNoBuilds(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mock := &mockCodeBuild{
		listFunc: func(_ context.Context, _ *codebuild.ListBuildsForProjectInput, _ ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return &codebuild.ListBuildsForProjectOutput{Ids: []string{}}, nil
		},
	}
	codebuildClientGetter = func() (buildtrigger.CodeBuildClientInterface, error) {
		return mock, nil
	}

	resp, err := Handler(context.Background(), authedRequest(testPostID))
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var body BuildStatusResponse
	if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if body.Status != "idle" {
		t.Errorf("expected status idle, got %q", body.Status)
	}
}

func TestHandler_ReturnsIdleWhenBatchGetEmpty(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mock := &mockCodeBuild{
		listFunc: func(_ context.Context, _ *codebuild.ListBuildsForProjectInput, _ ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return &codebuild.ListBuildsForProjectOutput{Ids: []string{"build-x"}}, nil
		},
		batchFunc: func(_ context.Context, _ *codebuild.BatchGetBuildsInput, _ ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
			return &codebuild.BatchGetBuildsOutput{Builds: nil}, nil
		},
	}
	codebuildClientGetter = func() (buildtrigger.CodeBuildClientInterface, error) {
		return mock, nil
	}

	resp, err := Handler(context.Background(), authedRequest(testPostID))
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var body BuildStatusResponse
	_ = json.Unmarshal([]byte(resp.Body), &body)
	if body.Status != "idle" {
		t.Errorf("expected status idle, got %q", body.Status)
	}
}

func TestHandler_StatusMapping(t *testing.T) {
	tests := []struct {
		name     string
		input    types.StatusType
		expected string
	}{
		{"in_progress -> in-progress", types.StatusTypeInProgress, "in-progress"},
		{"succeeded -> succeeded", types.StatusTypeSucceeded, "succeeded"},
		{"failed -> failed", types.StatusTypeFailed, "failed"},
		{"fault -> failed", types.StatusTypeFault, "failed"},
		{"timed_out -> failed", types.StatusTypeTimedOut, "failed"},
		{"stopped -> failed", types.StatusTypeStopped, "failed"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cleanup := setupTest(t)
			defer cleanup()

			end := time.Date(2026, 5, 1, 10, 5, 0, 0, time.UTC)
			mock := &mockCodeBuild{
				listFunc: func(_ context.Context, _ *codebuild.ListBuildsForProjectInput, _ ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
					return &codebuild.ListBuildsForProjectOutput{Ids: []string{"b-1"}}, nil
				},
				batchFunc: func(_ context.Context, _ *codebuild.BatchGetBuildsInput, _ ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
					return &codebuild.BatchGetBuildsOutput{
						Builds: []types.Build{
							{
								Id:          aws.String("b-1"),
								BuildStatus: tt.input,
								EndTime:     &end,
							},
						},
					}, nil
				},
			}
			codebuildClientGetter = func() (buildtrigger.CodeBuildClientInterface, error) {
				return mock, nil
			}

			resp, err := Handler(context.Background(), authedRequest(testPostID))
			if err != nil || resp.StatusCode != 200 {
				t.Fatalf("Handler failed: err=%v status=%d", err, resp.StatusCode)
			}
			var body BuildStatusResponse
			if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			if body.Status != tt.expected {
				t.Errorf("expected status %q, got %q", tt.expected, body.Status)
			}
			if body.EndTime == nil || *body.EndTime != "2026-05-01T10:05:00Z" {
				t.Errorf("expected endTime, got %v", body.EndTime)
			}
		})
	}
}

// --- error paths ---

func TestHandler_Unauthorized(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	resp, err := Handler(context.Background(), events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": testPostID},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != 401 {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestHandler_MissingPostID(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	req := authedRequest("")
	resp, err := Handler(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
	var body domain.ErrorResponse
	_ = json.Unmarshal([]byte(resp.Body), &body)
	if body.Message != "post ID is required" {
		t.Errorf("expected post ID is required, got %q", body.Message)
	}
}

func TestHandler_MissingProjectName(t *testing.T) {
	t.Setenv("CODEBUILD_PROJECT_NAME", "")
	resp, err := Handler(context.Background(), authedRequest(testPostID))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("expected 500, got %d", resp.StatusCode)
	}
	var body domain.ErrorResponse
	_ = json.Unmarshal([]byte(resp.Body), &body)
	if body.Message != "server configuration error" {
		t.Errorf("expected server configuration error, got %q", body.Message)
	}
}

// SanitizeProjectName rejects names containing CR/LF or other control
// characters. The handler must treat that as a server configuration error
// — the same path as a missing env var.
func TestHandler_RejectsInvalidProjectName(t *testing.T) {
	t.Setenv("CODEBUILD_PROJECT_NAME", "bad name with spaces")
	resp, err := Handler(context.Background(), authedRequest(testPostID))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("expected 500, got %d", resp.StatusCode)
	}
}

func TestHandler_ClientInitError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	codebuildClientGetter = func() (buildtrigger.CodeBuildClientInterface, error) {
		return nil, errors.New("init failed")
	}

	resp, err := Handler(context.Background(), authedRequest(testPostID))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("expected 500, got %d", resp.StatusCode)
	}
}

func TestHandler_ListBuildsError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mock := &mockCodeBuild{
		listFunc: func(_ context.Context, _ *codebuild.ListBuildsForProjectInput, _ ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return nil, errors.New("AccessDenied")
		},
	}
	codebuildClientGetter = func() (buildtrigger.CodeBuildClientInterface, error) {
		return mock, nil
	}

	resp, err := Handler(context.Background(), authedRequest(testPostID))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("expected 500, got %d", resp.StatusCode)
	}
	var body domain.ErrorResponse
	_ = json.Unmarshal([]byte(resp.Body), &body)
	if body.Message != "failed to list builds" {
		t.Errorf("expected failed to list builds, got %q", body.Message)
	}
}

func TestHandler_BatchGetBuildsError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mock := &mockCodeBuild{
		listFunc: func(_ context.Context, _ *codebuild.ListBuildsForProjectInput, _ ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return &codebuild.ListBuildsForProjectOutput{Ids: []string{"b-1"}}, nil
		},
		batchFunc: func(_ context.Context, _ *codebuild.BatchGetBuildsInput, _ ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
			return nil, errors.New("ThrottlingException")
		},
	}
	codebuildClientGetter = func() (buildtrigger.CodeBuildClientInterface, error) {
		return mock, nil
	}

	resp, err := Handler(context.Background(), authedRequest(testPostID))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("expected 500, got %d", resp.StatusCode)
	}
}

// --- auth edge cases ---

func TestHandler_AuthEdgeCases(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	tests := []struct {
		name       string
		authorizer map[string]interface{}
	}{
		{"nil authorizer", nil},
		{"empty authorizer", map[string]interface{}{}},
		{"nil claims", map[string]interface{}{"claims": nil}},
		{"claims not a map", map[string]interface{}{"claims": "not-a-map"}},
		{"no sub", map[string]interface{}{"claims": map[string]interface{}{"email": "x@y"}}},
		{"sub not string", map[string]interface{}{"claims": map[string]interface{}{"sub": 123}}},
		{"empty sub", map[string]interface{}{"claims": map[string]interface{}{"sub": ""}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := events.APIGatewayProxyRequest{
				PathParameters: map[string]string{"id": testPostID},
				RequestContext: events.APIGatewayProxyRequestContext{Authorizer: tt.authorizer},
			}
			resp, err := Handler(context.Background(), req)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if resp.StatusCode != 401 {
				t.Errorf("expected 401, got %d", resp.StatusCode)
			}
		})
	}
}

// --- response structure ---

func TestHandler_CORSHeaders(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mock := &mockCodeBuild{
		listFunc: func(_ context.Context, _ *codebuild.ListBuildsForProjectInput, _ ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return &codebuild.ListBuildsForProjectOutput{Ids: []string{}}, nil
		},
	}
	codebuildClientGetter = func() (buildtrigger.CodeBuildClientInterface, error) {
		return mock, nil
	}

	resp, _ := Handler(context.Background(), authedRequest(testPostID))
	if resp.Headers["Access-Control-Allow-Origin"] == "" {
		t.Errorf("expected CORS header to be set")
	}
	if resp.Headers["Content-Type"] != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", resp.Headers["Content-Type"])
	}
}
