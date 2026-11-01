package sitebuild

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"serverless-blog/go-functions/internal/middleware"
)

func TestBuildObservationDoesNotMisattributeNewerSaveToRecoveredBuild(t *testing.T) {
	now := time.Date(2026, 10, 31, 1, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name, requestedAt string
		desired           int64
		hasTimestamp      bool
	}{
		{"current save", now.Add(-time.Minute).Format(time.RFC3339Nano), 2, true},
		{"recovered older build", now.Add(-time.Minute).Format(time.RFC3339Nano), 3, false},
		{"legacy missing time", "", 2, false},
		{"invalid time", "invalid", 2, false},
		{"future time", now.Add(time.Minute).Format(time.RFC3339Nano), 2, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out bytes.Buffer
			writeBuildAccepted(middleware.NewLoggerWithWriter("fixture", "", &out), State{DesiredRevision: tc.desired, RequestedAt: tc.requestedAt, LastError: "SECRET_MUST_NOT_LOG"}, 2, "project:build-2", now)
			var event map[string]any
			if err := json.Unmarshal(out.Bytes(), &event); err != nil {
				t.Fatal(err)
			}
			_, found := event["requestedAtMs"]
			if found != tc.hasTimestamp {
				t.Fatalf("wrong timestamp association: %s", out.String())
			}
			if found && event["requestedAtMs"] != float64(now.Add(-time.Minute).UnixMilli()) {
				t.Fatal("save time was not preserved")
			}
			if event["event"] != "site-build-accepted" || event["contentRevision"] != float64(2) || event["buildId"] != "project:build-2" {
				t.Fatalf("missing correlation: %s", out.String())
			}
			if strings.Contains(out.String(), "SECRET_MUST_NOT_LOG") || event["confirmedAtMs"] != nil {
				t.Fatal("observation must neither leak state nor claim publication")
			}
		})
	}
}
