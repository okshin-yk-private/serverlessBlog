// Package buildtrigger provides CodeBuild build trigger functionality.
//
// Requirement 10.1: When a post is published via Admin, the existing Go Lambda (posts/update)
//
//	shall trigger a CodeBuild project for site rebuild.
//
// Requirement 10.2: The trigger shall be invoked via AWS SDK call to CodeBuild StartBuild API.
// Requirement 10.3: The trigger shall include idempotency handling: if a build is already in progress,
//
//	the new request shall be queued or deduplicated.
//
// Requirement 10.4: The trigger shall use IAM role-based authorization.
package buildtrigger

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
	"github.com/aws/aws-sdk-go-v2/service/codebuild/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// MockCodeBuildClient is a mock implementation of CodeBuildClientInterface
type MockCodeBuildClient struct {
	StartBuildFunc           func(ctx context.Context, params *codebuild.StartBuildInput, optFns ...func(*codebuild.Options)) (*codebuild.StartBuildOutput, error)
	ListBuildsForProjectFunc func(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error)
	BatchGetBuildsFunc       func(ctx context.Context, params *codebuild.BatchGetBuildsInput, optFns ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error)
}

func (m *MockCodeBuildClient) StartBuild(ctx context.Context, params *codebuild.StartBuildInput, optFns ...func(*codebuild.Options)) (*codebuild.StartBuildOutput, error) {
	if m.StartBuildFunc != nil {
		return m.StartBuildFunc(ctx, params, optFns...)
	}
	return nil, errors.New("StartBuildFunc not set")
}

func (m *MockCodeBuildClient) ListBuildsForProject(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
	if m.ListBuildsForProjectFunc != nil {
		return m.ListBuildsForProjectFunc(ctx, params, optFns...)
	}
	return nil, errors.New("ListBuildsForProjectFunc not set")
}

func (m *MockCodeBuildClient) BatchGetBuilds(ctx context.Context, params *codebuild.BatchGetBuildsInput, optFns ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
	if m.BatchGetBuildsFunc != nil {
		return m.BatchGetBuildsFunc(ctx, params, optFns...)
	}
	return nil, errors.New("BatchGetBuildsFunc not set")
}

const testProjectName = "test-astro-build-dev"

// TestNewBuildTrigger tests the BuildTrigger constructor
// Requirement 10.4: The trigger shall use IAM role-based authorization.
func TestNewBuildTrigger(t *testing.T) {
	mockClient := &MockCodeBuildClient{}
	trigger := NewBuildTrigger(mockClient, testProjectName)

	assert.NotNil(t, trigger)
	assert.Equal(t, testProjectName, trigger.projectName)
	assert.NotNil(t, trigger.client)
}

// TestNewBuildTriggerWithMinInterval tests creating a BuildTrigger with custom min interval
// Requirement 10.9: When multiple posts are published in rapid succession,
//
//	the system shall coalesce builds (max 1 build per minute).
func TestNewBuildTriggerWithMinInterval(t *testing.T) {
	mockClient := &MockCodeBuildClient{}
	customInterval := 2 * time.Minute
	trigger := NewBuildTriggerWithMinInterval(mockClient, testProjectName, customInterval)

	assert.NotNil(t, trigger)
	assert.Equal(t, customInterval, trigger.minInterval)
}

// TestTriggerBuild_Success tests successful build trigger
// Requirement 10.1: Trigger a CodeBuild project for site rebuild
// Requirement 10.2: Invoked via AWS SDK call to CodeBuild StartBuild API
func TestTriggerBuild_Success(t *testing.T) {
	mockClient := &MockCodeBuildClient{
		ListBuildsForProjectFunc: func(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return &codebuild.ListBuildsForProjectOutput{
				Ids: []string{}, // No builds in progress
			}, nil
		},
		StartBuildFunc: func(ctx context.Context, params *codebuild.StartBuildInput, optFns ...func(*codebuild.Options)) (*codebuild.StartBuildOutput, error) {
			assert.Equal(t, testProjectName, *params.ProjectName)
			return &codebuild.StartBuildOutput{
				Build: &types.Build{
					Id:          aws.String("test-build-id"),
					BuildStatus: types.StatusTypeInProgress,
				},
			}, nil
		},
	}

	trigger := NewBuildTrigger(mockClient, testProjectName)
	err := trigger.TriggerBuild(context.Background())

	assert.NoError(t, err)
}

// TestTriggerBuild_SkipsWhenBuildInProgress tests idempotency handling
// Requirement 10.3: If a build is already in progress, the new request shall be deduplicated
func TestTriggerBuild_SkipsWhenBuildInProgress(t *testing.T) {
	mockClient := &MockCodeBuildClient{
		ListBuildsForProjectFunc: func(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return &codebuild.ListBuildsForProjectOutput{
				Ids: []string{"existing-build-id"},
			}, nil
		},
		BatchGetBuildsFunc: func(ctx context.Context, params *codebuild.BatchGetBuildsInput, optFns ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
			return &codebuild.BatchGetBuildsOutput{
				Builds: []types.Build{
					{
						Id:          aws.String("existing-build-id"),
						BuildStatus: types.StatusTypeInProgress, // Build is in progress
					},
				},
			}, nil
		},
	}

	trigger := NewBuildTrigger(mockClient, testProjectName)
	err := trigger.TriggerBuild(context.Background())

	// Should not error - just skip the build
	assert.NoError(t, err)
}

// TestTriggerBuild_StartsWhenPreviousBuildCompleted tests that a new build is started
// when the previous build has completed
func TestTriggerBuild_StartsWhenPreviousBuildCompleted(t *testing.T) {
	startBuildCalled := false
	mockClient := &MockCodeBuildClient{
		ListBuildsForProjectFunc: func(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return &codebuild.ListBuildsForProjectOutput{
				Ids: []string{"previous-build-id"},
			}, nil
		},
		BatchGetBuildsFunc: func(ctx context.Context, params *codebuild.BatchGetBuildsInput, optFns ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
			return &codebuild.BatchGetBuildsOutput{
				Builds: []types.Build{
					{
						Id:          aws.String("previous-build-id"),
						BuildStatus: types.StatusTypeSucceeded, // Build completed
					},
				},
			}, nil
		},
		StartBuildFunc: func(ctx context.Context, params *codebuild.StartBuildInput, optFns ...func(*codebuild.Options)) (*codebuild.StartBuildOutput, error) {
			startBuildCalled = true
			return &codebuild.StartBuildOutput{
				Build: &types.Build{
					Id:          aws.String("new-build-id"),
					BuildStatus: types.StatusTypeInProgress,
				},
			}, nil
		},
	}

	trigger := NewBuildTrigger(mockClient, testProjectName)
	err := trigger.TriggerBuild(context.Background())

	assert.NoError(t, err)
	assert.True(t, startBuildCalled, "StartBuild should be called when previous build completed")
}

// TestTriggerBuild_RespectMinInterval tests build coalescing with min interval
// Requirement 10.9: Max 1 build per minute - coalesce rapid succession
func TestTriggerBuild_RespectMinInterval(t *testing.T) {
	startBuildCount := 0
	mockClient := &MockCodeBuildClient{
		ListBuildsForProjectFunc: func(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return &codebuild.ListBuildsForProjectOutput{
				Ids: []string{},
			}, nil
		},
		StartBuildFunc: func(ctx context.Context, params *codebuild.StartBuildInput, optFns ...func(*codebuild.Options)) (*codebuild.StartBuildOutput, error) {
			startBuildCount++
			return &codebuild.StartBuildOutput{
				Build: &types.Build{
					Id:          aws.String("test-build-id"),
					BuildStatus: types.StatusTypeInProgress,
				},
			}, nil
		},
	}

	// Use a short interval for testing
	trigger := NewBuildTriggerWithMinInterval(mockClient, testProjectName, 100*time.Millisecond)

	// First trigger should succeed
	err := trigger.TriggerBuild(context.Background())
	require.NoError(t, err)

	// Second trigger immediately after should be skipped
	err = trigger.TriggerBuild(context.Background())
	require.NoError(t, err)

	// Only one build should be started
	assert.Equal(t, 1, startBuildCount, "Only one build should be started within min interval")

	// Wait for interval to pass
	time.Sleep(150 * time.Millisecond)

	// Reset mock counter by accessing the mock directly through the trigger
	// (In production, this would be a new trigger or the interval would reset)
	err = trigger.TriggerBuild(context.Background())
	require.NoError(t, err)

	// Now two builds should have been started
	assert.Equal(t, 2, startBuildCount, "Second build should be started after interval passed")
}

// TestIsBuildInProgress_NoBuilds tests IsBuildInProgress when there are no builds
func TestIsBuildInProgress_NoBuilds(t *testing.T) {
	mockClient := &MockCodeBuildClient{
		ListBuildsForProjectFunc: func(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return &codebuild.ListBuildsForProjectOutput{
				Ids: []string{},
			}, nil
		},
	}

	trigger := NewBuildTrigger(mockClient, testProjectName)
	inProgress, err := trigger.IsBuildInProgress(context.Background())

	assert.NoError(t, err)
	assert.False(t, inProgress)
}

// TestIsBuildInProgress_HasInProgressBuild tests IsBuildInProgress when a build is running
func TestIsBuildInProgress_HasInProgressBuild(t *testing.T) {
	mockClient := &MockCodeBuildClient{
		ListBuildsForProjectFunc: func(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return &codebuild.ListBuildsForProjectOutput{
				Ids: []string{"build-1"},
			}, nil
		},
		BatchGetBuildsFunc: func(ctx context.Context, params *codebuild.BatchGetBuildsInput, optFns ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
			return &codebuild.BatchGetBuildsOutput{
				Builds: []types.Build{
					{
						Id:          aws.String("build-1"),
						BuildStatus: types.StatusTypeInProgress,
					},
				},
			}, nil
		},
	}

	trigger := NewBuildTrigger(mockClient, testProjectName)
	inProgress, err := trigger.IsBuildInProgress(context.Background())

	assert.NoError(t, err)
	assert.True(t, inProgress)
}

// TestIsBuildInProgress_AllBuildsCompleted tests when all builds are completed
func TestIsBuildInProgress_AllBuildsCompleted(t *testing.T) {
	mockClient := &MockCodeBuildClient{
		ListBuildsForProjectFunc: func(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return &codebuild.ListBuildsForProjectOutput{
				Ids: []string{"build-1", "build-2"},
			}, nil
		},
		BatchGetBuildsFunc: func(ctx context.Context, params *codebuild.BatchGetBuildsInput, optFns ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
			return &codebuild.BatchGetBuildsOutput{
				Builds: []types.Build{
					{
						Id:          aws.String("build-1"),
						BuildStatus: types.StatusTypeSucceeded,
					},
					{
						Id:          aws.String("build-2"),
						BuildStatus: types.StatusTypeFailed,
					},
				},
			}, nil
		},
	}

	trigger := NewBuildTrigger(mockClient, testProjectName)
	inProgress, err := trigger.IsBuildInProgress(context.Background())

	assert.NoError(t, err)
	assert.False(t, inProgress)
}

// TestIsBuildInProgress_ListBuildsError tests error handling for ListBuildsForProject
func TestIsBuildInProgress_ListBuildsError(t *testing.T) {
	mockClient := &MockCodeBuildClient{
		ListBuildsForProjectFunc: func(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return nil, errors.New("CodeBuild API error")
		},
	}

	trigger := NewBuildTrigger(mockClient, testProjectName)
	_, err := trigger.IsBuildInProgress(context.Background())

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to list builds")
}

// TestIsBuildInProgress_BatchGetBuildsError tests error handling for BatchGetBuilds
func TestIsBuildInProgress_BatchGetBuildsError(t *testing.T) {
	mockClient := &MockCodeBuildClient{
		ListBuildsForProjectFunc: func(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return &codebuild.ListBuildsForProjectOutput{
				Ids: []string{"build-1"},
			}, nil
		},
		BatchGetBuildsFunc: func(ctx context.Context, params *codebuild.BatchGetBuildsInput, optFns ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
			return nil, errors.New("BatchGetBuilds API error")
		},
	}

	trigger := NewBuildTrigger(mockClient, testProjectName)
	_, err := trigger.IsBuildInProgress(context.Background())

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to get build status")
}

// TestTriggerBuild_StartBuildError tests error handling for StartBuild
// Requirement 10.10: The Lambda shall handle CodeBuild API errors gracefully
func TestTriggerBuild_StartBuildError(t *testing.T) {
	mockClient := &MockCodeBuildClient{
		ListBuildsForProjectFunc: func(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return &codebuild.ListBuildsForProjectOutput{
				Ids: []string{},
			}, nil
		},
		StartBuildFunc: func(ctx context.Context, params *codebuild.StartBuildInput, optFns ...func(*codebuild.Options)) (*codebuild.StartBuildOutput, error) {
			return nil, errors.New("StartBuild API error")
		},
	}

	trigger := NewBuildTrigger(mockClient, testProjectName)
	err := trigger.TriggerBuild(context.Background())

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to start build")
}

// TestTriggerBuild_CheckInProgressError tests that error from IsBuildInProgress is propagated
func TestTriggerBuild_CheckInProgressError(t *testing.T) {
	mockClient := &MockCodeBuildClient{
		ListBuildsForProjectFunc: func(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return nil, errors.New("ListBuildsForProject API error")
		},
	}

	trigger := NewBuildTrigger(mockClient, testProjectName)
	err := trigger.TriggerBuild(context.Background())

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to check build status")
}

// TestBuildStatuses_InProgress tests that IN_PROGRESS status is detected
// Note: AWS SDK v2 CodeBuild only has IN_PROGRESS for running builds
func TestBuildStatuses_InProgress(t *testing.T) {
	mockClient := &MockCodeBuildClient{
		ListBuildsForProjectFunc: func(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
			return &codebuild.ListBuildsForProjectOutput{
				Ids: []string{"build-1"},
			}, nil
		},
		BatchGetBuildsFunc: func(ctx context.Context, params *codebuild.BatchGetBuildsInput, optFns ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
			return &codebuild.BatchGetBuildsOutput{
				Builds: []types.Build{
					{
						Id:          aws.String("build-1"),
						BuildStatus: types.StatusTypeInProgress,
					},
				},
			}, nil
		},
	}

	trigger := NewBuildTrigger(mockClient, testProjectName)
	inProgress, err := trigger.IsBuildInProgress(context.Background())

	assert.NoError(t, err)
	assert.True(t, inProgress, "Status IN_PROGRESS should be detected as in progress")
}

// TestBuildStatuses_Completed tests that all completed statuses are not detected as in-progress
func TestBuildStatuses_Completed(t *testing.T) {
	completedStatuses := []types.StatusType{
		types.StatusTypeSucceeded,
		types.StatusTypeFailed,
		types.StatusTypeFault,
		types.StatusTypeStopped,
		types.StatusTypeTimedOut,
	}

	for _, status := range completedStatuses {
		t.Run(string(status), func(t *testing.T) {
			mockClient := &MockCodeBuildClient{
				ListBuildsForProjectFunc: func(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
					return &codebuild.ListBuildsForProjectOutput{
						Ids: []string{"build-1"},
					}, nil
				},
				BatchGetBuildsFunc: func(ctx context.Context, params *codebuild.BatchGetBuildsInput, optFns ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
					return &codebuild.BatchGetBuildsOutput{
						Builds: []types.Build{
							{
								Id:          aws.String("build-1"),
								BuildStatus: status,
							},
						},
					}, nil
				},
			}

			trigger := NewBuildTrigger(mockClient, testProjectName)
			inProgress, err := trigger.IsBuildInProgress(context.Background())

			assert.NoError(t, err)
			assert.False(t, inProgress, "Status %s should not be detected as in progress", status)
		})
	}
}

// TestInterface tests that BuildTrigger implements the interface
func TestInterface(t *testing.T) {
	mockClient := &MockCodeBuildClient{}
	trigger := NewBuildTrigger(mockClient, testProjectName)

	// Verify interface compliance
	var _ Interface = trigger
}
