#!/usr/bin/env python3
"""Assertion helpers for scripts/ci/verify-public-contract.sh.

JSON / HTML / CSP-header parsing is unreadable in plain bash, so it lives
here (stdlib only). Each subcommand reads its input from stdin, prints
``✓``/``❌``/``⚠️`` lines describing what it checked, and exits 0 when every
check it ran passed (a skipped/warned check still exits 0) or 1 otherwise.
"""

from __future__ import annotations

import argparse
import json
import re
import sys

# Forbidden fields on the public API (Issue #683): authorId was the raw
# Cognito user sub, contentMarkdown is the unrendered source body.
FORBIDDEN_ITEM_KEYS = ("authorId", "contentMarkdown")

# Issue #683: the canonical site name lives in
# frontend/public-astro/src/lib/site.ts (SITE_NAME) and JSON-LD author.name
# is set to it (see frontend/public-astro/src/lib/jsonLdUtils.ts). We cannot
# import a TS module at runtime here, so the value is duplicated below; the
# "site name" test in tests/config compares the two and fails if they diverge.
EXPECTED_SITE_ORG_NAME = "bone of my fallacy"

UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)

JSONLD_SCRIPT_RE = re.compile(
    r'<script[^>]+type\s*=\s*["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)

ARTICLE_TYPES = {"BlogPosting", "Article"}

# Admin's Report-Only CSP allows same-origin, Cognito, and the presigned S3
# upload target for images (terraform/modules/cdn/main.tf,
# csp_report_only_admin). The regexes deliberately have no '*' in their
# character classes, so a wildcard host (e.g. https://*.amazonaws.com, from
# the still-enforced legacy CSP) can never match and is rejected as intended.
COGNITO_SRC_RE = re.compile(r"^https://cognito-idp\.[a-z0-9-]+\.amazonaws\.com$")
S3_REGIONAL_SRC_RE = re.compile(
    r"^https://[a-z0-9.-]+\.s3\.[a-z0-9-]+\.amazonaws\.com$"
)


def ok(message: str) -> None:
    print(f"✓ {message}")


def fail(message: str) -> None:
    print(f"❌ {message}")


def warn(message: str) -> None:
    print(f"⚠️ {message}")


def find_forbidden_keys(obj: dict) -> list[str]:
    return [key for key in FORBIDDEN_ITEM_KEYS if key in obj]


def cmd_api_list(args: argparse.Namespace) -> int:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        fail(f"{args.label}: response is not valid JSON ({exc})")
        return 1

    items = payload.get("items") if isinstance(payload, dict) else None
    if items is None:
        fail(f"{args.label}: response has no 'items' array")
        return 1

    if len(items) == 0:
        warn(f"{args.label}: 'items' is empty, skipping per-item field checks")
        print("__NO_SLUG__")
        return 0

    failed = False
    for item in items:
        leaked = find_forbidden_keys(item)
        if leaked:
            fail(f"{args.label}: item leaks internal field(s) {leaked}")
            failed = True

    if not failed:
        ok(f"{args.label}: no item exposes {list(FORBIDDEN_ITEM_KEYS)}")

    slug = next((item.get("slug") for item in items if item.get("slug")), None)
    # Printed on its own line so the calling shell can capture it; keep it
    # last and unambiguous (a real slug never equals this sentinel).
    print(slug if slug else "__NO_SLUG__")
    return 1 if failed else 0


def cmd_api_object(args: argparse.Namespace) -> int:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        fail(f"{args.label}: response is not valid JSON ({exc})")
        return 1

    if not isinstance(payload, dict):
        fail(f"{args.label}: response is not a JSON object")
        return 1

    leaked = find_forbidden_keys(payload)
    if leaked:
        fail(f"{args.label}: leaks internal field(s) {leaked}")
        return 1

    ok(f"{args.label}: no item exposes {list(FORBIDDEN_ITEM_KEYS)}")
    return 0


def cmd_rss_no_author(args: argparse.Namespace) -> int:
    rss = sys.stdin.read()
    if re.search(r"<author[\s>]", rss, re.IGNORECASE):
        fail("rss.xml contains a per-item <author> element (Issue #683)")
        return 1
    ok("rss.xml has no per-item <author> element")
    return 0


def cmd_rss_first_article(_args: argparse.Namespace) -> int:
    rss = sys.stdin.read()
    match = re.search(r"<link>([^<]*/posts/[^<]*)</link>", rss)
    print(match.group(1) if match else "")
    return 0


def _iter_jsonld_objects(html: str):
    for block in JSONLD_SCRIPT_RE.findall(html):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        candidates = data if isinstance(data, list) else [data]
        for candidate in candidates:
            if isinstance(candidate, dict) and "@graph" in candidate:
                for node in candidate["@graph"]:
                    if isinstance(node, dict):
                        yield node
            elif isinstance(candidate, dict):
                yield candidate


def cmd_jsonld_author(_args: argparse.Namespace) -> int:
    html = sys.stdin.read()
    objects = list(_iter_jsonld_objects(html))
    if not objects:
        warn("article page has no application/ld+json block, skipping")
        return 0

    failed = False

    for obj in objects:
        if "author" not in obj:
            continue
        author = obj["author"]
        if UUID_RE.search(json.dumps(author)):
            fail(f"JSON-LD author looks like a raw UUID: {json.dumps(author)}")
            failed = True

    article = next(
        (obj for obj in objects if obj.get("@type") in ARTICLE_TYPES), None
    )
    if article is None:
        warn("no BlogPosting/Article JSON-LD block found, skipping author check")
        return 1 if failed else 0

    author = article.get("author")
    if (
        not isinstance(author, dict)
        or author.get("@type") != "Organization"
        or author.get("name") != EXPECTED_SITE_ORG_NAME
    ):
        fail(
            "JSON-LD article author is not "
            f'{{"@type": "Organization", "name": "{EXPECTED_SITE_ORG_NAME}"}}: '
            f"got {json.dumps(author)}"
        )
        failed = True
    else:
        ok("JSON-LD article author is the site Organization")

    return 1 if failed else 0


def _last_header_block(raw_headers: str) -> str:
    # curl -D - concatenates one block per HTTP response (redirects, retries);
    # only the final response's headers apply to the returned body/status.
    blocks = re.split(r"\r?\n\r?\n", raw_headers.strip())
    return blocks[-1] if blocks else ""


def _parse_headers(raw_headers: str) -> dict[str, str]:
    headers: dict[str, str] = {}
    for line in _last_header_block(raw_headers).splitlines():
        if ":" not in line:
            continue
        name, _, value = line.partition(":")
        headers[name.strip().lower()] = value.strip()
    return headers


def _parse_csp(value: str) -> dict[str, set[str]]:
    directives: dict[str, set[str]] = {}
    for part in value.split(";"):
        tokens = part.strip().split()
        if not tokens:
            continue
        directives[tokens[0].lower()] = set(tokens[1:])
    return directives


def _is_allowed_admin_connect_source(token: str) -> bool:
    return (
        token == "'self'"
        or bool(COGNITO_SRC_RE.match(token))
        or bool(S3_REGIONAL_SRC_RE.match(token))
    )


def cmd_csp(args: argparse.Namespace) -> int:
    raw_headers = sys.stdin.read()
    headers = _parse_headers(raw_headers)
    csp_values = [
        headers[name]
        for name in ("content-security-policy", "content-security-policy-report-only")
        if headers.get(name)
    ]

    if not csp_values:
        fail(f"{args.page}: neither CSP nor CSP-Report-Only header is present")
        return 1

    directive_sets = [_parse_csp(value) for value in csp_values]

    failed = False

    def any_header(predicate) -> bool:
        return any(predicate(d) for d in directive_sets)

    if not any_header(
        lambda d: "'self'" in d.get("script-src", set())
        and "'unsafe-inline'" not in d.get("script-src", set())
    ):
        fail(f"{args.page}: no header has script-src 'self' without 'unsafe-inline'")
        failed = True
    else:
        ok(f"{args.page}: script-src 'self' with no 'unsafe-inline'")

    if not any_header(lambda d: "'none'" in d.get("object-src", set())):
        fail(f"{args.page}: no header has object-src 'none'")
        failed = True
    else:
        ok(f"{args.page}: object-src 'none'")

    if not any_header(lambda d: "'none'" in d.get("frame-ancestors", set())):
        fail(f"{args.page}: no header has frame-ancestors 'none'")
        failed = True
    else:
        ok(f"{args.page}: frame-ancestors 'none'")

    if not any_header(lambda d: "'self'" in d.get("base-uri", set())):
        fail(f"{args.page}: no header has base-uri 'self'")
        failed = True
    else:
        ok(f"{args.page}: base-uri 'self'")

    if args.page == "admin":
        if not any_header(
            lambda d: "connect-src" in d
            and len(d["connect-src"]) > 0
            and all(_is_allowed_admin_connect_source(t) for t in d["connect-src"])
        ):
            fail(
                f"{args.page}: no header has a connect-src limited to "
                "'self' / Cognito / the S3 image bucket (no wildcard hosts)"
            )
            failed = True
        else:
            ok(f"{args.page}: connect-src is limited to self/Cognito/S3")
    else:
        if not any_header(lambda d: d.get("connect-src") == {"'self'"}):
            fail(f"{args.page}: no header has connect-src exactly 'self'")
            failed = True
        else:
            ok(f"{args.page}: connect-src is exactly 'self'")

    return 1 if failed else 0


def cmd_site_name(_args: argparse.Namespace) -> int:
    print(EXPECTED_SITE_ORG_NAME)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("api-list", help="check GET /api/posts response")
    p.add_argument("--label", default="/api/posts")
    p.set_defaults(func=cmd_api_list)

    p = sub.add_parser("api-object", help="check a single API object")
    p.add_argument("--label", default="/api/posts/by-slug/<slug>")
    p.set_defaults(func=cmd_api_object)

    p = sub.add_parser("rss-no-author", help="check rss.xml has no <author>")
    p.set_defaults(func=cmd_rss_no_author)

    p = sub.add_parser("rss-first-article", help="print the first article URL")
    p.set_defaults(func=cmd_rss_first_article)

    p = sub.add_parser("jsonld-author", help="check article JSON-LD author")
    p.set_defaults(func=cmd_jsonld_author)

    p = sub.add_parser("csp", help="check CSP / CSP-Report-Only headers")
    p.add_argument("--page", choices=["public", "admin"], required=True)
    p.set_defaults(func=cmd_csp)

    p = sub.add_parser("site-name", help="print the expected site org name")
    p.set_defaults(func=cmd_site_name)

    return parser


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
