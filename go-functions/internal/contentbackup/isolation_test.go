package contentbackup

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"sync"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	dynamotypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"serverless-blog/go-functions/internal/domain"
)

// A versioned bucket still serves the last PutObject by default. Retaining old
// versions alone cannot keep a manifest and the current objects consistent.
type snapshotStore struct {
	mu      sync.Mutex
	objects map[string][]byte
}

func (s *snapshotStore) PutObject(_ context.Context, in *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	body, err := io.ReadAll(in.Body)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.objects[aws.ToString(in.Key)] = body
	return &s3.PutObjectOutput{}, nil
}

type failingCategoriesWriter struct{ *snapshotStore }

func (w failingCategoriesWriter) PutObject(ctx context.Context, in *s3.PutObjectInput, opts ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	if strings.HasSuffix(aws.ToString(in.Key), "/categories.json") {
		return nil, fmt.Errorf("simulated categories upload failure")
	}
	return w.snapshotStore.PutObject(ctx, in, opts...)
}

func exporterWithBody(t *testing.T, store ObjectPutter, body string) *Exporter {
	t.Helper()
	e := newExporter(t, &fakeS3{})
	e.S3 = store
	e.DynamoDB = &fakeDynamoDB{tables: map[string][]map[string]dynamotypes.AttributeValue{
		"posts": {mustMarshal(t, domain.BlogPost{ID: "shared-id", ContentMarkdown: body})},
	}}
	return e
}

func assertSnapshotIntact(t *testing.T, store *snapshotStore, manifest *Manifest) {
	t.Helper()
	store.mu.Lock()
	defer store.mu.Unlock()
	var saved Manifest
	if err := json.Unmarshal(store.objects[manifest.Prefix+"/manifest.json"], &saved); err != nil {
		t.Fatalf("saved manifest: %v", err)
	}
	for _, post := range manifest.Posts {
		if sha256Hex(store.objects[post.Key]) != post.SHA256 {
			t.Errorf("another run changed %s after its manifest was written", post.Key)
		}
	}
	if sha256Hex(store.objects[manifest.CategoriesKey]) != manifest.CategoriesHash {
		t.Error("categories no longer match the manifest")
	}
	if saved.Prefix != manifest.Prefix || saved.Posts[0].SHA256 != manifest.Posts[0].SHA256 {
		t.Error("another run replaced the manifest")
	}
}

func TestSameSecondConcurrentRunsKeepIndependentSnapshots(t *testing.T) {
	store := &snapshotStore{objects: make(map[string][]byte)}
	exporters := []*Exporter{
		exporterWithBody(t, store, "first revision"),
		exporterWithBody(t, store, "second revision"),
	}
	manifests := make([]*Manifest, len(exporters))
	errs := make([]error, len(exporters))
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i, exporter := range exporters {
		wg.Go(func() {
			<-start
			manifests[i], errs[i] = exporter.Run(context.Background())
		})
	}
	close(start)
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("run %d: %v", i, err)
		}
		assertSnapshotIntact(t, store, manifests[i])
	}
	if manifests[0].Prefix == manifests[1].Prefix {
		t.Error("runs starting at the same instant shared a prefix")
	}
}

func TestSameSecondFailedRunCannotCorruptCompletedSnapshot(t *testing.T) {
	store := &snapshotStore{objects: make(map[string][]byte)}
	completed, err := exporterWithBody(t, store, "complete revision").Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	_, err = exporterWithBody(t, failingCategoriesWriter{store}, "partial revision").Run(context.Background())
	if err == nil {
		t.Fatal("expected the second run to fail")
	}
	assertSnapshotIntact(t, store, completed)
	manifestCount := 0
	for key := range store.objects {
		if strings.HasSuffix(key, "/manifest.json") {
			manifestCount++
		}
	}
	if manifestCount != 1 {
		t.Fatalf("failed run must not publish a manifest; got %d", manifestCount)
	}
}
