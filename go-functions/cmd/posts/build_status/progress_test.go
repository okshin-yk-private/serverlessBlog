package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
	codebuildtypes "github.com/aws/aws-sdk-go-v2/service/codebuild/types"

	"serverless-blog/go-functions/internal/sitebuild"
)

type mockBuildReader struct {
	builds []codebuildtypes.Build
	err    error
	ids    []string
}

func (m *mockBuildReader) BatchGetBuilds(ctx context.Context, input *codebuild.BatchGetBuildsInput, _ ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
	if _, ok := ctx.Deadline(); !ok {
		panic("detail requests need a timeout")
	}
	m.ids = append(m.ids, input.Ids...)
	return &codebuild.BatchGetBuildsOutput{Builds: m.builds}, m.err
}
func readResponse(t *testing.T, target string) BuildStatusResponse {
	t.Helper()
	resp, err := Handler(context.Background(), request(target))
	if err != nil || resp.StatusCode != 200 {
		t.Fatalf("status=%d err=%v", resp.StatusCode, err)
	}
	var body BuildStatusResponse
	if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
		t.Fatal(err)
	}
	return body
}

func TestProgressUsesActualPhasesOnlyForTheActiveTarget(t *testing.T) {
	setup(t, sitebuild.State{ID: sitebuild.StateItemID, DesiredRevision: 5, DeployedRevision: 3, ActiveRevision: 4, ActiveBuildID: "build-4", Status: sitebuild.StatusInProgress,
		StartedAt: "unrelated-coordinator-clock", CompletedAt: "previous-build-clock"})
	start := time.Date(2026, 9, 16, 0, 0, 0, 0, time.UTC)
	client := &mockBuildReader{builds: []codebuildtypes.Build{{Id: aws.String("build-4"), CurrentPhase: aws.String("POST_BUILD"), StartTime: &start,
		Phases: []codebuildtypes.BuildPhase{{PhaseType: codebuildtypes.BuildPhaseTypeBuild, PhaseStatus: codebuildtypes.StatusTypeSucceeded, DurationInSeconds: aws.Int64(12)}}}}}
	codebuildClientGetter = func() (buildReader, error) { return client, nil }
	for _, target := range []string{"3", "5"} {
		body := readResponse(t, target)
		if body.BuildID != "" || len(body.Phases) != 0 || body.StartTime != "" || body.EndTime != "" {
			t.Fatalf("unrelated build leaked to %s: %+v", target, body)
		}
	}
	if len(client.ids) != 0 {
		t.Fatal("must not read a different revision's build")
	}
	body := readResponse(t, "4")
	if body.Phase != "POST_BUILD" || body.StartTime != "2026-09-16T00:00:00Z" || len(body.Phases) != 1 || *body.Phases[0].DurationSeconds != 12 || body.ProgressUnavailable {
		t.Fatalf("missing live phases: %+v", body)
	}
}

func TestProgressRetainsDurableStatusWhenDetailsUnavailable(t *testing.T) {
	for _, test := range []struct {
		name   string
		builds []codebuildtypes.Build
		err    error
	}{
		{"missing", nil, nil}, {"wrong build", []codebuildtypes.Build{{Id: aws.String("another-build")}}, nil}, {"service error", nil, errors.New("unavailable")},
	} {
		t.Run(test.name, func(t *testing.T) {
			setup(t, sitebuild.State{ID: sitebuild.StateItemID, DesiredRevision: 4, ActiveRevision: 4, ActiveBuildID: "build-4", Status: sitebuild.StatusInProgress})
			codebuildClientGetter = func() (buildReader, error) { return &mockBuildReader{builds: test.builds, err: test.err}, nil }
			body := readResponse(t, "4")
			if body.Status != sitebuild.StatusInProgress || !body.ProgressUnavailable || body.Phase != "" {
				t.Fatalf("unexpected status: %+v", body)
			}
		})
	}
}

func TestProgressShowsCompletedBuildAndFailurePhase(t *testing.T) {
	for _, status := range []string{sitebuild.StatusSucceeded, sitebuild.StatusFailed} {
		t.Run(status, func(t *testing.T) {
			state := sitebuild.State{ID: sitebuild.StateItemID, DesiredRevision: 4, ActiveRevision: 4, LastBuildID: "build-4", LastBuildRevision: 4, Status: status}
			if status == sitebuild.StatusSucceeded {
				state.DeployedRevision = 4
			}
			setup(t, state)
			end := time.Date(2026, 9, 16, 0, 1, 0, 0, time.UTC)
			phaseStatus := codebuildtypes.StatusTypeSucceeded
			if status == sitebuild.StatusFailed {
				phaseStatus = codebuildtypes.StatusTypeFailed
			}
			codebuildClientGetter = func() (buildReader, error) {
				return &mockBuildReader{builds: []codebuildtypes.Build{{Id: aws.String("build-4"), CurrentPhase: aws.String("COMPLETED"), EndTime: &end,
					Phases: []codebuildtypes.BuildPhase{{PhaseType: codebuildtypes.BuildPhaseTypePostBuild, PhaseStatus: phaseStatus}},
				}}}, nil
			}
			body := readResponse(t, "4")
			if body.Status != status || body.BuildID != "build-4" || body.EndTime == "" {
				t.Fatalf("missing terminal details: %+v", body)
			}
			if status == sitebuild.StatusFailed && body.FailedPhase != "POST_BUILD" {
				t.Fatalf("missing failure phase: %+v", body)
			}
		})
	}
}

func TestProgressDoesNotAttributeNewerCompletionToAnOlderSave(t *testing.T) {
	setup(t, sitebuild.State{ID: sitebuild.StateItemID, DesiredRevision: 7, DeployedRevision: 6, ActiveRevision: 7, ActiveBuildID: "build-7", LastBuildID: "build-6", LastBuildRevision: 6, Status: sitebuild.StatusInProgress})
	body := readResponse(t, "5")
	if body.Status != sitebuild.StatusSucceeded || body.BuildID != "" || body.ProgressUnavailable {
		t.Fatalf("wrong completion: %+v", body)
	}
}

func TestProgressWaitsForCoordinatorEvenWhenCodeBuildCompleted(t *testing.T) {
	setup(t, sitebuild.State{ID: sitebuild.StateItemID, DesiredRevision: 4, ActiveRevision: 4, ActiveBuildID: "build-4", Status: sitebuild.StatusInProgress})
	codebuildClientGetter = func() (buildReader, error) {
		return &mockBuildReader{builds: []codebuildtypes.Build{{Id: aws.String("build-4"), CurrentPhase: aws.String("COMPLETED"), BuildStatus: codebuildtypes.StatusTypeSucceeded}}}, nil
	}
	body := readResponse(t, "4")
	if body.Status != sitebuild.StatusInProgress || body.Phase != "COMPLETED" {
		t.Fatalf("must retain durable lifecycle: %+v", body)
	}
}
