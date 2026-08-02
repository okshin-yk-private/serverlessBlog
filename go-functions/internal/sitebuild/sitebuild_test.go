package sitebuild

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
	codebuildtypes "github.com/aws/aws-sdk-go-v2/service/codebuild/types"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	dynamodbtypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type mockDynamoDB struct {
	states       []State
	getCall      int
	getErr       error
	emptyGet     bool
	updates      []*dynamodb.UpdateItemInput
	updateErrors []error
}

func (m *mockDynamoDB) GetItem(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	if m.getErr != nil {
		return nil, m.getErr
	}
	if m.emptyGet {
		return &dynamodb.GetItemOutput{}, nil
	}
	if m.getCall >= len(m.states) {
		return nil, errors.New("unexpected GetItem call")
	}
	item, err := attributevalue.MarshalMap(m.states[m.getCall])
	m.getCall++
	if err != nil {
		return nil, err
	}
	return &dynamodb.GetItemOutput{Item: item}, nil
}

func (m *mockDynamoDB) UpdateItem(_ context.Context, input *dynamodb.UpdateItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
	call := len(m.updates)
	m.updates = append(m.updates, input)
	if call < len(m.updateErrors) && m.updateErrors[call] != nil {
		return nil, m.updateErrors[call]
	}
	return &dynamodb.UpdateItemOutput{}, nil
}

type mockCodeBuild struct {
	startInputs []*codebuild.StartBuildInput
	startOutput *codebuild.StartBuildOutput
	startErr    error
	batchOutput *codebuild.BatchGetBuildsOutput
	batchErr    error
}

func (m *mockCodeBuild) StartBuild(_ context.Context, input *codebuild.StartBuildInput, _ ...func(*codebuild.Options)) (*codebuild.StartBuildOutput, error) {
	m.startInputs = append(m.startInputs, input)
	if m.startErr != nil {
		return nil, m.startErr
	}
	return m.startOutput, nil
}

func (m *mockCodeBuild) BatchGetBuilds(_ context.Context, _ *codebuild.BatchGetBuildsInput, _ ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
	if m.batchErr != nil {
		return nil, m.batchErr
	}
	return m.batchOutput, nil
}

func TestRequestUpdateAtomicallyIncrementsDesiredRevision(t *testing.T) {
	item := RequestUpdate("posts", time.Date(2026, 8, 2, 1, 2, 3, 0, time.UTC))
	if item.Update == nil || aws.ToString(item.Update.TableName) != "posts" {
		t.Fatal("expected a transaction update for the posts table")
	}
	expression := aws.ToString(item.Update.UpdateExpression)
	if !strings.Contains(expression, "ADD desiredRevision :one") {
		t.Fatalf("desiredRevision must be incremented atomically: %s", expression)
	}
	if !strings.Contains(expression, "#status = if_not_exists(#status, :queued)") {
		t.Fatalf("an active starting/in-progress status must be preserved: %s", expression)
	}
	if got := item.Update.ExpressionAttributeValues[":queued"].(*dynamodbtypes.AttributeValueMemberS); got.Value != StatusQueued {
		t.Fatalf("expected queued state, got %q", got.Value)
	}
}

func TestStartPendingStartsDesiredRevisionWithIdempotencyToken(t *testing.T) {
	dynamoClient := &mockDynamoDB{states: []State{{
		ID: StateItemID, DesiredRevision: 2, DeployedRevision: 1, Status: StatusQueued,
	}}}
	codebuildClient := &mockCodeBuild{startOutput: &codebuild.StartBuildOutput{
		Build: &codebuildtypes.Build{Id: aws.String("project:build-2")},
	}}
	coordinator := NewCoordinator(dynamoClient, codebuildClient, "posts", "site-project")
	coordinator.now = func() time.Time { return time.Date(2026, 8, 2, 2, 0, 0, 0, time.UTC) }

	request, err := coordinator.StartPending(context.Background())
	if err != nil {
		t.Fatalf("StartPending returned error: %v", err)
	}
	if request.TargetRevision != 2 || request.BuildID != "project:build-2" || request.Status != StatusInProgress {
		t.Fatalf("unexpected request: %+v", request)
	}
	if len(codebuildClient.startInputs) != 1 {
		t.Fatalf("expected one StartBuild call, got %d", len(codebuildClient.startInputs))
	}
	input := codebuildClient.startInputs[0]
	if aws.ToString(input.IdempotencyToken) != "site-revision-2" {
		t.Fatalf("unexpected idempotency token: %q", aws.ToString(input.IdempotencyToken))
	}
	if len(input.EnvironmentVariablesOverride) != 1 || aws.ToString(input.EnvironmentVariablesOverride[0].Value) != "2" {
		t.Fatalf("CONTENT_REVISION override is missing: %+v", input.EnvironmentVariablesOverride)
	}
	if len(dynamoClient.updates) != 2 {
		t.Fatalf("expected lock and build-id updates, got %d", len(dynamoClient.updates))
	}
}

func TestCurrentRequestPreservesTargetWhenSynchronousStartIsUnavailable(t *testing.T) {
	dynamoClient := &mockDynamoDB{states: []State{{
		ID: StateItemID, DesiredRevision: 8, DeployedRevision: 7, Status: StatusQueued,
	}}}
	request := CurrentRequest(context.Background(), dynamoClient, "posts")
	if request.TargetRevision != 8 || request.Status != StatusQueued {
		t.Fatalf("unexpected durable request: %+v", request)
	}
}

func TestCurrentRequestReturnsFailedWhenStateCannotBeRead(t *testing.T) {
	request := CurrentRequest(context.Background(), &mockDynamoDB{getErr: errors.New("read failed")}, "posts")
	if request.Status != StatusFailed {
		t.Fatalf("state read failure must be visible to the caller: %+v", request)
	}
}

func TestGetStateReturnsIdleWhenCoordinatorDoesNotExist(t *testing.T) {
	state, err := NewCoordinator(&mockDynamoDB{emptyGet: true}, nil, "posts", "").GetState(context.Background())
	if err != nil {
		t.Fatalf("GetState returned error: %v", err)
	}
	if state.ID != StateItemID || state.Status != StatusIdle {
		t.Fatalf("unexpected empty state: %+v", state)
	}
}

func TestStartPendingQueuesNewestRevisionWhileBuildIsActive(t *testing.T) {
	dynamoClient := &mockDynamoDB{states: []State{{
		ID: StateItemID, DesiredRevision: 3, DeployedRevision: 1,
		ActiveRevision: 2, ActiveBuildID: "project:build-2", Status: StatusQueued,
	}}}
	codebuildClient := &mockCodeBuild{}

	request, err := NewCoordinator(dynamoClient, codebuildClient, "posts", "site-project").StartPending(context.Background())
	if err != nil {
		t.Fatalf("StartPending returned error: %v", err)
	}
	if request.TargetRevision != 3 || request.Status != StatusQueued || request.BuildID != "" {
		t.Fatalf("new revision must remain queued behind the active build: %+v", request)
	}
	if len(codebuildClient.startInputs) != 0 {
		t.Fatal("must not start a concurrent site build")
	}
}

func TestStartPendingRecoversStaleStartBeforeNewerDesiredRevision(t *testing.T) {
	now := time.Date(2026, 8, 2, 3, 0, 0, 0, time.UTC)
	dynamoClient := &mockDynamoDB{states: []State{{
		ID: StateItemID, DesiredRevision: 3, DeployedRevision: 1,
		ActiveRevision: 2, StartToken: "site-revision-2", Status: StatusStarting,
		StartedAt: now.Add(-10 * time.Minute).Format(time.RFC3339Nano),
	}}}
	codebuildClient := &mockCodeBuild{startOutput: &codebuild.StartBuildOutput{
		Build: &codebuildtypes.Build{Id: aws.String("project:build-2")},
	}}
	coordinator := NewCoordinator(dynamoClient, codebuildClient, "posts", "site-project")
	coordinator.now = func() time.Time { return now }

	request, err := coordinator.StartPending(context.Background())
	if err != nil {
		t.Fatalf("StartPending returned error: %v", err)
	}
	if request.TargetRevision != 3 || request.Status != StatusQueued || request.BuildID != "" {
		t.Fatalf("newer revision must remain queued during stale-start recovery: %+v", request)
	}
	if len(codebuildClient.startInputs) != 1 {
		t.Fatalf("expected one recovery StartBuild call, got %d", len(codebuildClient.startInputs))
	}
	input := codebuildClient.startInputs[0]
	if aws.ToString(input.IdempotencyToken) != "site-revision-2" || aws.ToString(input.EnvironmentVariablesOverride[0].Value) != "2" {
		t.Fatalf("must recover the exact active revision: %+v", input)
	}
	if condition := aws.ToString(dynamoClient.updates[0].ConditionExpression); !strings.Contains(condition, "startToken = :token") {
		t.Fatalf("recovery lock must retain the original token: %s", condition)
	}
}

func TestStartPendingReturnsConditionalLockWinner(t *testing.T) {
	conditional := &dynamodbtypes.ConditionalCheckFailedException{Message: aws.String("lost lock")}
	dynamoClient := &mockDynamoDB{
		states: []State{
			{ID: StateItemID, DesiredRevision: 2, DeployedRevision: 1, Status: StatusQueued},
			{ID: StateItemID, DesiredRevision: 2, DeployedRevision: 1, ActiveRevision: 2, ActiveBuildID: "project:build-2", Status: StatusInProgress},
		},
		updateErrors: []error{conditional},
	}

	request, err := NewCoordinator(dynamoClient, &mockCodeBuild{}, "posts", "site-project").StartPending(context.Background())
	if err != nil {
		t.Fatalf("conditional lock loss should return the winning request: %v", err)
	}
	if request.Status != StatusInProgress || request.BuildID != "project:build-2" {
		t.Fatalf("unexpected winning request: %+v", request)
	}
}

func TestStartPendingMarksCodeBuildStartFailure(t *testing.T) {
	dynamoClient := &mockDynamoDB{states: []State{{
		ID: StateItemID, DesiredRevision: 2, DeployedRevision: 1, Status: StatusQueued,
	}}}
	codebuildClient := &mockCodeBuild{startErr: errors.New("CodeBuild unavailable")}

	request, err := NewCoordinator(dynamoClient, codebuildClient, "posts", "site-project").StartPending(context.Background())
	if err == nil || request.Status != StatusFailed || request.TargetRevision != 2 {
		t.Fatalf("expected correlated start failure, request=%+v err=%v", request, err)
	}
	if len(dynamoClient.updates) != 2 {
		t.Fatalf("expected lock and failure updates, got %d", len(dynamoClient.updates))
	}
	failureUpdate := dynamoClient.updates[1]
	if got := failureUpdate.ExpressionAttributeValues[":error"].(*dynamodbtypes.AttributeValueMemberS).Value; got != "CodeBuild unavailable" {
		t.Fatalf("unexpected persisted failure: %q", got)
	}
}

func TestReconcileSuccessfulBuildStartsTrailingRevision(t *testing.T) {
	initial := State{
		ID: StateItemID, DesiredRevision: 3, DeployedRevision: 1,
		ActiveRevision: 2, ActiveBuildID: "project:build-2", Status: StatusInProgress,
	}
	afterCompletion := State{ID: StateItemID, DesiredRevision: 3, DeployedRevision: 2, ActiveRevision: 2, Status: StatusQueued}
	final := State{
		ID: StateItemID, DesiredRevision: 3, DeployedRevision: 2,
		ActiveRevision: 3, ActiveBuildID: "project:build-3", Status: StatusInProgress,
	}
	dynamoClient := &mockDynamoDB{states: []State{initial, afterCompletion, final}}
	codebuildClient := &mockCodeBuild{
		batchOutput: &codebuild.BatchGetBuildsOutput{Builds: []codebuildtypes.Build{{BuildStatus: codebuildtypes.StatusTypeSucceeded}}},
		startOutput: &codebuild.StartBuildOutput{Build: &codebuildtypes.Build{Id: aws.String("project:build-3")}},
	}

	state, err := NewCoordinator(dynamoClient, codebuildClient, "posts", "site-project").Reconcile(context.Background())
	if err != nil {
		t.Fatalf("Reconcile returned error: %v", err)
	}
	if state.DeployedRevision != 2 || state.ActiveRevision != 3 || state.ActiveBuildID != "project:build-3" {
		t.Fatalf("trailing revision was not started: %+v", state)
	}
	if len(codebuildClient.startInputs) != 1 || aws.ToString(codebuildClient.startInputs[0].IdempotencyToken) != "site-revision-3" {
		t.Fatalf("expected a trailing build for revision 3: %+v", codebuildClient.startInputs)
	}
	if len(dynamoClient.updates) != 3 {
		t.Fatalf("expected completion, lock, and build-id updates, got %d", len(dynamoClient.updates))
	}
}

func TestReconcileFailedBuildStartsTrailingRevision(t *testing.T) {
	initial := State{
		ID: StateItemID, DesiredRevision: 3, DeployedRevision: 1,
		ActiveRevision: 2, ActiveBuildID: "project:build-2", Status: StatusInProgress,
	}
	afterFailure := State{
		ID: StateItemID, DesiredRevision: 3, DeployedRevision: 1,
		ActiveRevision: 2, Status: StatusFailed, LastError: string(codebuildtypes.StatusTypeFailed),
	}
	final := State{
		ID: StateItemID, DesiredRevision: 3, DeployedRevision: 1,
		ActiveRevision: 3, ActiveBuildID: "project:build-3", Status: StatusInProgress,
	}
	dynamoClient := &mockDynamoDB{states: []State{initial, afterFailure, afterFailure, final}}
	codebuildClient := &mockCodeBuild{
		batchOutput: &codebuild.BatchGetBuildsOutput{Builds: []codebuildtypes.Build{{BuildStatus: codebuildtypes.StatusTypeFailed}}},
		startOutput: &codebuild.StartBuildOutput{Build: &codebuildtypes.Build{Id: aws.String("project:build-3")}},
	}

	state, err := NewCoordinator(dynamoClient, codebuildClient, "posts", "site-project").Reconcile(context.Background())
	if err != nil {
		t.Fatalf("Reconcile returned error: %v", err)
	}
	if state.ActiveRevision != 3 || state.ActiveBuildID != "project:build-3" || state.Status != StatusInProgress {
		t.Fatalf("failed build did not start trailing revision: %+v", state)
	}
	if len(dynamoClient.updates) != 3 {
		t.Fatalf("expected failure, lock, and build-id updates, got %d", len(dynamoClient.updates))
	}
}

func TestReconcileLeavesInProgressBuildUnchanged(t *testing.T) {
	initial := State{
		ID: StateItemID, DesiredRevision: 2, DeployedRevision: 1,
		ActiveRevision: 2, ActiveBuildID: "project:build-2", Status: StatusInProgress,
	}
	dynamoClient := &mockDynamoDB{states: []State{initial}}
	codebuildClient := &mockCodeBuild{batchOutput: &codebuild.BatchGetBuildsOutput{
		Builds: []codebuildtypes.Build{{BuildStatus: codebuildtypes.StatusTypeInProgress}},
	}}

	state, err := NewCoordinator(dynamoClient, codebuildClient, "posts", "site-project").Reconcile(context.Background())
	if err != nil {
		t.Fatalf("Reconcile returned error: %v", err)
	}
	if state.ActiveBuildID != initial.ActiveBuildID || len(dynamoClient.updates) != 0 {
		t.Fatalf("in-progress build must remain unchanged: %+v", state)
	}
}

func TestReconcileReturnsCodeBuildStatusError(t *testing.T) {
	initial := State{
		ID: StateItemID, DesiredRevision: 2, DeployedRevision: 1,
		ActiveRevision: 2, ActiveBuildID: "project:build-2", Status: StatusInProgress,
	}
	dynamoClient := &mockDynamoDB{states: []State{initial}}
	codebuildClient := &mockCodeBuild{batchErr: errors.New("CodeBuild status unavailable")}

	_, err := NewCoordinator(dynamoClient, codebuildClient, "posts", "site-project").Reconcile(context.Background())
	if err == nil || err.Error() != "CodeBuild status unavailable" {
		t.Fatalf("expected CodeBuild status error, got %v", err)
	}
	if len(dynamoClient.updates) != 0 {
		t.Fatal("status lookup failure must not mutate durable state")
	}
}

func TestRequestForStateCorrelatesTargetRevision(t *testing.T) {
	state := State{
		DesiredRevision: 5, DeployedRevision: 3, ActiveRevision: 4,
		ActiveBuildID: "project:build-4", Status: StatusInProgress,
	}
	tests := []struct {
		name   string
		target int64
		status string
		build  string
	}{
		{name: "deployed", target: 3, status: StatusSucceeded},
		{name: "active", target: 4, status: StatusInProgress, build: "project:build-4"},
		{name: "newer queued", target: 5, status: StatusQueued},
		{name: "default target", target: 0, status: StatusQueued},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := RequestForState(state, tt.target)
			if request.Status != tt.status || request.BuildID != tt.build {
				t.Fatalf("unexpected correlated request: %+v", request)
			}
		})
	}
}

func TestRequestForStateCoversIdleFailedAndStartingStates(t *testing.T) {
	tests := []struct {
		name   string
		state  State
		target int64
		status string
	}{
		{name: "idle", state: State{Status: StatusIdle}, status: StatusIdle},
		{name: "failed", state: State{DesiredRevision: 2, ActiveRevision: 2, Status: StatusFailed}, target: 2, status: StatusFailed},
		{name: "starting", state: State{DesiredRevision: 2, ActiveRevision: 2, Status: StatusStarting}, target: 2, status: StatusQueued},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := RequestForState(tt.state, tt.target); got.Status != tt.status {
				t.Fatalf("unexpected request: %+v", got)
			}
		})
	}
}
