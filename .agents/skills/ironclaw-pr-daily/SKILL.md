---
name: ironclaw-pr-daily
description: Daily digest of open PRs on nearai/ironclaw — categorizes by review-requested, needs-re-review, never-reviewed, and stale (takeover candidates). Tracks progress between runs.
version: 1.0.0
---

# IronClaw PR Daily Digest

Generate a reviewer-focused digest of all open PRs on `nearai/ironclaw`.
Categorizes PRs into actionable buckets and tracks changes between runs.

## When to use

Trigger on: "PR digest", "daily PRs", "what needs review", "open PRs on ironclaw",
"check ironclaw PRs", "PR triage", `/ironclaw-pr-daily`, or any request for a
review-oriented overview of `nearai/ironclaw` pull requests.

**Distinct from `check-my-ironclaw-prs`** — that skill audits PRs *you authored*.
This skill shows PRs *you need to review or could pick up*.

## Workflow

### 1. Run the digest script

```bash
python3 ~/.claude/skills/ironclaw-pr-daily/scripts/pr_digest.py
```

Optional arguments:
- `@username` — check as a different user
- `--stale-days N` — change stale threshold (default: 2)
- `--skip-commits` — skip per-PR commit date checks for speed

### 2. Present the output

Print the full markdown digest to the user. The digest includes:
- **Summary** — total counts per category
- **Changes Since Last Digest** — new, closed/merged, category changes
- **Review Requested** — PRs explicitly assigned for review
- **Needs Re-review** — previously reviewed PRs with new commits
- **Never Reviewed** — PRs not yet interacted with
- **Stale** — PRs idle >2 days, candidates for takeover
- **Action Items** — prioritized checklist

Each PR shows: number, title, author, size, CI status, idle days, age, draft status, labels.

### 3. Offer next steps

After presenting the digest, suggest:
- "Want me to review any of these PRs?" (integrates with `check-my-ironclaw-prs`)
- "Want me to check CI details on the failing ones?"
- "Should I look at the stale PRs for takeover candidates?"

## Categories reference

See `references/digest-categories.md` for detailed category definitions,
enrichment fields, delta tracking, and CLI options.

## State file

Digest state persists at `~/.claude/skills/ironclaw-pr-daily/.digest-state.json`.
Contains last run timestamp and per-PR category snapshot for delta comparison.

## Environment

Requires `gh` CLI authenticated with access to `nearai/ironclaw`.
Optional env vars: `IRONCLAW_PR_DIGEST_USERNAME`, `IRONCLAW_PR_DIGEST_STALE_DAYS`.
