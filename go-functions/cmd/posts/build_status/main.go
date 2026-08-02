// Package main provides the GetBuildStatus Lambda function for retrieving
// the revision-correlated status of the Astro SSG site rebuild.
//
// PR5b: Build status visibility for the publish flow. The admin UI polls
// this endpoint after a publish to show "queued / in-progress / succeeded /
// failed" so the editor knows when their post is live.
//
// Route: GET /admin/posts/{id}/build-status (Cognito authenticated)
package main

import (
	"context"
	"os"
	"strconv"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"

	"serverless-blog/go-functions/internal/auth"
	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/middleware"
	"serverless-blog/go-functions/internal/sitebuild"
)

var dynamoClientGetter = func() (sitebuild.DynamoDBClient, error) {
	return clients.GetDynamoDB()
}

// BuildStatusResponse is the API response body. Fields use camelCase JSON
// to match the rest of the admin API.
type BuildStatusResponse struct {
	BuildID          string `json:"buildId,omitempty"`
	Status           string `json:"status"`
	Phase            string `json:"phase,omitempty"`
	TargetRevision   int64  `json:"targetRevision,omitempty"`
	DesiredRevision  int64  `json:"desiredRevision,omitempty"`
	DeployedRevision int64  `json:"deployedRevision,omitempty"`
	StartTime        string `json:"startTime,omitempty"`
	EndTime          string `json:"endTime,omitempty"`
}

// Handler handles GET /admin/posts/{id}/build-status.
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if userID := auth.UserID(request); userID == "" {
		return errorResponse(401, "unauthorized")
	}

	if postID := request.PathParameters["id"]; postID == "" {
		return errorResponse(400, "post ID is required")
	}

	tableName := os.Getenv("TABLE_NAME")
	if tableName == "" {
		return errorResponse(500, "server configuration error")
	}

	client, err := dynamoClientGetter()
	if err != nil {
		return errorResponse(500, "server error")
	}
	coordinator := sitebuild.NewCoordinator(client, nil, tableName, "")
	state, err := coordinator.GetState(ctx)
	if err != nil {
		return errorResponse(500, "failed to get build status")
	}

	targetRevision := state.DesiredRevision
	if raw := request.QueryStringParameters["targetRevision"]; raw != "" {
		targetRevision, err = strconv.ParseInt(raw, 10, 64)
		if err != nil || targetRevision <= 0 {
			return errorResponse(400, "targetRevision must be a positive integer")
		}
	}
	requestState := sitebuild.RequestForState(state, targetRevision)
	resp := BuildStatusResponse{
		BuildID: requestState.BuildID, Status: requestState.Status,
		TargetRevision: requestState.TargetRevision, DesiredRevision: state.DesiredRevision,
		DeployedRevision: state.DeployedRevision, StartTime: state.StartedAt, EndTime: state.CompletedAt,
	}
	switch requestState.Status {
	case sitebuild.StatusInProgress:
		resp.Phase = "BUILD"
	case sitebuild.StatusQueued:
		resp.Phase = "QUEUED"
	}
	return middleware.JSONResponse(200, resp)
}

func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
