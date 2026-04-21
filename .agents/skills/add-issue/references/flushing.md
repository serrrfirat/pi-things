# Flushing Issues to GitHub

When `/add-issue flush` is invoked, classify and post all buffered issues.

## Steps

### 1. Read All Buffered Issues
- Load all `.json` files from `.claude/issues/`
- If none exist, inform user and stop

### 2. Classify Each Issue
Assign a `category` to each issue based on its content. Categories are semantic:
- Analyze repo structure to determine relevant categories
- Common categories: `ui`, `api`, `engine`, `channel`, `database`, `config`, `testing`
- For each issue, set the `category` field in the JSON
- Write the updated JSON back to disk

### 3. Present Summary for Confirmation
Show a table to the user before posting:

```
Issues to post to {owner}/{repo}:
| # | Title                          | Category |
|---|--------------------------------|----------|
| 1 | Button overlap on settings     | ui       |
| 2 | Engine crashes on empty input  | engine   |

Proceed? (y/n)
```

Wait for user confirmation before proceeding.

### 4. Post to GitHub
Run the flush script:
```bash
python3 ~/.claude/skills/add-issue/scripts/flush_issues.py .claude/issues/
```

The script:
- Uploads images to GitHub (via gist) and gets URLs
- Creates each issue with formatted body + image links
- Applies category as a GitHub label (if the label exists)
- Deletes local files after successful posting
- Outputs JSON summary

### 5. Report Results
Show which issues were created with their GitHub URLs.
If any failed, report errors and keep those local files.

## Dry Run
To preview without posting:
```bash
python3 ~/.claude/skills/add-issue/scripts/flush_issues.py .claude/issues/ --dry-run
```
