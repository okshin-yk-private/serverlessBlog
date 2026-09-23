#!/usr/bin/env python3
"""Keep security scanner exceptions justified and periodically re-reviewed (#694).

A review once found suppressions whose stated reasons no longer held (for
example "Rate limiting at CloudFront level" when no such limit existed). The
check below cannot judge a reason, but it forces one to exist and to be looked
at again:

- Every global exception (an ID line in terraform/.trivyignore, a `- CKV...`
  item under skip-check in terraform/.checkov.yaml) needs, in the comment block
  directly above it, a `Justification:` line and a `Review-by: YYYY-MM-DD` line.
- Every inline `#checkov:skip=ID:<reason>` / `#trivy:ignore:ID <reason>` in
  terraform/**/*.tf needs a non-empty reason.

Missing fields fail. An expired Review-by is a warning by default and fails with
--fail-on-expired (used by the nightly workflow), so an unrelated PR is not
blocked by a date passing.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from pathlib import Path

REVIEW_RE = re.compile(r"Review-by:\s*(\d{4}-\d{2}-\d{2})\b")
TRIVY_ID_RE = re.compile(r"^(AVD-[A-Z]+-\d+)\s*$", re.IGNORECASE)
CHECKOV_ITEM_RE = re.compile(r"^\s+-\s+(CKV2?_[A-Z0-9_]+)\s*$")
INLINE_CHECKOV_RE = re.compile(r"#\s*checkov:skip=([A-Z0-9_]+)(?::(.*))?$")
INLINE_TRIVY_RE = re.compile(r"#\s*trivy:ignore:([A-Za-z0-9-]+)(.*)$")


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, path: str, line: int, message: str) -> None:
        self.errors.append(f"::error file={path},line={line}::{message}")

    def warning(self, path: str, line: int, message: str) -> None:
        self.warnings.append(f"::warning file={path},line={line}::{message}")


def check_register(
    root: Path,
    rel: str,
    item_re: re.Pattern[str],
    today: dt.date,
    report: Report,
    start_marker: str | None = None,
) -> int:
    """Checks one register file; returns how many exceptions it holds."""
    lines = (root / rel).read_text(encoding="utf-8").splitlines()
    active = start_marker is None
    comments: list[str] = []
    count = 0
    for number, line in enumerate(lines, start=1):
        if not active:
            active = line.startswith(start_marker)  # type: ignore[arg-type]
            continue
        stripped = line.strip()
        if stripped.startswith("#"):
            comments.append(stripped)
            continue
        match = item_re.match(line)
        if match:
            count += 1
            exception_id = match.group(1)
            block = "\n".join(comments)
            if "Justification:" not in block:
                report.error(rel, number, f"{exception_id} has no 'Justification:' comment above it")
            review = REVIEW_RE.search(block)
            if not review:
                report.error(rel, number, f"{exception_id} has no 'Review-by: YYYY-MM-DD' comment above it")
            else:
                try:
                    due = dt.date.fromisoformat(review.group(1))
                except ValueError:
                    report.error(rel, number, f"{exception_id} has an invalid Review-by date {review.group(1)}")
                else:
                    if due < today:
                        report.warning(
                            rel,
                            number,
                            f"{exception_id} was due for review on {due}; re-check the justification and move Review-by forward",
                        )
            comments = []
            continue
        if not stripped:
            # A blank line ends a comment block unless an item follows it directly.
            comments = []
    return count


def check_inline(root: Path, report: Report) -> int:
    count = 0
    for path in sorted((root / "terraform").rglob("*.tf")):
        if ".terraform" in path.parts:
            continue
        rel = path.relative_to(root).as_posix()
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            checkov = INLINE_CHECKOV_RE.search(line)
            if checkov:
                count += 1
                if not (checkov.group(2) or "").strip():
                    report.error(rel, number, f"checkov:skip={checkov.group(1)} has no reason")
            trivy = INLINE_TRIVY_RE.search(line)
            if trivy:
                count += 1
                if not trivy.group(2).strip():
                    report.error(rel, number, f"trivy:ignore:{trivy.group(1)} has no reason")
    return count


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--today", type=dt.date.fromisoformat, default=dt.date.today())
    parser.add_argument("--fail-on-expired", action="store_true")
    args = parser.parse_args(argv)

    report = Report()
    trivy = check_register(args.root, "terraform/.trivyignore", TRIVY_ID_RE, args.today, report)
    checkov = check_register(
        args.root, "terraform/.checkov.yaml", CHECKOV_ITEM_RE, args.today, report, start_marker="skip-check:"
    )
    inline = check_inline(args.root, report)

    for line in report.errors + report.warnings:
        print(line)
    print(
        f"Security exceptions: {trivy} in .trivyignore, {checkov} in .checkov.yaml, {inline} inline; "
        f"{len(report.errors)} error(s), {len(report.warnings)} overdue review(s)."
    )
    if report.errors:
        return 1
    if args.fail_on_expired and report.warnings:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
