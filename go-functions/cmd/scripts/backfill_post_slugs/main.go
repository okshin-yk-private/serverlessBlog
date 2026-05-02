// Backfill script for the writer-experience PR7. Scans BlogPosts in
// DynamoDB, computes a friendly slug for any post that lacks one, and
// writes it back. Designed to be run from a developer workstation against
// dev/prd via the usual AWS_PROFILE / TABLE_NAME env vars.
//
//	make backfill-slugs ARGS="--dry-run"
//	make backfill-slugs            # writes for real
//
// Slug source of truth: domain.GenerateSlug (kana→romaji + kebab-case).
// Collisions are resolved by appending -2, -3, ... until SlugIndex Query
// returns 0 hits.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"serverless-blog/go-functions/internal/domain"
)

const defaultSlugIndex = "SlugIndex"

type ddbAPI interface {
	Scan(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error)
	Query(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
	UpdateItem(ctx context.Context, params *dynamodb.UpdateItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error)
}

func main() {
	var (
		tableName = flag.String("table-name", os.Getenv("TABLE_NAME"), "DynamoDB BlogPosts table name (or TABLE_NAME env)")
		region    = flag.String("region", os.Getenv("AWS_REGION"), "AWS region (or AWS_REGION env)")
		indexName = flag.String("slug-index", defaultSlugIndex, "Name of the SlugIndex GSI on BlogPosts")
		dryRun    = flag.Bool("dry-run", false, "Print proposed updates without writing")
	)
	flag.Parse()

	if *tableName == "" {
		log.Fatal("--table-name (or TABLE_NAME env) is required")
	}

	ctx := context.Background()
	cfgLoaders := []func(*config.LoadOptions) error{}
	if *region != "" {
		cfgLoaders = append(cfgLoaders, config.WithRegion(*region))
	}
	cfg, err := config.LoadDefaultConfig(ctx, cfgLoaders...)
	if err != nil {
		log.Fatalf("load aws config: %v", err)
	}
	client := dynamodb.NewFromConfig(cfg)

	if err := backfill(ctx, client, *tableName, *indexName, *dryRun); err != nil {
		log.Fatalf("backfill failed: %v", err)
	}
}

type summary struct {
	scanned       int
	skipped       int
	updated       int
	collisions    int
	emptyTitle    int
	dryRunPlanned int
}

func backfill(ctx context.Context, client ddbAPI, tableName, indexName string, dryRun bool) error {
	var s summary
	var lastEvaluatedKey map[string]types.AttributeValue
	for {
		out, err := client.Scan(ctx, &dynamodb.ScanInput{
			TableName:         aws.String(tableName),
			ExclusiveStartKey: lastEvaluatedKey,
		})
		if err != nil {
			return fmt.Errorf("scan: %w", err)
		}
		for _, item := range out.Items {
			s.scanned++
			var post domain.BlogPost
			if err := attributevalue.UnmarshalMap(item, &post); err != nil {
				log.Printf("warn: unmarshal failed for item, skipping: %v", err)
				s.skipped++
				continue
			}
			if post.Slug != nil && *post.Slug != "" {
				s.skipped++
				continue
			}
			if post.Title == "" {
				s.emptyTitle++
				s.skipped++
				log.Printf("warn: post id=%s has empty title; skipping (manual fix needed)", post.ID)
				continue
			}

			base := domain.GenerateSlug(post.Title)
			if base == "" {
				s.skipped++
				s.emptyTitle++
				log.Printf("warn: post id=%s slug generation produced empty; skipping", post.ID)
				continue
			}

			finalSlug, collisions, err := pickAvailableSlug(ctx, client, tableName, indexName, base, post.ID)
			if err != nil {
				return fmt.Errorf("pickAvailableSlug for id=%s: %w", post.ID, err)
			}
			s.collisions += collisions

			if dryRun {
				fmt.Printf("DRY-RUN id=%s\ttitle=%q\tslug=%s\n", post.ID, post.Title, finalSlug)
				s.dryRunPlanned++
				continue
			}

			if err := writeSlug(ctx, client, tableName, post.ID, finalSlug); err != nil {
				return fmt.Errorf("writeSlug id=%s: %w", post.ID, err)
			}
			s.updated++
			fmt.Printf("UPDATED id=%s\tslug=%s\n", post.ID, finalSlug)
		}
		if len(out.LastEvaluatedKey) == 0 {
			break
		}
		lastEvaluatedKey = out.LastEvaluatedKey
	}

	fmt.Println("---- summary ----")
	fmt.Printf("scanned: %d\n", s.scanned)
	fmt.Printf("skipped: %d (already had slug or unprocessable)\n", s.skipped)
	fmt.Printf("collisions resolved: %d\n", s.collisions)
	fmt.Printf("empty-title skipped: %d\n", s.emptyTitle)
	if dryRun {
		fmt.Printf("dry-run planned updates: %d\n", s.dryRunPlanned)
	} else {
		fmt.Printf("updated: %d\n", s.updated)
	}
	return nil
}

// pickAvailableSlug returns a slug that doesn't collide with another BlogPost.
// Excludes currentID from the collision set so re-running the script (which is
// idempotent) doesn't pile up suffixes.
func pickAvailableSlug(ctx context.Context, client ddbAPI, tableName, indexName, base, currentID string) (slug string, collisions int, err error) {
	candidate := base
	for n := 2; ; n++ {
		hit, qErr := slugInUseBy(ctx, client, tableName, indexName, candidate, currentID)
		if qErr != nil {
			return "", collisions, qErr
		}
		if !hit {
			return candidate, collisions, nil
		}
		collisions++
		candidate = fmt.Sprintf("%s-%d", base, n)
		if n > 1000 {
			return "", collisions, fmt.Errorf("too many slug collisions for base=%q", base)
		}
	}
}

func slugInUseBy(ctx context.Context, client ddbAPI, tableName, indexName, slug, excludeID string) (bool, error) {
	out, err := client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(tableName),
		IndexName:              aws.String(indexName),
		KeyConditionExpression: aws.String("slug = :slug"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":slug": &types.AttributeValueMemberS{Value: slug},
		},
		Limit: aws.Int32(2),
	})
	if err != nil {
		return false, err
	}
	for _, it := range out.Items {
		idAttr, ok := it["id"].(*types.AttributeValueMemberS)
		if !ok {
			continue
		}
		if idAttr.Value != excludeID {
			return true, nil
		}
	}
	return false, nil
}

func writeSlug(ctx context.Context, client ddbAPI, tableName, postID, slug string) error {
	_, err := client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(tableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: postID},
		},
		UpdateExpression: aws.String("SET slug = :s"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":s": &types.AttributeValueMemberS{Value: slug},
		},
	})
	return err
}
