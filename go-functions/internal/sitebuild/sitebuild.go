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

	"serverless-blog/go-functions/internal/middleware"
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

	defaultStartingTimeout = 3 * time.Minute
	// idempotencyTokenTTL is how long CodeBuild honors a StartBuild
	// IdempotencyToken.
	idempotencyTokenTTL = 5 * time.Minute
	// idempotencyTokenReuseWindow stops same-token retries before the TTL so a
	// retry that reaches CodeBuild slightly later is not a new request.
	idempotencyTokenReuseWindow = idempotencyTokenTTL - 30*time.Second
	// historyClockSkew widens the history window for clock differences
	// between Lambda and CodeBuild.
	historyClockSkew = time.Minute
	// legacyHistoryLookback bounds the history window for items written
	// before startAttemptedAt existed.
	legacyHistoryLookback = time.Hour
	// maxHistoryPages caps ListBuildsForProject pages (up to 100 IDs each).
	maxHistoryPages = 10

	contentRevisionVariable = "CONTENT_REVISION"

	attributeNameStatus    = "#status"
	attributeStatusValue   = "status"
	attributeValueRevision = ":revision"
	attributeValueNow      = ":now"
	attributeValueBuildID  = ":buildId"
	attributeValueStarting = ":starting"
	attributeValueToken    = ":token"
)

// errHistoryLimit means the build history window could not be fully inspected.
var errHistoryLimit = errors.New("CodeBuild build history page limit reached before the start window was covered")

// State is persisted in the BlogPosts table. It intentionally omits all GSI
// keys, so it never appears in article queries.
type State struct {
	ID                string `dynamodbav:"id"`
	DesiredRevision   int64  `dynamodbav:"desiredRevision"`
	DeployedRevision  int64  `dynamodbav:"deployedRevision"`
	ActiveRevision    int64  `dynamodbav:"activeRevision,omitempty"`
	ActiveBuildID     string `dynamodbav:"activeBuildId,omitempty"`
	LastBuildID       string `dynamodbav:"lastBuildId,omitempty"`
	LastBuildRevision int64  `dynamodbav:"lastBuildRevision,omitempty"`
	StartToken        string `dynamodbav:"startToken,omitempty"`
	Status            string `dynamodbav:"status"`
	RequestedAt       string `dynamodbav:"requestedAt,omitempty"`
	// StartedAt is the start-lock time; a lock older than the starting
	// timeout may be re-acquired.
	StartedAt string `dynamodbav:"startedAt,omitempty"`
	// StartAttemptedAt is the first StartBuild attempt with StartToken and
	// bounds that token's validity. Re-acquiring the lock never moves it.
	StartAttemptedAt string `dynamodbav:"startAttemptedAt,omitempty"`
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

// BuildHistoryClient adds the build-history lookup used only by the
// reconciler to recover a Build ID after its IdempotencyToken expired.
type BuildHistoryClient interface {
	CodeBuildClient
	ListBuildsForProject(context.Context, *codebuild.ListBuildsForProjectInput, ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error)
}

// Coordinator serializes builds while retaining the latest desired revision.
type Coordinator struct {
	dynamo          DynamoDBClient
	codebuild       CodeBuildClient
	history         BuildHistoryClient
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

// NewReconcilerCoordinator creates the coordinator used by the scheduled
// reconciler. Unlike NewCoordinator it may search CodeBuild build history
// (codebuild:ListBuildsForProject) to recover a Build ID whose
// IdempotencyToken expired; the posts Lambdas do not hold that permission.
func NewReconcilerCoordinator(dynamoClient DynamoDBClient, codebuildClient BuildHistoryClient, tableName, projectName string) *Coordinator {
	coordinator := NewCoordinator(dynamoClient, codebuildClient, tableName, projectName)
	coordinator.history = codebuildClient
	return coordinator
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
// A stale StatusStarting item means an earlier caller may have started a
// CodeBuild build and stopped before persisting its Build ID. While the
// original IdempotencyToken is still honored by CodeBuild, the same request
// is replayed with that token. Once the token may have expired, only a
// reconciler coordinator (NewReconcilerCoordinator) searches the project's
// build history; other callers leave the item for the reconciler so they
// never need history permissions and never start a duplicate build.
func (c *Coordinator) StartPending(ctx context.Context) (Request, error) {
	state, err := c.GetState(ctx)
	if err != nil {
		return Request{}, err
	}
	request := RequestForState(state, state.DesiredRevision)
	if state.DesiredRevision <= state.DeployedRevision || state.ActiveBuildID != "" {
		return request, nil
	}
	now := c.now().UTC()
	if state.Status == StatusStarting {
		if !isStartingStale(state, now, c.startingTimeout) {
			return request, nil
		}
		if state.ActiveRevision > 0 && state.StartToken != "" {
			return c.recoverStaleStart(ctx, state, now)
		}
	}
	return c.startFresh(ctx, state, now)
}

// startFresh acquires the start lock for the newest desired revision with a
// new token. A starting item that still carries a token is never taken over
// here: it may own a build whose ID was not persisted (see recoverStaleStart).
func (c *Coordinator) startFresh(ctx context.Context, state State, now time.Time) (Request, error) {
	targetRevision := state.DesiredRevision
	token := fmt.Sprintf("site-revision-%d", targetRevision)
	nowValue := now.Format(time.RFC3339Nano)
	_, err := c.dynamo.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(c.tableName),
		Key:                      stateKey(),
		UpdateExpression:         aws.String("SET #status = :starting, activeRevision = :revision, startToken = :token, startedAt = :now, startAttemptedAt = :now REMOVE activeBuildId, lastError"),
		ConditionExpression:      aws.String("desiredRevision = :revision AND attribute_not_exists(activeBuildId) AND (#status <> :starting OR ((attribute_not_exists(startToken) OR attribute_not_exists(activeRevision)) AND (attribute_not_exists(startedAt) OR startedAt < :staleBefore)))"),
		ExpressionAttributeNames: map[string]string{attributeNameStatus: attributeStatusValue},
		ExpressionAttributeValues: map[string]dynamodbtypes.AttributeValue{
			attributeValueStarting: stringValue(StatusStarting),
			attributeValueRevision: numberValue(targetRevision),
			attributeValueToken:    stringValue(token),
			attributeValueNow:      stringValue(nowValue),
			":staleBefore":         stringValue(now.Add(-c.startingTimeout).Format(time.RFC3339Nano)),
		},
	})
	if err != nil {
		return c.lockLost(ctx, targetRevision, err)
	}
	return c.startBuild(ctx, state, targetRevision, targetRevision, token)
}

// recoverStaleStart resolves a stale StatusStarting item for activeRevision.
// startAttemptedAt (the first StartBuild attempt with startToken) bounds the
// token's validity and is never moved by a lock refresh; startedAt is only the
// lock time used for the stale check.
func (c *Coordinator) recoverStaleStart(ctx context.Context, state State, now time.Time) (Request, error) {
	targetRevision := state.DesiredRevision
	revision := state.ActiveRevision
	attemptedAt, attemptKnown := firstStartAttempt(state)
	if attemptKnown && now.Sub(attemptedAt) < idempotencyTokenReuseWindow {
		// CodeBuild still honors the token: replaying it returns the build
		// that may already exist instead of starting another one.
		if _, err := c.refreshStartLock(ctx, state, now); err != nil {
			return c.lockLost(ctx, targetRevision, err)
		}
		return c.startBuild(ctx, state, revision, targetRevision, state.StartToken)
	}
	if c.history == nil {
		// The token may have expired. Replaying it could start a duplicate,
		// and history lookup is reserved for the reconciler; leave the item
		// untouched so the scheduled reconciler resolves it.
		middleware.LoggerFromContext(ctx).Info("site build start awaits reconciler history check",
			"activeRevision", revision, "startAttemptedAt", state.StartAttemptedAt, "startedAt", state.StartedAt)
		return RequestForState(state, targetRevision), nil
	}

	lockedAt, err := c.refreshStartLock(ctx, state, now)
	if err != nil {
		return c.lockLost(ctx, targetRevision, err)
	}
	build, err := c.findBuildForRevision(ctx, revision, historyNotBefore(state, attemptedAt, attemptKnown))
	if err != nil {
		// Fail closed: without proof that no build exists, never start one.
		return RequestForState(state, targetRevision), fmt.Errorf("site build history check for revision %d: %w", revision, err)
	}
	if build != nil {
		return c.adoptBuild(ctx, state, *build, lockedAt)
	}
	return c.restartWithNewToken(ctx, state, lockedAt)
}

// refreshStartLock re-acquires a stale start lock without changing the token or
// its first attempt time, and returns the new lock time.
func (c *Coordinator) refreshStartLock(ctx context.Context, state State, now time.Time) (string, error) {
	lockedAt := now.Format(time.RFC3339Nano)
	values := map[string]dynamodbtypes.AttributeValue{
		attributeValueStarting: stringValue(StatusStarting),
		attributeValueRevision: numberValue(state.ActiveRevision),
		attributeValueToken:    stringValue(state.StartToken),
		attributeValueNow:      stringValue(lockedAt),
		":staleBefore":         stringValue(now.Add(-c.startingTimeout).Format(time.RFC3339Nano)),
	}
	attemptCondition := "attribute_not_exists(startAttemptedAt)"
	if state.StartAttemptedAt != "" {
		attemptCondition = "startAttemptedAt = :attemptedAt"
		values[":attemptedAt"] = stringValue(state.StartAttemptedAt)
	}
	_, err := c.dynamo.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:        aws.String(c.tableName),
		Key:              stateKey(),
		UpdateExpression: aws.String("SET startedAt = :now REMOVE lastError"),
		ConditionExpression: aws.String("desiredRevision >= :revision AND attribute_not_exists(activeBuildId) AND #status = :starting AND activeRevision = :revision AND startToken = :token AND " +
			attemptCondition + " AND (attribute_not_exists(startedAt) OR startedAt < :staleBefore)"),
		ExpressionAttributeNames:  map[string]string{attributeNameStatus: attributeStatusValue},
		ExpressionAttributeValues: values,
	})
	return lockedAt, err
}

// adoptBuild persists a build found in CodeBuild history as the active build
// and, when it already finished, applies the same completion transition as
// Reconcile so a newer desired revision can start.
func (c *Coordinator) adoptBuild(ctx context.Context, state State, build codebuildtypes.Build, lockedAt string) (Request, error) {
	targetRevision := state.DesiredRevision
	buildID := aws.ToString(build.Id)
	_, err := c.dynamo.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(c.tableName),
		Key:                      stateKey(),
		UpdateExpression:         aws.String("SET #status = :inProgress, activeBuildId = :buildId"),
		ConditionExpression:      aws.String("attribute_not_exists(activeBuildId) AND #status = :starting AND activeRevision = :revision AND startToken = :token AND startedAt = :lockedAt"),
		ExpressionAttributeNames: map[string]string{attributeNameStatus: attributeStatusValue},
		ExpressionAttributeValues: map[string]dynamodbtypes.AttributeValue{
			":inProgress":          stringValue(StatusInProgress),
			attributeValueStarting: stringValue(StatusStarting),
			attributeValueBuildID:  stringValue(buildID),
			attributeValueRevision: numberValue(state.ActiveRevision),
			attributeValueToken:    stringValue(state.StartToken),
			":lockedAt":            stringValue(lockedAt),
		},
	})
	if err != nil {
		return c.lockLost(ctx, targetRevision, err)
	}
	middleware.LoggerFromContext(ctx).Info("site build recovered from CodeBuild history",
		"contentRevision", state.ActiveRevision, "buildId", buildID, "buildStatus", string(build.BuildStatus))

	adopted := state
	adopted.ActiveBuildID = buildID
	adopted.Status = StatusInProgress
	if build.BuildStatus == codebuildtypes.StatusTypeInProgress {
		if state.ActiveRevision < targetRevision {
			return Request{TargetRevision: targetRevision, Status: StatusQueued}, nil
		}
		return Request{TargetRevision: targetRevision, BuildID: buildID, Status: StatusInProgress}, nil
	}
	latest, err := c.completeBuild(ctx, adopted, build.BuildStatus)
	if err != nil {
		return Request{}, err
	}
	return RequestForState(latest, targetRevision), nil
}

// restartWithNewToken starts activeRevision again after the history check
// proved that no build exists for it. The new token gets a new first attempt
// time, so its own validity window starts now.
func (c *Coordinator) restartWithNewToken(ctx context.Context, state State, lockedAt string) (Request, error) {
	targetRevision := state.DesiredRevision
	revision := state.ActiveRevision
	now := c.now().UTC()
	token := fmt.Sprintf("site-revision-%d-%d", revision, now.UnixMilli())
	nowValue := now.Format(time.RFC3339Nano)
	_, err := c.dynamo.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(c.tableName),
		Key:                      stateKey(),
		UpdateExpression:         aws.String("SET startToken = :newToken, startAttemptedAt = :now, startedAt = :now REMOVE lastError"),
		ConditionExpression:      aws.String("attribute_not_exists(activeBuildId) AND #status = :starting AND activeRevision = :revision AND startToken = :token AND startedAt = :lockedAt"),
		ExpressionAttributeNames: map[string]string{attributeNameStatus: attributeStatusValue},
		ExpressionAttributeValues: map[string]dynamodbtypes.AttributeValue{
			attributeValueStarting: stringValue(StatusStarting),
			attributeValueRevision: numberValue(revision),
			attributeValueToken:    stringValue(state.StartToken),
			":newToken":            stringValue(token),
			attributeValueNow:      stringValue(nowValue),
			":lockedAt":            stringValue(lockedAt),
		},
	})
	if err != nil {
		return c.lockLost(ctx, targetRevision, err)
	}
	return c.startBuild(ctx, state, revision, targetRevision, token)
}

// findBuildForRevision walks the project's build history newest first and
// returns the newest build started at or after notBefore whose
// CONTENT_REVISION equals revision. It returns (nil, nil) only when the whole
// window was inspected; any API error, unreadable build, or reaching the page
// limit before the window is covered is an error.
func (c *Coordinator) findBuildForRevision(ctx context.Context, revision int64, notBefore time.Time) (*codebuildtypes.Build, error) {
	var nextToken *string
	for page := 0; page < maxHistoryPages; page++ {
		out, err := c.history.ListBuildsForProject(ctx, &codebuild.ListBuildsForProjectInput{
			ProjectName: aws.String(c.projectName),
			SortOrder:   codebuildtypes.SortOrderTypeDescending,
			NextToken:   nextToken,
		})
		if err != nil {
			return nil, fmt.Errorf("list CodeBuild builds: %w", err)
		}
		build, covered, err := c.matchHistoryPage(ctx, out.Ids, revision, notBefore)
		if err != nil || build != nil {
			return build, err
		}
		if covered || aws.ToString(out.NextToken) == "" {
			return nil, nil
		}
		nextToken = out.NextToken
	}
	return nil, errHistoryLimit
}

// matchHistoryPage inspects one page of build IDs in list order. covered is
// true once a build older than notBefore was seen: newer pages hold only
// newer build numbers, so the window ends inside this page.
func (c *Coordinator) matchHistoryPage(ctx context.Context, ids []string, revision int64, notBefore time.Time) (*codebuildtypes.Build, bool, error) {
	if len(ids) == 0 {
		return nil, false, nil
	}
	out, err := c.history.BatchGetBuilds(ctx, &codebuild.BatchGetBuildsInput{Ids: ids})
	if err != nil {
		return nil, false, fmt.Errorf("read CodeBuild builds: %w", err)
	}
	byID := make(map[string]*codebuildtypes.Build, len(out.Builds))
	for i := range out.Builds {
		byID[aws.ToString(out.Builds[i].Id)] = &out.Builds[i]
	}
	covered := false
	for _, id := range ids {
		build, ok := byID[id]
		if !ok || build.StartTime == nil {
			return nil, false, fmt.Errorf("CodeBuild build %s could not be inspected", id)
		}
		if build.StartTime.Before(notBefore) {
			covered = true
			continue
		}
		if contentRevision(build) == revision {
			return build, covered, nil
		}
	}
	return nil, covered, nil
}

// startBuild calls StartBuild for a locked revision and persists its Build ID.
func (c *Coordinator) startBuild(ctx context.Context, state State, revision, targetRevision int64, token string) (Request, error) {
	buildOut, err := c.codebuild.StartBuild(ctx, &codebuild.StartBuildInput{
		ProjectName:      aws.String(c.projectName),
		IdempotencyToken: aws.String(token),
		EnvironmentVariablesOverride: []codebuildtypes.EnvironmentVariable{{
			Name: aws.String(contentRevisionVariable), Value: aws.String(strconv.FormatInt(revision, 10)), Type: codebuildtypes.EnvironmentVariableTypePlaintext,
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

	logBuildAccepted(ctx, state, revision, buildID, c.now())

	_, err = c.dynamo.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(c.tableName),
		Key:                      stateKey(),
		UpdateExpression:         aws.String("SET #status = :inProgress, activeBuildId = :buildId"),
		ConditionExpression:      aws.String("activeRevision = :revision AND startToken = :token"),
		ExpressionAttributeNames: map[string]string{attributeNameStatus: attributeStatusValue},
		ExpressionAttributeValues: map[string]dynamodbtypes.AttributeValue{
			":inProgress":          stringValue(StatusInProgress),
			attributeValueBuildID:  stringValue(buildID),
			attributeValueRevision: numberValue(revision),
			attributeValueToken:    stringValue(token),
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

// lockLost converts a lost conditional update into the winner's request.
func (c *Coordinator) lockLost(ctx context.Context, targetRevision int64, err error) (Request, error) {
	var conditional *dynamodbtypes.ConditionalCheckFailedException
	if errors.As(err, &conditional) {
		latest, getErr := c.GetState(ctx)
		return RequestForState(latest, targetRevision), getErr
	}
	return Request{}, err
}

func (c *Coordinator) markStartFailed(ctx context.Context, revision int64, startErr error) error {
	_, err := c.dynamo.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(c.tableName),
		Key:                      map[string]dynamodbtypes.AttributeValue{"id": &dynamodbtypes.AttributeValueMemberS{Value: StateItemID}},
		UpdateExpression:         aws.String("SET #status = :failed, lastError = :error REMOVE activeBuildId, startToken, startedAt, startAttemptedAt"),
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
		return c.reconcileIdle(ctx, state)
	}

	out, err := c.codebuild.BatchGetBuilds(ctx, &codebuild.BatchGetBuildsInput{Ids: []string{state.ActiveBuildID}})
	if err != nil {
		return State{}, err
	}
	if len(out.Builds) == 0 || out.Builds[0].BuildStatus == codebuildtypes.StatusTypeInProgress {
		return state, nil
	}
	return c.completeBuild(ctx, state, out.Builds[0].BuildStatus)
}

// completeBuild records a finished active build and starts a trailing revision.
func (c *Coordinator) completeBuild(ctx context.Context, state State, buildStatus codebuildtypes.StatusType) (State, error) {
	now := c.now().UTC().Format(time.RFC3339Nano)
	if buildStatus == codebuildtypes.StatusTypeSucceeded {
		return c.completeSucceededBuild(ctx, state, now)
	}
	return c.completeFailedBuild(ctx, state, string(buildStatus), now)
}

func (c *Coordinator) reconcileIdle(ctx context.Context, state State) (State, error) {
	// Do not endlessly restart a revision that already failed; wait until a
	// newer desiredRevision arrives (or an operator manually triggers a build).
	alreadyFailedCurrentRevision := state.Status == StatusFailed && state.LastBuildRevision >= state.DesiredRevision
	if state.DesiredRevision > state.DeployedRevision && !alreadyFailedCurrentRevision {
		if _, startErr := c.StartPending(ctx); startErr != nil {
			return State{}, startErr
		}
		return c.GetState(ctx)
	}
	return state, nil
}

func (c *Coordinator) completeSucceededBuild(ctx context.Context, state State, now string) (State, error) {
	_, err := c.dynamo.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(c.tableName),
		Key:                      map[string]dynamodbtypes.AttributeValue{"id": &dynamodbtypes.AttributeValueMemberS{Value: StateItemID}},
		UpdateExpression:         aws.String("SET deployedRevision = :revision, #status = :status, completedAt = :now, lastBuildId = :buildId, lastBuildRevision = :revision REMOVE activeBuildId, startToken, startedAt, startAttemptedAt, lastError"),
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

func (c *Coordinator) completeFailedBuild(ctx context.Context, state State, buildStatus, now string) (State, error) {
	_, err := c.dynamo.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                aws.String(c.tableName),
		Key:                      map[string]dynamodbtypes.AttributeValue{"id": &dynamodbtypes.AttributeValueMemberS{Value: StateItemID}},
		UpdateExpression:         aws.String("SET #status = :failed, completedAt = :now, lastError = :error, lastBuildId = :buildId, lastBuildRevision = :revision REMOVE activeBuildId, startToken, startedAt, startAttemptedAt"),
		ConditionExpression:      aws.String("activeBuildId = :buildId"),
		ExpressionAttributeNames: map[string]string{attributeNameStatus: attributeStatusValue},
		ExpressionAttributeValues: map[string]dynamodbtypes.AttributeValue{
			":failed":              &dynamodbtypes.AttributeValueMemberS{Value: StatusFailed},
			attributeValueNow:      &dynamodbtypes.AttributeValueMemberS{Value: now},
			":error":               &dynamodbtypes.AttributeValueMemberS{Value: buildStatus},
			attributeValueBuildID:  &dynamodbtypes.AttributeValueMemberS{Value: state.ActiveBuildID},
			attributeValueRevision: &dynamodbtypes.AttributeValueMemberN{Value: strconv.FormatInt(state.ActiveRevision, 10)},
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

// firstStartAttempt returns when startToken was first sent to StartBuild.
// Items written before startAttemptedAt existed report false: their startedAt
// may have been moved by earlier lock refreshes, so token validity is unknown
// and must be treated as expired.
func firstStartAttempt(state State) (time.Time, bool) {
	if state.StartAttemptedAt == "" {
		return time.Time{}, false
	}
	attemptedAt, err := time.Parse(time.RFC3339Nano, state.StartAttemptedAt)
	return attemptedAt, err == nil
}

// historyNotBefore is the oldest build start time the history check must
// cover. Any StartBuild with the current token happened after its first
// attempt; clock skew between Lambda and CodeBuild is allowed for. Legacy
// items only know the latest lock time, so they look further back.
func historyNotBefore(state State, attemptedAt time.Time, attemptKnown bool) time.Time {
	if attemptKnown {
		return attemptedAt.Add(-historyClockSkew)
	}
	startedAt, err := time.Parse(time.RFC3339Nano, state.StartedAt)
	if err != nil {
		// Unknown lower bound: require the complete history (or fail closed
		// when the page limit is reached first).
		return time.Time{}
	}
	return startedAt.Add(-legacyHistoryLookback)
}

func contentRevision(build *codebuildtypes.Build) int64 {
	if build.Environment == nil {
		return 0
	}
	for _, variable := range build.Environment.EnvironmentVariables {
		if aws.ToString(variable.Name) != contentRevisionVariable {
			continue
		}
		revision, err := strconv.ParseInt(aws.ToString(variable.Value), 10, 64)
		if err != nil {
			return 0
		}
		return revision
	}
	return 0
}

func stateKey() map[string]dynamodbtypes.AttributeValue {
	return map[string]dynamodbtypes.AttributeValue{"id": stringValue(StateItemID)}
}

func stringValue(value string) dynamodbtypes.AttributeValue {
	return &dynamodbtypes.AttributeValueMemberS{Value: value}
}

func numberValue(value int64) dynamodbtypes.AttributeValue {
	return &dynamodbtypes.AttributeValueMemberN{Value: strconv.FormatInt(value, 10)}
}
