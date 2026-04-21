---
description: Fix CI failures for a PR/branch in an isolated worktree, push fixes, and remove the worktree
allowed-tools: Bash(git :*), Bash(gh pr:*), Bash(cd :*), Read, Edit, Write, Grep, Glob
argument-hint: "<PR-number, branch-name, or github-PR-url>"
---

# Fix CI in Isolated Worktree

Fix all CI failures for a PR or branch in a throwaway git worktree. After the quality gate passes, commit, push, and delete the worktree.

## Step 1: Resolve target branch

Parse `$ARGUMENTS`:
- GitHub PR URL (e.g. `https://github.com/org/repo/pull/42`) → extract PR number
- Bare number → PR number
- Any other string → branch name
- Empty → stop and ask the user

If PR number, resolve the branch:
```
gh pr view <number> --json headRefName --jq .headRefName
```

Save the result as **BRANCH**. Derive a filesystem-safe **SLUG** (lowercase, only `[a-z0-9-]`).

## Step 2: Create worktree

Find the **main** repo root (not the current worktree root):
```bash
git worktree list --porcelain | head -1 | sed 's/worktree //'
```

Set `WORKTREE=<main-root>/.claude/worktrees/ci-fix-<SLUG>`.

If `$WORKTREE` already exists, remove it:
```bash
git worktree remove "$WORKTREE" --force
```

Create the worktree in detached-HEAD mode at the remote branch tip:
```bash
git fetch origin "$BRANCH"
git worktree add "$WORKTREE" "origin/$BRANCH" --detach
```

**CRITICAL — shell state does not persist between Bash calls.**
Every subsequent bash command MUST start with `cd "$WORKTREE" && ...`.
Use the absolute path. Do NOT assume the working directory has changed.

## Step 3: Quality gate — iterative fix loop (max 5 rounds)

Run the checks in order. When a step fails, fix the code, then **restart from that step**. One round = all four steps passing. Stop after 5 full rounds if it still fails.

### The gate

1. **Format** — `cargo fmt`
   If it rewrites files, note them but no code fix needed.

2. **Lint** — `cargo clippy --all --benches --tests --examples --all-features -- -D warnings`
   Read each warning/error, open the file, fix the source. Common: unused imports, redundant clones, needless borrows, missing `Send`/`Sync` bounds, type mismatches.

3. **Unit tests** — `cargo test --lib`
   Read failing test output. Trace the code path under test. Fix the **root cause**, not the assertion, unless the test expectation is genuinely wrong.

4. **Safety script** — `bash scripts/pre-commit-safety.sh`
   Skip if the script does not exist. Otherwise fix flagged patterns:
   - `.unwrap()` / `.expect()` → proper `?` error propagation
   - Hardcoded `/tmp` → `tempfile::tempdir()`
   - Direct `state.store.*` → route through `ToolDispatcher`
   - Unredacted tracing params → wrap with `redact_params()`
   - `&s[..n]` byte slicing → use `char_indices()` / `is_char_boundary()`

### Guidelines

- Keep fixes minimal — only touch what is needed to pass the gate.
- Do NOT refactor, add comments, or "improve" surrounding code.
- If a clippy lint or test failure reveals a deeper design issue that cannot be fixed minimally, stop and report it to the user instead of making a large speculative change.

## Step 4: Commit and push

If **any** files changed (check with `git status` inside the worktree):

1. Stage everything — `git add -A` is safe in an isolated worktree.
2. Commit:
   ```
   fix: resolve CI failures — <brief summary of what was fixed>
   ```
   Keep the summary under 72 characters. List specifics in the commit body if more than 3 things changed.
3. Push to the original remote branch:
   ```bash
   git push origin HEAD:refs/heads/<BRANCH>
   ```

If **nothing** changed, report "CI already passes — no changes needed."

## Step 5: Remove worktree

Leave the worktree directory first, then remove it:
```bash
cd / && git -C "<main-root>" worktree remove ".claude/worktrees/ci-fix-<SLUG>" --force
```

Verify with `git worktree list` that it is gone.

## Step 6: Summary

Report to the user:
- Which checks were failing and what was fixed (files + one-line descriptions)
- Whether changes were pushed (include the branch name)
- Worktree cleanup confirmation
- Any remaining issues that could not be auto-fixed
