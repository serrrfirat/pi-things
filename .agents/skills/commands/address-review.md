---
description: Fetch PR review comments, categorize, apply fixes, run quality gate, commit and push
allowed-tools: Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh pr comment:*), Bash(gh pr edit:*), Bash(gh api:*), Bash(gh repo view:*), Bash(git branch:*), Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(cargo fmt:*), Bash(cargo clippy:*), Bash(cargo test:*), Bash(bash scripts/*), Read, Edit, Write, Grep, Glob
argument-hint: "[pr-number (optional, auto-detects from branch)]"
---

# Address PR Review Feedback

## Step 1: Find the PR

If `$ARGUMENTS` is provided, use that as the PR number. Otherwise, detect the PR for the current branch:

```
gh pr list --head $(git branch --show-current) --json number,title,url --jq '.[0]'
```

Resolve the repo owner/name:
```
gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"'
```

If no PR is found, tell the user and stop.

## Step 2: Fetch unresolved review comments

Fetch review comments and review summaries:

```
gh api --paginate repos/{owner}/{repo}/pulls/{number}/comments
gh api --paginate repos/{owner}/{repo}/pulls/{number}/reviews
```

Filter to comments that are not resolved/dismissed. Deduplicate bot comments that raise the same issue. List each unique comment with: file path, line, reviewer handle, and body text.

## Step 3: Categorize feedback

Group every actionable comment into exactly one category (priority order):

1. **Correctness/bugs** — logic errors, wrong behavior, missing error handling
2. **Test additions** — missing tests, insufficient coverage, test fixes
3. **Security hardening** — injection, secrets, redaction, validation gaps
4. **Naming/DRY** — rename suggestions, extract-helper, dedup code
5. **Documentation** — comment fixes, doc updates, spec changes
6. **Style/formatting** — whitespace, import order, cosmetic

Present the categorized list as a table:

| # | Category | File:Line | Reviewer | Issue | Planned Fix |
|---|----------|-----------|----------|-------|-------------|

Check if any comments are already resolved by prior commits — mark those "already addressed".

Wait for user confirmation before fixing.

## Step 4: Apply fixes

Work through categories in priority order. For each comment:

- Read the file at the referenced line before changing anything
- If the comment is ambiguous, ask the user — do not guess
- For correctness fixes: also write a regression test (`#[test]` or `#[tokio::test]`)
- For naming/DRY: grep for all occurrences before renaming to avoid partials

## Step 5: Run quality gate

```
cargo fmt
cargo clippy --all --benches --tests --examples --all-features
cargo test --lib
```

All three must pass. If clippy or tests fail, fix and re-run from `cargo fmt`. Also run:

```
bash scripts/pre-commit-safety.sh
```

Fix any flagged patterns or add `// safety: <reason>` with justification.

Stop after 3 failed iterations and show remaining errors to the user.

## Step 6: Commit and push

Commit message template:
```
fix(scope): address {reviewer} review — {summary} (#{PR})
```

- `scope`: primary module changed (web, gateway, engine, safety, admin, etc.)
- Use `refactor(scope):` or `docs(scope):` if no bug fix is involved

Stage specific files — never `git add -A`. Verify with `git diff --cached` before committing.

```
git push
```

## Step 7: Reply to reviewers

Ask the user if they want to post a summary comment:
```
gh pr comment {number} --body "Addressed review feedback: ..."
```

And optionally re-request review:
```
gh pr edit {number} --add-reviewer {reviewer}
```

## Rules

- Never guess at code you haven't read. Always read the referenced file/line first.
- Group duplicate comments (same issue from multiple bots) and address once.
- Do not make changes beyond what the review comments ask for.
- Follow IronClaw conventions: no `.unwrap()` in production, `crate::` imports, `thiserror` errors.
- If changes touch persistence, verify both database backends are updated.
