---
description: Run a structured PR diff audit with risk checks and publish-ready review summary
allowed-tools: Read, Bash, Grep, Write
argument-hint: [branch-or-pr-context]
---

# PR Diff Audit

Audit: $ARGUMENTS

## Gather context
1. Detect current branch and base branch:
   - `git branch --show-current`
   - `git merge-base HEAD origin/main`
2. Collect changed files and stats:
   - `git diff --name-status origin/main...HEAD`
   - `git diff --stat origin/main...HEAD`
3. Collect commit history:
   - `git log --oneline --decorate origin/main..HEAD`

## Review pass (ordered)
1. **Correctness**: logic regressions, edge cases, state transitions
2. **Safety**: panic/unwrap usage, input validation, auth/permissions
3. **Data contracts**: payload/schema compatibility, serialization changes
4. **Concurrency/perf**: blocking calls, contention, unnecessary allocations
5. **Operational readiness**: logging clarity, observability, rollback/feature flag path

## Output
Write `review/pr-audit-<branch>.md` with:
- Executive summary (3-5 bullets)
- Blocking issues
- Non-blocking improvements
- File-by-file notes
- Release risk level (Low/Med/High)
- Recommended next action (approve/request changes/retest scope)

## Optional push safety
If history was rewritten, include a final section:
- confirm remote branch
- suggest `git push --force-with-lease` only if required
- include one-line rationale
