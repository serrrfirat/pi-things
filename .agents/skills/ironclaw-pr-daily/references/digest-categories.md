# PR Digest Categories

## 1. Review Requested
PRs where the author or a maintainer explicitly requested your review via GitHub's "Reviewers" sidebar.

**Action:** Review promptly — someone is waiting on you.

## 2. Needs Re-review
PRs you previously reviewed that have new commits pushed after your last review.
The author likely addressed your feedback.

**Action:** Re-review the diff since your last review. Check if your comments were addressed.

## 3. Never Reviewed
Open PRs you have not interacted with (no review, no comment).
Excludes stale PRs (those appear in the Stale bucket).

**Action:** Skim for PRs in your area of expertise. Claim ones you can review.

## 4. Stale (Can Be Taken Over)
PRs with no update for >N days (default: 2).
The original author may have moved on or gotten blocked.

**Action:** If the work is valuable, consider:
- Commenting to check on the author
- Offering to take over the branch
- Closing with a note if superseded

## Enrichment Fields

Each PR in the digest includes:

| Field | Meaning |
|-------|---------|
| Size (XS/S/M/L/XL) | Total lines changed: XS≤50, S≤200, M≤500, L≤1000, XL>1000 |
| CI | Status of CI checks: pass / FAIL / pend / mix / none |
| Idle | Days since last update to the PR |
| Open | Days since the PR was opened |
| Draft | Whether the PR is marked as draft |
| Labels | First 3 GitHub labels |

## Delta Tracking

The digest saves state between runs to `~/.claude/skills/ironclaw-pr-daily/.digest-state.json`.

Between runs it reports:
- **New PRs** — opened since last digest
- **Closed/Merged** — no longer open since last digest
- **Category changes** — PRs that moved between buckets (e.g. never_reviewed → stale)

## CLI Options

```
python3 pr_digest.py                     # default: current gh user, 2-day stale
python3 pr_digest.py @alice              # check as user alice
python3 pr_digest.py --stale-days 5      # 5-day stale threshold
python3 pr_digest.py --skip-commits      # skip per-PR commit checks (faster)
```

Env vars (via `.env` or shell):
- `IRONCLAW_PR_DIGEST_USERNAME` — override GitHub username
- `IRONCLAW_PR_DIGEST_STALE_DAYS` — override stale threshold
