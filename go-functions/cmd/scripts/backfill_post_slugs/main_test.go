package main

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"serverless-blog/go-functions/internal/domain"
)

const tn = "BlogPosts-test"
const idx = "SlugIndex"

type mockDDB struct {
	scanFn   func(context.Context, *dynamodb.ScanInput, ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error)
	queryFn  func(context.Context, *dynamodb.QueryInput, ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
	updateFn func(context.Context, *dynamodb.UpdateItemInput, ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error)
}

func (m *mockDDB) Scan(ctx context.Context, in *dynamodb.ScanInput, opts ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
	return m.scanFn(ctx, in, opts...)
}
func (m *mockDDB) Query(ctx context.Context, in *dynamodb.QueryInput, opts ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
	return m.queryFn(ctx, in, opts...)
}
func (m *mockDDB) UpdateItem(ctx context.Context, in *dynamodb.UpdateItemInput, opts ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
	return m.updateFn(ctx, in, opts...)
}

func ptr[T any](v T) *T { return &v }

func mustMarshal(t *testing.T, p domain.BlogPost) map[string]types.AttributeValue {
	t.Helper()
	av, err := attributevalue.MarshalMap(p)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return av
}

func TestSlugInUseBy_NoMatch(t *testing.T) {
	c := &mockDDB{
		queryFn: func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{}, nil
		},
	}
	hit, err := slugInUseBy(context.Background(), c, tn, idx, "x", "self")
	if err != nil || hit {
		t.Fatalf("expected no hit, got hit=%v err=%v", hit, err)
	}
}

func TestSlugInUseBy_HitDifferentID(t *testing.T) {
	other := mustMarshal(t, domain.BlogPost{ID: "other"})
	c := &mockDDB{
		queryFn: func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{Count: 1, Items: []map[string]types.AttributeValue{other}}, nil
		},
	}
	hit, err := slugInUseBy(context.Background(), c, tn, idx, "x", "self")
	if err != nil || !hit {
		t.Fatalf("expected hit, got hit=%v err=%v", hit, err)
	}
}

func TestSlugInUseBy_HitSelf_NotConflict(t *testing.T) {
	self := mustMarshal(t, domain.BlogPost{ID: "self"})
	c := &mockDDB{
		queryFn: func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{Count: 1, Items: []map[string]types.AttributeValue{self}}, nil
		},
	}
	hit, err := slugInUseBy(context.Background(), c, tn, idx, "x", "self")
	if err != nil || hit {
		t.Fatalf("expected self-hit not conflict, got hit=%v err=%v", hit, err)
	}
}

func TestSlugInUseBy_QueryError(t *testing.T) {
	c := &mockDDB{
		queryFn: func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return nil, errors.New("ddb")
		},
	}
	_, err := slugInUseBy(context.Background(), c, tn, idx, "x", "self")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestPickAvailableSlug_NoCollision(t *testing.T) {
	c := &mockDDB{
		queryFn: func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{}, nil
		},
	}
	slug, collisions, err := pickAvailableSlug(context.Background(), c, tn, idx, "hello", "self")
	if err != nil || slug != "hello" || collisions != 0 {
		t.Fatalf("expected hello/0/nil, got %s/%d/%v", slug, collisions, err)
	}
}

func TestPickAvailableSlug_TwoCollisions(t *testing.T) {
	calls := 0
	other := mustMarshal(t, domain.BlogPost{ID: "x"})
	c := &mockDDB{
		queryFn: func(_ context.Context, in *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			calls++
			val := in.ExpressionAttributeValues[":slug"].(*types.AttributeValueMemberS).Value
			if val == "hello" || val == "hello-2" {
				return &dynamodb.QueryOutput{Count: 1, Items: []map[string]types.AttributeValue{other}}, nil
			}
			return &dynamodb.QueryOutput{}, nil
		},
	}
	slug, collisions, err := pickAvailableSlug(context.Background(), c, tn, idx, "hello", "self")
	if err != nil || slug != "hello-3" || collisions != 2 {
		t.Fatalf("expected hello-3/2/nil, got %s/%d/%v", slug, collisions, err)
	}
	if calls != 3 {
		t.Errorf("expected 3 query calls, got %d", calls)
	}
}

func TestPickAvailableSlug_QueryError(t *testing.T) {
	c := &mockDDB{
		queryFn: func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return nil, errors.New("ddb")
		},
	}
	_, _, err := pickAvailableSlug(context.Background(), c, tn, idx, "hello", "self")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestWriteSlug_OK(t *testing.T) {
	var captured *dynamodb.UpdateItemInput
	c := &mockDDB{
		updateFn: func(_ context.Context, in *dynamodb.UpdateItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
			captured = in
			return &dynamodb.UpdateItemOutput{}, nil
		},
	}
	if err := writeSlug(context.Background(), c, tn, "id-1", "my-slug"); err != nil {
		t.Fatal(err)
	}
	if captured == nil {
		t.Fatal("UpdateItem not called")
	}
	if *captured.UpdateExpression != "SET slug = :s" {
		t.Errorf("unexpected expression: %s", *captured.UpdateExpression)
	}
	got := captured.ExpressionAttributeValues[":s"].(*types.AttributeValueMemberS).Value
	if got != "my-slug" {
		t.Errorf("expected my-slug, got %s", got)
	}
}

func TestBackfill_DryRunDoesNotUpdate(t *testing.T) {
	post := mustMarshal(t, domain.BlogPost{ID: "id-1", Title: "Hello World"})
	c := &mockDDB{
		scanFn: func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{post}}, nil
		},
		queryFn: func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{}, nil
		},
		updateFn: func(_ context.Context, _ *dynamodb.UpdateItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
			t.Error("UpdateItem should not be called on dry-run")
			return &dynamodb.UpdateItemOutput{}, nil
		},
	}
	if err := backfill(context.Background(), c, tn, idx, true); err != nil {
		t.Fatal(err)
	}
}

func TestBackfill_SkipsPostsWithExistingSlug(t *testing.T) {
	withSlug := mustMarshal(t, domain.BlogPost{ID: "id-1", Title: "Hello", Slug: ptr("already-set")})
	scanned := false
	updated := false
	c := &mockDDB{
		scanFn: func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			scanned = true
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{withSlug}}, nil
		},
		queryFn: func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			t.Error("Query should not run for posts with slug")
			return &dynamodb.QueryOutput{}, nil
		},
		updateFn: func(_ context.Context, _ *dynamodb.UpdateItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
			updated = true
			return &dynamodb.UpdateItemOutput{}, nil
		},
	}
	if err := backfill(context.Background(), c, tn, idx, false); err != nil {
		t.Fatal(err)
	}
	if !scanned {
		t.Error("expected Scan to run")
	}
	if updated {
		t.Error("expected UpdateItem NOT to run")
	}
}

func TestBackfill_UpdatesPostsMissingSlug(t *testing.T) {
	missing := mustMarshal(t, domain.BlogPost{ID: "id-1", Title: "Hello World"})
	queries := 0
	var updatedSlug string
	c := &mockDDB{
		scanFn: func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{missing}}, nil
		},
		queryFn: func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			queries++
			return &dynamodb.QueryOutput{}, nil
		},
		updateFn: func(_ context.Context, in *dynamodb.UpdateItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
			updatedSlug = in.ExpressionAttributeValues[":s"].(*types.AttributeValueMemberS).Value
			return &dynamodb.UpdateItemOutput{}, nil
		},
	}
	if err := backfill(context.Background(), c, tn, idx, false); err != nil {
		t.Fatal(err)
	}
	if queries != 1 {
		t.Errorf("expected 1 query, got %d", queries)
	}
	if updatedSlug != "hello-world" {
		t.Errorf("expected slug hello-world, got %q", updatedSlug)
	}
}

func TestBackfill_HandlesPagination(t *testing.T) {
	page1 := mustMarshal(t, domain.BlogPost{ID: "id-1", Title: "First"})
	page2 := mustMarshal(t, domain.BlogPost{ID: "id-2", Title: "Second"})
	scanCalls := 0
	c := &mockDDB{
		scanFn: func(_ context.Context, in *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			scanCalls++
			if scanCalls == 1 {
				return &dynamodb.ScanOutput{
					Items:            []map[string]types.AttributeValue{page1},
					LastEvaluatedKey: map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: "id-1"}},
				}, nil
			}
			if in.ExclusiveStartKey == nil {
				t.Error("expected ExclusiveStartKey on second scan")
			}
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{page2}}, nil
		},
		queryFn: func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{}, nil
		},
		updateFn: func(_ context.Context, _ *dynamodb.UpdateItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
			return &dynamodb.UpdateItemOutput{}, nil
		},
	}
	if err := backfill(context.Background(), c, tn, idx, false); err != nil {
		t.Fatal(err)
	}
	if scanCalls != 2 {
		t.Errorf("expected 2 scan calls, got %d", scanCalls)
	}
}

func TestBackfill_SkipsEmptyTitle(t *testing.T) {
	empty := mustMarshal(t, domain.BlogPost{ID: "id-1", Title: ""})
	c := &mockDDB{
		scanFn: func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{empty}}, nil
		},
		queryFn: func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			t.Error("Query should not be called for empty title")
			return &dynamodb.QueryOutput{}, nil
		},
		updateFn: func(_ context.Context, _ *dynamodb.UpdateItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
			t.Error("UpdateItem should not be called for empty title")
			return &dynamodb.UpdateItemOutput{}, nil
		},
	}
	if err := backfill(context.Background(), c, tn, idx, false); err != nil {
		t.Fatal(err)
	}
}

func TestBackfill_PropagatesScanError(t *testing.T) {
	c := &mockDDB{
		scanFn: func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return nil, errors.New("scan failed")
		},
	}
	err := backfill(context.Background(), c, tn, idx, false)
	if err == nil || !strings.Contains(err.Error(), "scan") {
		t.Errorf("expected scan error, got %v", err)
	}
}

func TestParseFlags_OK(t *testing.T) {
	t.Setenv("TABLE_NAME", "")
	t.Setenv("AWS_REGION", "")
	a, err := parseFlags([]string{"--table-name", "T", "--region", "ap-northeast-1", "--dry-run"})
	if err != nil {
		t.Fatal(err)
	}
	if a.tableName != "T" || a.region != "ap-northeast-1" || !a.dryRun || a.indexName != defaultSlugIndex {
		t.Errorf("got %+v", a)
	}
}

func TestParseFlags_MissingTableName(t *testing.T) {
	t.Setenv("TABLE_NAME", "")
	if _, err := parseFlags([]string{}); err == nil {
		t.Fatal("expected error")
	}
}

func TestRun_FlagError(t *testing.T) {
	t.Setenv("TABLE_NAME", "")
	if err := run(context.Background(), []string{}); err == nil {
		t.Fatal("expected error from missing table-name")
	}
}

func TestRun_AWSClientError(t *testing.T) {
	original := newAWSClient
	t.Cleanup(func() { newAWSClient = original })
	newAWSClient = func(_ context.Context, _ string) (ddbAPI, error) {
		return nil, errors.New("aws failed")
	}
	err := run(context.Background(), []string{"--table-name", "T"})
	if err == nil || !strings.Contains(err.Error(), "aws") {
		t.Errorf("expected aws error, got %v", err)
	}
}

func TestRun_BackfillSucceeds(t *testing.T) {
	original := newAWSClient
	t.Cleanup(func() { newAWSClient = original })
	newAWSClient = func(_ context.Context, _ string) (ddbAPI, error) {
		return &mockDDB{
			scanFn: func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
				return &dynamodb.ScanOutput{}, nil
			},
		}, nil
	}
	if err := run(context.Background(), []string{"--table-name", "T", "--dry-run"}); err != nil {
		t.Fatalf("expected success, got %v", err)
	}
}
