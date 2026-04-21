#!/usr/bin/env python3
"""Flush buffered issues to GitHub. Uploads images, creates issues, cleans up."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def get_repo_info():
    """Get owner/repo from gh CLI."""
    result = subprocess.run(
        ["gh", "repo", "view", "--json", "owner,name"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"Error: Could not determine repo. Run from a git repo with gh auth.\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    data = json.loads(result.stdout)
    return data["owner"]["login"], data["name"]


def upload_image_to_github(image_path: str, owner: str, repo: str) -> str | None:
    """Upload image to GitHub and return the markdown-ready URL.

    Uses gh api to upload to the repository's issue attachment endpoint.
    Falls back to creating an empty issue comment with the image if needed.
    """
    path = Path(image_path)
    if not path.exists():
        print(f"  Warning: Image not found: {image_path}", file=sys.stderr)
        return None

    # Use gh api to upload the file as a release asset via a temp draft release,
    # or more simply: create a gist with the image and link it.
    # Simplest reliable approach: upload via gh gist
    result = subprocess.run(
        ["gh", "gist", "create", str(path), "--public", "--desc", f"Issue image: {path.name}"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        gist_url = result.stdout.strip()
        # Get raw URL for the file
        gist_id = gist_url.split("/")[-1]
        raw_result = subprocess.run(
            ["gh", "api", f"gists/{gist_id}", "--jq", f'.files["{path.name}"].raw_url'],
            capture_output=True, text=True
        )
        if raw_result.returncode == 0 and raw_result.stdout.strip():
            return raw_result.stdout.strip()
        return gist_url
    else:
        print(f"  Warning: Failed to upload image: {result.stderr}", file=sys.stderr)
        return None


def format_issue_body(issue: dict, image_urls: dict[str, str]) -> str:
    """Format issue JSON into GitHub issue markdown body."""
    parts = []

    if issue.get("expected"):
        parts.append(f"## Expected Behavior\n\n{issue['expected']}")

    if issue.get("observed"):
        parts.append(f"## Observed Behavior\n\n{issue['observed']}")

    if issue.get("details"):
        parts.append(f"## Details\n\n{issue['details']}")

    if issue.get("category"):
        parts.append(f"**Category:** {issue['category']}")

    # Append images
    for local_path, url in image_urls.items():
        if url:
            name = Path(local_path).stem
            parts.append(f"### Screenshot\n\n![{name}]({url})")

    parts.append("\n---\n*Filed via `/add-issue flush`*")
    return "\n\n".join(parts)


def create_github_issue(title: str, body: str, labels: list[str] | None = None) -> str | None:
    """Create a GitHub issue via gh CLI. Returns issue URL."""
    cmd = ["gh", "issue", "create", "--title", title, "--body", body]
    if labels:
        for label in labels:
            cmd.extend(["--label", label])
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        return result.stdout.strip()
    else:
        print(f"  Error creating issue: {result.stderr}", file=sys.stderr)
        return None


def load_issues(issues_dir: Path) -> list[tuple[Path, dict]]:
    """Load all issue JSON files from the directory."""
    issues = []
    for f in sorted(issues_dir.glob("*.json")):
        try:
            data = json.loads(f.read_text())
            issues.append((f, data))
        except (json.JSONDecodeError, OSError) as e:
            print(f"  Warning: Skipping {f.name}: {e}", file=sys.stderr)
    return issues


def main():
    parser = argparse.ArgumentParser(description="Flush buffered issues to GitHub")
    parser.add_argument("issues_dir", help="Path to .claude/issues directory")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be posted without posting")
    args = parser.parse_args()

    issues_dir = Path(args.issues_dir)
    if not issues_dir.exists():
        print("No issues directory found. Nothing to flush.")
        return

    issues = load_issues(issues_dir)
    if not issues:
        print("No buffered issues found.")
        return

    owner, repo = get_repo_info()
    print(f"Flushing {len(issues)} issue(s) to {owner}/{repo}\n")

    results = []
    for filepath, issue in issues:
        title = issue.get("title", "Untitled Issue")
        print(f"  -> {title}")

        if args.dry_run:
            results.append({"title": title, "file": str(filepath), "url": "(dry-run)"})
            continue

        # Upload images
        image_urls = {}
        images_dir = issues_dir / "images"
        for img_ref in issue.get("images", []):
            img_path = issues_dir / img_ref if not os.path.isabs(img_ref) else img_ref
            url = upload_image_to_github(str(img_path), owner, repo)
            image_urls[img_ref] = url

        body = format_issue_body(issue, image_urls)
        labels = [issue["category"]] if issue.get("category") else None
        url = create_github_issue(title, body, labels)

        if url:
            results.append({"title": title, "file": str(filepath), "url": url})
            # Clean up local file
            filepath.unlink(missing_ok=True)
            # Clean up associated images
            for img_ref in issue.get("images", []):
                img_path = issues_dir / img_ref if not os.path.isabs(img_ref) else Path(img_ref)
                img_path.unlink(missing_ok=True)
        else:
            results.append({"title": title, "file": str(filepath), "url": None, "error": "Failed to create"})

    # Clean up empty images dir
    img_dir = issues_dir / "images"
    if img_dir.exists() and not any(img_dir.iterdir()):
        img_dir.rmdir()

    # Clean up empty issues dir
    if issues_dir.exists() and not any(issues_dir.iterdir()):
        issues_dir.rmdir()

    # Output summary as JSON for Claude to parse
    print(json.dumps({"results": results}, indent=2))


if __name__ == "__main__":
    main()
