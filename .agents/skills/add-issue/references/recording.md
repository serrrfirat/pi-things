# Recording an Issue

When `/add-issue` is invoked (without `flush` argument), record the user's issue.

## Steps

1. Parse the user's message for: expected behavior, observed behavior, details
2. If the user provides an image (temp file path), copy it to `.claude/issues/images/`
3. Derive a concise title from the description (under 80 chars)
4. Generate a unique ID: `issue-{YYYYMMDD}-{HHmmss}`
5. Save as `.claude/issues/{id}.json`

## Issue JSON Schema

```json
{
  "id": "issue-20260416-143022",
  "timestamp": "2026-04-16T14:30:22Z",
  "title": "Short descriptive title",
  "expected": "What should happen",
  "observed": "What actually happens",
  "details": "Additional context, steps to reproduce, etc.",
  "images": ["images/issue-20260416-143022-1.png"],
  "category": null
}
```

## Image Handling

- User-pasted images arrive as temp file paths (e.g. `/tmp/...png`)
- Copy each image to `.claude/issues/images/{id}-{n}.{ext}`
- Store relative path in the `images` array
- Preserve original file extension

## Directory Setup

Create `.claude/issues/` and `.claude/issues/images/` if they don't exist.
Ensure `.claude/issues/` is in `.gitignore` (add if missing).

## Confirmation

After saving, confirm to user:
```
Recorded: "{title}" (id: {id})
{N} issue(s) buffered. Run /add-issue flush to post to GitHub.
```
