// Package auth reads identity information out of the Cognito authorizer
// claims that API Gateway attaches to a Lambda proxy request.
//
// Every handler used to carry its own copy of the "pull sub out of the
// claims map" logic. Keeping it in one place is what makes an authorization
// rule like RequireGroup possible to apply consistently.
package auth

import (
	"strings"

	"github.com/aws/aws-lambda-go/events"
)

// AdminGroup is the Cognito group required to mutate site-wide resources
// such as categories.
const AdminGroup = "admin"

// claimsMap returns the Cognito claims attached by the API Gateway
// authorizer, or nil when the request is unauthenticated.
func claimsMap(request events.APIGatewayProxyRequest) map[string]interface{} {
	if request.RequestContext.Authorizer == nil {
		return nil
	}

	claims, ok := request.RequestContext.Authorizer["claims"]
	if !ok || claims == nil {
		return nil
	}

	claimsMap, ok := claims.(map[string]interface{})
	if !ok {
		return nil
	}

	return claimsMap
}

// UserID returns the Cognito subject (the stable user identifier) for the
// request, or an empty string when the request carries no usable claims.
func UserID(request events.APIGatewayProxyRequest) string {
	claims := claimsMap(request)
	if claims == nil {
		return ""
	}

	sub, ok := claims["sub"]
	if !ok {
		return ""
	}

	subStr, ok := sub.(string)
	if !ok {
		return ""
	}

	return subStr
}

// Groups returns the Cognito groups the caller belongs to.
//
// The shape of the cognito:groups claim depends on how it reaches the
// handler: API Gateway flattens the JWT's array claim, so it can arrive as a
// real slice, as a bracketed string ("[admin editor]"), or as a plain
// comma/space separated list. All three are accepted rather than assuming
// one, because getting this wrong fails open or locks everyone out.
func Groups(request events.APIGatewayProxyRequest) []string {
	claims := claimsMap(request)
	if claims == nil {
		return nil
	}

	raw, ok := claims["cognito:groups"]
	if !ok || raw == nil {
		return nil
	}

	switch v := raw.(type) {
	case []string:
		return normalizeGroups(v)
	case []interface{}:
		groups := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok {
				groups = append(groups, s)
			}
		}
		return normalizeGroups(groups)
	case string:
		trimmed := strings.TrimSpace(v)
		trimmed = strings.TrimPrefix(trimmed, "[")
		trimmed = strings.TrimSuffix(trimmed, "]")
		fields := strings.FieldsFunc(trimmed, func(r rune) bool {
			return r == ',' || r == ' '
		})
		return normalizeGroups(fields)
	default:
		return nil
	}
}

func normalizeGroups(groups []string) []string {
	normalized := make([]string, 0, len(groups))
	for _, g := range groups {
		if trimmed := strings.TrimSpace(g); trimmed != "" {
			normalized = append(normalized, trimmed)
		}
	}
	if len(normalized) == 0 {
		return nil
	}
	return normalized
}

// HasGroup reports whether the caller belongs to the named Cognito group.
func HasGroup(request events.APIGatewayProxyRequest, group string) bool {
	for _, g := range Groups(request) {
		if g == group {
			return true
		}
	}
	return false
}

// IsAdmin reports whether the caller may mutate site-wide resources.
func IsAdmin(request events.APIGatewayProxyRequest) bool {
	return HasGroup(request, AdminGroup)
}
