#!/usr/bin/env python3
"""IronClaw PR Daily Digest — categorize open PRs for review triage.

Categories:
  1. Review Requested — explicitly assigned to you
  2. Needs Re-review — you reviewed, new commits pushed since
  3. Never Reviewed   — you haven't interacted with it
  4. Stale            — >N days without update (can be taken over)

Usage:
  python3 pr_digest.py [@username] [--stale-days N] [--skip-commits]
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from pathlib import Path

REPO = "nearai/ironclaw"
DEFAULT_STALE_DAYS = 2
STATE_DIR = Path.home() / ".claude" / "skills" / "ironclaw-pr-daily"
STATE_FILE = STATE_DIR / ".digest-state.json"

# ── env loading ──────────────────────────────────────────────────────
def _load_env():
    """Load .env files in priority order (lowest to highest)."""
    skill = "ironclaw-pr-daily"
    candidates = [
        Path(".claude/.env"),
        Path(".claude/skills/.env"),
        Path(f".claude/skills/{skill}/.env"),
        Path.home() / ".claude/.env",
        Path.home() / ".claude/skills/.env",
        Path.home() / f".claude/skills/{skill}/.env",
    ]
    for p in candidates:
        if p.exists():
            for line in p.read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))

_load_env()


# ── gh CLI helpers ───────────────────────────────────────────────────
def run_gh(args: list[str], timeout: int = 120) -> str:
    result = subprocess.run(
        ["gh"] + args,
        capture_output=True, text=True, timeout=timeout,
    )
    if result.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args[:4])}…: {result.stderr.strip()}")
    return result.stdout


def get_username(override: str | None = None) -> str:
    if override:
        return override
    env = os.environ.get("IRONCLAW_PR_DIGEST_USERNAME")
    if env:
        return env
    return run_gh(["api", "user", "--jq", ".login"]).strip()


# ── data fetching ────────────────────────────────────────────────────
# Lightweight fields for the bulk list (avoids GraphQL 502 on large repos)
LIGHT_FIELDS = (
    "number,title,author,url,createdAt,updatedAt,labels,isDraft,"
    "additions,deletions,reviewDecision"
)


def fetch_open_prs() -> list[dict]:
    """Fetch all open PRs with lightweight fields."""
    data = run_gh([
        "pr", "list", "--repo", REPO, "--state", "open",
        "--json", LIGHT_FIELDS, "--limit", "500",
    ])
    return json.loads(data)


def search_review_requested(username: str) -> set[int]:
    """Use GitHub search to find PRs requesting this user's review."""
    try:
        data = run_gh([
            "api", "search/issues",
            "-f", f"q=is:pr is:open repo:{REPO} review-requested:{username}",
            "--jq", ".items[].number",
        ])
        return {int(n.strip()) for n in data.strip().splitlines() if n.strip()}
    except RuntimeError:
        return set()


def search_reviewed_by(username: str) -> set[int]:
    """Use GitHub search to find PRs this user has formally reviewed."""
    try:
        data = run_gh([
            "api", "search/issues",
            "-f", f"q=is:pr is:open repo:{REPO} reviewed-by:{username}",
            "--jq", ".items[].number",
        ])
        return {int(n.strip()) for n in data.strip().splitlines() if n.strip()}
    except RuntimeError:
        return set()


def search_commented_by(username: str) -> set[int]:
    """Use GitHub search to find PRs this user has commented on."""
    try:
        data = run_gh([
            "api", "search/issues",
            "-f", f"q=is:pr is:open repo:{REPO} commenter:{username}",
            "--jq", ".items[].number",
        ])
        return {int(n.strip()) for n in data.strip().splitlines() if n.strip()}
    except RuntimeError:
        return set()


def fetch_my_latest_review_date(pr_number: int, username: str) -> datetime | None:
    """Get the timestamp of the user's most recent formal review on a PR."""
    try:
        data = run_gh([
            "api", f"repos/{REPO}/pulls/{pr_number}/reviews",
            "--jq", f'[.[] | select(.user.login == "{username}") | .submitted_at] | sort | last',
        ])
        val = data.strip()
        if val and val != "null":
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except RuntimeError:
        pass
    return None


def fetch_my_latest_comment_date(pr_number: int, username: str) -> datetime | None:
    """Get the timestamp of the user's most recent comment on a PR.

    Checks both conversation comments and inline diff comments.
    """
    dates: list[datetime] = []
    # Conversation comments (issue-style)
    try:
        data = run_gh([
            "api", f"repos/{REPO}/issues/{pr_number}/comments",
            "--jq", f'[.[] | select(.user.login == "{username}") | .created_at] | sort | last',
        ])
        val = data.strip()
        if val and val != "null":
            dates.append(datetime.fromisoformat(val.replace("Z", "+00:00")))
    except RuntimeError:
        pass
    # Inline diff comments
    try:
        data = run_gh([
            "api", f"repos/{REPO}/pulls/{pr_number}/comments",
            "--jq", f'[.[] | select(.user.login == "{username}") | .created_at] | sort | last',
        ])
        val = data.strip()
        if val and val != "null":
            dates.append(datetime.fromisoformat(val.replace("Z", "+00:00")))
    except RuntimeError:
        pass
    return max(dates) if dates else None


def fetch_my_latest_interaction_date(pr_number: int, username: str) -> datetime | None:
    """Get the latest of review date or comment date for a PR."""
    dates: list[datetime] = []
    review_dt = fetch_my_latest_review_date(pr_number, username)
    if review_dt:
        dates.append(review_dt)
    comment_dt = fetch_my_latest_comment_date(pr_number, username)
    if comment_dt:
        dates.append(comment_dt)
    return max(dates) if dates else None


def fetch_pr_ci_status(pr_number: int) -> list[dict] | None:
    """Get CI status check rollup for a PR."""
    try:
        data = run_gh([
            "pr", "view", str(pr_number), "--repo", REPO,
            "--json", "statusCheckRollup",
        ])
        return json.loads(data).get("statusCheckRollup")
    except RuntimeError:
        return None


def get_latest_commit_date(pr_number: int) -> datetime | None:
    """Return date of the most-recent commit on a PR."""
    try:
        data = run_gh([
            "api", f"repos/{REPO}/pulls/{pr_number}/commits",
            "--jq", ".[].commit.committer.date",
        ])
    except RuntimeError:
        return None
    dates = [l.strip() for l in data.strip().splitlines() if l.strip()]
    if not dates:
        return None
    parsed = [datetime.fromisoformat(d.replace("Z", "+00:00")) for d in dates]
    return max(parsed)


# ── classification helpers ───────────────────────────────────────────
def classify_size(additions: int, deletions: int) -> str:
    total = additions + deletions
    if total <= 50:
        return "XS"
    if total <= 200:
        return "S"
    if total <= 500:
        return "M"
    if total <= 1000:
        return "L"
    return "XL"


def summarize_ci(checks: list[dict] | None) -> str:
    if not checks:
        return "none"
    states = [c.get("conclusion") or c.get("status", "unknown") for c in checks]
    if any(s == "FAILURE" for s in states):
        return "failing"
    if any(s in ("PENDING", "IN_PROGRESS", "QUEUED") for s in states):
        return "pending"
    if all(s == "SUCCESS" for s in states):
        return "passing"
    return "mixed"


def _enrich(pr: dict) -> dict:
    """Build a flat dict with the fields the digest uses."""
    now = datetime.now(timezone.utc)
    updated = datetime.fromisoformat(pr["updatedAt"].replace("Z", "+00:00"))
    created = datetime.fromisoformat(pr["createdAt"].replace("Z", "+00:00"))
    return {
        "number": pr["number"],
        "title": pr["title"],
        "author": pr["author"]["login"],
        "url": pr["url"],
        "created_at": pr["createdAt"],
        "updated_at": pr["updatedAt"],
        "is_draft": pr.get("isDraft", False),
        "size": classify_size(pr.get("additions", 0), pr.get("deletions", 0)),
        "additions": pr.get("additions", 0),
        "deletions": pr.get("deletions", 0),
        "ci": summarize_ci(pr.get("statusCheckRollup")),
        "review_decision": pr.get("reviewDecision") or "none",
        "days_idle": (now - updated).days,
        "days_open": (now - created).days,
        "labels": [l["name"] for l in (pr.get("labels") or [])],
    }


# ── categorisation ───────────────────────────────────────────────────
def categorize_prs(
    prs: list[dict],
    username: str,
    stale_days: int = DEFAULT_STALE_DAYS,
    skip_commits: bool = False,
    *,
    _requested_nums: set[int] | None = None,
    _interacted_nums: set[int] | None = None,
) -> dict[str, list[dict]]:
    """Sort PRs into the four buckets.

    Phase 1 — Use GitHub search API to find PRs with any interaction
              (formal reviews OR comments).
    Phase 2 — For previously-interacted PRs, check latest commit date (parallel).

    The _requested_nums/_interacted_nums kwargs are for testing; normally
    they are fetched via the search API.
    """
    categories: dict[str, list[dict]] = {
        "review_requested": [],
        "needs_re_review": [],
        "never_reviewed": [],
        "stale": [],
    }

    # Phase 1: get the interaction-relevant PR sets via search API (3 calls)
    if _requested_nums is None:
        print("  Checking review requests…", file=sys.stderr)
        _requested_nums = search_review_requested(username)
    if _interacted_nums is None:
        print("  Checking reviewed PRs…", file=sys.stderr)
        reviewed = search_reviewed_by(username)
        print("  Checking commented PRs…", file=sys.stderr)
        commented = search_commented_by(username)
        _interacted_nums = reviewed | commented

    pr_map: dict[int, dict] = {}  # number -> raw pr data
    interacted_prs: list[int] = []

    for pr in prs:
        author = pr["author"]["login"]
        if author == username:
            continue
        num = pr["number"]
        pr_map[num] = pr
        info = _enrich(pr)

        if num in _requested_nums:
            categories["review_requested"].append(info)
        elif num in _interacted_nums:
            interacted_prs.append(num)
        elif info["days_idle"] >= stale_days:
            categories["stale"].append(info)
        else:
            categories["never_reviewed"].append(info)

    # Phase 2: for previously-interacted PRs, check for new commits
    if skip_commits:
        for num in interacted_prs:
            info = _enrich(pr_map[num])
            if info["days_idle"] >= stale_days:
                categories["stale"].append(info)
            else:
                categories["needs_re_review"].append(info)
        return categories

    def _check(num: int) -> tuple[int, datetime | None, datetime | None]:
        interact_dt = fetch_my_latest_interaction_date(num, username)
        commit_dt = get_latest_commit_date(num)
        return num, interact_dt, commit_dt

    print(f"  Checking commits on {len(interacted_prs)} interacted PRs…", file=sys.stderr)
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(_check, n): n for n in interacted_prs}
        for fut in as_completed(futures):
            num, interact_dt, commit_dt = fut.result()
            info = _enrich(pr_map[num])
            if interact_dt and commit_dt and commit_dt > interact_dt:
                info["last_interaction"] = interact_dt.isoformat()
                info["latest_commit"] = commit_dt.isoformat()
                categories["needs_re_review"].append(info)
            elif info["days_idle"] >= stale_days:
                info["previously_interacted"] = True
                categories["stale"].append(info)
            # else: interacted & up-to-date — no action needed

    return categories


# ── state persistence ────────────────────────────────────────────────
def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"last_run": None, "prs": {}}


def save_state(categories: dict):
    now = datetime.now(timezone.utc).isoformat()
    prs: dict[str, dict] = {}
    for cat, items in categories.items():
        for pr in items:
            prs[str(pr["number"])] = {
                "category": cat,
                "author": pr["author"],
                "last_seen": now,
            }
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps({"last_run": now, "prs": prs}, indent=2))


# ── formatting ───────────────────────────────────────────────────────
SECTION_ORDER = [
    ("review_requested", "Review Requested (assigned to you)"),
    ("needs_re_review", "Needs Re-review (new commits since your last review/comment)"),
    ("never_reviewed", "Never Interacted"),
    ("stale", "Stale (can be taken over)"),
]

CI_ICONS = {
    "passing": "pass", "failing": "FAIL", "pending": "pend",
    "none": "-", "mixed": "mix",
}


def format_digest(
    categories: dict[str, list[dict]],
    prev_state: dict,
    username: str,
) -> str:
    now = datetime.now(timezone.utc)
    lines: list[str] = []

    # Header
    lines.append("# IronClaw PR Daily Digest")
    lines.append(f"**Generated:** {now.strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append(f"**Reviewer:** @{username}")
    if prev_state.get("last_run"):
        lines.append(f"**Previous digest:** {prev_state['last_run']}")
    lines.append("")

    # Summary
    total = sum(len(v) for v in categories.values())
    lines.append("## Summary")
    lines.append(f"- **Total open PRs (excluding yours):** {total}")
    for key, label in SECTION_ORDER:
        lines.append(f"- **{label.split('(')[0].strip()}:** {len(categories[key])}")
    lines.append("")

    # Delta
    if prev_state.get("prs"):
        prev_nums = set(prev_state["prs"].keys())
        curr_nums: set[str] = set()
        for items in categories.values():
            for pr in items:
                curr_nums.add(str(pr["number"]))
        new = curr_nums - prev_nums
        closed = prev_nums - curr_nums
        moved: list[str] = []
        for n in curr_nums & prev_nums:
            prev_cat = prev_state["prs"][n].get("category", "")
            curr_cat = next(
                (cat for cat, items in categories.items()
                 if any(str(p["number"]) == n for p in items)),
                "",
            )
            if prev_cat and curr_cat and prev_cat != curr_cat:
                moved.append(f"#{n} {prev_cat} -> {curr_cat}")
        if new or closed or moved:
            lines.append("## Changes Since Last Digest")
            if new:
                lines.append(f"- **New PRs:** {', '.join(f'#{n}' for n in sorted(new, key=int))}")
            if closed:
                lines.append(f"- **Closed/Merged:** {', '.join(f'#{n}' for n in sorted(closed, key=int))}")
            if moved:
                lines.append(f"- **Category changes:** {'; '.join(moved)}")
            lines.append("")

    # Per-category tables
    for key, title in SECTION_ORDER:
        items = categories[key]
        if not items:
            continue
        lines.append(f"## {title}")
        lines.append("")
        lines.append("| # | Title | Author | Size | CI | Idle | Open | Draft | Labels |")
        lines.append("|---|-------|--------|------|----|------|------|-------|--------|")
        for pr in sorted(items, key=lambda p: p["days_idle"], reverse=True):
            draft = "DRAFT" if pr["is_draft"] else ""
            ci = CI_ICONS.get(pr["ci"], "?")
            labels = ", ".join(pr["labels"][:3]) if pr["labels"] else ""
            title_short = pr["title"][:55]
            lines.append(
                f"| [#{pr['number']}]({pr['url']}) "
                f"| {title_short} "
                f"| @{pr['author']} "
                f"| {pr['size']} (+{pr['additions']}/-{pr['deletions']}) "
                f"| {ci} "
                f"| {pr['days_idle']}d "
                f"| {pr['days_open']}d "
                f"| {draft} "
                f"| {labels} |"
            )
        lines.append("")

    # Priority list
    urgent: list[str] = []
    for pr in categories["review_requested"]:
        urgent.append(f"- [ ] **Review** [#{pr['number']}]({pr['url']}) — requested by author")
    for pr in categories["needs_re_review"]:
        urgent.append(f"- [ ] **Re-review** [#{pr['number']}]({pr['url']}) — new commits")
    if urgent:
        lines.append("## Action Items")
        lines.extend(urgent)
        lines.append("")

    return "\n".join(lines)


# ── main ─────────────────────────────────────────────────────────────
def main(argv: list[str] | None = None):
    args = argv if argv is not None else sys.argv[1:]
    username_arg: str | None = None
    stale_days = int(os.environ.get("IRONCLAW_PR_DIGEST_STALE_DAYS", DEFAULT_STALE_DAYS))
    skip_commits = False

    i = 0
    while i < len(args):
        if args[i].startswith("@"):
            username_arg = args[i][1:]
        elif args[i] == "--stale-days" and i + 1 < len(args):
            stale_days = int(args[i + 1])
            i += 1
        elif args[i] == "--skip-commits":
            skip_commits = True
        i += 1

    username = get_username(username_arg)
    print(f"Fetching open PRs for reviewer @{username}…", file=sys.stderr)

    prs = fetch_open_prs()
    print(f"Found {len(prs)} open PRs. Categorising…", file=sys.stderr)

    categories = categorize_prs(prs, username, stale_days, skip_commits)
    prev_state = load_state()
    digest = format_digest(categories, prev_state, username)
    save_state(categories)

    print(digest)


if __name__ == "__main__":
    main()
