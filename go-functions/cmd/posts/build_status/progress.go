package main

import (
	"context"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
	codebuildtypes "github.com/aws/aws-sdk-go-v2/service/codebuild/types"

	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/sitebuild"
)

type buildReader interface {
	BatchGetBuilds(context.Context, *codebuild.BatchGetBuildsInput, ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error)
}

var codebuildClientGetter = func() (buildReader, error) { return clients.GetCodeBuild() }

// BuildPhase exposes timings without leaking build logs or environment variables.
type BuildPhase struct {
	Name            string `json:"name"`
	Status          string `json:"status"`
	StartTime       string `json:"startTime,omitempty"`
	EndTime         string `json:"endTime,omitempty"`
	DurationSeconds *int64 `json:"durationSeconds,omitempty"`
}

func formatTime(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}

func progressBuildID(state sitebuild.State, resp *BuildStatusResponse) string {
	if resp.Status == sitebuild.StatusInProgress {
		return resp.BuildID
	}
	// Completed timings belong to this save, not a newer site's build. Queued
	// revisions never borrow the active build's phase or clock.
	if resp.Status == sitebuild.StatusSucceeded && state.LastBuildRevision == resp.TargetRevision {
		return state.LastBuildID
	}
	if resp.Status == sitebuild.StatusFailed && state.LastBuildRevision == state.ActiveRevision && state.LastBuildRevision >= resp.TargetRevision {
		return state.LastBuildID
	}
	return ""
}

func addBuildProgress(ctx context.Context, state sitebuild.State, resp *BuildStatusResponse) {
	buildID := progressBuildID(state, resp)
	if buildID == "" {
		return
	}
	resp.BuildID = buildID
	client, err := codebuildClientGetter()
	if err != nil {
		resp.ProgressUnavailable = true
		return
	}
	// Optional detail must not make the durable status endpoint slow or fail.
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	out, err := client.BatchGetBuilds(ctx, &codebuild.BatchGetBuildsInput{Ids: []string{buildID}})
	if err != nil || out == nil || len(out.Builds) != 1 || aws.ToString(out.Builds[0].Id) != buildID {
		resp.ProgressUnavailable = true
		return
	}
	build := out.Builds[0]
	resp.Phase = aws.ToString(build.CurrentPhase)
	resp.StartTime = formatTime(build.StartTime)
	resp.EndTime = formatTime(build.EndTime)
	for _, phase := range build.Phases {
		resp.Phases = append(resp.Phases, BuildPhase{
			Name: string(phase.PhaseType), Status: string(phase.PhaseStatus),
			StartTime: formatTime(phase.StartTime), EndTime: formatTime(phase.EndTime),
			DurationSeconds: phase.DurationInSeconds,
		})
		if resp.FailedPhase == "" && (phase.PhaseStatus == codebuildtypes.StatusTypeFailed || phase.PhaseStatus == codebuildtypes.StatusTypeFault || phase.PhaseStatus == codebuildtypes.StatusTypeStopped || phase.PhaseStatus == codebuildtypes.StatusTypeTimedOut) {
			resp.FailedPhase = string(phase.PhaseType)
		}
	}
	// The coordinator remains authoritative for completion and trailing builds.
}
