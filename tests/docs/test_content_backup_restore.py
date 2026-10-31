"""Exercise the documented Bash procedure using a versioned S3 fixture, never AWS.

Run: python3 -m unittest discover -s tests/docs -v
"""

import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
PREFIX = "snapshots/2026-10-31T180005Z"  # Old timestamp-only prefixes remain usable.
POST_KEY = f"{PREFIX}/posts/p1.md"
CATEGORY_KEY = f"{PREFIX}/categories.json"
MANIFEST_KEY = f"{PREFIX}/manifest.json"

# This fake is deliberately read-only. It rejects missing version IDs and delete
# markers; any new AWS command added to the procedure also fails closed.
FAKE_AWS = r'''#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sys

args = sys.argv[1:]
fixture = json.loads(Path(os.environ["S3_FIXTURE"]).read_text())
if args[:2] == ["s3api", "list-object-versions"]:
    if "--no-paginate" in args or "--max-items" in args:
        sys.exit("Pagination was disabled")
    print(json.dumps(fixture["listing"]))
elif args[:2] == ["s3api", "get-object"]:
    if "--version-id" not in args:
        sys.exit("Must select a data version explicitly")
    key = args[args.index("--key") + 1]
    version = args[args.index("--version-id") + 1]
    body = fixture["objects"].get(key, {}).get(version)
    if body is None:
        sys.exit("No such data version (or delete marker)")
    Path(args[-1]).write_text(body)
    print(json.dumps({"VersionId": version}))
else:
    sys.exit("Unexpected or mutating AWS operation")
'''


def digest(body):
    return hashlib.sha256(body.encode()).hexdigest()


class RestoreProcedureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.post = "---\nid: p1\n---\noriginal draft\n"
        self.categories = '[{"id":"c1","name":"Original"}]\n'
        manifest = {
            "formatVersion": 1,
            "prefix": PREFIX,
            "postCount": 1,
            "categoryCount": 1,
            "categoriesKey": CATEGORY_KEY,
            "categoriesSha256": digest(self.categories),
            "posts": [{"key": POST_KEY, "sha256": digest(self.post)}],
        }
        objects = {
            MANIFEST_KEY: {"original": json.dumps(manifest), "overwritten": "{}"},
            POST_KEY: {"original": self.post, "overwritten": "corrupted draft"},
            CATEGORY_KEY: {"original": self.categories, "overwritten": "[]"},
        }
        listing = {"Versions": [], "DeleteMarkers": []}
        for key, versions in objects.items():
            for version in versions:
                listing["Versions"].append({
                    "Key": key, "VersionId": version, "IsLatest": False,
                    "LastModified": "2026-10-31T18:00:05Z",
                })
            listing["DeleteMarkers"].append({
                "Key": key, "VersionId": "deleted", "IsLatest": True,
            })
        fixture = self.work / "fixture.json"
        fixture.write_text(json.dumps({"listing": listing, "objects": objects}))
        binary = self.work / "bin"
        binary.mkdir()
        fake = binary / "aws"
        fake.write_text(FAKE_AWS)
        fake.chmod(0o700)
        self.preamble = (
            f'export PATH="{binary}:$PATH"\n'
            f'export S3_FIXTURE="{fixture}"\n'
        )
        section = (ROOT / "docs/content-backup.md").read_text().split("## 復元\n", 1)[1]
        self.blocks = re.findall(r"```bash\n(.*?)\n```", section, re.S)
        self.assertEqual(len(self.blocks), 4, "Review the test when the procedure changes")

    def run_procedure(self, post_version="original", include_categories=True):
        setup, manifest, download, verify_all = self.blocks
        manifest = manifest.replace("<selected-prefix>", PREFIX.split("/", 1)[1])
        manifest = manifest.replace("<selected-data-version-id>", "original")
        post = download.replace("snapshots/<selected-prefix>/posts/<post-id>.md", POST_KEY)
        post = post.replace("<candidate-data-version-id>", post_version)
        category = download.replace("snapshots/<selected-prefix>/posts/<post-id>.md", CATEGORY_KEY)
        category = category.replace("<candidate-data-version-id>", "original")
        category = category.replace("verified/0001.bin", "verified/0002.bin")
        script = "\n".join([
            self.preamble, setup, manifest, post,
            category if include_categories else "", verify_all,
        ])
        return subprocess.run(
            ["bash", "-c", script], cwd=self.work,
            text=True, capture_output=True, check=False,
        )

    def test_recovers_original_versions_behind_overwrites_and_delete_markers(self):
        result = self.run_procedure()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        restored = self.work / "backup-recovery"
        self.assertEqual((restored / "verified/0001.bin").read_text(), self.post)
        self.assertEqual((restored / "verified/0002.bin").read_text(), self.categories)
        self.assertEqual(
            (restored / "selected-manifest.tsv").read_text(),
            f"{MANIFEST_KEY}\toriginal\n",
        )
        self.assertIn("Verified all 2 files", result.stdout)

    def test_rejects_overwritten_file_even_when_download_succeeds(self):
        result = self.run_procedure(post_version="overwritten")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SHA-256 mismatch", result.stderr)
        self.assertFalse((self.work / "backup-recovery/verified/0001.bin").exists())

    def test_rejects_delete_marker_as_data_version(self):
        result = self.run_procedure(post_version="deleted")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("No such data version", result.stderr)
        self.assertFalse((self.work / "backup-recovery/verified/0001.bin").exists())

    def test_rejects_incomplete_download_set(self):
        result = self.run_procedure(include_categories=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing or duplicate selected files", result.stderr)


if __name__ == "__main__":
    unittest.main()
