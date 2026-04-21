---
name: create-issue
description: Create GitHub issues from markdown files in the ideas folder. Use when the user wants to convert an idea document into a GitHub issue for tracking.
---

# Create Issue from Idea

This skill reads a markdown file from the ideas folder and creates a GitHub issue from its contents.

## Instructions

1. **Identify the idea file**:
   - If user specifies a filename (e.g., "automation-insights.md"), use that
   - If user doesn't specify, list the ideas folder and ask which file
   - Assume ideas folder is `/Users/firatsertgoz/Documents/synapse/ideas/`

2. **Parse the markdown file**:
   - Extract the first heading as the issue title (e.g., `# Automation Insights Implementation Plan`)
   - Extract the rest of the content as the issue body
   - If no heading, use the filename as title

3. **Determine the target repository**:
   - Default: `serrrfirat/synapse` (main repo)
   - If user specifies a different repo, use that

4. **Create the issue using gh CLI**:
   ```bash
   gh issue create --title "<title>" --body "<body>" --repo <repo>
   ```

5. **Report the result**:
   - Show the issue URL
   - Confirm it was created successfully

## Examples

**User says**: "Create issue from automation-insights.md"

**You do**:
```bash
# Read the file
cat /Users/firatsertgoz/Documents/synapse/ideas/automation-insights.md

# Extract title and body
# Title: "Automation Insights Implementation Plan"
# Body: Everything after the first heading

# Create issue
gh issue create \
  --title "Automation Insights Implementation Plan" \
  --body "$(cat /Users/firatsertgoz/Documents/synapse/ideas/automation-insights.md)" \
  --repo serrrfirat/synapse

# Report result
echo "Issue created: https://github.com/serrrfirat/synapse/issues/<number>"
```

**User says**: "Create issue from ui-improvements.md to myother/repo"

**You do**:
```bash
gh issue create \
  --title "UI Improvements" \
  --body "$(cat /Users/firatsertgoz/Documents/synapse/ideas/ui-improvements.md)" \
  --repo myother/repo
```

## Edge Cases

- **File doesn't exist**: Report error and list available ideas
- **gh not installed**: Report that gh CLI is required
- **Not authenticated**: Tell user to run `gh auth login` first
- **Empty file**: Report that the file is empty
- **No title found**: Use the filename without .md as the title

## Requirements

- GitHub CLI (`gh`) must be installed
- User must be authenticated with `gh auth login`
