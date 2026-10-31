package contentbackup

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	dynamotypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/google/uuid"

	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/sitebuild"
)

// fakeDynamoDB returns each table's items split into one item per page, so
// pagination is always exercised.
type fakeDynamoDB struct {
	tables map[string][]map[string]dynamotypes.AttributeValue
	err    error
}

func (f *fakeDynamoDB) Scan(_ context.Context, in *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
	if f.err != nil {
		return nil, f.err
	}
	items := f.tables[aws.ToString(in.TableName)]
	start := 0
	if in.ExclusiveStartKey != nil {
		var cursor struct {
			N int `dynamodbav:"n"`
		}
		if err := attributevalue.UnmarshalMap(in.ExclusiveStartKey, &cursor); err != nil {
			return nil, err
		}
		start = cursor.N
	}
	if start >= len(items) {
		return &dynamodb.ScanOutput{}, nil
	}
	out := &dynamodb.ScanOutput{Items: items[start : start+1]}
	if start+1 < len(items) {
		key, err := attributevalue.MarshalMap(struct {
			N int `dynamodbav:"n"`
		}{start + 1})
		if err != nil {
			return nil, err
		}
		out.LastEvaluatedKey = key
	}
	return out, nil
}

type putCall struct {
	key         string
	contentType string
	checksum    s3types.ChecksumAlgorithm
	body        string
}

type fakeS3 struct {
	calls  []putCall
	failOn string
}

func (f *fakeS3) PutObject(_ context.Context, in *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	key := aws.ToString(in.Key)
	if f.failOn != "" && strings.HasSuffix(key, f.failOn) {
		return nil, errors.New("access denied")
	}
	body, err := io.ReadAll(in.Body)
	if err != nil {
		return nil, err
	}
	f.calls = append(f.calls, putCall{key: key, contentType: aws.ToString(in.ContentType), checksum: in.ChecksumAlgorithm, body: string(body)})
	return &s3.PutObjectOutput{}, nil
}

func mustMarshal(t *testing.T, v any) map[string]dynamotypes.AttributeValue {
	t.Helper()
	item, err := attributevalue.MarshalMap(v)
	if err != nil {
		t.Fatal(err)
	}
	return item
}

func fixedNow() time.Time { return time.Date(2026, 10, 31, 18, 0, 5, 0, time.UTC) }

func newExporter(t *testing.T, s3Client *fakeS3) *Exporter {
	t.Helper()
	slug := "hello-world"
	published := "2026-10-01T00:00:00Z"
	excerpt := "要約"
	return &Exporter{
		DynamoDB: &fakeDynamoDB{tables: map[string][]map[string]dynamotypes.AttributeValue{
			"posts": {
				mustMarshal(t, domain.BlogPost{ID: "b-draft", Title: "下書き", ContentMarkdown: "draft body", PublishStatus: domain.PublishStatusDraft, Tags: []string{}}),
				mustMarshal(t, map[string]any{"id": sitebuild.StateItemID, "desiredRevision": 3}),
				mustMarshal(t, domain.BlogPost{ID: "a-pub", Version: 2, Title: `He said "hi": <ok>`, Slug: &slug, ContentMarkdown: "# Hello\n\nbody\n", ContentHTML: "<h1>Hello</h1>", PublishStatus: domain.PublishStatusPublished, Category: "tech", Tags: []string{"go", "aws"}, PublishedAt: &published, Excerpt: &excerpt}),
			},
			"categories": {
				mustMarshal(t, domain.Category{ID: "c2", Name: "Life", Slug: "life", SortOrder: 2}),
				mustMarshal(t, domain.Category{ID: "c1", Name: "Tech", Slug: "tech", SortOrder: 1}),
			},
		}},
		S3:     s3Client,
		Config: Config{PostsTableName: "posts", CategoriesTableName: "categories", BucketName: "backup"},
		Now:    fixedNow,
	}
}

func TestRunWritesPostsCategoriesAndManifestLast(t *testing.T) {
	s3Client := &fakeS3{}
	manifest, err := newExporter(t, s3Client).Run(context.Background())
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	prefix := manifest.Prefix
	const timestampPrefix = "snapshots/2026-10-31T180005Z-"
	if !strings.HasPrefix(prefix, timestampPrefix) {
		t.Fatalf("prefix does not preserve UTC timestamp: %q", prefix)
	}
	runID, err := uuid.Parse(strings.TrimPrefix(prefix, timestampPrefix))
	if err != nil || runID.Version() != 4 {
		t.Fatalf("prefix must include a random UUID: %q", prefix)
	}
	wantKeys := []string{
		prefix + "/posts/a-pub.md",
		prefix + "/posts/b-draft.md",
		prefix + "/categories.json",
		prefix + "/manifest.json",
	}
	if len(s3Client.calls) != len(wantKeys) {
		t.Fatalf("got %d puts, want %d: %+v", len(s3Client.calls), len(wantKeys), s3Client.calls)
	}
	for i, call := range s3Client.calls {
		if call.key != wantKeys[i] {
			t.Errorf("put %d key = %q, want %q", i, call.key, wantKeys[i])
		}
		if call.checksum != s3types.ChecksumAlgorithmSha256 {
			t.Errorf("put %s checksum = %q, want SHA256 (required by Object Lock)", call.key, call.checksum)
		}
	}
	if s3Client.calls[0].contentType != "text/markdown; charset=utf-8" {
		t.Errorf("markdown content type = %q", s3Client.calls[0].contentType)
	}

	if manifest.PostCount != 2 || manifest.DraftCount != 1 || manifest.CategoryCount != 2 {
		t.Errorf("counts = posts %d drafts %d categories %d", manifest.PostCount, manifest.DraftCount, manifest.CategoryCount)
	}
	var written Manifest
	if err := json.Unmarshal([]byte(s3Client.calls[3].body), &written); err != nil {
		t.Fatalf("manifest is not JSON: %v", err)
	}
	if written.Prefix != prefix || written.GeneratedAt != "2026-10-31T18:00:05Z" {
		t.Errorf("manifest prefix/time = %q %q", written.Prefix, written.GeneratedAt)
	}
	if written.Posts[0].SHA256 != sha256Hex([]byte(s3Client.calls[0].body)) || written.Posts[0].Slug != "hello-world" {
		t.Errorf("manifest entry does not match the written post: %+v", written.Posts[0])
	}
	if written.CategoriesHash != sha256Hex([]byte(s3Client.calls[2].body)) {
		t.Error("manifest categories hash does not match categories.json")
	}

	var categories []domain.Category
	if err := json.Unmarshal([]byte(s3Client.calls[2].body), &categories); err != nil {
		t.Fatal(err)
	}
	if len(categories) != 2 || categories[0].ID != "c1" {
		t.Errorf("categories must be sorted by sortOrder: %+v", categories)
	}
}

func TestRunDoesNotWriteManifestWhenAPutFails(t *testing.T) {
	s3Client := &fakeS3{failOn: "categories.json"}
	if _, err := newExporter(t, s3Client).Run(context.Background()); err == nil {
		t.Fatal("expected an error")
	}
	for _, call := range s3Client.calls {
		if strings.HasSuffix(call.key, "manifest.json") {
			t.Fatal("manifest must not be written for an incomplete snapshot")
		}
	}
}

func TestRunReturnsScanError(t *testing.T) {
	exporter := newExporter(t, &fakeS3{})
	exporter.DynamoDB = &fakeDynamoDB{err: errors.New("throttled")}
	if _, err := exporter.Run(context.Background()); err == nil || !strings.Contains(err.Error(), "scan posts") {
		t.Fatalf("err = %v", err)
	}
}

func TestRunRejectsMissingConfiguration(t *testing.T) {
	exporter := newExporter(t, &fakeS3{})
	exporter.Config.BucketName = ""
	if _, err := exporter.Run(context.Background()); err == nil {
		t.Fatal("expected configuration error")
	}
}

func TestRenderPostKeepsRestorableFieldsAndOmitsHTML(t *testing.T) {
	slug := "s"
	published := "2026-10-01T00:00:00Z"
	got, err := RenderPost(&domain.BlogPost{
		ID: "p1", Version: 3, Title: "a: \"b\"\nc <d>", Slug: &slug, ContentMarkdown: "body",
		ContentHTML: "<p>body</p>", PublishStatus: "published", Category: "tech",
		AuthorID: "sub-1", CreatedAt: "2026-09-01T00:00:00Z", UpdatedAt: "2026-09-02T00:00:00Z",
		PublishedAt: &published,
	})
	if err != nil {
		t.Fatal(err)
	}
	want := `---
id: "p1"
version: 3
title: "a: \"b\"\nc <d>"
slug: "s"
publishStatus: "published"
category: "tech"
tags: []
imageUrls: []
authorId: "sub-1"
createdAt: "2026-09-01T00:00:00Z"
updatedAt: "2026-09-02T00:00:00Z"
publishedAt: "2026-10-01T00:00:00Z"
---
body
`
	if string(got) != want {
		t.Errorf("RenderPost mismatch\n got:\n%s\nwant:\n%s", got, want)
	}
}

func TestRenderPostKeepsExistingTrailingNewline(t *testing.T) {
	got, err := RenderPost(&domain.BlogPost{ID: "p", ContentMarkdown: "line\n"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(string(got), "---\nline\n") || strings.HasSuffix(string(got), "\n\n") {
		t.Errorf("unexpected ending: %q", got)
	}
}
