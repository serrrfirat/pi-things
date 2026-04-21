# Diff Analysis Reference

## How Diff Overlap Detection Works

For each unresolved, non-outdated thread, the script runs:

```bash
git diff <original_commit_oid> HEAD -- <file_path>
```

This produces unified diff output with hunk headers like:

```
@@ -16,8 +16,12 @@ fn some_function() {
```

Format: `@@ -<old_start>,<old_count> +<new_start>,<new_count> @@`

## Overlap Check

A hunk overlaps with a comment if the comment's `originalLine` falls within the old-side range:

```
old_start <= originalLine <= old_start + old_count
```

If any hunk overlaps, the commented code was modified -- strong signal feedback was addressed.

## Edge Cases

**File renamed**: `git diff` with `--follow` does not work for `diff` between commits. If the file was renamed, the diff against the old path returns empty. The script checks both `path` (current) and falls back to checking if the file exists at `original_commit_oid`.

**File deleted**: If `git diff` shows the file was deleted entirely, all comments on that file are marked as "file deleted" in the report.

**Binary files**: Skipped -- binary diffs cannot be meaningfully analyzed for line overlap.

**Multi-line comments**: Use `originalStartLine` to `originalLine` range for overlap check instead of just `originalLine`.

## When git diff Disagrees with isOutdated

GitHub's `isOutdated` uses its own diff algorithm which may differ from local `git diff`. Trust `isOutdated=true` (GitHub confirms change). When `isOutdated=false`, the local diff provides a second opinion -- if the local diff shows changes at the line, mark as "Addressed (diff)" in the report.
