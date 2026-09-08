// Package poststore builds atomic post/version and slug ownership conditions.
package poststore

import (
	"errors"
	"strconv"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// VersionCondition supports existing items that predate version tracking.
// attribute_exists(id) prevents a concurrent delete from being resurrected.
func VersionCondition(version int64) (expression *string, names map[string]string, values map[string]types.AttributeValue) {
	condition := "attribute_exists(id) AND #version = :version"
	if version == 0 {
		condition = "attribute_exists(id) AND (attribute_not_exists(#version) OR #version = :version)"
	}
	return aws.String(condition), map[string]string{"#version": "version"}, map[string]types.AttributeValue{
		":version": &types.AttributeValueMemberN{Value: strconv.FormatInt(version, 10)},
	}
}

// ReserveSlug intentionally omits all GSI keys so reservations never appear in
// post lists or slug lookups. Existing owners may retain their reservation.
func ReserveSlug(table, slug, owner string) types.TransactWriteItem {
	return types.TransactWriteItem{Put: &types.Put{
		TableName: aws.String(table),
		Item: map[string]types.AttributeValue{
			"id":      &types.AttributeValueMemberS{Value: "SLUG#" + slug},
			"ownerId": &types.AttributeValueMemberS{Value: owner},
		},
		ConditionExpression:       aws.String("attribute_not_exists(id) OR ownerId = :owner"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":owner": &types.AttributeValueMemberS{Value: owner}},
	}}
}

// ReleaseSlug also handles legacy posts with no reservation yet.
func ReleaseSlug(table, slug, owner string) types.TransactWriteItem {
	return types.TransactWriteItem{Delete: &types.Delete{
		TableName:                 aws.String(table),
		Key:                       map[string]types.AttributeValue{"id": &types.AttributeValueMemberS{Value: "SLUG#" + slug}},
		ConditionExpression:       aws.String("attribute_not_exists(id) OR ownerId = :owner"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":owner": &types.AttributeValueMemberS{Value: owner}},
	}}
}

// IsConflict does not misclassify capacity/validation failures as conflicts.
func IsConflict(err error) bool {
	var conditional *types.ConditionalCheckFailedException
	if errors.As(err, &conditional) {
		return true
	}
	var canceled *types.TransactionCanceledException
	if errors.As(err, &canceled) {
		for _, reason := range canceled.CancellationReasons {
			if aws.ToString(reason.Code) == "ConditionalCheckFailed" || aws.ToString(reason.Code) == "TransactionConflict" {
				return true
			}
		}
	}
	return false
}
