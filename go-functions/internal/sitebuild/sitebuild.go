// Package sitebuild coordinates durable public-site build requests.
package sitebuild

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
	codebuildtypes "github.com/aws/aws-sdk-go-v2/service/codebuild/types"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	dynamodbtypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const (
	// StateItemID is reserved for the singleton site-build coordinator item.
	StateItemID = "__SITE_BUILD_STATE__"
	// StatusQueued means the target revision is waiting for a build slot.
	StatusQueued = "queued"
	// StatusStarting means a caller owns the conditional StartBuild lock.
	StatusStarting = "starting"
	// StatusInProgress means CodeBuild accepted the active revision.
	StatusInProgress = "in-progress"
	// StatusSucceeded means the active revision was deployed successfully.
	StatusSucceeded = "succeeded"
	// StatusFailed means the active revision failed to deploy.
	StatusFailed = "failed"
	// StatusIdle means no site-build request has been created yet.
	StatusIdle = "idle"

	defaultStartingTimeout = 5 * time.Minute

	attributeNameStatus    = "#status"
	attributeStatusValue   = "status"
	attributeValueRevision = ":revision"
	attributeValueNow      = ":now"
	attributeValueBuildID  = ":buildId"
)

// State is persisted in the BlogPosts table. It intentionally omits all GSI
// keys, so it never appears in article queries.
type State struct {
	ID               string `dynamodbav:"id"`
	DesiredRevision  int64  `dynamodbav:"desiredRevision"`
	DeployedRevision int64  `dynamodbav:"deployedRevision"`
	ActiveRevision   int64  `dynamodbav:"activeRevision,omitempty"`
	ActiveBuildID    string `dynamodbav:"activeBuildId,omitempty"`
	StartToken       string `dynamodbav:"startToken,omitempty"`
	Status           string `dynamodbav:"status"`
	RequestedAt      string `dynamodbav:"requestedAt,omitempty"`
	StartedAt        string `dynamodbav:"startedAt,omitempty"`
	CompletedAt      string `dynamodbav:"completedAt,omitempty"`
	LastError        string `dynamodbav:"lastError,omitempty"`
}

// Request is returned to the admin UI and correlates one save with deployment.
type Request struct {
	TargetRevision int64  `json:"targetRevision"`
	BuildID        string `json:"buildId,omitempty"`
	Status         string `json:"status"`
}

// DynamoDBClient is the subset needed by the coordinator.
type DynamoDBClient interface {
	GetItem(context.Context, *dynamodb.GetItemInput, ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	UpdateItem(context.Context, *dynamodb.UpdateItemInput, ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error)
}

// CodeBuildClient is the subset needed to start and reconcile builds.
type CodeBuildClient interface {
	StartBuild(context.Context, *codebuild.StartBuildInput, ...func(*codebuild.Options)) (*codebuild.StartBuildOutput, error)
	BatchGetBuilds(context.Context, *codebuild.BatchGetBuildsInput, ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error)
}

// Coordinator serializes builds while retaining the latest desired revision.
type Coordinator struct {
	dynamo          DynamoDBClient
	codebuild       CodeBuildClient
	tableName       string
	projectName     string
	now             func() time.Time
	startingTimeout time.Duration
}

// NewCoordinator creates a durable site-build coordinator.
func NewCoordinator(dynamoClient DynamoDBClient, codebuildClient CodeBuildClient, tableName, projectName string) *Coordinator {
	return &Coordinator{
		dynamo: dynamoClient, codebuild: codebuildClient, tableName: tableName,
		projectName: projectName, now: time.Now, startingTimeout: defaultStartingTimeout,
	}
}

// CurrentRequest returns the durable request visible to the admin API even
// when the synchronous CodeBuild client or project configuration is
// temporarily unavailable. The scheduled reconciler can start it later.
func CurrentRequest(ctx context.Context, dynamoClient DynamoDBClient, tableName string) Request {
	state, err := NewCoordinator(dynamoClient, nil, tableName, "").GetState(ctx)
	if err != nil {
		return Request{Status: StatusFailed}
	}
	return RequestForState(state, state.DesiredRevision)
}

// RequestUpdate returns the transaction item that atomically advances the
// desired site revision alongside an article mutation.
func RequestUpdate(tableName string, requestedAt time.Time) dynamodbtypes.TransactWriteItem {
	return dynamodbtypes.TransactWriteItem{Update: &dynamodbtypes.Update{
		TableName: aws.String(tableName),
		Key: map[string]dynamodbtypes.AttributeValue{
			"id": &dynamodbtypes.AttributeValueMemberS{Value: StateItemID},
		},
		UpdateExpression:         aws.String("ADD desiredRevision :one SET #status = if_not_exists(#status, :queued), requestedAt = :requestedAt, deployedRevision = if_not_exists(deployedRevision, :zero)"),
		ExpressionAttributeNames: map[string]string{attributeNameStatus: attributeStatusValue},
		ExpressionAttributeValues: map[string]dynamodbtypes.AttributeValue{
			":one":         &dynamodbtypes.AttributeValueMemberN{Value: "1"},
			":zero":        &dynamodbtypes.AttributeValueMemberN{Value: "0"},
			":queued":      &dynamodbtypes.AttributeValueMemberS{Value: StatusQueued},
			":requestedAt": &dynamodbtypes.AttributeValueMemberS{Value: requestedAt.UTC().Format(time.RFC3339Nano)},
		},
	}}
}

// GetState reads the singleton coordinator item with a strongly consistent read.
func (c *Coordinator) GetState(ctx context.Context) (State, error) {
	out, err := c.dynamo.GetItem(ctx, &dynamodb.GetItemInput{
		TableName:      aws.String(c.tableName),
		Key:            map[string]dynamodbtypes.AttributeValue{"id": &dynamodbtypes.AttributeValueMemberS{Value: StateItemID}},
		ConsistentRead: aws.Bool(true),
	})
	if err != nil {
		return State{}, err
	}
	if len(out.Item) == 0 {
		return State{ID: StateItemID, Status: StatusIdle}, nil
	}
	var state State
	if err := attributevalue.UnmarshalMap(out.Item, &state); err != nil {
		return State{}, err
	}
	return state, nil
}

// StartPending starts the newest desired revision when no build owns the slot.
//
//nolint:gocyclo // Conditional lock acquisition and stale-start recovery form one explicit state machine.
func (c *Coordinator) StartPending(ctx context.Context) (Request, error) {
	state, err := c.GetState(ctx)
	if err != nil {
		return Request{}, err
	}
	request := RequestForState(state, state.DesiredRevision)
	if state.DesiredRevision <= state.DeployedRevision || state.ActiveBuildID != "" {
		return request, nil
	}

	if state.Status == StatusStarting && !isStartingStale(state, c.now(), c.startingTimeout) {
		return request, nil
	}

	targetRevision := state.DesiredRevision
	revision := targetRevision
	token := fmt.Sprintf("site-revision-%d", revision)
	now := c.now().UTC()
	staleBefore := now.Add(-c.startingTimeout).Format(time.RFC3339Nano)
	condition := "desiredRevision = :revision AND attribute_not_exists(activeBuildId) AND (#status <> :starting OR attribute_not_exists(startedAt) OR startedAt < :staleBefore)"
	// A previous StartBuild may have succeeded while the Lambda stopped before
	// persisting its Build ID. Recover that exact request first with the same
	// idempotency token; a newer desired revision remains queued behind it.
	if state.Status == StatusStarting && isStartingStale(state, now, c.startingTimeout) && state.ActiveRevision > 0 && state.StartToken != "" {
		revision = state.ActiveRevision
		token = state.StartToken
		condition = "desiredRevision >= :revision AND attribute_not_exists(activeBuildId) AND #status = :starting AND activeRevision = :revision AND startToken = :token AND (attribute_not_exists(startedAt) OR startedAt < :staleBefore)"
	}
	acquired, err := c.dynamo.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(c.tableName),
		Key:                      map[string]dynamodbtypes.AttributeValue{"id": &dynamodbtypes.AttributeValueMemberS{Value: StateItemID}},
		UpdateExpression:         aws.String("SET #status = :starting, activeRevision = :revision, startToken = :token, startedAt = :now REMOVE activeBuildId, lastError"),
		ConditionExpression:      aws.String(condition),
		ExpressionAttributeNames: map[string]string{attributeNameStatus: attributeStatusValue},
		ExpressionAttributeValues: map[string]dynamodbtypes.AttributeValue{
			":starting":            &dynamodbtypes.AttributeValueMemberS{Value: StatusStarting},
			attributeValueRevision: &dynamodbtypes.AttributeValueMemberN{Value: strconv.FormatInt(revision, 10)},
			":token":               &dynamodbtypes.AttributeValueMemberS{Value: token},
			attributeValueNow:      &dynamodbtypes.AttributeValueMemberS{Value: now.Format(time.RFC3339Nano)},
			":staleBefore":         &dynamodbtypes.AttributeValueMemberS{Value: staleBefore},
		},
		ReturnValues: dynamodbtypes.ReturnValueAllNew,
	})
	if err != nil {
		var conditional *dynamodbtypes.ConditionalCheckFailedException
		if errors.As(err, &conditional) {
			latest, getErr := c.GetState(ctx)
			return RequestForState(latest, targetRevision), getErr
		}
		return Request{}, err
	}
	_ = acquired

	buildOut, err := c.codebuild.StartBuild(ctx, &codebuild.StartBuildInput{
		ProjectName:      aws.String(c.projectName),
		IdempotencyToken: aws.String(token),
		EnvironmentVariablesOverride: []codebuildtypes.EnvironmentVariable{{
			Name: aws.String("CONTENT_REVISION"), Value: aws.String(strconv.FormatInt(revision, 10)), Type: codebuildtypes.EnvironmentVariableTypePlaintext,
		}},
	})
	if err != nil {
		if markErr := c.markStartFailed(ctx, revision, err); markErr != nil {
			return Request{TargetRevision: revision, Status: StatusFailed}, errors.Join(err, markErr)
		}
		return Request{TargetRevision: revision, Status: StatusFailed}, err
	}
	buildID := ""
	if buildOut.Build != nil {
		buildID = aws.ToString(buildOut.Build.Id)
	}
	if buildID == "" {
		err = errors.New("CodeBuild StartBuild returned no build ID")
		if markErr := c.markStartFailed(ctx, revision, err); markErr != nil {
			return Request{TargetRevision: revision, Status: StatusFailed}, errors.Join(err, markErr)
		}
		return Request{TargetRevision: revision, Status: StatusFailed}, err
	}

	_, err = c.dynamo.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(c.tableName),
		Key:                      map[string]dynamodbtypes.AttributeValue{"id": &dynamodbtypes.AttributeValueMemberS{Value: StateItemID}},
		UpdateExpression:         aws.String("SET #status = :inProgress, activeBuildId = :buildId"),
		ConditionExpression:      aws.String("activeRevision = :revision AND startToken = :token"),
		ExpressionAttributeNames: map[string]string{attributeNameStatus: attributeStatusValue},
		ExpressionAttributeValues: map[string]dynamodbtypes.AttributeValue{
			":inProgress":          &dynamodbtypes.AttributeValueMemberS{Value: StatusInProgress},
			attributeValueBuildID:  &dynamodbtypes.AttributeValueMemberS{Value: buildID},
			attributeValueRevision: &dynamodbtypes.AttributeValueMemberN{Value: strconv.FormatInt(revision, 10)},
			":token":               &dynamodbtypes.AttributeValueMemberS{Value: token},
		},
	})
	if err != nil {
		return Request{}, err
	}
	if revision < targetRevision {
		return Request{TargetRevision: targetRevision, Status: StatusQueued}, nil
	}
	return Request{TargetRevision: targetRevision, BuildID: buildID, Status: StatusInProgress}, nil
}

func (c *Coordinator) markStartFailed(ctx context.Context, revision int64, startErr error) error {
	_, err := c.dynamo.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(c.tableName),
		Key:                      map[string]dynamodbtypes.AttributeValue{"id": &dynamodbtypes.AttributeValueMemberS{Value: StateItemID}},
		UpdateExpression:         aws.String("SET #status = :failed, lastError = :error REMOVE activeBuildId, startToken, startedAt"),
		ConditionExpression:      aws.String("activeRevision = :revision"),
		ExpressionAttributeNames: map[string]string{attributeNameStatus: attributeStatusValue},
		ExpressionAttributeValues: map[string]dynamodbtypes.AttributeValue{
			":failed":              &dynamodbtypes.AttributeValueMemberS{Value: StatusFailed},
			":error":               &dynamodbtypes.AttributeValueMemberS{Value: startErr.Error()},
			attributeValueRevision: &dynamodbtypes.AttributeValueMemberN{Value: strconv.FormatInt(revision, 10)},
		},
	})
	return err
}

// Reconcile updates durable state from the active CodeBuild and starts a
// trailing build when newer content was requested during that build.
func (c *Coordinator) Reconcile(ctx context.Context) (State, error) {
	state, err := c.GetState(ctx)
	if err != nil {
		return State{}, err
	}
	if state.ActiveBuildID == "" {
		if state.DesiredRevision > state.DeployedRevision {
			if _, startErr := c.StartPending(ctx); startErr != nil {
				return State{}, startErr
			}
			return c.GetState(ctx)
		}
		return state, nil
	}

	out, err := c.codebuild.BatchGetBuilds(ctx, &codebuild.BatchGetBuildsInput{Ids: []string{state.ActiveBuildID}})
	if err != nil {
		return State{}, err
	}
	if len(out.Builds) == 0 {
		return state, nil
	}
	build := out.Builds[0]
	if build.BuildStatus == codebuildtypes.StatusTypeInProgress {
		return state, nil
	}

	now := c.now().UTC().Format(time.RFC3339Nano)
	if build.BuildStatus == codebuildtypes.StatusTypeSucceeded {
		_, err = c.dynamo.UpdateItem(ctx, &dynamodb.UpdateItemInput{
			TableName:                aws.String(c.tableName),
			Key:                      map[string]dynamodbtypes.AttributeValue{"id": &dynamodbtypes.AttributeValueMemberS{Value: StateItemID}},
			UpdateExpression:         aws.String("SET deployedRevision = :revision, #status = :status, completedAt = :now REMOVE activeBuildId, startToken, startedAt, lastError"),
			ConditionExpression:      aws.String("activeBuildId = :buildId AND activeRevision = :revision"),
			ExpressionAttributeNames: map[string]string{attributeNameStatus: attributeStatusValue},
			ExpressionAttributeValues: map[string]dynamodbtypes.AttributeValue{
				attributeValueRevision: &dynamodbtypes.AttributeValueMemberN{Value: strconv.FormatInt(state.ActiveRevision, 10)},
				":status":              &dynamodbtypes.AttributeValueMemberS{Value: StatusSucceeded},
				attributeValueNow:      &dynamodbtypes.AttributeValueMemberS{Value: now},
				attributeValueBuildID:  &dynamodbtypes.AttributeValueMemberS{Value: state.ActiveBuildID},
			},
		})
		if err != nil {
			return State{}, err
		}
		// Re-read desiredRevision inside StartPending. A post mutation can race
		// with the completion update after the initial state read; relying on
		// the stale snapshot here could strand that mutation until the scheduler.
		if _, startErr := c.StartPending(ctx); startErr != nil {
			return State{}, startErr
		}
		return c.GetState(ctx)
	}

	_, err = c.dynamo.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(c.tableName),
		Key:                      map[string]dynamodbtypes.AttributeValue{"id": &dynamodbtypes.AttributeValueMemberS{Value: StateItemID}},
		UpdateExpression:         aws.String("SET #status = :failed, completedAt = :now, lastError = :error REMOVE activeBuildId, startToken, startedAt"),
		ConditionExpression:      aws.String("activeBuildId = :buildId"),
		ExpressionAttributeNames: map[string]string{attributeNameStatus: attributeStatusValue},
		ExpressionAttributeValues: map[string]dynamodbtypes.AttributeValue{
			":failed":             &dynamodbtypes.AttributeValueMemberS{Value: StatusFailed},
			attributeValueNow:     &dynamodbtypes.AttributeValueMemberS{Value: now},
			":error":              &dynamodbtypes.AttributeValueMemberS{Value: string(build.BuildStatus)},
			attributeValueBuildID: &dynamodbtypes.AttributeValueMemberS{Value: state.ActiveBuildID},
		},
	})
	if err != nil {
		return State{}, err
	}
	latest, err := c.GetState(ctx)
	if err != nil {
		return State{}, err
	}
	if latest.DesiredRevision > state.ActiveRevision {
		if _, err := c.StartPending(ctx); err != nil {
			return State{}, err
		}
	}
	return c.GetState(ctx)
}

// RequestForState derives the status of one target revision from durable state.
func RequestForState(state State, targetRevision int64) Request {
	if targetRevision == 0 {
		targetRevision = state.DesiredRevision
	}
	status := StatusQueued
	buildID := ""
	switch {
	case targetRevision == 0:
		status = StatusIdle
	case state.DeployedRevision >= targetRevision:
		status = StatusSucceeded
	case state.Status == StatusFailed && state.ActiveRevision >= targetRevision:
		status = StatusFailed
	case state.ActiveBuildID != "" && state.ActiveRevision >= targetRevision:
		status = StatusInProgress
	case state.Status == StatusStarting && state.ActiveRevision >= targetRevision:
		status = StatusQueued
	}
	if status == StatusInProgress && state.ActiveRevision >= targetRevision {
		buildID = state.ActiveBuildID
	}
	return Request{TargetRevision: targetRevision, BuildID: buildID, Status: status}
}

func isStartingStale(state State, now time.Time, timeout time.Duration) bool {
	started, err := time.Parse(time.RFC3339Nano, state.StartedAt)
	return err != nil || now.Sub(started) >= timeout
}
