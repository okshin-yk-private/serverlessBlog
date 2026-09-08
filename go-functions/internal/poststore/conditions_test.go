package poststore

import (
	"errors"
	"fmt"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func TestIsConflict(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want bool
	}{
		{"success", nil, false},
		{"transport", errors.New("connection lost"), false},
		{"conditional", &types.ConditionalCheckFailedException{}, true},
		{"wrapped", fmt.Errorf("write: %w", &types.ConditionalCheckFailedException{}), true},
		{"canceled without reasons", &types.TransactionCanceledException{}, false},
		{"capacity", &types.TransactionCanceledException{CancellationReasons: []types.CancellationReason{{Code: aws.String("ProvisionedThroughputExceeded")}}}, false},
		{"transaction conditional", &types.TransactionCanceledException{CancellationReasons: []types.CancellationReason{{Code: aws.String("None")}, {Code: aws.String("ConditionalCheckFailed")}}}, true},
		{"transaction race", &types.TransactionCanceledException{CancellationReasons: []types.CancellationReason{{Code: aws.String("TransactionConflict")}}}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsConflict(tc.err); got != tc.want {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestVersionConditionLegacyAndCurrent(t *testing.T) {
	for _, version := range []int64{0, 7} {
		expr, names, values := VersionCondition(version)
		want := "attribute_exists(id) AND #version = :version"
		if version == 0 {
			want = "attribute_exists(id) AND (attribute_not_exists(#version) OR #version = :version)"
		}
		if aws.ToString(expr) != want || names["#version"] != "version" || values[":version"].(*types.AttributeValueMemberN).Value != fmt.Sprint(version) {
			t.Fatal("invalid optimistic locking condition")
		}
	}
}

func TestSlugReservationIsNotIndexedAsPost(t *testing.T) {
	put := ReserveSlug("posts", "example", "post-1").Put
	if len(put.Item) != 2 || put.Item["id"].(*types.AttributeValueMemberS).Value != "SLUG#example" || put.Item["ownerId"].(*types.AttributeValueMemberS).Value != "post-1" {
		t.Fatal("reservation must contain only its primary key and owner")
	}
	del := ReleaseSlug("posts", "example", "post-1").Delete
	if aws.ToString(put.ConditionExpression) != "attribute_not_exists(id) OR ownerId = :owner" || aws.ToString(del.ConditionExpression) != aws.ToString(put.ConditionExpression) || del.ExpressionAttributeValues[":owner"].(*types.AttributeValueMemberS).Value != "post-1" {
		t.Fatal("claim/release must preserve ownership")
	}
}
