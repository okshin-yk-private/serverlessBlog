package sitebuild

import (
	"context"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/retry"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
)

// lostThenDeniedTransport loses the response of the first request (as if
// CodeBuild accepted it and the connection then reset) and answers any later
// request with AccessDeniedException, the rejection that would otherwise
// clear the start token.
type lostThenDeniedTransport struct {
	mu    sync.Mutex
	calls int
}

func (t *lostThenDeniedTransport) Do(req *http.Request) (*http.Response, error) {
	t.mu.Lock()
	t.calls++
	call := t.calls
	t.mu.Unlock()
	if req.Body != nil {
		_, _ = io.Copy(io.Discard, req.Body)
		_ = req.Body.Close()
	}
	if call == 1 {
		return nil, &net.OpError{Op: "read", Net: "tcp", Err: syscall.ECONNRESET}
	}
	return &http.Response{
		StatusCode: http.StatusBadRequest,
		Header: http.Header{
			"Content-Type":     []string{"application/x-amz-json-1.1"},
			"X-Amzn-Errortype": []string{"AccessDeniedException"},
			"X-Amzn-Requestid": []string{"test-request"},
		},
		Body:    io.NopCloser(strings.NewReader(`{"__type":"AccessDeniedException","message":"denied"}`)),
		Request: req,
	}, nil
}

func (t *lostThenDeniedTransport) count() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.calls
}

// newRealCodeBuild builds an SDK client that retries like the production
// client (standard retryer, 3 attempts) but without backoff delays.
func newRealCodeBuild(transport *lostThenDeniedTransport) *codebuild.Client {
	return codebuild.New(codebuild.Options{
		Region:      "ap-northeast-1",
		Credentials: credentials.NewStaticCredentialsProvider("AKID", "SECRET", ""),
		HTTPClient:  transport,
		Retryer: retry.NewStandard(func(o *retry.StandardOptions) {
			o.Backoff = retry.BackoffDelayerFunc(func(int, error) (time.Duration, error) { return 0, nil })
		}),
	})
}

func TestStartBuildSendsExactlyOneHTTPRequest(t *testing.T) {
	t.Run("control: the client retries a lost response by default", func(t *testing.T) {
		transport := &lostThenDeniedTransport{}
		_, err := newRealCodeBuild(transport).StartBuild(context.Background(), &codebuild.StartBuildInput{ProjectName: aws.String("site-project")})
		if err == nil || transport.count() < 2 {
			t.Fatalf("expected the SDK to retry into AccessDenied, calls=%d err=%v", transport.count(), err)
		}
	})

	t.Run("coordinator disables SDK retries and keeps the start lock", func(t *testing.T) {
		transport := &lostThenDeniedTransport{}
		dynamoClient := &mockDynamoDB{states: []State{queuedRevision2()}}
		coordinator := NewCoordinator(dynamoClient, newRealCodeBuild(transport), "posts", "site-project")
		coordinator.now = func() time.Time { return recoveryNow }

		request, err := coordinator.StartPending(context.Background())
		if err == nil {
			t.Fatal("a lost StartBuild response must be reported")
		}
		if got := transport.count(); got != 1 {
			t.Fatalf("StartBuild must be sent exactly once, got %d HTTP requests", got)
		}
		if isDefinitiveStartRejection(err) {
			t.Fatalf("the lost response must not surface as a definitive rejection: %v", err)
		}
		if len(dynamoClient.updates) != 1 {
			t.Fatalf("only the start lock may be written; startToken and startAttemptedAt must remain, got %d updates", len(dynamoClient.updates))
		}
		lock := dynamoClient.updates[0]
		if got := stringAttr(t, lock, ":token"); got != "site-revision-2" {
			t.Fatalf("unexpected token: %s", got)
		}
		if expression := aws.ToString(lock.UpdateExpression); !strings.Contains(expression, "startAttemptedAt = :now") {
			t.Fatalf("lock must record the first attempt: %s", expression)
		}
		if request.Status != StatusQueued {
			t.Fatalf("revision must stay starting/queued: %+v", request)
		}
	})
}

func TestStartBuildCallsDisableSDKRetries(t *testing.T) {
	for _, state := range []State{queuedRevision2(), staleStart(4*time.Minute, 4*time.Minute)} {
		dynamoClient := &mockDynamoDB{states: []State{state}}
		codebuildClient := &mockCodeBuild{startOutput: newBuildOutput("project:build-2")}
		if _, err := postsCoordinatorAt(dynamoClient, codebuildClient, recoveryNow).StartPending(context.Background()); err != nil {
			t.Fatalf("StartPending returned error: %v", err)
		}
		if len(codebuildClient.startRetryMaxAttempts) != 1 || codebuildClient.startRetryMaxAttempts[0] != 1 {
			t.Fatalf("StartBuild must run with RetryMaxAttempts=1 (new and replay): %v", codebuildClient.startRetryMaxAttempts)
		}
	}
}
