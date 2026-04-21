---
name: eli5
description: "Explain GitHub PRs in plain language (ELI5) with ASCII diagrams. Triggers on explain this PR, ELI5, what does this PR do, or GitHub PR URLs."
version: 1.0.0
---

# ELI5 PR Explainer

Generate beginner-friendly explanations of GitHub PRs with ASCII architecture diagrams.

## When to Use

- User shares a GitHub PR URL or number and asks to explain/ELI5 it
- User asks "what does this PR do", "break this down", "explain like I'm 5"

## Workflow

1. **Fetch PR data** via `gh` CLI (run both in parallel):
   - `gh pr view <PR> --repo <owner/repo> --json title,body,additions,deletions,files,commits`
   - `gh pr diff <PR> --repo <owner/repo>`

2. **Analyze** the diff, commits, and PR body. Identify:
   - Core architectural changes (new modules, renamed paths, new patterns)
   - Data flow changes (before vs after)
   - Security/safety implications
   - Migration strategies

3. **Generate explanation** following `references/output-format.md`

4. **Build diagrams** following `references/diagram-guide.md`

## Key Principles

- Lead with a **real-world analogy** — relate the change to something physical/tangible
- Break into **numbered sections** — one per major change, max 4-5
- Every section gets an **ASCII diagram** showing before/after or architecture
- End with **stats** (lines changed, files, tests, new deps)
- Use plain language — no jargon without immediate explanation
- Keep total output under ~200 lines — concise over exhaustive
