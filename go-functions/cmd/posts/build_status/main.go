// Package main provides the GetBuildStatus Lambda function for retrieving
// the latest CodeBuild status of the Astro SSG site rebuild.
//
// PR5b: Build status visibility for the publish flow. The admin UI polls
// this endpoint after a publish to show "queued / in-progress / succeeded /
// failed" so the editor knows when their post is live.
//
// Route: GET /admin/posts/{id}/build-status (Cognito authenticated)
//
// The handler returns the most recent build for the configured CodeBuild
// project. Build-to-post correlation is intentionally coarse: we surface
// "the latest build for the project" rather than tying a build to the
// post id (CodeBuild coalesces rapid publishes; precise correlation is
// out of scope for this PR).
package main

import (
	"context"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
	"github.com/aws/aws-sdk-go-v2/service/codebuild/types"

	"serverless-blog/go-functions/internal/buildtrigger"
	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/middleware"
)

// codebuildClientGetter returns a CodeBuild client. Overridable in tests.
var codebuildClientGetter = func() (buildtrigger.CodeBuildClientInterface, error) {
	return clients.GetCodeBuild()
}

// BuildStatusResponse is the API response body. Fields use camelCase JSON
// to match the rest of the admin API.
type BuildStatusResponse struct {
	BuildID   string  `json:"buildId"`
	Status    string  `json:"status"`
	Phase     string  `json:"phase,omitempty"`
	StartTime *string `json:"startTime,omitempty"`
	EndTime   *string `json:"endTime,omitempty"`
}

// Handler handles GET /admin/posts/{id}/build-status.
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if userID := getUserIDFromRequest(request); userID == "" {
		return errorResponse(401, "unauthorized")
	}

	if postID := request.PathParameters["id"]; postID == "" {
		return errorResponse(400, "post ID is required")
	}

	projectName := buildtrigger.SanitizeProjectName(os.Getenv("CODEBUILD_PROJECT_NAME"))
	if projectName == "" {
		return errorResponse(500, "server configuration error")
	}

	client, err := codebuildClientGetter()
	if err != nil {
		return errorResponse(500, "server error")
	}

	listOutput, err := client.ListBuildsForProject(ctx, &codebuild.ListBuildsForProjectInput{
		ProjectName: aws.String(projectName),
		SortOrder:   types.SortOrderTypeDescending,
	})
	if err != nil {
		return errorResponse(500, "failed to list builds")
	}

	if len(listOutput.Ids) == 0 {
		return middleware.JSONResponse(200, BuildStatusResponse{Status: "idle"})
	}

	getOutput, err := client.BatchGetBuilds(ctx, &codebuild.BatchGetBuildsInput{
		Ids: []string{listOutput.Ids[0]},
	})
	if err != nil {
		return errorResponse(500, "failed to get build status")
	}

	if len(getOutput.Builds) == 0 {
		return middleware.JSONResponse(200, BuildStatusResponse{Status: "idle"})
	}

	build := getOutput.Builds[0]
	resp := BuildStatusResponse{
		Status: mapBuildStatus(build.BuildStatus),
		Phase:  aws.ToString(build.CurrentPhase),
	}
	if build.Id != nil {
		resp.BuildID = *build.Id
	}
	if build.StartTime != nil {
		ts := build.StartTime.UTC().Format("2006-01-02T15:04:05Z07:00")
		resp.StartTime = &ts
	}
	if build.EndTime != nil {
		ts := build.EndTime.UTC().Format("2006-01-02T15:04:05Z07:00")
		resp.EndTime = &ts
	}

	return middleware.JSONResponse(200, resp)
}

// mapBuildStatus maps a CodeBuild StatusType into one of the four UI states
// (idle / in-progress / succeeded / failed). CodeBuild does not surface a
// distinct "queued" state via this API, so the badge treats "in-progress"
// as covering both queued and running.
func mapBuildStatus(status types.StatusType) string {
	switch status {
	case types.StatusTypeInProgress:
		return "in-progress"
	case types.StatusTypeSucceeded:
		return "succeeded"
	case types.StatusTypeFailed,
		types.StatusTypeFault,
		types.StatusTypeTimedOut,
		types.StatusTypeStopped:
		return "failed"
	default:
		return "idle"
	}
}

func getUserIDFromRequest(request events.APIGatewayProxyRequest) string {
	if request.RequestContext.Authorizer == nil {
		return ""
	}
	claims, ok := request.RequestContext.Authorizer["claims"]
	if !ok || claims == nil {
		return ""
	}
	claimsMap, ok := claims.(map[string]interface{})
	if !ok {
		return ""
	}
	sub, ok := claimsMap["sub"]
	if !ok {
		return ""
	}
	userID, ok := sub.(string)
	if !ok {
		return ""
	}
	return userID
}

func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
