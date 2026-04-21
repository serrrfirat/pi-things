#!/usr/bin/env python3
"""Tests for flush_issues.py — unit tests that don't require GitHub auth."""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

# Import the module under test
import flush_issues


@pytest.fixture
def issues_dir(tmp_path):
    """Create a temp issues directory with sample issues."""
    img_dir = tmp_path / "images"
    img_dir.mkdir()
    # Create a fake image
    img_file = img_dir / "issue-20260416-100000-1.png"
    img_file.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)

    # Issue with image
    issue1 = {
        "id": "issue-20260416-100000",
        "timestamp": "2026-04-16T10:00:00Z",
        "title": "Button overlaps sidebar on mobile",
        "expected": "Button should be contained within the sidebar bounds",
        "observed": "Button renders 20px outside the sidebar on screens < 768px",
        "details": "Reproducible on Chrome mobile emulator, iPhone SE viewport",
        "images": ["images/issue-20260416-100000-1.png"],
        "category": "ui",
    }
    (tmp_path / "issue-20260416-100000.json").write_text(json.dumps(issue1))

    # Issue without image
    issue2 = {
        "id": "issue-20260416-100100",
        "timestamp": "2026-04-16T10:01:00Z",
        "title": "Engine panics on empty tool list",
        "expected": "Engine should handle empty tool list gracefully",
        "observed": "Panic at src/agent/dispatcher.rs:142",
        "details": "Triggered when no tools are registered and a dispatch is attempted",
        "images": [],
        "category": "engine",
    }
    (tmp_path / "issue-20260416-100100.json").write_text(json.dumps(issue2))

    return tmp_path


def test_load_issues(issues_dir):
    """Load issues from directory."""
    issues = flush_issues.load_issues(issues_dir)
    assert len(issues) == 2
    titles = {i[1]["title"] for i in issues}
    assert "Button overlaps sidebar on mobile" in titles
    assert "Engine panics on empty tool list" in titles


def test_load_issues_empty(tmp_path):
    """Load from empty directory returns empty list."""
    issues = flush_issues.load_issues(tmp_path)
    assert issues == []


def test_load_issues_skips_invalid(tmp_path):
    """Invalid JSON files are skipped with a warning."""
    (tmp_path / "bad.json").write_text("not json {{{")
    issues = flush_issues.load_issues(tmp_path)
    assert issues == []


def test_format_issue_body_full():
    """Format a complete issue with all fields and an image."""
    issue = {
        "expected": "Should work",
        "observed": "Does not work",
        "details": "Steps: click button, observe crash",
        "category": "ui",
    }
    image_urls = {"images/shot.png": "https://example.com/shot.png"}
    body = flush_issues.format_issue_body(issue, image_urls)

    assert "## Expected Behavior" in body
    assert "Should work" in body
    assert "## Observed Behavior" in body
    assert "Does not work" in body
    assert "## Details" in body
    assert "**Category:** ui" in body
    assert "![shot](https://example.com/shot.png)" in body
    assert "Filed via `/add-issue flush`" in body


def test_format_issue_body_no_images():
    """Format issue without images."""
    issue = {
        "expected": "A",
        "observed": "B",
        "details": "C",
        "category": None,
    }
    body = flush_issues.format_issue_body(issue, {})
    assert "## Expected Behavior" in body
    assert "Screenshot" not in body
    assert "Category" not in body


def test_format_issue_body_missing_fields():
    """Format issue with missing optional fields."""
    issue = {"observed": "Crash on startup"}
    body = flush_issues.format_issue_body(issue, {})
    assert "## Observed Behavior" in body
    assert "Expected" not in body
    assert "Details" not in body


@patch("flush_issues.subprocess.run")
def test_get_repo_info(mock_run):
    """Parse repo info from gh CLI output."""
    mock_run.return_value = MagicMock(
        returncode=0,
        stdout='{"owner":{"login":"myorg"},"name":"myrepo"}'
    )
    owner, name = flush_issues.get_repo_info()
    assert owner == "myorg"
    assert name == "myrepo"


@patch("flush_issues.subprocess.run")
def test_get_repo_info_fails(mock_run):
    """Exit on gh CLI failure."""
    mock_run.return_value = MagicMock(returncode=1, stderr="not a repo")
    with pytest.raises(SystemExit):
        flush_issues.get_repo_info()


@patch("flush_issues.subprocess.run")
def test_create_github_issue(mock_run):
    """Create issue via gh CLI."""
    mock_run.return_value = MagicMock(
        returncode=0,
        stdout="https://github.com/org/repo/issues/42\n"
    )
    url = flush_issues.create_github_issue("Title", "Body", ["bug"])
    assert url == "https://github.com/org/repo/issues/42"
    cmd = mock_run.call_args[0][0]
    assert "--label" in cmd
    assert "bug" in cmd


@patch("flush_issues.subprocess.run")
def test_create_github_issue_no_labels(mock_run):
    """Create issue without labels."""
    mock_run.return_value = MagicMock(returncode=0, stdout="https://github.com/org/repo/issues/43\n")
    url = flush_issues.create_github_issue("Title", "Body")
    cmd = mock_run.call_args[0][0]
    assert "--label" not in cmd


@patch("flush_issues.subprocess.run")
def test_upload_image_nonexistent(mock_run):
    """Return None for missing image file."""
    result = flush_issues.upload_image_to_github("/nonexistent/image.png", "org", "repo")
    assert result is None
    mock_run.assert_not_called()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
