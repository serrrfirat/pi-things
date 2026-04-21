---
name: add-issue
description: Buffer issue reports (expected/observed/details + screenshots) locally, then classify and batch-post to GitHub with /add-issue flush.
version: 1.0.0
---

# Add Issue

Buffer issue reports locally and batch-post them to GitHub.

## Two Modes

### `/add-issue` — Record an issue
Parse the user's message into structured fields and save to `.claude/issues/`.
See `references/recording.md` for the full schema and image handling steps.

### `/add-issue flush` — Classify and post all buffered issues
Classify each issue, show summary table for confirmation, post to GitHub, clean up.
See `references/flushing.md` for the classification and posting workflow.

## Quick Reference

**Record:**
1. Extract: title (derive from description, <80 chars), expected, observed, details
2. Copy any pasted images to `.claude/issues/images/{id}-{n}.{ext}`
3. Save JSON to `.claude/issues/{id}.json` — schema in `references/recording.md`
4. Ensure `.claude/issues/` is in `.gitignore`
5. Confirm: title, id, total buffered count

**Flush:**
1. Read all `.claude/issues/*.json`
2. Classify each by semantic category (e.g. `ui`, `engine`, `channel`, `api`, `database`, `config`)
3. Present titles + categories table — wait for user confirmation
4. Run: `python3 ~/.claude/skills/add-issue/scripts/flush_issues.py .claude/issues/`
5. Report GitHub URLs for created issues

## Image Handling
- User-pasted images arrive as temp file paths
- Copy to `.claude/issues/images/` with issue ID prefix
- On flush, images are uploaded to GitHub (via gist) and linked in issue body

## Issue Body Format (on GitHub)
```markdown
## Expected Behavior
{expected}

## Observed Behavior
{observed}

## Details
{details}

**Category:** {category}

### Screenshot
![screenshot](url)
```
