package sitebuild

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
	codebuildtypes "github.com/aws/aws-sdk-go-v2/service/codebuild/types"
	"github.com/aws/smithy-go"
)

// Edge cases for #902 recovery: lost StartBuild responses, history paging,
// unclassifiable builds, the token safety margin, and the stale boundary.

func queuedRevision2() State {
	return State{ID: StateItemID, DesiredRevision: 2, DeployedRevision: 1, Status: StatusQueued}
}

func TestStartBuildUnknownOutcomeKeepsStartLock(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		output *codebuild.StartBuildOutput
	}{
		{name: "network error", err: errors.New("connection reset by peer")},
		{name: "timeout", err: context.DeadlineExceeded},
		{name: "throttling", err: &smithy.GenericAPIError{Code: "ThrottlingException", Message: "slow down"}},
		{name: "server error", err: &smithy.GenericAPIError{Code: "InternalFailure", Message: "5xx"}},
		{name: "missing build ID", output: &codebuild.StartBuildOutput{}},
		{name: "empty build ID", output: &codebuild.StartBuildOutput{Build: &codebuildtypes.Build{Id: aws.String("")}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dynamoClient := &mockDynamoDB{states: []State{queuedRevision2()}}
			codebuildClient := &mockCodeBuild{startErr: tt.err, startOutput: tt.output}

			request, err := postsCoordinatorAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
			if err == nil {
				t.Fatal("an unknown StartBuild outcome must be reported")
			}
			if tt.err != nil && !errors.Is(err, tt.err) {
				t.Fatalf("cause must be preserved: %v", err)
			}
			if len(dynamoClient.updates) != 1 {
				t.Fatalf("only the start lock may be written (no failure record that clears the token), got %d updates", len(dynamoClient.updates))
			}
			if request.Status != StatusQueued || request.TargetRevision != 2 {
				t.Fatalf("revision must stay pending for token replay or history recovery: %+v", request)
			}
		})
	}
}

func TestStartBuildDefinitiveRejectionRecordsFailure(t *testing.T) {
	for _, rejection := range []error{
		&codebuildtypes.InvalidInputException{Message: aws.String("invalid")},
		&codebuildtypes.ResourceNotFoundException{Message: aws.String("no project")},
		&codebuildtypes.AccountLimitExceededException{Message: aws.String("limit")},
		&smithy.GenericAPIError{Code: errorCodeAccessDenied, Message: "denied"},
	} {
		t.Run(fmt.Sprintf("%T", rejection), func(t *testing.T) {
			dynamoClient := &mockDynamoDB{states: []State{queuedRevision2()}}
			codebuildClient := &mockCodeBuild{startErr: rejection}

			request, err := postsCoordinatorAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
			if err == nil || request.Status != StatusFailed {
				t.Fatalf("definitive rejection must be a failure: request=%+v err=%v", request, err)
			}
			if len(dynamoClient.updates) != 2 {
				t.Fatalf("expected lock and conditional failure updates, got %d", len(dynamoClient.updates))
			}
			if got := stringAttr(t, dynamoClient.updates[1], ":token"); got != "site-revision-2" {
				t.Fatalf("failure record must be conditioned on the caller's token: %s", got)
			}
		})
	}
}

func TestStartPendingSafetyMarginRecoversButNeverIssuesNewToken(t *testing.T) {
	for _, elapsed := range []time.Duration{4*time.Minute + 30*time.Second, 4*time.Minute + 59*time.Second} {
		t.Run(elapsed.String()+"/match", func(t *testing.T) {
			dynamoClient := &mockDynamoDB{states: []State{staleStart(elapsed, elapsed)}}
			codebuildClient := &mockCodeBuild{
				listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-2")},
				builds:    buildsByID(historyBuild("project:build-2", "2", elapsed, codebuildtypes.StatusTypeInProgress)),
			}
			request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
			if err != nil || request.BuildID != "project:build-2" || len(codebuildClient.startInputs) != 0 {
				t.Fatalf("an existing build must be recovered in the margin: request=%+v err=%v", request, err)
			}
		})
		t.Run(elapsed.String()+"/no match", func(t *testing.T) {
			dynamoClient := &mockDynamoDB{states: []State{staleStart(elapsed, elapsed)}}
			codebuildClient := &mockCodeBuild{listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("")}}
			request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
			if err != nil {
				t.Fatalf("waiting for token expiry is not an error: %v", err)
			}
			if len(codebuildClient.startInputs) != 0 {
				t.Fatal("no StartBuild may be issued while the old token may still be honored")
			}
			if len(dynamoClient.updates) != 1 {
				t.Fatalf("only the lock refresh may be written (no token rotation), got %d", len(dynamoClient.updates))
			}
			if request.Status != StatusQueued {
				t.Fatalf("revision must remain queued: %+v", request)
			}
		})
	}
}

func TestStartPendingPaginatesPastOneHundredBuilds(t *testing.T) {
	firstPage := make([]string, 0, 100)
	builds := make([]codebuildtypes.Build, 0, 101)
	for i := 0; i < 100; i++ {
		id := fmt.Sprintf("project:build-%d", 200-i)
		firstPage = append(firstPage, id)
		builds = append(builds, historyBuild(id, "1", time.Minute, codebuildtypes.StatusTypeFailed))
	}
	run := func(t *testing.T, lastRevision string) (*mockDynamoDB, *mockCodeBuild, Request) {
		t.Helper()
		all := append(append([]codebuildtypes.Build{}, builds...), historyBuild("project:build-100", lastRevision, 9*time.Minute, codebuildtypes.StatusTypeInProgress))
		dynamoClient := &mockDynamoDB{states: []State{staleStart(10*time.Minute, 10*time.Minute)}}
		codebuildClient := &mockCodeBuild{
			listPages:   []*codebuild.ListBuildsForProjectOutput{historyPage("page-2", firstPage...), historyPage("", "project:build-100")},
			builds:      buildsByID(all...),
			startOutput: newBuildOutput("project:build-201"),
		}
		request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
		if err != nil {
			t.Fatalf("StartPending returned error: %v", err)
		}
		if len(codebuildClient.listInputs) != 2 || aws.ToString(codebuildClient.listInputs[1].NextToken) != "page-2" {
			t.Fatalf("the 101st build must be read through NextToken: %+v", codebuildClient.listInputs)
		}
		for _, input := range codebuildClient.listInputs {
			if input.SortOrder != "" {
				t.Fatalf("SortOrder must not be sent: %+v", input)
			}
		}
		return dynamoClient, codebuildClient, request
	}

	t.Run("match on page 2", func(t *testing.T) {
		_, codebuildClient, request := run(t, "2")
		if request.BuildID != "project:build-100" || len(codebuildClient.startInputs) != 0 {
			t.Fatalf("build on page 2 must be adopted: %+v", request)
		}
	})
	t.Run("no match after full history", func(t *testing.T) {
		dynamoClient, codebuildClient, _ := run(t, "1")
		assertRestartedWithNewToken(t, dynamoClient, codebuildClient)
	})
}

func TestStartPendingDoesNotStopPagingOnOldStartTime(t *testing.T) {
	// Start times need not follow build numbers. An old build on page 1 must
	// not end the search before page 2.
	dynamoClient := &mockDynamoDB{states: []State{staleStart(10*time.Minute, 10*time.Minute)}}
	codebuildClient := &mockCodeBuild{
		listPages: []*codebuild.ListBuildsForProjectOutput{
			historyPage("page-2", "project:build-9", "project:build-8"),
			historyPage("", "project:build-7"),
		},
		builds: buildsByID(
			historyBuild("project:build-9", "1", time.Minute, codebuildtypes.StatusTypeFailed),
			historyBuild("project:build-8", "1", 3*time.Hour, codebuildtypes.StatusTypeFailed),
			historyBuild("project:build-7", "2", 9*time.Minute, codebuildtypes.StatusTypeInProgress),
		),
	}
	request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
	if err != nil || request.BuildID != "project:build-7" || len(codebuildClient.startInputs) != 0 {
		t.Fatalf("match after an older start time must be found: request=%+v err=%v", request, err)
	}
}

func TestStartPendingPrefersNewestBuildOfSameRevision(t *testing.T) {
	dynamoClient := &mockDynamoDB{states: []State{staleStart(10*time.Minute, 10*time.Minute)}}
	codebuildClient := &mockCodeBuild{
		listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-7", "project:build-6")},
		builds: buildsByID(
			historyBuild("project:build-7", "2", 6*time.Minute, codebuildtypes.StatusTypeInProgress),
			historyBuild("project:build-6", "2", 9*time.Minute, codebuildtypes.StatusTypeFailed),
		),
	}
	request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
	if err != nil || request.BuildID != "project:build-7" {
		t.Fatalf("the newest build number of the revision must be adopted: request=%+v err=%v", request, err)
	}
	if got := stringAttr(t, dynamoClient.updates[1], ":buildId"); got != "project:build-7" {
		t.Fatalf("adopted %s", got)
	}
}

func TestStartPendingLegacyItemSearchesWholeHistory(t *testing.T) {
	// Older code moved startedAt on every retry. A build accepted at T0 can
	// therefore be far older than startedAt; a legacy item (no
	// startAttemptedAt) must not apply any start-time lower bound.
	legacy := func() State {
		state := staleStart(0, 3*time.Minute)
		state.StartAttemptedAt = ""
		return state
	}
	originalBuild := historyBuild("project:build-2", "2", 75*time.Minute, codebuildtypes.StatusTypeInProgress)

	t.Run("build 70+ minutes older than startedAt is recovered", func(t *testing.T) {
		dynamoClient := &mockDynamoDB{states: []State{legacy()}}
		codebuildClient := &mockCodeBuild{
			listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-2")},
			builds:    buildsByID(originalBuild),
		}
		request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
		if err != nil || request.BuildID != "project:build-2" || len(codebuildClient.startInputs) != 0 {
			t.Fatalf("the original build must be recovered: request=%+v err=%v", request, err)
		}
	})

	t.Run("still recovered after a long history outage", func(t *testing.T) {
		// First reconcile: history unavailable. The refresh must not persist
		// any bound that a later run would apply.
		dynamoClient := &mockDynamoDB{states: []State{legacy()}}
		failing := &mockCodeBuild{listErr: errors.New("throttled")}
		if _, err := reconcilerAt(dynamoClient, failing, recoveryNow).StartPending(context.Background()); err == nil {
			t.Fatal("history outage must fail closed")
		}
		if expression := aws.ToString(dynamoClient.updates[0].UpdateExpression); expression != "SET startedAt = :now REMOVE lastError" {
			t.Fatalf("legacy refresh must only move the lock: %s", expression)
		}
		// Two hours later the item is still legacy-shaped with a refreshed lock.
		later := recoveryNow.Add(2 * time.Hour)
		state := legacy()
		state.StartedAt = formatLockTime(later.Add(-3 * time.Minute))
		dynamoClient = &mockDynamoDB{states: []State{state}}
		codebuildClient := &mockCodeBuild{
			listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-2")},
			builds:    buildsByID(originalBuild),
		}
		request, err := reconcilerAt(dynamoClient, codebuildClient, later).StartPending(context.Background())
		if err != nil || request.BuildID != "project:build-2" || len(codebuildClient.startInputs) != 0 {
			t.Fatalf("the original build must be recovered after the outage: request=%+v err=%v", request, err)
		}
	})
}

func TestStartBuildReplayRejectionKeepsToken(t *testing.T) {
	for _, rejection := range []error{
		&smithy.GenericAPIError{Code: errorCodeAccessDenied, Message: "denied"},
		&codebuildtypes.InvalidInputException{Message: aws.String("invalid")},
		&codebuildtypes.AccountLimitExceededException{Message: aws.String("limit")},
	} {
		t.Run(fmt.Sprintf("%T", rejection), func(t *testing.T) {
			state := staleStart(4*time.Minute, 4*time.Minute)
			dynamoClient := &mockDynamoDB{states: []State{state}}
			codebuildClient := &mockCodeBuild{startErr: rejection}

			request, err := postsCoordinatorAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
			if err == nil || !errors.Is(err, rejection) {
				t.Fatalf("replay rejection must be reported: %v", err)
			}
			if len(codebuildClient.startInputs) != 1 || aws.ToString(codebuildClient.startInputs[0].IdempotencyToken) != "site-revision-2" {
				t.Fatalf("expected one same-token replay: %+v", codebuildClient.startInputs)
			}
			if len(dynamoClient.updates) != 1 {
				t.Fatalf("a rejected replay must not record a failure that clears the token, got %d updates", len(dynamoClient.updates))
			}
			if expression := aws.ToString(dynamoClient.updates[0].UpdateExpression); strings.Contains(expression, "REMOVE activeBuildId") || strings.Contains(expression, "startToken") {
				t.Fatalf("only the lock may move: %s", expression)
			}
			if request.Status != StatusQueued {
				t.Fatalf("revision must stay starting/queued: %+v", request)
			}
		})
	}
}

func TestStartBuildNewTokenRejectionRecordsFailure(t *testing.T) {
	// After history proved no build exists, a rejection of the new token's
	// first StartBuild is definitive and is recorded.
	dynamoClient := &mockDynamoDB{states: []State{staleStart(10*time.Minute, 10*time.Minute)}}
	codebuildClient := &mockCodeBuild{
		listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("")},
		startErr:  &codebuildtypes.InvalidInputException{Message: aws.String("invalid")},
	}
	request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
	if err == nil || request.Status != StatusFailed {
		t.Fatalf("new-token rejection must be a failure: request=%+v err=%v", request, err)
	}
	if len(dynamoClient.updates) != 3 {
		t.Fatalf("expected refresh, rotation and failure updates, got %d", len(dynamoClient.updates))
	}
	if got, want := stringAttr(t, dynamoClient.updates[2], ":token"), stringAttr(t, dynamoClient.updates[1], ":newToken"); got != want {
		t.Fatalf("failure must be conditioned on the new token: %s vs %s", got, want)
	}
}

func TestStartPendingFailsClosedOnUnclassifiableBuild(t *testing.T) {
	withEnv := func(env *codebuildtypes.ProjectEnvironment) codebuildtypes.Build {
		build := historyBuild("project:build-5", "2", 2*time.Minute, codebuildtypes.StatusTypeInProgress)
		build.Environment = env
		return build
	}
	revisionVariable := func(value *string) *codebuildtypes.ProjectEnvironment {
		return &codebuildtypes.ProjectEnvironment{EnvironmentVariables: []codebuildtypes.EnvironmentVariable{{Name: aws.String("CONTENT_REVISION"), Value: value}}}
	}
	withStatus := func(status codebuildtypes.StatusType) codebuildtypes.Build {
		return historyBuild("project:build-5", "2", 2*time.Minute, status)
	}
	tests := []struct {
		name  string
		build codebuildtypes.Build
	}{
		{name: "environment missing", build: withEnv(nil)},
		{name: "revision value nil", build: withEnv(revisionVariable(nil))},
		{name: "revision value empty", build: withEnv(revisionVariable(aws.String("")))},
		{name: "revision value not integer", build: withEnv(revisionVariable(aws.String("two")))},
		{name: "matching build with empty status", build: withStatus("")},
		{name: "matching build with unknown status", build: withStatus("PENDING_SOMETHING")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dynamoClient := &mockDynamoDB{states: []State{staleStart(10*time.Minute, 10*time.Minute)}}
			codebuildClient := &mockCodeBuild{
				listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-5")},
				builds:    buildsByID(tt.build),
			}
			request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
			if err == nil {
				t.Fatal("an unclassifiable build must fail closed")
			}
			if len(codebuildClient.startInputs) != 0 {
				t.Fatal("must not start a build")
			}
			if len(dynamoClient.updates) != 1 {
				t.Fatalf("only the lock refresh may be written (no adoption, release or trailing start), got %d", len(dynamoClient.updates))
			}
			if request.Status != StatusQueued {
				t.Fatalf("lock must be kept: %+v", request)
			}
		})
	}
}

func TestStartPendingSkipsBuildsWithoutContentRevision(t *testing.T) {
	// A manual run has an environment but no CONTENT_REVISION: it is not a
	// coordinator build and does not block the restart.
	manual := historyBuild("project:build-5", "2", 2*time.Minute, codebuildtypes.StatusTypeInProgress)
	manual.Environment = &codebuildtypes.ProjectEnvironment{EnvironmentVariables: []codebuildtypes.EnvironmentVariable{{Name: aws.String("OTHER"), Value: aws.String("x")}}}
	dynamoClient := &mockDynamoDB{states: []State{staleStart(10*time.Minute, 10*time.Minute)}}
	codebuildClient := &mockCodeBuild{
		listPages:   []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-5")},
		builds:      buildsByID(manual),
		startOutput: newBuildOutput("project:build-2b"),
	}
	if _, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background()); err != nil {
		t.Fatalf("StartPending returned error: %v", err)
	}
	assertRestartedWithNewToken(t, dynamoClient, codebuildClient)
}

func TestReconcileKeepsActiveBuildOnUnknownStatus(t *testing.T) {
	for _, status := range []codebuildtypes.StatusType{"", "SOMETHING_NEW"} {
		t.Run(string(status), func(t *testing.T) {
			initial := State{ID: StateItemID, DesiredRevision: 3, DeployedRevision: 1, ActiveRevision: 2, ActiveBuildID: "project:build-2", Status: StatusInProgress}
			dynamoClient := &mockDynamoDB{states: []State{initial}}
			codebuildClient := &mockCodeBuild{batchOutput: &codebuild.BatchGetBuildsOutput{Builds: []codebuildtypes.Build{{BuildStatus: status}}}}
			if _, err := NewReconcilerCoordinator(dynamoClient, codebuildClient, "posts", "site-project").Reconcile(context.Background()); err == nil {
				t.Fatal("unknown status must be an error")
			}
			if len(dynamoClient.updates) != 0 || len(codebuildClient.startInputs) != 0 {
				t.Fatal("unknown status must not release the slot or start a build")
			}
		})
	}
}

func TestStaleBoundaryUsesParsedTimeAndRawValueCondition(t *testing.T) {
	timeout := 3 * time.Minute
	base := time.Date(2026, 11, 23, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name      string
		startedAt string
		lockTime  time.Time
	}{
		{name: "second precision", startedAt: "2026-11-23T12:00:00Z", lockTime: base},
		{name: "short fraction", startedAt: "2026-11-23T12:00:00.1Z", lockTime: base.Add(100 * time.Millisecond)},
		{name: "fixed width", startedAt: formatLockTime(base), lockTime: base},
	}
	for _, tt := range tests {
		lockedState := func() State {
			return State{
				ID: StateItemID, DesiredRevision: 2, DeployedRevision: 1, ActiveRevision: 2,
				StartToken: "site-revision-2", Status: StatusStarting,
				StartedAt: tt.startedAt, StartAttemptedAt: formatLockTime(tt.lockTime),
			}
		}
		t.Run(tt.name+"/exactly three minutes", func(t *testing.T) {
			now := tt.lockTime.Add(timeout)
			dynamoClient := &mockDynamoDB{states: []State{lockedState()}}
			codebuildClient := &mockCodeBuild{startOutput: newBuildOutput("project:build-2")}
			request, err := postsCoordinatorAt(dynamoClient, codebuildClient, now).StartPending(context.Background())
			if err != nil || request.BuildID != "project:build-2" {
				t.Fatalf("lock at the boundary must be re-acquired: request=%+v err=%v", request, err)
			}
			refresh := dynamoClient.updates[0]
			if condition := aws.ToString(refresh.ConditionExpression); !strings.Contains(condition, "startedAt = :expectedStartedAt") || strings.Contains(condition, "<") {
				t.Fatalf("condition must test the raw value, never order timestamps: %s", condition)
			}
			if got := stringAttr(t, refresh, ":expectedStartedAt"); got != tt.startedAt {
				t.Fatalf("condition must use the raw startedAt read: %s", got)
			}
		})
		t.Run(tt.name+"/one nanosecond short", func(t *testing.T) {
			now := tt.lockTime.Add(timeout - time.Nanosecond)
			dynamoClient := &mockDynamoDB{states: []State{lockedState()}}
			codebuildClient := &mockCodeBuild{}
			if _, err := postsCoordinatorAt(dynamoClient, codebuildClient, now).StartPending(context.Background()); err != nil {
				t.Fatalf("StartPending returned error: %v", err)
			}
			if len(dynamoClient.updates) != 0 || len(codebuildClient.startInputs) != 0 {
				t.Fatal("a lock just short of the timeout must be left alone")
			}
		})
		t.Run(tt.name+"/concurrent refresh detected", func(t *testing.T) {
			now := tt.lockTime.Add(timeout)
			winner := lockedState()
			winner.StartedAt = formatLockTime(now)
			dynamoClient := &mockDynamoDB{states: []State{lockedState(), winner}, liveStartedAt: &winner.StartedAt}
			codebuildClient := &mockCodeBuild{}
			request, err := postsCoordinatorAt(dynamoClient, codebuildClient, now).StartPending(context.Background())
			if err != nil {
				t.Fatalf("losing the lock is not an error: %v", err)
			}
			if len(codebuildClient.startInputs) != 0 || request.Status != StatusQueued {
				t.Fatalf("the caller that lost the lock must not start a build: request=%+v", request)
			}
		})
	}
}
