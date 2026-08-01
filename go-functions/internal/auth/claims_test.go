package auth

import (
	"testing"

	"github.com/aws/aws-lambda-go/events"
)

func requestWithClaims(claims map[string]interface{}) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{"claims": claims},
		},
	}
}

func TestUserID(t *testing.T) {
	tests := []struct {
		name    string
		request events.APIGatewayProxyRequest
		want    string
	}{
		{
			name:    "returns the sub claim",
			request: requestWithClaims(map[string]interface{}{"sub": "user-123"}),
			want:    "user-123",
		},
		{
			name:    "empty when there is no authorizer",
			request: events.APIGatewayProxyRequest{},
			want:    "",
		},
		{
			name: "empty when claims are missing",
			request: events.APIGatewayProxyRequest{
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: map[string]interface{}{},
				},
			},
			want: "",
		},
		{
			name: "empty when claims are not a map",
			request: events.APIGatewayProxyRequest{
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: map[string]interface{}{"claims": "not-a-map"},
				},
			},
			want: "",
		},
		{
			name:    "empty when sub is absent",
			request: requestWithClaims(map[string]interface{}{"email": "a@example.com"}),
			want:    "",
		},
		{
			name:    "empty when sub is not a string",
			request: requestWithClaims(map[string]interface{}{"sub": 42}),
			want:    "",
		},
		{
			name: "empty when claims are nil",
			request: events.APIGatewayProxyRequest{
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: map[string]interface{}{"claims": nil},
				},
			},
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := UserID(tt.request); got != tt.want {
				t.Errorf("UserID() = %q, want %q", got, tt.want)
			}
		})
	}
}

// API Gateway does not deliver the cognito:groups array claim in a single
// shape, so every form we might receive has to resolve to the same answer.
func TestGroupsAcceptsEveryClaimShape(t *testing.T) {
	tests := []struct {
		name  string
		claim interface{}
		want  []string
	}{
		{name: "string slice", claim: []string{"admin", "editor"}, want: []string{"admin", "editor"}},
		{name: "interface slice", claim: []interface{}{"admin", "editor"}, want: []string{"admin", "editor"}},
		{name: "bracketed space separated", claim: "[admin editor]", want: []string{"admin", "editor"}},
		{name: "comma separated", claim: "admin,editor", want: []string{"admin", "editor"}},
		{name: "comma space separated", claim: "admin, editor", want: []string{"admin", "editor"}},
		{name: "single value", claim: "admin", want: []string{"admin"}},
		{name: "bracketed single value", claim: "[admin]", want: []string{"admin"}},
		{name: "empty string", claim: "", want: nil},
		{name: "empty brackets", claim: "[]", want: nil},
		{name: "empty slice", claim: []string{}, want: nil},
		{name: "unexpected type", claim: 42, want: nil},
		{name: "slice with non-strings", claim: []interface{}{"admin", 7}, want: []string{"admin"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Groups(requestWithClaims(map[string]interface{}{"cognito:groups": tt.claim}))
			if len(got) != len(tt.want) {
				t.Fatalf("Groups() = %v, want %v", got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("Groups()[%d] = %q, want %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestGroupsWithoutClaim(t *testing.T) {
	if got := Groups(requestWithClaims(map[string]interface{}{"sub": "user-123"})); got != nil {
		t.Errorf("Groups() = %v, want nil", got)
	}
	if got := Groups(events.APIGatewayProxyRequest{}); got != nil {
		t.Errorf("Groups() = %v, want nil", got)
	}
	if got := Groups(requestWithClaims(map[string]interface{}{"cognito:groups": nil})); got != nil {
		t.Errorf("Groups() = %v, want nil", got)
	}
}

func TestIsAdmin(t *testing.T) {
	tests := []struct {
		name  string
		claim interface{}
		want  bool
	}{
		{name: "member of admin", claim: []string{"admin"}, want: true},
		{name: "member of admin among others", claim: "[editor admin]", want: true},
		{name: "not a member", claim: []string{"editor"}, want: false},
		{name: "no groups at all", claim: nil, want: false},
		// Guards against a prefix match letting the wrong group through.
		{name: "similar group name", claim: []string{"administrators"}, want: false},
		{name: "case mismatch is not a member", claim: []string{"Admin"}, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			claims := map[string]interface{}{"sub": "user-123"}
			if tt.claim != nil {
				claims["cognito:groups"] = tt.claim
			}
			if got := IsAdmin(requestWithClaims(claims)); got != tt.want {
				t.Errorf("IsAdmin() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestHasGroupOnUnauthenticatedRequest(t *testing.T) {
	if HasGroup(events.APIGatewayProxyRequest{}, AdminGroup) {
		t.Error("HasGroup() = true for an unauthenticated request, want false")
	}
}
