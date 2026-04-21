---
name: address-review-ironclaw
version: 0.3.0
description: Fetch PR review comments, categorize feedback, apply fixes, run quality gate, commit and push. Automates the review-address cycle for IronClaw PRs. Always works in an isolated git worktree.
activation:
  keywords:
    - address review
    - review feedback
    - fix review comments
    - PR feedback
    - review round
    - address comments
  patterns:
    - "(?i)address.*(review|feedback|comments)"
    - "(?i)fix.*(review|PR) (comments|feedback)"
    - "(?i)(respond|reply) to.*(review|feedback)"
  tags:
    - developer
    - github
    - review
  max_context_tokens: 2200
requires:
  bins: [gh, cargo]
---

# Address PR Review Feedback

Automate the read-categorize-fix-verify-push loop for IronClaw PR reviews.

**This skill always runs in an isolated git worktree.** All edits, builds, and commits happen there. The worktree is cleaned up at the end.

## 0. Set up worktree

Before doing anything else, create an isolated worktree for the PR branch:

```bash
# Identify the PR branch first
PR_BRANCH=$(gh pr view --json headRefName -q .headRefName)
WORKTREE_DIR="/tmp/ironclaw-review-$(date +%s)"

# Create a worktree on the PR branch
git worktree add "$WORKTREE_DIR" "$PR_BRANCH"
cd "$WORKTREE_DIR"
```

Use `EnterWorktree` if available. Otherwise create the worktree manually as above.

**All subsequent steps (fetch comments, apply fixes, build, commit, push) MUST run inside the worktree directory.** Do not modify the main checkout.

## 1. Identify the PR

```bash
gh pr view --json number,headRefName,url,author,reviewRequests
```

If not on a PR branch, ask the user for the PR number and check it out within the worktree.

## 2. Fetch unresolved review comments

```bash
gh api repos/{owner}/{repo}/pulls/{number}/reviews
gh api repos/{owner}/{repo}/pulls/{number}/comments
```

Also check review threads:
```bash
gh pr view {number} --json reviewDecision,reviews,comments
```

Filter to comments where `state` is not `DISMISSED` and threads not yet resolved. List each comment with: file path, line number, reviewer handle, and body text.

## 3. Categorize feedback

Group every actionable comment into exactly one category (priority order):

1. **Correctness/bugs** — logic errors, wrong behavior, missing error handling
2. **Test additions** — missing tests, insufficient coverage, test fixes
3. **Security hardening** — injection, secrets, redaction, validation gaps
4. **Naming/DRY** — rename suggestions, extract-helper, dedup code
5. **Documentation** — comment fixes, doc updates, spec changes
6. **Style/formatting** — whitespace, import order, cosmetic

Present the categorized list to the user for confirmation before fixing.

## 4. Apply fixes by category

Work through categories in priority order. For each comment:

- Read the file at the referenced line
- Apply the fix
- If the comment is ambiguous, ask the user — do not guess

**Correctness fixes**: also write a regression test (`#[test]` or `#[tokio::test]`). The commit-msg hook requires test changes for `fix()` commits — see `scripts/commit-msg-regression.sh`.

**Naming/DRY**: grep for all occurrences before renaming to avoid partial renames across the workspace.

**Security**: check that `redact_params()` is used before logging tool parameters. Validate URL inputs resolve DNS before checking for private IPs (anti-SSRF). See `skills/review-checklist/SKILL.md` for the full security checklist.

## 5. Run quality gate

```bash
cargo fmt
cargo clippy --all --benches --tests --examples --all-features
cargo test --lib
```

If clippy or tests fail, fix the issue and re-run from `cargo fmt`. Do not proceed until all three pass.

Also run the pre-commit safety checks:
```bash
bash scripts/pre-commit-safety.sh
```

Fix any flagged patterns (production panics, unredacted logging, multi-step DB without transactions, dispatch bypass) or add `// safety: <reason>` with justification.

## 6. Commit with structured message

Template:
```
fix(scope): address {reviewer} review — {summary} (#{PR})
```

- `scope`: primary crate or module changed (`web`, `gateway`, `engine`, `safety`, `admin`, etc.)
- `{reviewer}`: GitHub handle of the reviewer
- `{summary}`: 3-8 word summary of the most significant changes
- If changes are only docs/naming with no bug fix, use `refactor(scope):` or `docs(scope):` instead of `fix(scope):`

Stage specific files — never `git add -A`. Verify with `git diff --cached` before committing.

## 7. Push and re-request review

```bash
git push
```

Ask the user if they want to re-request review:
```bash
gh pr edit {number} --add-reviewer {reviewer}
```

Optionally post a summary comment on the PR listing what was addressed:
```bash
gh pr comment {number} --body "Addressed review feedback: ..."
```

## 8. Fix CI failures

After pushing, wait for CI to start and check for failures:

```bash
# Wait briefly for CI to trigger, then poll status
sleep 10
gh pr checks {number} --watch --fail-fast 2>&1 || true
```

If any checks fail:

1. **Fetch the failure logs**:
   ```bash
   RUN_ID=$(gh pr checks {number} --json name,state,link --jq '.[] | select(.state == "FAILURE") | .link' | head -1 | grep -oP 'runs/\K[0-9]+')
   gh run view "$RUN_ID" --log-failed 2>&1 | grep -E "error\[|error:|FAILED|panicked" | head -40
   ```

2. **Diagnose and fix** the root cause in the worktree. Common CI failures:
   - **Clippy warnings-as-errors**: fix the lint, don't suppress it with `#[allow(...)]` unless justified
   - **Test failures**: read the assertion message, fix the code or test
   - **Formatting**: run `cargo fmt` again (sometimes CI uses a different rustfmt version)
   - **Pre-existing failures in other crates** (e.g. `ironclaw_skills` dead code): these are NOT your problem — skip them. Only fix failures in files you touched or that are caused by your changes.

3. **Re-run quality gate** locally after fixing:
   ```bash
   cargo fmt
   cargo clippy --all --benches --tests --examples --all-features
   cargo test --lib
   ```

4. **Commit the CI fix** as a separate commit:
   ```bash
   git commit -m "fix(scope): fix CI — {description of what failed}"
   git push
   ```

5. **Re-check CI** — repeat this loop up to 3 times. If CI still fails after 3 attempts, stop and report the remaining failures to the user.

If all checks pass (or only pre-existing failures remain), proceed to cleanup.

## 9. Clean up worktree

After pushing (or on any fatal error), always clean up:

```bash
# Return to original directory first
cd -
# Remove the worktree
git worktree remove "$WORKTREE_DIR" --force
```

Use `ExitWorktree` if available. Otherwise remove manually as above.

If the worktree removal fails (e.g. uncommitted changes after an error), warn the user and print the path so they can clean up manually:
```
⚠ Worktree left at {WORKTREE_DIR} — remove with: git worktree remove {WORKTREE_DIR} --force
```

**Never leave a worktree behind without informing the user.**

## Error handling

- **gh auth failure**: Ask user to run `gh auth login`
- **Quality gate loops (>3 iterations)**: Stop, show remaining failures, then clean up worktree
- **Ambiguous comment**: Always ask rather than guessing the reviewer's intent
- **Commit blocked by commit-msg hook**: Add a regression test, or get user approval for `[skip-regression-check]`
- **Reviewer left only approval with no comments**: Nothing to address — report "no actionable feedback found", then clean up worktree
- **Any unrecoverable error**: Clean up the worktree before stopping — see step 9
