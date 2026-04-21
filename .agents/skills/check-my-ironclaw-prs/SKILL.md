---
name: check-my-ironclaw-prs
description: Sweep open PRs on nearai/ironclaw (default @me, or specify a GitHub username), report status (CI, reviews, comments), list actionable feedback, and propose fixes without implementing them.
allowed-tools: Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh pr checks:*), Bash(gh pr diff:*), Bash(gh api:*), Bash(gh repo view:*), Bash(git log:*), Bash(git diff:*), Read, Grep, Glob, Agent
argument-hint: "[@username] [--pr <number>] [--skip-ci]"
---

# Check My Ironclaw PRs

Scan open PRs on `nearai/ironclaw` for a given author (default: `@me`), report their health, surface unaddressed feedback, and propose fixes — without implementing anything.

## Step 1: Parse Arguments

Extract from `$ARGUMENTS`:
- **@username**: optional GitHub username (e.g. `@ilblackdragon`). If provided, query that user's PRs instead of `@me`. Strip the leading `@` when passing to `--author`.
- **--pr N**: optional, audit only this PR number instead of all
- **--skip-ci**: optional, skip CI status check (faster)
- If no arguments, audit all open PRs authored by `@me`.

Set `AUTHOR` = the provided username (without `@`), or `@me` if none given.

## Step 2: Discover Open PRs

```bash
gh pr list --repo nearai/ironclaw --author {AUTHOR} --state open \
  --json number,title,headRefName,baseRefName,url,isDraft,updatedAt,reviewDecision
```

Print a numbered list: `#{number} — {title} [{isDraft ? "DRAFT" : "OPEN"}]`

## Step 3: Per-PR Health Check

For each PR (or the single `--pr` target), collect all data in parallel where possible.

### 3a. CI / Check Status

```bash
gh pr checks {number} --repo nearai/ironclaw
```

Classify:
- **green**: all checks pass
- **red**: one or more checks failed — capture the failing check names and conclusions
- **pending**: checks still running
- **none**: no checks configured

### 3b. Review Status

```bash
gh pr view {number} --repo nearai/ironclaw \
  --json reviewDecision,reviews,latestReviews
```

Classify:
- **approved**: reviewDecision is APPROVED
- **changes_requested**: reviewDecision is CHANGES_REQUESTED — note which reviewers
- **pending**: no decision yet or review requested but not submitted
- **commented**: reviews exist but no formal decision

### 3c. Unresolved Review Threads

Fetch review comments (threaded):
```bash
gh api repos/nearai/ironclaw/pulls/{number}/comments --paginate
```

Also fetch issue-level (top-level) PR comments:
```bash
gh api repos/nearai/ironclaw/issues/{number}/comments --paginate
```

For each comment thread, determine:
- **Author**: who left the comment (skip bot comments unless they contain actionable info)
- **Is it addressed?**: check if the PR author ({AUTHOR}) replied or if a later commit resolves it
- **Quote**: the actual comment body (truncate to ~200 chars if long)

Keep only unaddressed/actionable comments.

### 3d. PR Diff Context

For any PR with actionable comments or failing CI, fetch the diff context:
```bash
gh pr diff {number} --repo nearai/ironclaw --name-only
```

And read the relevant files/sections that comments point to, so you can propose accurate fixes.

## Step 4: Dashboard Output

Print a status dashboard:

```
## PR Dashboard — nearai/ironclaw (@{AUTHOR})

| #    | Title                              | URL                                              | Status | CI     | Reviews           | Open Comments |
|------|------------------------------------|--------------------------------------------------|--------|--------|-------------------|---------------|
| 2154 | feat(admin): admin tool policy...  | https://github.com/nearai/ironclaw/pull/2154     | OPEN   | red    | changes_requested | 3             |
| 2143 | feat(cli): gateway subcommands...  | https://github.com/nearai/ironclaw/pull/2143     | OPEN   | green  | pending           | 0             |
| ...  | ...                                | ...                                              | ...    | ...    | ...               | ...           |

Legend: green = all passing, red = failures, pending = running, none = no checks
```

## Step 5: Per-PR Detail Report

For each PR that has actionable items (failing CI, requested changes, or unaddressed comments), print a detail section:

```
### PR #{number}: {title}
Branch: {headRefName} -> {baseRefName}
URL: https://github.com/nearai/ironclaw/pull/{number}

**CI Status**: {status}
  - {check_name}: {conclusion} — {details if failed}

**Review Status**: {reviewDecision}
  - Reviewer {name}: {state}

**Unaddressed Comments** ({count}):

1. **@{author}** on `{file}:{line}` ({date}):
   > {comment body, truncated}

   **Proposed fix**: {concrete description of what code change would address this}

2. **@{author}** (top-level, {date}):
   > {comment body}

   **Proposed fix**: {what to do}
```

## Step 6: Summary & Next Steps

Print a prioritized action list:

```
## Recommended Actions (priority order)

1. **PR #XXXX** — Fix CI: {what's failing and likely cause}
2. **PR #XXXX** — Address N review comments from @reviewer
3. **PR #XXXX** — Respond to top-level discussion
4. **PR #XXXX** — No action needed (green + approved or just waiting)
```

End with: `Ready to implement fixes? Tell me which PR(s) to work on.`

## Rules

- **Read-only**: Do not edit files, push code, or post comments. This skill is for assessment only.
- **Be specific**: When proposing fixes, reference exact files and line ranges from the diff.
- **Skip noise**: Ignore bot comments (dependabot, codecov, etc.) unless they contain actionable CI failure info.
- **Prioritize**: Failed CI > changes_requested > unaddressed comments > everything else.
- **Draft PRs**: Include them but mark clearly as DRAFT. They still need health checks.
- **Staleness**: Flag PRs not updated in >5 days as potentially stale.
- **Parallel fetch**: Use subagents to audit multiple PRs in parallel when checking all PRs.
- **Repo is always `nearai/ironclaw`**: Hardcoded. Do not ask the user which repo.
