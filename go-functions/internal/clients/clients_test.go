// Package clients provides AWS service client initialization tests.
package clients

import (
	"errors"
	"os"
	"testing"
)

// errTestInit is a test error for simulating initialization failures.
var errTestInit = errors.New("test initialization error")

// TestGetDynamoDB tests the DynamoDB client getter.
func TestGetDynamoDB(t *testing.T) {
	// Reset singleton state for testing
	ResetForTesting()

	client, err := GetDynamoDB()
	if err != nil {
		t.Errorf("GetDynamoDB() error = %v, want nil", err)
		return
	}
	if client == nil {
		t.Error("GetDynamoDB() returned nil client")
	}
}

// TestGetDynamoDB_Singleton tests that GetDynamoDB returns same instance.
func TestGetDynamoDB_Singleton(t *testing.T) {
	ResetForTesting()

	client1, err1 := GetDynamoDB()
	if err1 != nil {
		t.Errorf("first GetDynamoDB() error = %v", err1)
		return
	}
	client2, err2 := GetDynamoDB()
	if err2 != nil {
		t.Errorf("second GetDynamoDB() error = %v", err2)
		return
	}

	if client1 != client2 {
		t.Error("GetDynamoDB() should return the same instance (singleton)")
	}
}

// TestGetS3 tests the S3 client getter.
func TestGetS3(t *testing.T) {
	ResetForTesting()

	client, err := GetS3()
	if err != nil {
		t.Errorf("GetS3() error = %v, want nil", err)
		return
	}
	if client == nil {
		t.Error("GetS3() returned nil client")
	}
}

// TestGetS3_Singleton tests that GetS3 returns same instance.
func TestGetS3_Singleton(t *testing.T) {
	ResetForTesting()

	client1, err1 := GetS3()
	if err1 != nil {
		t.Errorf("first GetS3() error = %v", err1)
		return
	}
	client2, err2 := GetS3()
	if err2 != nil {
		t.Errorf("second GetS3() error = %v", err2)
		return
	}

	if client1 != client2 {
		t.Error("GetS3() should return the same instance (singleton)")
	}
}

// TestGetCognito tests the Cognito client getter.
func TestGetCognito(t *testing.T) {
	ResetForTesting()

	client, err := GetCognito()
	if err != nil {
		t.Errorf("GetCognito() error = %v, want nil", err)
		return
	}
	if client == nil {
		t.Error("GetCognito() returned nil client")
	}
}

// TestGetCognito_Singleton tests that GetCognito returns same instance.
func TestGetCognito_Singleton(t *testing.T) {
	ResetForTesting()

	client1, err1 := GetCognito()
	if err1 != nil {
		t.Errorf("first GetCognito() error = %v", err1)
		return
	}
	client2, err2 := GetCognito()
	if err2 != nil {
		t.Errorf("second GetCognito() error = %v", err2)
		return
	}

	if client1 != client2 {
		t.Error("GetCognito() should return the same instance (singleton)")
	}
}

// TestGetPresignClient tests the S3 Presign client getter.
func TestGetPresignClient(t *testing.T) {
	ResetForTesting()

	client, err := GetPresignClient()
	if err != nil {
		t.Errorf("GetPresignClient() error = %v, want nil", err)
		return
	}
	if client == nil {
		t.Error("GetPresignClient() returned nil client")
	}
}

// TestGetPresignClient_Singleton tests that GetPresignClient returns same instance.
func TestGetPresignClient_Singleton(t *testing.T) {
	ResetForTesting()

	client1, err1 := GetPresignClient()
	if err1 != nil {
		t.Errorf("first GetPresignClient() error = %v", err1)
		return
	}
	client2, err2 := GetPresignClient()
	if err2 != nil {
		t.Errorf("second GetPresignClient() error = %v", err2)
		return
	}

	if client1 != client2 {
		t.Error("GetPresignClient() should return the same instance (singleton)")
	}
}

// TestEnvironmentVariableRegion tests that AWS_REGION is respected.
func TestEnvironmentVariableRegion(t *testing.T) {
	ResetForTesting()

	// Set a specific region
	if err := os.Setenv("AWS_REGION", "ap-northeast-1"); err != nil {
		t.Fatalf("failed to set AWS_REGION: %v", err)
	}
	defer func() {
		if err := os.Unsetenv("AWS_REGION"); err != nil {
			t.Errorf("failed to unset AWS_REGION: %v", err)
		}
	}()

	// Just verify clients can be created with the region set
	client, err := GetDynamoDB()
	if err != nil {
		t.Errorf("GetDynamoDB() with AWS_REGION set error = %v, want nil", err)
		return
	}
	if client == nil {
		t.Error("GetDynamoDB() with AWS_REGION set returned nil client")
	}
}

// TestLocalStackEndpointOverride_DynamoDB tests endpoint override for DynamoDB.
func TestLocalStackEndpointOverride_DynamoDB(t *testing.T) {
	ResetForTesting()

	// Set LocalStack endpoint
	if err := os.Setenv("DYNAMODB_ENDPOINT", "http://localhost:4566"); err != nil {
		t.Fatalf("failed to set DYNAMODB_ENDPOINT: %v", err)
	}
	defer func() {
		if err := os.Unsetenv("DYNAMODB_ENDPOINT"); err != nil {
			t.Errorf("failed to unset DYNAMODB_ENDPOINT: %v", err)
		}
	}()

	client, err := GetDynamoDB()
	if err != nil {
		t.Errorf("GetDynamoDB() with endpoint override error = %v, want nil", err)
		return
	}
	if client == nil {
		t.Error("GetDynamoDB() with endpoint override returned nil client")
	}
}

// TestLocalStackEndpointOverride_S3 tests endpoint override for S3.
func TestLocalStackEndpointOverride_S3(t *testing.T) {
	ResetForTesting()

	// Set LocalStack endpoint
	if err := os.Setenv("S3_ENDPOINT", "http://localhost:4566"); err != nil {
		t.Fatalf("failed to set S3_ENDPOINT: %v", err)
	}
	defer func() {
		if err := os.Unsetenv("S3_ENDPOINT"); err != nil {
			t.Errorf("failed to unset S3_ENDPOINT: %v", err)
		}
	}()

	client, err := GetS3()
	if err != nil {
		t.Errorf("GetS3() with endpoint override error = %v, want nil", err)
		return
	}
	if client == nil {
		t.Error("GetS3() with endpoint override returned nil client")
	}
}

// TestLocalStackEndpointOverride_Cognito tests endpoint override for Cognito.
func TestLocalStackEndpointOverride_Cognito(t *testing.T) {
	ResetForTesting()

	// Set LocalStack endpoint
	if err := os.Setenv("COGNITO_ENDPOINT", "http://localhost:4566"); err != nil {
		t.Fatalf("failed to set COGNITO_ENDPOINT: %v", err)
	}
	defer func() {
		if err := os.Unsetenv("COGNITO_ENDPOINT"); err != nil {
			t.Errorf("failed to unset COGNITO_ENDPOINT: %v", err)
		}
	}()

	client, err := GetCognito()
	if err != nil {
		t.Errorf("GetCognito() with endpoint override error = %v, want nil", err)
		return
	}
	if client == nil {
		t.Error("GetCognito() with endpoint override returned nil client")
	}
}

// TestGetDynamoDB_ReturnsErrorWhenInitFails tests error handling.
func TestGetDynamoDB_ReturnsErrorWhenInitFails(t *testing.T) {
	ResetForTesting()

	// Inject an initialization error
	SetInitErrorForTesting(errTestInit)

	client, err := GetDynamoDB()
	if err == nil {
		t.Error("GetDynamoDB() should return error when init fails")
		return
	}
	if !errors.Is(err, errTestInit) {
		t.Errorf("GetDynamoDB() error = %v, want %v", err, errTestInit)
	}
	if client != nil {
		t.Error("GetDynamoDB() should return nil client when init fails")
	}
}

// TestGetS3_ReturnsErrorWhenInitFails tests error handling for S3.
func TestGetS3_ReturnsErrorWhenInitFails(t *testing.T) {
	ResetForTesting()

	// Inject an initialization error
	SetInitErrorForTesting(errTestInit)

	client, err := GetS3()
	if err == nil {
		t.Error("GetS3() should return error when init fails")
		return
	}
	if !errors.Is(err, errTestInit) {
		t.Errorf("GetS3() error = %v, want %v", err, errTestInit)
	}
	if client != nil {
		t.Error("GetS3() should return nil client when init fails")
	}
}

// TestGetCognito_ReturnsErrorWhenInitFails tests error handling for Cognito.
func TestGetCognito_ReturnsErrorWhenInitFails(t *testing.T) {
	ResetForTesting()

	// Inject an initialization error
	SetInitErrorForTesting(errTestInit)

	client, err := GetCognito()
	if err == nil {
		t.Error("GetCognito() should return error when init fails")
		return
	}
	if !errors.Is(err, errTestInit) {
		t.Errorf("GetCognito() error = %v, want %v", err, errTestInit)
	}
	if client != nil {
		t.Error("GetCognito() should return nil client when init fails")
	}
}

// TestGetPresignClient_ReturnsErrorWhenInitFails tests error handling for Presign.
func TestGetPresignClient_ReturnsErrorWhenInitFails(t *testing.T) {
	ResetForTesting()

	// Inject an initialization error
	SetInitErrorForTesting(errTestInit)

	client, err := GetPresignClient()
	if err == nil {
		t.Error("GetPresignClient() should return error when init fails")
		return
	}
	if !errors.Is(err, errTestInit) {
		t.Errorf("GetPresignClient() error = %v, want %v", err, errTestInit)
	}
	if client != nil {
		t.Error("GetPresignClient() should return nil client when init fails")
	}
}

// TestAllClientsThreadSafe tests concurrent access to all clients.
func TestAllClientsThreadSafe(t *testing.T) {
	ResetForTesting()

	done := make(chan error, 12)

	// Spawn goroutines to access all clients concurrently
	for i := 0; i < 3; i++ {
		go func() {
			_, err := GetDynamoDB()
			done <- err
		}()
		go func() {
			_, err := GetS3()
			done <- err
		}()
		go func() {
			_, err := GetCognito()
			done <- err
		}()
		go func() {
			_, err := GetPresignClient()
			done <- err
		}()
	}

	// Wait for all goroutines to complete and check for errors
	for i := 0; i < 12; i++ {
		if err := <-done; err != nil {
			t.Errorf("concurrent client access error = %v", err)
		}
	}
}

// TestAllClientsSingletonAfterConcurrentAccess verifies singleton behavior.
func TestAllClientsSingletonAfterConcurrentAccess(t *testing.T) {
	// First do concurrent access
	TestAllClientsThreadSafe(t)

	// Then verify singletons are consistent
	verifySingletonConsistency(t, "DynamoDB", func() (interface{}, error) { return GetDynamoDB() })
	verifySingletonConsistency(t, "S3", func() (interface{}, error) { return GetS3() })
	verifySingletonConsistency(t, "Cognito", func() (interface{}, error) { return GetCognito() })
	verifySingletonConsistency(t, "Presign", func() (interface{}, error) { return GetPresignClient() })
}

// verifySingletonConsistency is a helper to verify singleton behavior.
func verifySingletonConsistency(t *testing.T, name string, getter func() (interface{}, error)) {
	t.Helper()
	client1, err1 := getter()
	if err1 != nil {
		t.Errorf("%s getter error = %v", name, err1)
		return
	}
	client2, err2 := getter()
	if err2 != nil {
		t.Errorf("%s getter error = %v", name, err2)
		return
	}
	if client1 != client2 {
		t.Errorf("%s client should be singleton after concurrent access", name)
	}
}
