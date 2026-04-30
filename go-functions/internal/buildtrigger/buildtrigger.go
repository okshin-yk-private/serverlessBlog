// Package buildtrigger provides CodeBuild build trigger functionality.
//
// This package implements the build trigger for Astro SSG site rebuilds.
// It is called from the posts/update Lambda when a post is published.
//
// Requirement 10.1: When a post is published via Admin, the existing Go Lambda (posts/update)
//
//	shall trigger a CodeBuild project for site rebuild.
//
// Requirement 10.2: The trigger shall be invoked via AWS SDK call to CodeBuild StartBuild API
//
//	from within the Go Lambda.
//
// Requirement 10.3: The trigger shall include idempotency handling: if a build is already in progress,
//
//	the new request shall be queued or deduplicated.
//
// Requirement 10.4: The trigger shall use IAM role-based authorization (Lambda execution role
//
//	with codebuild:StartBuild permission).
//
// Requirement 10.9: When multiple posts are published in rapid succession, the system shall
//
//	coalesce builds (max 1 build per minute).
package buildtrigger

import (
	"context"
	"fmt"
	"regexp"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
	"github.com/aws/aws-sdk-go-v2/service/codebuild/types"
)

// DefaultMinInterval is the default minimum interval between builds (1 minute)
// Requirement 10.9: Max 1 build per minute
const DefaultMinInterval = 1 * time.Minute

// validProjectNameRE matches AWS CodeBuild project names: must start with an
// alphanumeric, followed by 1–254 alphanumerics, hyphens, or underscores
// (per the CodeBuild project-name constraint). Anything containing CR/LF or
// other control characters fails to match — which is what neutralizes the
// log-injection class flagged by gosec G706.
var validProjectNameRE = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{1,254}$`)

// SanitizeProjectName returns name unchanged if it satisfies AWS CodeBuild's
// project-name format, or "" otherwise. Use it at the os.Getenv trust
// boundary so subsequent slog calls operate on a vetted, well-formed string.
func SanitizeProjectName(name string) string {
	return validProjectNameRE.FindString(name)
}

// CodeBuildClientInterface defines the interface for CodeBuild operations
// This interface allows for mocking in tests
//
//nolint:dupl // Interface signatures necessarily match implementation in test mocks
type CodeBuildClientInterface interface {
	StartBuild(ctx context.Context, params *codebuild.StartBuildInput, optFns ...func(*codebuild.Options)) (*codebuild.StartBuildOutput, error)
	ListBuildsForProject(ctx context.Context, params *codebuild.ListBuildsForProjectInput, optFns ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error)
	BatchGetBuilds(ctx context.Context, params *codebuild.BatchGetBuildsInput, optFns ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error)
}

// Interface defines the interface for build triggers
type Interface interface {
	TriggerBuild(ctx context.Context) error
	IsBuildInProgress(ctx context.Context) (bool, error)
}

// BuildTrigger manages triggering CodeBuild projects for site rebuilds
type BuildTrigger struct {
	client        CodeBuildClientInterface
	projectName   string
	minInterval   time.Duration
	lastBuildTime time.Time
	mu            sync.Mutex
}

// NewBuildTrigger creates a new BuildTrigger with default min interval (1 minute)
func NewBuildTrigger(client CodeBuildClientInterface, projectName string) *BuildTrigger {
	return &BuildTrigger{
		client:      client,
		projectName: projectName,
		minInterval: DefaultMinInterval,
	}
}

// NewBuildTriggerWithMinInterval creates a new BuildTrigger with a custom min interval
func NewBuildTriggerWithMinInterval(client CodeBuildClientInterface, projectName string, minInterval time.Duration) *BuildTrigger {
	return &BuildTrigger{
		client:      client,
		projectName: projectName,
		minInterval: minInterval,
	}
}

// TriggerBuild triggers a CodeBuild project build
// Requirement 10.1: Trigger CodeBuild for site rebuild
// Requirement 10.3: Deduplicate if build is in progress
// Requirement 10.9: Coalesce builds within min interval
func (b *BuildTrigger) TriggerBuild(ctx context.Context) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Check min interval (coalesce rapid requests)
	if time.Since(b.lastBuildTime) < b.minInterval {
		return nil // Skip - too soon since last build
	}

	// Check if a build is already in progress
	inProgress, err := b.isBuildInProgressInternal(ctx)
	if err != nil {
		return fmt.Errorf("failed to check build status: %w", err)
	}

	if inProgress {
		return nil // Skip - build already in progress
	}

	// Start a new build
	_, err = b.client.StartBuild(ctx, &codebuild.StartBuildInput{
		ProjectName: aws.String(b.projectName),
	})
	if err != nil {
		return fmt.Errorf("failed to start build: %w", err)
	}

	// Update last build time
	b.lastBuildTime = time.Now()

	return nil
}

// IsBuildInProgress checks if any build is currently in progress
// Returns true if a build is queued, pending, or in progress
func (b *BuildTrigger) IsBuildInProgress(ctx context.Context) (bool, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.isBuildInProgressInternal(ctx)
}

// isBuildInProgressInternal is the internal implementation (must be called with lock held)
func (b *BuildTrigger) isBuildInProgressInternal(ctx context.Context) (bool, error) {
	// List recent builds for the project
	listOutput, err := b.client.ListBuildsForProject(ctx, &codebuild.ListBuildsForProjectInput{
		ProjectName: aws.String(b.projectName),
		SortOrder:   types.SortOrderTypeDescending,
	})
	if err != nil {
		return false, fmt.Errorf("failed to list builds: %w", err)
	}

	// No builds found
	if len(listOutput.Ids) == 0 {
		return false, nil
	}

	// Check only the most recent build (first one due to descending order)
	// We only need to check the latest build to determine if one is in progress
	buildIDs := listOutput.Ids
	if len(buildIDs) > 5 {
		buildIDs = buildIDs[:5] // Limit to 5 most recent builds
	}

	getOutput, err := b.client.BatchGetBuilds(ctx, &codebuild.BatchGetBuildsInput{
		Ids: buildIDs,
	})
	if err != nil {
		return false, fmt.Errorf("failed to get build status: %w", err)
	}

	// Check if any build is in progress
	for i := range getOutput.Builds {
		if isInProgressStatus(getOutput.Builds[i].BuildStatus) {
			return true, nil
		}
	}

	return false, nil
}

// isInProgressStatus returns true if the status indicates a build is still running
func isInProgressStatus(status types.StatusType) bool {
	// Note: StatusType only has IN_PROGRESS for running builds
	// QUEUED and PENDING are not separate statuses in AWS SDK v2
	return status == types.StatusTypeInProgress
}
