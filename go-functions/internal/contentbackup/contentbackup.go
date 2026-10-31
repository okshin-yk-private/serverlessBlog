// Package contentbackup exports blog posts and categories as a Markdown
// snapshot to an S3 bucket in another region.
//
// Each run writes a new, self-contained prefix:
//
//	snapshots/<UTC timestamp>/posts/<post id>.md
//	snapshots/<UTC timestamp>/categories.json
//	snapshots/<UTC timestamp>/manifest.json
//
// The manifest is written last, so a prefix without manifest.json is an
// incomplete run and must not be used for a restore. Drafts are included:
// DynamoDB is their only other copy. contentHtml is omitted because it is
// derived from contentMarkdown when a post is saved.
package contentbackup

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"sort"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"

	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/sitebuild"
)

// SnapshotPrefixRoot is the top-level prefix for every snapshot.
const SnapshotPrefixRoot = "snapshots"

// ObjectPutter is the subset of the S3 client used to write a snapshot.
type ObjectPutter interface {
	PutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.Options)) (*s3.PutObjectOutput, error)
}

// Config identifies the source tables and the destination bucket.
type Config struct {
	PostsTableName      string
	CategoriesTableName string
	BucketName          string
}

// ManifestFile describes one exported post.
type ManifestFile struct {
	Key           string `json:"key"`
	SHA256        string `json:"sha256"`
	Bytes         int    `json:"bytes"`
	ID            string `json:"id"`
	Slug          string `json:"slug,omitempty"`
	Title         string `json:"title"`
	PublishStatus string `json:"publishStatus"`
}

// Manifest marks a snapshot as complete and lists what it contains.
type Manifest struct {
	FormatVersion  int            `json:"formatVersion"`
	GeneratedAt    string         `json:"generatedAt"`
	Prefix         string         `json:"prefix"`
	PostCount      int            `json:"postCount"`
	DraftCount     int            `json:"draftCount"`
	CategoryCount  int            `json:"categoryCount"`
	CategoriesKey  string         `json:"categoriesKey"`
	CategoriesHash string         `json:"categoriesSha256"`
	Posts          []ManifestFile `json:"posts"`
}

// Exporter writes snapshots. Now is injectable for tests.
type Exporter struct {
	DynamoDB dynamodb.ScanAPIClient
	S3       ObjectPutter
	Config   Config
	Now      func() time.Time
}

// SnapshotPrefix returns the prefix for a snapshot taken at t.
func SnapshotPrefix(t time.Time) string {
	return path.Join(SnapshotPrefixRoot, t.UTC().Format("2006-01-02T150405Z"))
}

// Run exports every post and category and returns the written manifest.
func (e *Exporter) Run(ctx context.Context) (*Manifest, error) {
	if e.Config.PostsTableName == "" || e.Config.CategoriesTableName == "" || e.Config.BucketName == "" {
		return nil, errors.New("content backup is not configured")
	}
	now := time.Now
	if e.Now != nil {
		now = e.Now
	}
	generatedAt := now().UTC()
	prefix := SnapshotPrefix(generatedAt)

	posts, err := scanAll[domain.BlogPost](ctx, e.DynamoDB, e.Config.PostsTableName)
	if err != nil {
		return nil, fmt.Errorf("scan posts: %w", err)
	}
	categories, err := scanAll[domain.Category](ctx, e.DynamoDB, e.Config.CategoriesTableName)
	if err != nil {
		return nil, fmt.Errorf("scan categories: %w", err)
	}

	manifest := &Manifest{
		FormatVersion: 1,
		GeneratedAt:   generatedAt.Format(time.RFC3339),
		Prefix:        prefix,
		Posts:         []ManifestFile{},
	}
	err = e.writePosts(ctx, manifest, posts)
	if err != nil {
		return nil, err
	}
	err = e.writeCategories(ctx, manifest, categories)
	if err != nil {
		return nil, err
	}

	manifestBody, err := marshalJSON(manifest)
	if err != nil {
		return nil, fmt.Errorf("marshal manifest: %w", err)
	}
	err = e.put(ctx, path.Join(prefix, "manifest.json"), "application/json", manifestBody)
	if err != nil {
		return nil, err
	}
	return manifest, nil
}

func (e *Exporter) writePosts(ctx context.Context, manifest *Manifest, posts []domain.BlogPost) error {
	sort.Slice(posts, func(i, j int) bool { return posts[i].ID < posts[j].ID })
	for i := range posts {
		post := &posts[i]
		// The site-build coordinator keeps its state row in the posts table.
		if post.ID == sitebuild.StateItemID || post.ID == "" {
			continue
		}
		body, err := RenderPost(post)
		if err != nil {
			return fmt.Errorf("render post %s: %w", post.ID, err)
		}
		key := path.Join(manifest.Prefix, "posts", post.ID+".md")
		if err := e.put(ctx, key, "text/markdown; charset=utf-8", body); err != nil {
			return err
		}
		file := ManifestFile{
			Key:           key,
			SHA256:        sha256Hex(body),
			Bytes:         len(body),
			ID:            post.ID,
			Title:         post.Title,
			PublishStatus: post.PublishStatus,
		}
		if post.Slug != nil {
			file.Slug = *post.Slug
		}
		manifest.Posts = append(manifest.Posts, file)
		if post.PublishStatus != domain.PublishStatusPublished {
			manifest.DraftCount++
		}
	}
	manifest.PostCount = len(manifest.Posts)
	return nil
}

func (e *Exporter) writeCategories(ctx context.Context, manifest *Manifest, categories []domain.Category) error {
	sort.Slice(categories, func(i, j int) bool {
		if categories[i].SortOrder != categories[j].SortOrder {
			return categories[i].SortOrder < categories[j].SortOrder
		}
		return categories[i].ID < categories[j].ID
	})
	body, err := marshalJSON(categories)
	if err != nil {
		return fmt.Errorf("marshal categories: %w", err)
	}
	manifest.CategoriesKey = path.Join(manifest.Prefix, "categories.json")
	manifest.CategoriesHash = sha256Hex(body)
	manifest.CategoryCount = len(categories)
	return e.put(ctx, manifest.CategoriesKey, "application/json", body)
}

// put writes one object. Buckets with Object Lock reject uploads without an
// integrity checksum, so the SHA-256 checksum is requested explicitly rather
// than relying on the SDK default.
func (e *Exporter) put(ctx context.Context, key, contentType string, body []byte) error {
	_, err := e.S3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:            aws.String(e.Config.BucketName),
		Key:               aws.String(key),
		Body:              bytes.NewReader(body),
		ContentType:       aws.String(contentType),
		ChecksumAlgorithm: s3types.ChecksumAlgorithmSha256,
	})
	if err != nil {
		return fmt.Errorf("put %s: %w", key, err)
	}
	return nil
}

func scanAll[T any](ctx context.Context, client dynamodb.ScanAPIClient, table string) ([]T, error) {
	var out []T
	paginator := dynamodb.NewScanPaginator(client, &dynamodb.ScanInput{TableName: aws.String(table)})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		var items []T
		if err := attributevalue.UnmarshalListOfMaps(page.Items, &items); err != nil {
			return nil, err
		}
		out = append(out, items...)
	}
	return out, nil
}

// frontMatterField is one line of YAML front matter. Values are JSON-encoded,
// which is valid YAML, so titles containing quotes, colons or newlines round-trip
// without a YAML library.
type frontMatterField struct {
	name  string
	value any
}

// RenderPost renders a post as Markdown with YAML front matter. Every field
// needed to recreate the DynamoDB item is kept except contentHtml.
func RenderPost(post *domain.BlogPost) ([]byte, error) {
	tags := post.Tags
	if tags == nil {
		tags = []string{}
	}
	imageURLs := post.ImageURLs
	if imageURLs == nil {
		imageURLs = []string{}
	}
	fields := []frontMatterField{
		{"id", post.ID},
		{"version", post.Version},
		{"title", post.Title},
	}
	if post.Slug != nil {
		fields = append(fields, frontMatterField{"slug", *post.Slug})
	}
	fields = append(fields,
		frontMatterField{"publishStatus", post.PublishStatus},
		frontMatterField{"category", post.Category},
		frontMatterField{"tags", tags},
	)
	if post.Excerpt != nil {
		fields = append(fields, frontMatterField{"excerpt", *post.Excerpt})
	}
	if post.CoverImageURL != nil {
		fields = append(fields, frontMatterField{"coverImageUrl", *post.CoverImageURL})
	}
	fields = append(fields,
		frontMatterField{"imageUrls", imageURLs},
		frontMatterField{"authorId", post.AuthorID},
		frontMatterField{"createdAt", post.CreatedAt},
		frontMatterField{"updatedAt", post.UpdatedAt},
	)
	if post.PublishedAt != nil {
		fields = append(fields, frontMatterField{"publishedAt", *post.PublishedAt})
	}

	var buf bytes.Buffer
	buf.WriteString("---\n")
	for _, field := range fields {
		var value bytes.Buffer
		encoder := json.NewEncoder(&value)
		// Keep <, > and & readable; they need no escaping in YAML.
		encoder.SetEscapeHTML(false)
		if err := encoder.Encode(field.value); err != nil {
			return nil, fmt.Errorf("encode %s: %w", field.name, err)
		}
		fmt.Fprintf(&buf, "%s: %s\n", field.name, bytes.TrimRight(value.Bytes(), "\n"))
	}
	buf.WriteString("---\n")
	buf.WriteString(post.ContentMarkdown)
	if post.ContentMarkdown != "" && post.ContentMarkdown[len(post.ContentMarkdown)-1] != '\n' {
		buf.WriteByte('\n')
	}
	return buf.Bytes(), nil
}

func marshalJSON(v any) ([]byte, error) {
	body, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(body, '\n'), nil
}

func sha256Hex(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}
