#!/usr/bin/env bash
#
# Analyze file conflicts across multiple GitHub Issues
#
# Usage: bash scripts/analyze-issue-conflicts.sh <issue1> <issue2> [issue3] ...
#
# Extracts file paths from the "対象ファイル" section of each issue body
# and outputs JSON with per-issue file lists for conflict detection.
#
# Output format:
# {
#   "issues": {
#     "42": { "title": "...", "files": ["path/to/file1", "path/to/file2"], "labels": ["bug"] },
#     "57": { "title": "...", "files": ["path/to/file3"], "labels": [] }
#   },
#   "conflicts": [
#     { "file": "path/to/file1", "issues": [42, 63] }
#   ]
# }

set -euo pipefail

if [[ $# -lt 2 ]]; then
    echo "Usage: $0 <issue1> <issue2> [issue3] ..." >&2
    echo "At least 2 issue numbers are required." >&2
    exit 1
fi

ISSUE_NUMBERS=("$@")

# Temporary directory for intermediate files
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Fetch all issues in parallel
for issue_num in "${ISSUE_NUMBERS[@]}"; do
    (
        gh issue view "$issue_num" --json title,body,labels \
            > "$TMPDIR/issue-${issue_num}.json" 2>/dev/null
    ) &
done
wait

# Build the result JSON
echo "{"
echo '  "issues": {'

first_issue=true
declare -A all_files  # file -> space-separated issue numbers

for issue_num in "${ISSUE_NUMBERS[@]}"; do
    issue_file="$TMPDIR/issue-${issue_num}.json"

    if [[ ! -f "$issue_file" ]]; then
        echo "Warning: Failed to fetch issue #${issue_num}" >&2
        continue
    fi

    title=$(jq -r '.title // ""' "$issue_file")
    labels=$(jq -c '[.labels[]?.name // empty]' "$issue_file")
    body=$(jq -r '.body // ""' "$issue_file")

    # Extract file paths from "対象ファイル" section
    # Looks for backtick-quoted paths like `go-functions/internal/handler/posts.go`
    files=$(echo "$body" | \
        sed -n '/対象ファイル/,/^##/p' | \
        grep -oP '`[^`]+\.[a-zA-Z]+`' | \
        sed 's/`//g' | \
        sort -u)

    # Build JSON array of files
    files_json="["
    first_file=true
    while IFS= read -r filepath; do
        [[ -z "$filepath" ]] && continue
        if [[ "$first_file" == "true" ]]; then
            first_file=false
        else
            files_json+=","
        fi
        files_json+="\"${filepath}\""

        # Track for conflict detection
        if [[ -n "${all_files[$filepath]:-}" ]]; then
            all_files[$filepath]+=" $issue_num"
        else
            all_files[$filepath]="$issue_num"
        fi
    done <<< "$files"
    files_json+="]"

    if [[ "$first_issue" == "true" ]]; then
        first_issue=false
    else
        echo ","
    fi

    echo -n "    \"${issue_num}\": {\"title\": $(echo "$title" | jq -Rs .), \"files\": ${files_json}, \"labels\": ${labels}}"
done

echo ""
echo "  },"

# Build conflicts array
echo '  "conflicts": ['
first_conflict=true
for filepath in "${!all_files[@]}"; do
    issues="${all_files[$filepath]}"
    # Count number of issues (space-separated)
    num_issues=$(echo "$issues" | wc -w)
    if [[ "$num_issues" -gt 1 ]]; then
        if [[ "$first_conflict" == "true" ]]; then
            first_conflict=false
        else
            echo ","
        fi
        issues_array=$(echo "$issues" | tr ' ' '\n' | sort -n | jq -Rs 'split("\n") | map(select(. != "") | tonumber)')
        echo -n "    {\"file\": \"${filepath}\", \"issues\": ${issues_array}}"
    fi
done
echo ""
echo "  ]"
echo "}"
