package sitebuild

import (
	"context"
	"time"

	"serverless-blog/go-functions/internal/middleware"
)

// Observe only an accepted build; this is not proof that content is public.
// requestedAt belongs to DesiredRevision, so never attach a newer save time to
// a recovered older build. Missing telemetry must not alter build coordination.
func logBuildAccepted(ctx context.Context, state State, revision int64, buildID string, now time.Time) {
	writeBuildAccepted(middleware.LoggerFromContext(ctx), state, revision, buildID, now)
}

func writeBuildAccepted(logger middleware.Logger, state State, revision int64, buildID string, now time.Time) {
	fields := []any{
		"event", "site-build-accepted",
		"contentRevision", revision,
		"buildId", buildID,
		"buildAcceptedAtMs", now.UnixMilli(),
	}
	if requestedAt, err := time.Parse(time.RFC3339Nano, state.RequestedAt); err == nil &&
		revision == state.DesiredRevision && !requestedAt.After(now) {
		fields = append(fields, "requestedAtMs", requestedAt.UnixMilli())
	}
	logger.Info("site publication timing", fields...)
}
