---
name: unslopify
description: "Audit and safely clean code slop in a repository: dead code, stale legacy paths, weak types, circular dependencies, noisy comments, duplicated code, and dishonest error handling. Use when the user asks to clean up a codebase, remove cruft, reduce tech debt, tighten types, or do a careful cleanup pass without broad redesign."
---

# Unslopify

Unslopify is a **cleanup audit + safe implementation workflow**.

Goal: leave the codebase cleaner, smaller, and more honest **without** quietly changing behavior.

This skill is for:
- Unused code, unused exports, dead paths, and stale dependencies
- Weak or evasive types that can be strengthened from local evidence
- Small circular dependencies that can be broken safely
- Error handling that hides failures or fakes safety
- Deprecated, legacy, fallback, or migration-leftover paths that are no longer active
- AI slop, fake scaffolding, placeholder comments, and noisy commentary
- Obvious low-risk duplication where ownership is clear

This skill is **not** for:
- Broad architecture redesign
- Reorganizing packages or module ownership across the repo
- Changing public APIs without explicit approval
- Migration or compatibility decisions with unclear blast radius
- “Big cleanup” diffs that are hard to review

## Core principles

- **Behavior first.** Clean code that breaks behavior is not clean.
- **Evidence over vibes.** Use references, call sites, tests, config, and search results.
- **Small batches win.** Prefer 3 safe changes over 30 speculative ones.
- **Don’t force a lane.** If a lane produces nothing safe, say so.
- **Generated/vendor code is off-limits** unless the task explicitly requires it.
- **Cleanup is not redesign.** If the right fix is architectural, mark it out of scope.

## Pi-native tool mapping

When following this workflow, use pi tools instead of assuming another harness exists.

- Repository scan: `ls`, `find`, `grep`, `read`
- Focused validation: `bash`
- Editing: `edit`, `write`
- Clarifications / approvals: `ask_user`
- Parallel research: `subagent` or `ant_colony`
- External docs or package behavior: `code_search`, `web_search`, `librarian`

Do **not** reference unavailable tools such as `context_builder`, `ask_oracle`, `agent_run`, `get_file_tree`, or `apply_edits`.

## Workflow

### Phase 1 — Quick scan

Keep this short. The goal is orientation, not implementation.

1. Use `ls`, `find`, and `read` to identify:
   - language / framework
   - package manager / build system
   - tests, lint, typecheck, CI config
   - generated/vendor/build directories to avoid
2. Identify likely validation commands from repo files.
3. Write down obvious public boundaries: routes, exported APIs, schemas, migrations, integrations.

Stop after enough context to plan discovery.

### Phase 2 — Discovery lanes

Research first. Do not edit yet.

For broad cleanup requests, investigate these lanes:
1. Obvious duplication / low-risk DRY cleanup
2. Shared type consolidation
3. Unused code and dependencies
4. Circular dependencies
5. Weak types
6. Error handling cleanup
7. Deprecated / legacy / fallback paths
8. AI slop / stubs / noisy comments

Use `subagent` in parallel when helpful. Each lane should return:
- scope inspected
- evidence collected
- candidate files/symbols
- high-confidence candidates
- risky / uncertain candidates
- validation needed
- out-of-scope items

### Phase 3 — Discovery digest

Before editing, summarize:
- language / framework / package manager
- validation commands
- generated/vendor exclusions
- public API / migration / integration boundaries
- high-confidence candidates
- risky candidates
- out-of-scope findings

If the cleanup request is broad or high-stakes, use `ask_user` to confirm scope before implementation.

### Phase 4 — Cleanup ledger

Convert findings into a ledger:

| ID | Lane | Change | Files/symbols | Evidence | Risk | Validation | Decision |
|---|---|---|---|---|---|---|---|

Decision values:
- **Implement now**
- **Needs human review**
- **Out of scope**
- **No action**

Only implement items that are:
- evidence-backed
- behavior-preserving
- locally understandable
- practically verifiable

### Phase 5 — Implementation plan

Create a short plan for only the **Implement now** items.

Prefer this order:
1. Remove clearly unused code / dead paths
2. Remove stale legacy / fallback branches
3. Fix small cycles blocking cleanup
4. Strengthen weak types with local evidence
5. Clean up dishonest error handling
6. Deduplicate only where it truly simplifies
7. Remove noisy comments and stubs last

### Phase 6 — Direct implementation

Implement in small, reviewable batches.

Rules:
- Use `edit` for surgical changes.
- Re-read affected files after meaningful batches.
- Run the narrowest relevant validation first.
- If uncertainty appears mid-edit, stop and downgrade the item.
- Do not bundle unrelated cleanup into one diff.

### Phase 7 — Verification

Run the strongest practical validation available, usually some combination of:
- typecheck
- lint
- unit/integration tests
- build
- dependency/cycle checks already present in the repo
- search to confirm deleted symbols are gone

If there were pre-existing failures, record them explicitly.

### Phase 8 — Final report

Always report:
- summary of implemented cleanup
- validation run and results
- skipped findings
- needs-human-review items
- out-of-scope items
- follow-up risks

## High-confidence criteria

A cleanup item is high-confidence only if:
- affected files/symbols are identified
- evidence is stronger than a hunch
- intended behavior remains unchanged, or the change is explicitly approved
- blast radius is understandable
- a realistic validation path exists
- it does not silently change public contracts or compatibility guarantees

## Lane guidance

### 1) Obvious duplication / DRY cleanup

Only consolidate when ownership is clear and the abstraction is simpler than the duplication.

Keep duplication when:
- domain meaning differs
- lifecycle differs
- public boundaries differ
- the shared abstraction would feel unnatural

### 2) Shared type consolidation

Consolidate duplicate types only when shared ownership is real.

Do **not** collapse intentional boundaries such as:
- public vs internal
- API vs persistence
- client vs server
- input vs output models

### 3) Unused code and dependencies

Static analysis is evidence, not a verdict.

Check references through:
- imports / exports
- routes / registries
- reflection / dynamic loading
- config wiring
- tests and scripts
- CLI entry points
- public API surfaces

### 4) Circular dependencies

Break cycles with small boundary improvements:
- extract pure types / constants
- move shared contracts downward
- split mixed-responsibility files
- invert tiny dependencies where appropriate

Do not hide cycles with lazy imports unless there is a real runtime reason.

### 5) Weak types

Replace weak types using actual call sites, schemas, tests, and library docs.

Bad cleanup:
- replacing `any` with fake precision
- adding broad aliases that hide uncertainty
- using `as SomeType` theater

Good cleanup:
- narrow types from actual usage
- preserve `unknown` at untrusted boundaries, then validate quickly

### 6) Error handling cleanup

Remove fake safety such as:
- empty catches
- catch-and-return-null without meaning
- catch-and-log-only paths that swallow failure
- broad fallbacks masking broken assumptions

Keep error handling that serves a real purpose:
- boundary validation
- retries with limits
- cleanup / finally behavior
- domain error translation
- useful user-facing messages

### 7) Deprecated / legacy / fallback paths

Remove only when active call sites, config, and tests show the path is no longer needed.

Be extra careful around:
- persisted data
- migrations
- external integrations
- documented compatibility promises

### 8) AI slop / stubs / noisy comments

Remove:
- placeholder code
- fake scaffolding
- stale TODOs pretending to be implementation
- comments narrating obvious syntax
- “new vs old implementation” lore that is no longer useful

Keep concise comments that explain:
- non-obvious constraints
- domain rules
- security concerns
- workarounds with context

## When to use ask_user

Use `ask_user` before implementation when:
- the cleanup could remove public or compatibility code
- there are multiple plausible cleanup scopes
- the user said “clean this up” but did not define boundaries
- a candidate requires judgment rather than evidence

Ask exactly one focused question per call.

## Suggested output format

```md
## Unslopify Report

### Summary
- ...

### Implemented cleanup
| ID | Lane | Change | Files | Validation |
|---|---|---|---|---|

### Validation
| Command | Result | Notes |
|---|---|---|

### Needs human review
- ...

### Out of scope
- ...

### Risks / follow-ups
- ...
```

## Anti-patterns

Avoid:
- skipping discovery and jumping straight to edits
- deleting code because “it looks unused”
- cleaning generated/vendor/build outputs
- inventing new tooling or changing package managers casually
- turning cleanup into a rewrite
- hiding uncertainty in the final report
- reformatting unrelated files as collateral damage

## Success condition

The result should be a smaller, clearer diff that a cautious maintainer would merge with confidence.
