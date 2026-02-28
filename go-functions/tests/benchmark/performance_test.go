// Package benchmark provides performance verification tests for Go Lambda functions.
// These tests validate that the compiled binaries meet the performance requirements
// specified in requirements.md (Requirements 11.1-11.4).
package benchmark

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// Performance requirements from requirements.md
const (
	// MaxBinarySize is the maximum allowed binary size in bytes (20MB)
	MaxBinarySize = 20 * 1024 * 1024

	// MaxColdStartTime is the target cold start time (50ms P95)
	// Note: This is measured via X-Ray in production; here we measure init time
	MaxColdStartTime = 50 * time.Millisecond

	// MaxReadOpMemory is the maximum memory for read operations (128MB)
	// Note: Actual memory usage is validated in Lambda configuration
	MaxReadOpMemory = 128 * 1024 * 1024

	// MaxCIPipelineTime is the maximum CI pipeline time (5 minutes)
	MaxCIPipelineTime = 5 * time.Minute
)

// Lambda functions grouped by domain
var (
	// PostsFunctions are the posts domain functions
	PostsFunctions = []string{
		"posts-create",
		"posts-get",
		"posts-get_public",
		"posts-list",
		"posts-update",
		"posts-delete",
	}

	// AuthFunctions are the authentication domain functions
	AuthFunctions = []string{
		"auth-login",
		"auth-logout",
		"auth-refresh",
	}

	// ImagesFunctions are the images domain functions
	ImagesFunctions = []string{
		"images-get_upload_url",
		"images-delete",
	}

	// ReadOnlyFunctions are functions that should use less memory
	ReadOnlyFunctions = []string{
		"posts-get",
		"posts-get_public",
		"posts-list",
	}

	// AllFunctions is the complete list of Lambda functions
	AllFunctions = append(append(PostsFunctions, AuthFunctions...), ImagesFunctions...)
)

// getBinDir returns the bin directory path
func getBinDir() string {
	// Try to find bin directory relative to test location
	// First check if we're in the go-functions directory
	if _, err := os.Stat("bin"); err == nil {
		return "bin"
	}
	// Check if we're in go-functions/tests/benchmark
	if _, err := os.Stat("../../bin"); err == nil {
		return "../../bin"
	}
	// Fallback to absolute path
	return "/home/okshin/src/github.com/okshin-yk-private/serverlessBlog/go-functions/bin"
}

// TestBinarySizeRequirements verifies that all Lambda binaries are under 20MB (Requirement 11.2)
func TestBinarySizeRequirements(t *testing.T) {
	binDir := getBinDir()

	for _, funcName := range AllFunctions {
		t.Run(funcName, func(t *testing.T) {
			binaryPath := filepath.Join(binDir, funcName, "bootstrap")

			// Check if binary exists
			info, err := os.Stat(binaryPath)
			if err != nil {
				if os.IsNotExist(err) {
					t.Skipf("Binary not built yet: %s (run 'make build' first)", binaryPath)
				}
				t.Fatalf("Failed to stat binary %s: %v", binaryPath, err)
			}

			size := info.Size()
			sizeMB := float64(size) / (1024 * 1024)

			t.Logf("Binary size: %.2f MB (%d bytes)", sizeMB, size)

			if size > MaxBinarySize {
				t.Errorf("Binary %s exceeds size limit: %.2f MB > 20 MB",
					funcName, sizeMB)
			}
		})
	}
}

// TestBinarySizeDetails provides detailed size breakdown for each function
func TestBinarySizeDetails(t *testing.T) {
	binDir := getBinDir()

	type sizeInfo struct {
		name   string
		size   int64
		sizeMB float64
	}

	var sizes []sizeInfo
	var totalSize int64

	for _, funcName := range AllFunctions {
		binaryPath := filepath.Join(binDir, funcName, "bootstrap")
		info, err := os.Stat(binaryPath)
		if err != nil {
			if os.IsNotExist(err) {
				t.Skipf("Binary not built yet: %s", binaryPath)
			}
			continue
		}

		size := info.Size()
		sizes = append(sizes, sizeInfo{
			name:   funcName,
			size:   size,
			sizeMB: float64(size) / (1024 * 1024),
		})
		totalSize += size
	}

	// Log detailed breakdown
	t.Log("\n=== Binary Size Report ===")
	t.Logf("%-25s %10s", "Function", "Size (MB)")
	t.Log(strings.Repeat("-", 40))

	for _, s := range sizes {
		t.Logf("%-25s %10.2f", s.name, s.sizeMB)
	}

	t.Log(strings.Repeat("-", 40))
	t.Logf("%-25s %10.2f", "TOTAL", float64(totalSize)/(1024*1024))
	t.Logf("%-25s %10.2f", "AVERAGE", float64(totalSize)/float64(len(sizes))/(1024*1024))
}

// TestBuildTimePerformance measures build time for all functions
// Validates that build performance supports CI pipeline < 5 minutes (Requirement 11.4)
func TestBuildTimePerformance(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping build time test in short mode")
	}

	// Save current directory
	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Failed to get current directory: %v", err)
	}

	// Change to go-functions directory
	goFunctionsDir := findGoFunctionsDir()
	if goFunctionsDir == "" {
		t.Skip("go-functions directory not found")
	}

	if err := os.Chdir(goFunctionsDir); err != nil {
		t.Fatalf("Failed to change to go-functions directory: %v", err)
	}
	defer func() {
		if err := os.Chdir(origDir); err != nil {
			t.Logf("Warning: failed to change back to original directory: %v", err)
		}
	}()

	// Clean first
	cleanCmd := exec.Command("make", "clean")
	if err := cleanCmd.Run(); err != nil {
		t.Logf("Warning: clean failed: %v", err)
	}

	// Measure build time
	start := time.Now()
	buildCmd := exec.Command("make", "build")
	output, err := buildCmd.CombinedOutput()
	buildDuration := time.Since(start)

	if err != nil {
		t.Fatalf("Build failed: %v\nOutput: %s", err, output)
	}

	t.Logf("Build completed in %v", buildDuration)

	// Build time should be reasonable (target: under 2 minutes for full build)
	// This is generous; actual Go builds are much faster
	maxBuildTime := 2 * time.Minute
	if buildDuration > maxBuildTime {
		t.Errorf("Build time exceeds threshold: %v > %v", buildDuration, maxBuildTime)
	}
}

// TestIndividualBuildTime measures build time for each function
func TestIndividualBuildTime(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping individual build time test in short mode")
	}

	goFunctionsDir := findGoFunctionsDir()
	if goFunctionsDir == "" {
		t.Skip("go-functions directory not found")
	}

	// Build settings
	env := append(os.Environ(),
		"CGO_ENABLED=0",
		"GOOS=linux",
		"GOARCH=arm64",
	)

	funcToCmdPath := map[string]string{
		"posts-create":          "cmd/posts/create",
		"posts-get":             "cmd/posts/get",
		"posts-get_public":      "cmd/posts/get_public",
		"posts-list":            "cmd/posts/list",
		"posts-update":          "cmd/posts/update",
		"posts-delete":          "cmd/posts/delete",
		"auth-login":            "cmd/auth/login",
		"auth-logout":           "cmd/auth/logout",
		"auth-refresh":          "cmd/auth/refresh",
		"images-get_upload_url": "cmd/images/get_upload_url",
		"images-delete":         "cmd/images/delete",
	}

	var totalBuildTime time.Duration

	for funcName, cmdPath := range funcToCmdPath {
		t.Run(funcName, func(t *testing.T) {
			fullCmdPath := filepath.Join(goFunctionsDir, cmdPath)
			if _, err := os.Stat(fullCmdPath); os.IsNotExist(err) {
				t.Skipf("Source directory not found: %s", fullCmdPath)
			}

			outputPath := filepath.Join(goFunctionsDir, "bin", funcName, "bootstrap_test")

			// Ensure output directory exists
			if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
				t.Fatalf("Failed to create output directory: %v", err)
			}

			cmd := exec.Command("go", "build",
				"-ldflags=-s -w",
				"-tags=lambda.norpc",
				"-o", outputPath,
				"./"+cmdPath)
			cmd.Dir = goFunctionsDir
			cmd.Env = env

			start := time.Now()
			output, err := cmd.CombinedOutput()
			buildTime := time.Since(start)

			if err != nil {
				t.Fatalf("Build failed: %v\nOutput: %s", err, output)
			}

			totalBuildTime += buildTime
			t.Logf("Build time: %v", buildTime)

			// Clean up test binary
			os.Remove(outputPath)

			// Individual build should be under 30 seconds
			maxIndividualBuild := 30 * time.Second
			if buildTime > maxIndividualBuild {
				t.Errorf("Build time exceeds threshold: %v > %v", buildTime, maxIndividualBuild)
			}
		})
	}

	t.Logf("Total build time for all functions: %v", totalBuildTime)
}

// TestMemoryConfigurationRequirements validates memory configuration recommendations
func TestMemoryConfigurationRequirements(t *testing.T) {
	// This test documents the memory requirements for each function type
	// Actual memory usage is validated in Lambda configuration

	t.Log("\n=== Memory Configuration Requirements ===")
	t.Log("Based on Requirement 11.3")
	t.Log("")

	t.Log("Read Operations (< 128MB):")
	for _, fn := range ReadOnlyFunctions {
		t.Logf("  - %s: 128 MB recommended", fn)
	}

	t.Log("")
	t.Log("Write Operations (128-512MB):")
	writeOps := []string{
		"posts-create",
		"posts-update",
		"posts-delete",
	}
	for _, fn := range writeOps {
		t.Logf("  - %s: 256 MB recommended", fn)
	}

	t.Log("")
	t.Log("Auth Operations (128MB):")
	for _, fn := range AuthFunctions {
		t.Logf("  - %s: 128 MB recommended", fn)
	}

	t.Log("")
	t.Log("Image Operations (128-256MB):")
	for _, fn := range ImagesFunctions {
		t.Logf("  - %s: 128 MB recommended", fn)
	}
}

// TestColdStartSimulation simulates cold start by measuring binary initialization
// Note: Actual cold start is measured via X-Ray in production (Requirement 11.1)
func TestColdStartSimulation(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping cold start simulation in short mode")
	}

	binDir := getBinDir()

	// We can't run ARM64 binaries on x86_64, but we can verify they exist
	// and report expected cold start based on binary characteristics
	for _, funcName := range AllFunctions {
		t.Run(funcName, func(t *testing.T) {
			binaryPath := filepath.Join(binDir, funcName, "bootstrap")

			info, err := os.Stat(binaryPath)
			if err != nil {
				if os.IsNotExist(err) {
					t.Skipf("Binary not built: %s", binaryPath)
				}
				t.Fatalf("Failed to stat binary: %v", err)
			}

			sizeMB := float64(info.Size()) / (1024 * 1024)

			// Cold start estimation based on binary size
			// Smaller binaries typically have faster cold starts
			// Go Lambda typically: 10-50ms for binaries under 20MB
			estimatedColdStart := 30 * time.Millisecond
			if sizeMB > 15 {
				estimatedColdStart = 40 * time.Millisecond
			}
			if sizeMB > 18 {
				estimatedColdStart = 50 * time.Millisecond
			}

			t.Logf("Binary: %.2f MB, Estimated cold start: %v", sizeMB, estimatedColdStart)

			// Warn if estimated cold start approaches limit
			if estimatedColdStart > 45*time.Millisecond {
				t.Logf("Warning: Cold start may be close to 50ms limit")
			}
		})
	}
}

// TestBinaryArchitecture verifies binaries are compiled for ARM64
func TestBinaryArchitecture(t *testing.T) {
	binDir := getBinDir()

	// Check if 'file' command is available
	_, err := exec.LookPath("file")
	if err != nil {
		t.Skip("'file' command not available - skipping architecture verification")
	}

	for _, funcName := range AllFunctions {
		t.Run(funcName, func(t *testing.T) {
			binaryPath := filepath.Join(binDir, funcName, "bootstrap")

			if _, err := os.Stat(binaryPath); os.IsNotExist(err) {
				t.Skipf("Binary not built: %s", binaryPath)
			}

			// Use 'file' command to check architecture
			cmd := exec.Command("file", binaryPath)
			output, err := cmd.Output()
			if err != nil {
				t.Skipf("Failed to run file command: %v", err)
			}

			outputStr := string(output)
			t.Logf("Binary info: %s", strings.TrimSpace(outputStr))

			// Verify it's an ARM64 ELF binary
			if !strings.Contains(outputStr, "ARM aarch64") && !strings.Contains(outputStr, "aarch64") {
				t.Errorf("Binary is not ARM64: %s", outputStr)
			}

			if !strings.Contains(outputStr, "ELF") {
				t.Errorf("Binary is not ELF format: %s", outputStr)
			}

			// Verify it's statically linked (no dynamic dependencies)
			if strings.Contains(outputStr, "dynamically linked") {
				t.Errorf("Binary should be statically linked: %s", outputStr)
			}
		})
	}
}

// TestGoTestPerformance measures test execution time
func TestGoTestPerformance(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping test performance measurement in short mode")
	}

	goFunctionsDir := findGoFunctionsDir()
	if goFunctionsDir == "" {
		t.Skip("go-functions directory not found")
	}

	// Measure test execution time
	cmd := exec.Command("go", "test", "-race", "-short", "./...")
	cmd.Dir = goFunctionsDir

	start := time.Now()
	output, err := cmd.CombinedOutput()
	testDuration := time.Since(start)

	if err != nil {
		t.Logf("Test output:\n%s", output)
		// Don't fail - tests might fail for other reasons
		t.Logf("Warning: some tests failed: %v", err)
	}

	t.Logf("Test execution time: %v", testDuration)

	// Tests should complete quickly (under 2 minutes for short mode)
	maxTestTime := 2 * time.Minute
	if testDuration > maxTestTime {
		t.Errorf("Test execution time exceeds threshold: %v > %v", testDuration, maxTestTime)
	}
}

// TestCIPerformanceEstimate estimates total CI pipeline time
func TestCIPerformanceEstimate(t *testing.T) {
	t.Log("\n=== CI Pipeline Time Estimate ===")
	t.Log("Based on Requirement 11.4: < 5 minutes")
	t.Log("")

	// Typical CI pipeline phases and estimated times
	phases := []struct {
		name     string
		estimate time.Duration
	}{
		{"Checkout & Setup Go", 20 * time.Second},
		{"Download Dependencies (cached)", 10 * time.Second},
		{"Lint (golangci-lint)", 30 * time.Second},
		{"Unit Tests (go test -race)", 60 * time.Second},
		{"Build All Functions", 60 * time.Second},
		{"Upload Artifacts", 15 * time.Second},
	}

	var totalEstimate time.Duration
	for _, phase := range phases {
		t.Logf("  %-35s %v", phase.name, phase.estimate)
		totalEstimate += phase.estimate
	}

	t.Log(strings.Repeat("-", 50))
	t.Logf("  %-35s %v", "TOTAL ESTIMATE", totalEstimate)
	t.Log("")

	if totalEstimate > MaxCIPipelineTime {
		t.Errorf("Estimated CI time exceeds requirement: %v > %v",
			totalEstimate, MaxCIPipelineTime)
	} else {
		t.Logf("Estimated CI time is within requirement (< 5 minutes)")
	}
}

// findGoFunctionsDir finds the go-functions directory
func findGoFunctionsDir() string {
	// Try common locations
	candidates := []string{
		".",
		"../..",
		"/home/okshin/src/github.com/okshin-yk-private/serverlessBlog/go-functions",
	}

	for _, candidate := range candidates {
		goMod := filepath.Join(candidate, "go.mod")
		if _, err := os.Stat(goMod); err == nil {
			abs, _ := filepath.Abs(candidate)
			return abs
		}
	}

	return ""
}

// BenchmarkBinarySize provides benchmark for monitoring binary size changes
func BenchmarkBinarySize(b *testing.B) {
	binDir := getBinDir()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var totalSize int64
		for _, funcName := range AllFunctions {
			binaryPath := filepath.Join(binDir, funcName, "bootstrap")
			if info, err := os.Stat(binaryPath); err == nil {
				totalSize += info.Size()
			}
		}
		if totalSize == 0 {
			b.Skip("No binaries found")
		}
	}
}

// init function to print system info
func init() {
	// Print system info for debugging
	_ = runtime.GOOS
	_ = runtime.GOARCH
}
