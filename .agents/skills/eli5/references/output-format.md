# ELI5 Output Format

## Structure

```
## What This PR Does (Like You're 5)

[1-2 paragraph real-world analogy. Compare the system to something physical
(house, factory, post office). Explain what was broken/missing and what
the PR fixes/adds in terms of that analogy.]

---

## The N Big Changes

### 1. [Change Name] — [One-line plain English summary]

[2-3 sentences explaining WHY this change exists, not just WHAT it does.
What problem did developers/users face before?]

```
[ASCII DIAGRAM — see diagram-guide.md]
```

### 2. [Next Change]
...

---

## Security Fixes Included (optional)

- Bullet list of security-relevant changes, if any
- Plain language: "secrets were being saved in plain text" not "redaction bypass"

---

## Stats

- **+N / -N lines** across M files
- N new tests
- N commits
- New dependencies: list (if any)
```

## Tone Rules

- "Imagine you have..." not "The system implements..."
- "Before this PR..." / "After this PR..." framing
- Parenthetical definitions for jargon: "schema (a blueprint for what data looks like)"
- Short paragraphs, max 3 sentences each
- No code snippets unless absolutely necessary for understanding
- Active voice: "The PR adds X" not "X was added by the PR"

## Section Count

- 1-2 changes: just explain inline, no numbered sections
- 3-5 changes: numbered sections (most common)
- 6+: group related changes, stay under 5 sections

## Length Target

- Small PRs (<100 lines): ~50 lines output
- Medium PRs (100-500 lines): ~100 lines output
- Large PRs (500+ lines): ~150-200 lines output, max
