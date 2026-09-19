"""Compare dependency findings using one Trivy database snapshot; execute no PR code."""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


MANIFESTS = {
    "bun.lock": "bun",
    "frontend/admin/bun.lock": "bun",
    "frontend/public-astro/bun.lock": "bun",
    "scripts/deploy/bun.lock": "bun",
    "go-functions/go.mod": "gomod",
}
SEVERITIES = {"UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"}


def findings(report):
    if report.get("SchemaVersion") != 2 or not isinstance(report.get("Results"), list):
        raise ValueError("Missing or unsupported Trivy report")
    seen = set()
    high = set()
    for result in report["Results"]:
        target = result.get("Target")
        if target not in MANIFESTS or result.get("Type") != MANIFESTS[target]:
            raise ValueError("Unexpected manifest or ecosystem in Trivy report")
        if target in seen or not result.get("Packages"):
            raise ValueError("Duplicate or unparsed dependency manifest")
        seen.add(target)
        vulnerabilities = result.get("Vulnerabilities") or []
        if not isinstance(vulnerabilities, list):
            raise ValueError("Invalid vulnerability list")
        for item in vulnerabilities:
            if not all(isinstance(item.get(key), str) and item[key] for key in ("VulnerabilityID", "PkgName", "InstalledVersion", "Severity")) or item["Severity"] not in SEVERITIES:
                raise ValueError("Incomplete vulnerability record")
            if item["Severity"] in {"HIGH", "CRITICAL"}:
                # Include version and severity: an upgrade retaining a High finding,
                # or a High -> Critical escalation, still needs human review.
                high.add((target, item["PkgName"], item["InstalledVersion"], item["VulnerabilityID"], item["Severity"]))
    if seen != set(MANIFESTS):
        raise ValueError("Trivy did not parse every required dependency manifest")
    return high


def compare(base, head):
    previous, current = findings(base), findings(head)
    return current - previous, current & previous


def scan(source, destination, config, ignore):
    for manifest in MANIFESTS:
        companions = [manifest]
        if manifest.endswith("bun.lock"):
            companions.append(str(Path(manifest).with_name("package.json")))
        else:
            companions.append("go-functions/go.sum")
        for name in companions:
            file = source / name
            if file.is_symlink() or not file.is_file() or any(parent.is_symlink() for parent in file.parents):
                raise ValueError(f"Missing, nonregular or symlink dependency file: {name}")
            output = destination / name
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, output)
    # Work in isolated manifest-only trees: no PR trivy.yaml/.trivyignore/config,
    # .git, installed packages, scripts, caches or artifacts are consumed.
    result = subprocess.run([
        "trivy", "fs", "--config", str(config), "--ignorefile", str(ignore),
        "--scanners", "vuln", "--pkg-types", "library", "--include-dev-deps",
        "--list-all-pkgs", "--skip-db-update", "--format", "json", ".",
    ], cwd=destination, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise ValueError("Trivy scan failed; no merge decision is possible")
    return json.loads(result.stdout)


def main():
    base, head = (Path(arg).resolve() for arg in sys.argv[1:])
    with tempfile.TemporaryDirectory(prefix="dependency-security-") as directory:
        root = Path(directory)
        config, ignore = root / "empty.yaml", root / "empty.ignore"
        config.write_text("{}\n")
        ignore.write_text("")
        (root / "base").mkdir()
        (root / "head").mkdir()
        before = scan(base, root / "base", config, ignore)
        after = scan(head, root / "head", config, ignore)
        added, existing = compare(before, after)
        print(f"New/changed High or Critical dependency findings: {len(added)}")
        print(f"Unchanged baseline High or Critical findings: {len(existing)} (not resolved or accepted by this check)")
        # Vulnerability IDs/package versions are public metadata, not secret results.
        for finding in sorted(added):
            print(" | ".join(finding))
        if added:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
