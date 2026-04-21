---
name: pr-fix-loop
description: Iterative PR review-fix loop. Reviews PR across 6 lenses, auto-fixes Critical/High/Medium findings, commits each iteration, repeats until clean or max iterations.
allowed-tools: Bash(gh pr view:*), Bash(gh pr diff:*), Bash(gh api:*), Bash(gh repo view:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git status:*), Bash(gh pr checkout:*), Read, Grep, Glob, Write, Edit
argument-hint: "<pr-number> [--max-iterations N]"
---

# PR Fix Loop

Iterative review-fix cycle: review PR -> fix medium+ issues -> commit -> re-review -> repeat until clean.

## Step 1: Parse Arguments

Extract from `$ARGUMENTS`:
- **PR number**: bare number or GitHub URL (extract number from URL)
- **--max-iterations N**: optional, default `5`
- If no PR number provided, stop and ask the user.

Set `ITERATION = 1`, `MAX_ITERATIONS = N`.

## Step 2: Setup

Fetch PR metadata:
```
gh pr view {number} --json title,body,baseRefName,headRefName,headRefOid,files,additions,deletions
```

Checkout the PR branch:
```
gh pr checkout {number}
```

Get changed files:
```
gh pr diff {number} --name-only
```

Print: `Starting pr-fix-loop on PR #{number}: "{title}" (max {MAX_ITERATIONS} iterations)`

## Step 3: The Loop

Repeat for each iteration until clean or `ITERATION > MAX_ITERATIONS`:

### Phase 1 — Review

Print: `--- Iteration {ITERATION}/{MAX_ITERATIONS}: Reviewing ---`

Load `references/review-lenses.md`. For each changed file, read the ENTIRE file (not just diff hunks).
Apply all 6 review lenses. Produce a findings table:

```
| # | Severity | Category | File:Line | Finding | Suggested Fix |
```

### Phase 2 — Evaluate

Filter findings to **Critical**, **High**, and **Medium** only.

- If **zero** actionable findings: print `No medium+ issues found.` → go to Step 4 (Clean Completion).
- If findings exist: print the filtered table and continue.

### Phase 3 — Fix

Load `references/fix-strategy.md`. Apply fixes in priority order: Critical → High → Medium.

For each finding:
1. Read the target file
2. Apply the suggested fix using Edit tool
3. Re-read the edited region to verify correctness
4. If fix is unsafe or uncertain, skip it and mark as "remaining"

Print summary: `Fixed {N} findings, skipped {M} (uncertain/out-of-scope).`

### Phase 4 — Commit

Stage only modified files by name:
```
git add file1 file2 ...
```

Commit:
```
git commit -m "fix: address review findings (iteration {ITERATION})"
```

### Phase 5 — Next

Increment `ITERATION`. If `ITERATION > MAX_ITERATIONS`, go to Step 5 (Max Iterations Reached).
Otherwise, return to Phase 1.

## Step 4: Clean Completion

Print iteration summary:
```
PR Fix Loop complete (clean).
Iterations: {ITERATION}
Total findings fixed: {total}
Pushing...
```

Push: `git push`

## Step 5: Max Iterations Reached

Print remaining findings table and summary:
```
PR Fix Loop: max iterations ({MAX_ITERATIONS}) reached.
Remaining medium+ findings: {count}
```

Display the remaining findings table. Ask user: "Push current state? (y/n)"
On confirmation: `git push`

## Rules

- Never auto-fix a finding you are not confident about. Skip and report it.
- Always re-read files after editing to verify the fix.
- Do not introduce code outside the PR's original intent or scope.
- Do not post review comments on GitHub — this skill fixes, not comments.
- Respect project CLAUDE.md conventions.
- When in doubt about severity, round up.
