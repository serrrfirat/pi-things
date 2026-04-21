#!/usr/bin/env python3
"""Tests for pr_digest.py — categorisation, enrichment, formatting."""
from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

# Make the scripts dir importable
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pr_digest  # noqa: E402


# ── fixtures ─────────────────────────────────────────────────────────
NOW = datetime(2026, 4, 13, 12, 0, 0, tzinfo=timezone.utc)


def _make_pr(
    number: int = 1,
    author: str = "alice",
    updated_hours_ago: int = 1,
    created_days_ago: int = 5,
    additions: int = 50,
    deletions: int = 10,
    is_draft: bool = False,
    labels: list[dict] | None = None,
) -> dict:
    """Create a lightweight PR dict (matches LIGHT_FIELDS from bulk fetch)."""
    updated = NOW - timedelta(hours=updated_hours_ago)
    created = NOW - timedelta(days=created_days_ago)
    return {
        "number": number,
        "title": f"PR #{number}",
        "author": {"login": author},
        "url": f"https://github.com/nearai/ironclaw/pull/{number}",
        "createdAt": created.isoformat(),
        "updatedAt": updated.isoformat(),
        "isDraft": is_draft,
        "additions": additions,
        "deletions": deletions,
        "reviewDecision": None,
        "labels": labels or [],
    }


# ── classify_size ────────────────────────────────────────────────────
class TestClassifySize:
    def test_xs(self):
        assert pr_digest.classify_size(10, 5) == "XS"

    def test_small(self):
        assert pr_digest.classify_size(100, 50) == "S"

    def test_medium(self):
        assert pr_digest.classify_size(300, 100) == "M"

    def test_large(self):
        assert pr_digest.classify_size(600, 200) == "L"

    def test_xl(self):
        assert pr_digest.classify_size(800, 500) == "XL"


# ── summarize_ci ─────────────────────────────────────────────────────
class TestSummarizeCi:
    def test_none(self):
        assert pr_digest.summarize_ci(None) == "none"
        assert pr_digest.summarize_ci([]) == "none"

    def test_passing(self):
        assert pr_digest.summarize_ci([{"conclusion": "SUCCESS"}]) == "passing"

    def test_failing(self):
        checks = [{"conclusion": "SUCCESS"}, {"conclusion": "FAILURE"}]
        assert pr_digest.summarize_ci(checks) == "failing"

    def test_pending(self):
        assert pr_digest.summarize_ci([{"status": "IN_PROGRESS"}]) == "pending"


# ── categorize_prs ───────────────────────────────────────────────────
class TestCategorizePrs:
    """Test with skip_commits=True and injected _requested/_reviewed sets."""

    @patch("pr_digest.datetime")
    def _cat(self, prs, username, mock_dt, stale_days=2,
             requested_nums=None, interacted_nums=None):
        mock_dt.now.return_value = NOW
        mock_dt.fromisoformat = datetime.fromisoformat
        return pr_digest.categorize_prs(
            prs, username, stale_days, skip_commits=True,
            _requested_nums=requested_nums or set(),
            _interacted_nums=interacted_nums or set(),
        )

    def test_skips_own_prs(self):
        prs = [_make_pr(number=1, author="me")]
        cats = self._cat(prs, "me")
        assert all(len(v) == 0 for v in cats.values())

    def test_review_requested(self):
        prs = [_make_pr(number=2)]
        cats = self._cat(prs, "me", requested_nums={2})
        assert len(cats["review_requested"]) == 1
        assert cats["review_requested"][0]["number"] == 2

    def test_previously_reviewed_goes_to_needs_re_review(self):
        prs = [_make_pr(number=3)]
        cats = self._cat(prs, "me", interacted_nums={3})
        # With skip_commits, previously interacted non-stale -> needs_re_review
        assert len(cats["needs_re_review"]) == 1

    def test_commented_pr_goes_to_needs_re_review(self):
        """A PR with only a comment (no formal review) is also 'interacted'."""
        prs = [_make_pr(number=8)]
        cats = self._cat(prs, "me", interacted_nums={8})
        assert len(cats["needs_re_review"]) == 1

    def test_stale_pr(self):
        prs = [_make_pr(number=4, updated_hours_ago=72)]  # 3 days idle
        cats = self._cat(prs, "me", stale_days=2)
        assert len(cats["stale"]) == 1
        assert cats["stale"][0]["number"] == 4

    def test_never_reviewed(self):
        prs = [_make_pr(number=5, updated_hours_ago=1)]
        cats = self._cat(prs, "me")
        assert len(cats["never_reviewed"]) == 1

    def test_review_requested_takes_priority_over_stale(self):
        prs = [_make_pr(number=6, updated_hours_ago=96)]
        cats = self._cat(prs, "me", requested_nums={6})
        assert len(cats["review_requested"]) == 1
        assert len(cats["stale"]) == 0

    def test_previously_interacted_stale_goes_to_stale(self):
        prs = [_make_pr(number=7, updated_hours_ago=72)]
        cats = self._cat(prs, "me", interacted_nums={7})
        assert len(cats["stale"]) == 1

    def test_mixed_categorisation(self):
        prs = [
            _make_pr(number=10),  # review_requested
            _make_pr(number=11, updated_hours_ago=1),  # never_reviewed
            _make_pr(number=12, updated_hours_ago=96),  # stale
            _make_pr(number=13, author="me"),  # own
            _make_pr(number=14),  # commented (interacted)
        ]
        cats = self._cat(prs, "me", requested_nums={10}, interacted_nums={14})
        assert len(cats["review_requested"]) == 1
        assert len(cats["never_reviewed"]) == 1
        assert len(cats["stale"]) == 1
        assert len(cats["needs_re_review"]) == 1


# ── state persistence ───────────────────────────────────────────────
class TestState:
    def test_load_missing(self, tmp_path):
        with patch.object(pr_digest, "STATE_FILE", tmp_path / "nope.json"):
            state = pr_digest.load_state()
        assert state == {"last_run": None, "prs": {}}

    def test_save_and_load(self, tmp_path):
        sf = tmp_path / ".digest-state.json"
        with patch.object(pr_digest, "STATE_FILE", sf), \
             patch.object(pr_digest, "STATE_DIR", tmp_path):
            cats = {"review_requested": [{"number": 1, "author": "alice"}],
                    "needs_re_review": [], "never_reviewed": [], "stale": []}
            pr_digest.save_state(cats)
            state = pr_digest.load_state()
        assert "1" in state["prs"]
        assert state["prs"]["1"]["category"] == "review_requested"


# ── formatting ───────────────────────────────────────────────────────
class TestFormatDigest:
    def test_contains_header(self):
        cats = {k: [] for k in ("review_requested", "needs_re_review",
                                "never_reviewed", "stale")}
        digest = pr_digest.format_digest(cats, {"last_run": None, "prs": {}}, "me")
        assert "IronClaw PR Daily Digest" in digest
        assert "@me" in digest

    def test_delta_section(self):
        cats = {
            "review_requested": [],
            "needs_re_review": [{"number": 99, "title": "t", "author": "a",
                                 "url": "u", "size": "S", "additions": 1,
                                 "deletions": 1, "ci": "passing", "days_idle": 0,
                                 "days_open": 1, "is_draft": False, "labels": [],
                                 "review_decision": "none"}],
            "never_reviewed": [],
            "stale": [],
        }
        prev = {"last_run": "2026-04-12T00:00:00", "prs": {"50": {"category": "stale", "author": "x"}}}
        digest = pr_digest.format_digest(cats, prev, "me")
        assert "New PRs" in digest  # #99 is new
        assert "Closed/Merged" in digest  # #50 is gone

    def test_action_items(self):
        cats = {
            "review_requested": [{"number": 1, "title": "t", "author": "a",
                                  "url": "http://example.com", "size": "S",
                                  "additions": 1, "deletions": 1, "ci": "none",
                                  "days_idle": 0, "days_open": 1,
                                  "is_draft": False, "labels": [],
                                  "review_decision": "none"}],
            "needs_re_review": [],
            "never_reviewed": [],
            "stale": [],
        }
        digest = pr_digest.format_digest(cats, {"last_run": None, "prs": {}}, "me")
        assert "Action Items" in digest
        assert "Review" in digest


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
