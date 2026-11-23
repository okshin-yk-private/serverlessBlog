package sitebuild

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
	codebuildtypes "github.com/aws/aws-sdk-go-v2/service/codebuild/types"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	dynamodbtypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// Issue #902: a StartBuild may succeed while the Build ID is never persisted.
// These tests cover recovery of such a stale StatusStarting item around the
// 5-minute CodeBuild IdempotencyToken lifetime.

var recoveryNow = time.Date(2026, 8, 2, 3, 0, 0, 0, time.UTC)

func recoveryTime(ago time.Duration) string {
	return recoveryNow.Add(-ago).Format(time.RFC3339Nano)
}

// staleStart is revision 2 locked with its original token; attemptAgo is the
// first StartBuild attempt and lockAgo the latest lock refresh.
func staleStart(attemptAgo, lockAgo time.Duration) State {
	return State{
		ID: StateItemID, DesiredRevision: 2, DeployedRevision: 1,
		ActiveRevision: 2, StartToken: "site-revision-2", Status: StatusStarting,
		StartedAt: recoveryTime(lockAgo), StartAttemptedAt: recoveryTime(attemptAgo),
	}
}

func historyBuild(id string, revision string, startedAgo time.Duration, status codebuildtypes.StatusType) codebuildtypes.Build {
	return codebuildtypes.Build{
		Id:          aws.String(id),
		BuildStatus: status,
		StartTime:   aws.Time(recoveryNow.Add(-startedAgo)),
		Environment: &codebuildtypes.ProjectEnvironment{EnvironmentVariables: []codebuildtypes.EnvironmentVariable{
			{Name: aws.String("OTHER"), Value: aws.String("x")},
			{Name: aws.String("CONTENT_REVISION"), Value: aws.String(revision)},
		}},
	}
}

func historyPage(next string, ids ...string) *codebuild.ListBuildsForProjectOutput {
	out := &codebuild.ListBuildsForProjectOutput{Ids: ids}
	if next != "" {
		out.NextToken = aws.String(next)
	}
	return out
}

func buildsByID(builds ...codebuildtypes.Build) map[string]codebuildtypes.Build {
	out := make(map[string]codebuildtypes.Build, len(builds))
	for _, build := range builds {
		out[aws.ToString(build.Id)] = build
	}
	return out
}

func reconcilerAt(dynamoClient *mockDynamoDB, codebuildClient *mockCodeBuild, now time.Time) *Coordinator {
	coordinator := NewReconcilerCoordinator(dynamoClient, codebuildClient, "posts", "site-project")
	coordinator.now = func() time.Time { return now }
	return coordinator
}

func postsCoordinatorAt(dynamoClient *mockDynamoDB, codebuildClient *mockCodeBuild, now time.Time) *Coordinator {
	coordinator := NewCoordinator(dynamoClient, codebuildClient, "posts", "site-project")
	coordinator.now = func() time.Time { return now }
	return coordinator
}

func stringAttr(t *testing.T, input *dynamodb.UpdateItemInput, name string) string {
	t.Helper()
	value, ok := input.ExpressionAttributeValues[name].(*dynamodbtypes.AttributeValueMemberS)
	if !ok {
		t.Fatalf("missing string value %s in %s", name, aws.ToString(input.UpdateExpression))
	}
	return value.Value
}

func newBuildOutput(id string) *codebuild.StartBuildOutput {
	return &codebuild.StartBuildOutput{Build: &codebuildtypes.Build{Id: aws.String(id)}}
}

func TestStartPendingFreshLockRecordsFirstStartAttempt(t *testing.T) {
	dynamoClient := &mockDynamoDB{states: []State{{ID: StateItemID, DesiredRevision: 2, DeployedRevision: 1, Status: StatusQueued}}}
	codebuildClient := &mockCodeBuild{startOutput: newBuildOutput("project:build-2")}

	if _, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background()); err != nil {
		t.Fatalf("StartPending returned error: %v", err)
	}
	lock := dynamoClient.updates[0]
	if !strings.Contains(aws.ToString(lock.UpdateExpression), "startAttemptedAt = :now") {
		t.Fatalf("a new token must record its first attempt time: %s", aws.ToString(lock.UpdateExpression))
	}
	if !strings.Contains(aws.ToString(lock.ConditionExpression), "attribute_not_exists(startToken)") {
		t.Fatalf("a fresh lock must not take over a starting item that still owns a token: %s", aws.ToString(lock.ConditionExpression))
	}
	if len(codebuildClient.listInputs) != 0 {
		t.Fatal("a fresh start must not read build history")
	}
}

func TestStartPendingReplaysSameTokenWithinReuseWindow(t *testing.T) {
	for _, elapsed := range []time.Duration{3 * time.Minute, 3*time.Minute + time.Second, 4*time.Minute + 29*time.Second} {
		t.Run(elapsed.String(), func(t *testing.T) {
			state := staleStart(elapsed, elapsed)
			state.DesiredRevision = 3 // a newer save stays queued behind the recovery
			dynamoClient := &mockDynamoDB{states: []State{state}}
			codebuildClient := &mockCodeBuild{startOutput: newBuildOutput("project:build-2")}

			request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
			if err != nil {
				t.Fatalf("StartPending returned error: %v", err)
			}
			if request.TargetRevision != 3 || request.Status != StatusQueued {
				t.Fatalf("newer revision must remain queued: %+v", request)
			}
			if len(codebuildClient.listInputs) != 0 || len(codebuildClient.batchInputs) != 0 {
				t.Fatal("a valid token must be replayed without reading build history")
			}
			if len(codebuildClient.startInputs) != 1 {
				t.Fatalf("expected one replay StartBuild, got %d", len(codebuildClient.startInputs))
			}
			input := codebuildClient.startInputs[0]
			if aws.ToString(input.IdempotencyToken) != "site-revision-2" || aws.ToString(input.EnvironmentVariablesOverride[0].Value) != "2" {
				t.Fatalf("must replay the exact active request: %+v", input)
			}
			lock := dynamoClient.updates[0]
			if expression := aws.ToString(lock.UpdateExpression); strings.Contains(expression, "startAttemptedAt") || strings.Contains(expression, "startToken") {
				t.Fatalf("lock refresh must not move the token or its first attempt time: %s", expression)
			}
			if condition := aws.ToString(lock.ConditionExpression); !strings.Contains(condition, "startAttemptedAt = :attemptedAt") || !strings.Contains(condition, "startToken = :token") {
				t.Fatalf("lock refresh must be conditional on the observed token attempt: %s", condition)
			}
			if got := stringAttr(t, lock, ":attemptedAt"); got != state.StartAttemptedAt {
				t.Fatalf("first attempt time changed: %s", got)
			}
		})
	}
}

func TestStartPendingUsesFirstAttemptNotLockRefreshForTokenExpiry(t *testing.T) {
	// The lock was refreshed 3m10s ago, but the token was first sent 6 minutes
	// ago. Before #902 the refresh reset the expiry basis and the token was
	// replayed after CodeBuild had forgotten it, starting a duplicate build.
	state := staleStart(6*time.Minute, 3*time.Minute+10*time.Second)
	dynamoClient := &mockDynamoDB{states: []State{state}}
	codebuildClient := &mockCodeBuild{
		listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-2")},
		builds:    buildsByID(historyBuild("project:build-2", "2", 6*time.Minute, codebuildtypes.StatusTypeInProgress)),
	}

	request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
	if err != nil {
		t.Fatalf("StartPending returned error: %v", err)
	}
	if len(codebuildClient.startInputs) != 0 {
		t.Fatalf("expired token must not be replayed: %+v", codebuildClient.startInputs)
	}
	if request.Status != StatusInProgress || request.BuildID != "project:build-2" {
		t.Fatalf("existing build must be recovered: %+v", request)
	}
}

func TestStartPendingTokenExpiryBoundaryRequiresHistoryCheck(t *testing.T) {
	for _, elapsed := range []time.Duration{4*time.Minute + 30*time.Second, 5 * time.Minute, 5*time.Minute + time.Second} {
		t.Run(elapsed.String(), func(t *testing.T) {
			dynamoClient := &mockDynamoDB{states: []State{staleStart(elapsed, elapsed)}}
			codebuildClient := &mockCodeBuild{
				listPages:   []*codebuild.ListBuildsForProjectOutput{historyPage("")},
				startOutput: newBuildOutput("project:build-2b"),
			}
			coordinator := reconcilerAt(dynamoClient, codebuildClient, recoveryNow)

			request, err := coordinator.StartPending(context.Background())
			if err != nil {
				t.Fatalf("StartPending returned error: %v", err)
			}
			if len(codebuildClient.listInputs) != 1 {
				t.Fatalf("an expired token must be checked against build history, got %d list calls", len(codebuildClient.listInputs))
			}
			list := codebuildClient.listInputs[0]
			if aws.ToString(list.ProjectName) != "site-project" || list.SortOrder != codebuildtypes.SortOrderTypeDescending {
				t.Fatalf("history must be read newest first for this project: %+v", list)
			}
			assertRestartedWithNewToken(t, dynamoClient, codebuildClient)
			if request.Status != StatusInProgress || request.BuildID != "project:build-2b" {
				t.Fatalf("unexpected restart request: %+v", request)
			}
		})
	}
}

func assertRestartedWithNewToken(t *testing.T, dynamoClient *mockDynamoDB, codebuildClient *mockCodeBuild) {
	t.Helper()
	if len(codebuildClient.startInputs) != 1 {
		t.Fatalf("expected one StartBuild with a new token, got %d", len(codebuildClient.startInputs))
	}
	input := codebuildClient.startInputs[0]
	token := aws.ToString(input.IdempotencyToken)
	if token == "site-revision-2" || !strings.HasPrefix(token, "site-revision-2-") || aws.ToString(input.EnvironmentVariablesOverride[0].Value) != "2" {
		t.Fatalf("restart must use a new token for the same revision: %+v", input)
	}
	if len(dynamoClient.updates) != 3 {
		t.Fatalf("expected lock refresh, token rotation and build-id updates, got %d", len(dynamoClient.updates))
	}
	rotation := dynamoClient.updates[1]
	if expression := aws.ToString(rotation.UpdateExpression); !strings.Contains(expression, "startToken = :newToken") || !strings.Contains(expression, "startAttemptedAt = :now") {
		t.Fatalf("new token must get a new first attempt time: %s", expression)
	}
	if got := stringAttr(t, rotation, ":newToken"); got != token {
		t.Fatalf("persisted token %q differs from StartBuild token %q", got, token)
	}
	if got, want := stringAttr(t, rotation, ":lockedAt"), stringAttr(t, dynamoClient.updates[0], ":now"); got != want {
		t.Fatalf("token rotation must require the lock this caller holds: %s != %s", got, want)
	}
	if got := stringAttr(t, dynamoClient.updates[2], ":token"); got != token {
		t.Fatalf("build-id update must match the new token: %s", got)
	}
}

func TestStartPendingAdoptsInProgressBuildAfterTokenExpiry(t *testing.T) {
	state := staleStart(7*time.Minute, 7*time.Minute)
	state.DesiredRevision = 3
	dynamoClient := &mockDynamoDB{states: []State{state}}
	codebuildClient := &mockCodeBuild{
		listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-9", "project:build-2", "project:build-1")},
		builds: buildsByID(
			historyBuild("project:build-9", "1", 2*time.Minute, codebuildtypes.StatusTypeFailed), // unrelated revision
			historyBuild("project:build-2", "2", 7*time.Minute, codebuildtypes.StatusTypeInProgress),
			historyBuild("project:build-1", "1", 30*time.Minute, codebuildtypes.StatusTypeSucceeded),
		),
	}

	request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
	if err != nil {
		t.Fatalf("StartPending returned error: %v", err)
	}
	if len(codebuildClient.startInputs) != 0 {
		t.Fatal("an existing build must be adopted instead of starting a duplicate")
	}
	if request.TargetRevision != 3 || request.Status != StatusQueued {
		t.Fatalf("newer revision must stay queued behind the adopted build: %+v", request)
	}
	if len(dynamoClient.updates) != 2 {
		t.Fatalf("expected lock refresh and adoption updates, got %d", len(dynamoClient.updates))
	}
	adopt := dynamoClient.updates[1]
	if stringAttr(t, adopt, ":buildId") != "project:build-2" || stringAttr(t, adopt, ":token") != "site-revision-2" {
		t.Fatalf("adoption must persist the matching build for the owning token: %+v", adopt.ExpressionAttributeValues)
	}
	if condition := aws.ToString(adopt.ConditionExpression); !strings.Contains(condition, "attribute_not_exists(activeBuildId)") || !strings.Contains(condition, "startedAt = :lockedAt") {
		t.Fatalf("adoption must be conditional on the held lock: %s", condition)
	}
	if ids := codebuildClient.batchInputs[0].Ids; len(ids) != 3 {
		t.Fatalf("build details must be read for the listed page: %v", ids)
	}
}

func TestStartPendingAdoptsSucceededBuildAndStartsTrailingRevision(t *testing.T) {
	initial := staleStart(8*time.Minute, 8*time.Minute)
	initial.DesiredRevision = 3
	afterCompletion := State{ID: StateItemID, DesiredRevision: 3, DeployedRevision: 2, Status: StatusSucceeded, LastBuildID: "project:build-2", LastBuildRevision: 2}
	final := State{ID: StateItemID, DesiredRevision: 3, DeployedRevision: 2, ActiveRevision: 3, ActiveBuildID: "project:build-3", Status: StatusInProgress}
	dynamoClient := &mockDynamoDB{states: []State{initial, afterCompletion, final}}
	codebuildClient := &mockCodeBuild{
		listPages:   []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-2")},
		builds:      buildsByID(historyBuild("project:build-2", "2", 8*time.Minute, codebuildtypes.StatusTypeSucceeded)),
		startOutput: newBuildOutput("project:build-3"),
	}

	request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
	if err != nil {
		t.Fatalf("StartPending returned error: %v", err)
	}
	if len(codebuildClient.startInputs) != 1 || aws.ToString(codebuildClient.startInputs[0].IdempotencyToken) != "site-revision-3" {
		t.Fatalf("only the trailing revision may start: %+v", codebuildClient.startInputs)
	}
	if request.TargetRevision != 3 || request.Status != StatusInProgress || request.BuildID != "project:build-3" {
		t.Fatalf("unexpected request after trailing start: %+v", request)
	}
	// lock refresh, adoption, success completion, trailing lock, trailing build id
	if len(dynamoClient.updates) != 5 {
		t.Fatalf("expected 5 updates, got %d", len(dynamoClient.updates))
	}
	completion := dynamoClient.updates[2]
	if !strings.Contains(aws.ToString(completion.UpdateExpression), "deployedRevision = :revision") || stringAttr(t, completion, ":buildId") != "project:build-2" {
		t.Fatalf("adopted build must be recorded as deployed: %s", aws.ToString(completion.UpdateExpression))
	}
	if !strings.Contains(aws.ToString(completion.UpdateExpression), "startAttemptedAt") {
		t.Fatalf("completion must clear the token attempt time: %s", aws.ToString(completion.UpdateExpression))
	}
}

func TestStartPendingAdoptsFinishedFailureWithoutRestartingSameRevision(t *testing.T) {
	for _, status := range []codebuildtypes.StatusType{
		codebuildtypes.StatusTypeFailed, codebuildtypes.StatusTypeFault, codebuildtypes.StatusTypeStopped, codebuildtypes.StatusTypeTimedOut,
	} {
		t.Run(string(status), func(t *testing.T) {
			initial := staleStart(8*time.Minute, 8*time.Minute)
			afterFailure := State{ID: StateItemID, DesiredRevision: 2, DeployedRevision: 1, ActiveRevision: 2, Status: StatusFailed, LastBuildRevision: 2, LastError: string(status)}
			dynamoClient := &mockDynamoDB{states: []State{initial, afterFailure, afterFailure}}
			codebuildClient := &mockCodeBuild{
				listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-2")},
				builds:    buildsByID(historyBuild("project:build-2", "2", 8*time.Minute, status)),
			}

			request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
			if err != nil {
				t.Fatalf("StartPending returned error: %v", err)
			}
			if len(codebuildClient.startInputs) != 0 {
				t.Fatal("a finished build of the same revision must not be started again")
			}
			if request.Status != StatusFailed || request.TargetRevision != 2 {
				t.Fatalf("finished failure must be reported: %+v", request)
			}
			if got := stringAttr(t, dynamoClient.updates[2], ":error"); got != string(status) {
				t.Fatalf("failure status not recorded: %s", got)
			}
		})
	}
}

func TestStartPendingAdoptsFailedBuildAndStartsNewerRevision(t *testing.T) {
	initial := staleStart(8*time.Minute, 8*time.Minute)
	initial.DesiredRevision = 3
	afterFailure := State{ID: StateItemID, DesiredRevision: 3, DeployedRevision: 1, ActiveRevision: 2, Status: StatusFailed, LastBuildRevision: 2}
	final := State{ID: StateItemID, DesiredRevision: 3, DeployedRevision: 1, ActiveRevision: 3, ActiveBuildID: "project:build-3", Status: StatusInProgress}
	dynamoClient := &mockDynamoDB{states: []State{initial, afterFailure, afterFailure, final}}
	codebuildClient := &mockCodeBuild{
		listPages:   []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-2")},
		builds:      buildsByID(historyBuild("project:build-2", "2", 8*time.Minute, codebuildtypes.StatusTypeFailed)),
		startOutput: newBuildOutput("project:build-3"),
	}

	request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
	if err != nil {
		t.Fatalf("StartPending returned error: %v", err)
	}
	if len(codebuildClient.startInputs) != 1 || aws.ToString(codebuildClient.startInputs[0].EnvironmentVariablesOverride[0].Value) != "3" {
		t.Fatalf("only the newer revision may start: %+v", codebuildClient.startInputs)
	}
	if request.Status != StatusInProgress || request.BuildID != "project:build-3" {
		t.Fatalf("unexpected request: %+v", request)
	}
}

func TestStartPendingSearchesHistoryAcrossPages(t *testing.T) {
	t.Run("match on second page", func(t *testing.T) {
		dynamoClient := &mockDynamoDB{states: []State{staleStart(10*time.Minute, 10*time.Minute)}}
		codebuildClient := &mockCodeBuild{
			listPages: []*codebuild.ListBuildsForProjectOutput{
				historyPage("page-2", "project:build-5", "project:build-4"),
				historyPage("page-3", "project:build-3", "project:build-2"),
			},
			builds: buildsByID(
				historyBuild("project:build-5", "1", time.Minute, codebuildtypes.StatusTypeFailed),
				historyBuild("project:build-4", "1", 5*time.Minute, codebuildtypes.StatusTypeFailed),
				historyBuild("project:build-3", "1", 8*time.Minute, codebuildtypes.StatusTypeFailed),
				historyBuild("project:build-2", "2", 10*time.Minute, codebuildtypes.StatusTypeInProgress),
			),
		}

		request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
		if err != nil {
			t.Fatalf("StartPending returned error: %v", err)
		}
		if len(codebuildClient.startInputs) != 0 || request.BuildID != "project:build-2" {
			t.Fatalf("build on a later page must be adopted: request=%+v starts=%d", request, len(codebuildClient.startInputs))
		}
		if len(codebuildClient.listInputs) != 2 || aws.ToString(codebuildClient.listInputs[1].NextToken) != "page-2" {
			t.Fatalf("second page must be requested with NextToken: %+v", codebuildClient.listInputs)
		}
	})

	t.Run("window covered without match", func(t *testing.T) {
		dynamoClient := &mockDynamoDB{states: []State{staleStart(10*time.Minute, 10*time.Minute)}}
		codebuildClient := &mockCodeBuild{
			listPages: []*codebuild.ListBuildsForProjectOutput{
				historyPage("page-2", "project:build-5"),
				// build-1 is older than the first attempt (minus skew) and
				// carries the same revision from an earlier failed run: it
				// must not be adopted, and it proves the window is covered.
				historyPage("page-3", "project:build-4", "project:build-1"),
			},
			builds: buildsByID(
				historyBuild("project:build-5", "1", 2*time.Minute, codebuildtypes.StatusTypeFailed),
				historyBuild("project:build-4", "1", 9*time.Minute, codebuildtypes.StatusTypeFailed),
				historyBuild("project:build-1", "2", 2*time.Hour, codebuildtypes.StatusTypeFailed),
			),
			startOutput: newBuildOutput("project:build-2b"),
		}

		if _, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background()); err != nil {
			t.Fatalf("StartPending returned error: %v", err)
		}
		if len(codebuildClient.listInputs) != 2 {
			t.Fatalf("history beyond the covered window must not be read: %d pages", len(codebuildClient.listInputs))
		}
		assertRestartedWithNewToken(t, dynamoClient, codebuildClient)
	})

	t.Run("history exhausted without match", func(t *testing.T) {
		dynamoClient := &mockDynamoDB{states: []State{staleStart(10*time.Minute, 10*time.Minute)}}
		codebuildClient := &mockCodeBuild{
			listPages:   []*codebuild.ListBuildsForProjectOutput{historyPage("page-2", "project:build-5"), historyPage("", "project:build-4")},
			builds:      buildsByID(historyBuild("project:build-5", "1", 2*time.Minute, codebuildtypes.StatusTypeFailed), historyBuild("project:build-4", "1", 9*time.Minute, codebuildtypes.StatusTypeFailed)),
			startOutput: newBuildOutput("project:build-2b"),
		}

		if _, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background()); err != nil {
			t.Fatalf("StartPending returned error: %v", err)
		}
		assertRestartedWithNewToken(t, dynamoClient, codebuildClient)
	})
}

func TestStartPendingFailsClosedWhenHistoryIsUncertain(t *testing.T) {
	inWindow := historyBuild("project:build-5", "1", time.Minute, codebuildtypes.StatusTypeFailed)
	limitPages := make([]*codebuild.ListBuildsForProjectOutput, maxHistoryPages)
	for i := range limitPages {
		limitPages[i] = historyPage("more", "project:build-5")
	}
	tests := []struct {
		name   string
		client *mockCodeBuild
	}{
		{name: "list error", client: &mockCodeBuild{listErr: errors.New("throttled")}},
		{name: "batch error", client: &mockCodeBuild{
			listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-5")},
			batchErr:  errors.New("throttled"),
		}},
		{name: "build not found", client: &mockCodeBuild{
			listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-5", "project:missing")},
			builds:    buildsByID(inWindow),
		}},
		{name: "page limit before window covered", client: &mockCodeBuild{listPages: limitPages, builds: buildsByID(inWindow)}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dynamoClient := &mockDynamoDB{states: []State{staleStart(10*time.Minute, 10*time.Minute)}}

			request, err := reconcilerAt(dynamoClient, tt.client, recoveryNow).StartPending(context.Background())
			if err == nil {
				t.Fatal("an uncertain history check must return an error for the next reconcile")
			}
			if len(tt.client.startInputs) != 0 {
				t.Fatal("must never start a build without proof that none exists")
			}
			if len(dynamoClient.updates) != 1 {
				t.Fatalf("only the lock refresh may be written, got %d updates", len(dynamoClient.updates))
			}
			if request.Status != StatusQueued {
				t.Fatalf("revision must remain queued: %+v", request)
			}
		})
	}
	if !errors.Is(func() error {
		dynamoClient := &mockDynamoDB{states: []State{staleStart(10*time.Minute, 10*time.Minute)}}
		_, err := reconcilerAt(dynamoClient, &mockCodeBuild{listPages: limitPages, builds: buildsByID(inWindow)}, recoveryNow).StartPending(context.Background())
		return err
	}(), errHistoryLimit) {
		t.Fatal("page-limit failure must be identifiable")
	}
}

func TestStartPendingConcurrentRecoveryLosesLockSafely(t *testing.T) {
	conditional := &dynamodbtypes.ConditionalCheckFailedException{Message: aws.String("lock taken")}
	winner := staleStart(10*time.Minute, 0)

	t.Run("lock refresh lost", func(t *testing.T) {
		dynamoClient := &mockDynamoDB{states: []State{staleStart(10*time.Minute, 10*time.Minute), winner}, updateErrors: []error{conditional}}
		codebuildClient := &mockCodeBuild{}

		request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
		if err != nil {
			t.Fatalf("losing the lock is not an error: %v", err)
		}
		if len(codebuildClient.listInputs) != 0 || len(codebuildClient.startInputs) != 0 {
			t.Fatal("the losing caller must neither read history nor start a build")
		}
		if request.Status != StatusQueued {
			t.Fatalf("unexpected request: %+v", request)
		}
	})

	t.Run("adoption lost", func(t *testing.T) {
		adopted := winner
		adopted.ActiveBuildID, adopted.Status = "project:build-2", StatusInProgress
		dynamoClient := &mockDynamoDB{states: []State{staleStart(10*time.Minute, 10*time.Minute), adopted}, updateErrors: []error{nil, conditional}}
		codebuildClient := &mockCodeBuild{
			listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-2")},
			builds:    buildsByID(historyBuild("project:build-2", "2", 10*time.Minute, codebuildtypes.StatusTypeInProgress)),
		}

		request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
		if err != nil || len(codebuildClient.startInputs) != 0 || request.BuildID != "project:build-2" {
			t.Fatalf("lost adoption must return the winner without starting: request=%+v err=%v", request, err)
		}
	})

	t.Run("token rotation lost", func(t *testing.T) {
		dynamoClient := &mockDynamoDB{states: []State{staleStart(10*time.Minute, 10*time.Minute), winner}, updateErrors: []error{nil, conditional}}
		codebuildClient := &mockCodeBuild{listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("")}}

		if _, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background()); err != nil {
			t.Fatalf("losing the rotation is not an error: %v", err)
		}
		if len(codebuildClient.startInputs) != 0 {
			t.Fatal("a caller that lost the rotation must not start a build")
		}
	})

	t.Run("non-stale lock is left alone", func(t *testing.T) {
		dynamoClient := &mockDynamoDB{states: []State{staleStart(10*time.Minute, 2*time.Minute)}}
		codebuildClient := &mockCodeBuild{}
		if _, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background()); err != nil {
			t.Fatalf("StartPending returned error: %v", err)
		}
		if len(dynamoClient.updates) != 0 || len(codebuildClient.listInputs) != 0 || len(codebuildClient.startInputs) != 0 {
			t.Fatal("a recently refreshed lock belongs to another caller")
		}
	})
}

func TestStartPendingLegacyStartingItemWithoutAttemptTime(t *testing.T) {
	legacy := func() State {
		state := staleStart(0, 3*time.Minute+30*time.Second)
		state.StartAttemptedAt = ""
		return state
	}

	t.Run("reconciler checks history instead of replaying", func(t *testing.T) {
		dynamoClient := &mockDynamoDB{states: []State{legacy()}}
		codebuildClient := &mockCodeBuild{
			// The legacy startedAt may have been refreshed after the original
			// StartBuild, so a build started before it is still searched.
			listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-2")},
			builds:    buildsByID(historyBuild("project:build-2", "2", 40*time.Minute, codebuildtypes.StatusTypeInProgress)),
		}

		request, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
		if err != nil {
			t.Fatalf("StartPending returned error: %v", err)
		}
		if len(codebuildClient.startInputs) != 0 || request.BuildID != "project:build-2" {
			t.Fatalf("legacy item must recover the existing build: request=%+v starts=%d", request, len(codebuildClient.startInputs))
		}
		if condition := aws.ToString(dynamoClient.updates[0].ConditionExpression); !strings.Contains(condition, "attribute_not_exists(startAttemptedAt)") {
			t.Fatalf("legacy lock refresh must require the legacy shape: %s", condition)
		}
	})

	t.Run("posts caller waits for reconciler", func(t *testing.T) {
		dynamoClient := &mockDynamoDB{states: []State{legacy()}}
		codebuildClient := &mockCodeBuild{}
		request, err := postsCoordinatorAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
		if err != nil || request.Status != StatusQueued {
			t.Fatalf("posts caller must wait without error: request=%+v err=%v", request, err)
		}
		if len(dynamoClient.updates) != 0 || len(codebuildClient.startInputs) != 0 || len(codebuildClient.listInputs) != 0 {
			t.Fatal("posts caller must not touch a legacy starting item")
		}
	})
}

func TestStartPendingPostsCallerNeverReadsHistory(t *testing.T) {
	t.Run("expired token waits for reconciler", func(t *testing.T) {
		state := staleStart(6*time.Minute, 6*time.Minute)
		state.DesiredRevision = 3
		dynamoClient := &mockDynamoDB{states: []State{state}}
		// The mock implements ListBuildsForProject, as the real client does;
		// a posts coordinator must still never call it.
		codebuildClient := &mockCodeBuild{}

		request, err := postsCoordinatorAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
		if err != nil {
			t.Fatalf("posts caller must not surface an error: %v", err)
		}
		if request.TargetRevision != 3 || request.Status != StatusQueued {
			t.Fatalf("revision must remain queued for the reconciler: %+v", request)
		}
		if len(codebuildClient.listInputs) != 0 || len(codebuildClient.batchInputs) != 0 || len(codebuildClient.startInputs) != 0 || len(dynamoClient.updates) != 0 {
			t.Fatal("posts caller must neither read history, start a build, nor take the lock")
		}
	})

	t.Run("valid token is replayed without history", func(t *testing.T) {
		dynamoClient := &mockDynamoDB{states: []State{staleStart(4*time.Minute, 4*time.Minute)}}
		codebuildClient := &mockCodeBuild{startOutput: newBuildOutput("project:build-2")}

		request, err := postsCoordinatorAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background())
		if err != nil || request.BuildID != "project:build-2" {
			t.Fatalf("posts caller may replay a valid token: request=%+v err=%v", request, err)
		}
		if len(codebuildClient.listInputs) != 0 || len(codebuildClient.startInputs) != 1 || aws.ToString(codebuildClient.startInputs[0].IdempotencyToken) != "site-revision-2" {
			t.Fatalf("expected one same-token replay and no history read: %+v", codebuildClient.startInputs)
		}
	})
}

func TestReconcileRecoversLostBuildIDThroughHistory(t *testing.T) {
	initial := staleStart(7*time.Minute, 7*time.Minute)
	adopted := initial
	adopted.ActiveBuildID, adopted.Status = "project:build-2", StatusInProgress
	dynamoClient := &mockDynamoDB{states: []State{initial, initial, adopted}}
	codebuildClient := &mockCodeBuild{
		listPages: []*codebuild.ListBuildsForProjectOutput{historyPage("", "project:build-2")},
		builds:    buildsByID(historyBuild("project:build-2", "2", 7*time.Minute, codebuildtypes.StatusTypeInProgress)),
	}

	state, err := reconcilerAt(dynamoClient, codebuildClient, recoveryNow).Reconcile(context.Background())
	if err != nil {
		t.Fatalf("Reconcile returned error: %v", err)
	}
	if state.ActiveBuildID != "project:build-2" || len(codebuildClient.startInputs) != 0 {
		t.Fatalf("reconcile must recover the lost Build ID without a duplicate: %+v", state)
	}
}
