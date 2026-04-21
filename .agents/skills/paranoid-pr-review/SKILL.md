---
description: Paranoid architect review of a PR — fetches diff, reads changed files, deep review across 7 lenses (including v2 engine impact for ironclaw), posts findings with confidence tags as GitHub comments
disable-model-invocation: true
allowed-tools: Bash(gh pr view:*), Bash(gh pr diff:*), Bash(gh pr comment:*), Bash(gh api:*), Bash(gh repo view:*), Bash(git diff:*), Bash(git log:*), Read, Grep, Glob
argument-hint: "<pr-number or github-pr-url>"
---

# Paranoid Architect Code Review

You are reviewing this PR as a paranoid architect. Your job is to find every bug, vulnerability, race condition, edge case, and undocumented assumption before it ships. Assume adversarial users, concurrent access, and Murphy's law.

## Step 1: Resolve the PR

Parse `$ARGUMENTS` to extract the PR number:
- If it's a URL like `https://github.com/owner/repo/pull/123`, extract `123`.
- If it's a bare number, use it directly.
- If empty, stop and ask the user for a PR number.

Fetch PR metadata (including head commit SHA for posting line comments later):

```
gh pr view {number} --json title,body,baseRefName,headRefName,headRefOid,files,additions,deletions
```

Save the `headRefOid` value, you'll need it as `commit_id` in Step 6.

## Step 2: Load the full diff

```
gh pr diff {number}
```

Also get the list of changed files:

```
gh pr diff {number} --name-only
```

## Step 3: Read every changed file in full

For each changed file, read the ENTIRE current file (not just the diff hunks). You need surrounding context to catch:
- Callers of modified functions that now behave differently
- Trait/interface contracts that the change may violate
- Invariants established elsewhere that the diff breaks

If the PR touches more than 20 files, still read all of them, but process in this priority order: service logic > routes/handlers > models/types > tests > docs. Batch reads in groups of ~20 if needed.

## Step 4: Deep review

Go through the changes with each of these lenses. For every finding, note the file, line range, severity, confidence, and a concrete description.

**Noise reduction**: Do NOT report findings that are better served by automated linters (e.g., logging level conventions like `info!` vs `debug!`, import style, formatting). If you spot a convention violation that recurs across the PR, mention it once in the "Convention Notes" section (Step 5) rather than listing it per-file. Focus your findings table on substance: bugs, security issues, correctness problems, and missing tests.

### IronClaw-specific checks

In addition to the general lenses below, check IronClaw conventions (see CLAUDE.md):
- No `.unwrap()` or `.expect()` in production code (tests are fine)
- Use `crate::` imports, not `super::`
- Error types use `thiserror` in `error.rs`
- If the change touches persistence, verify both database backends are updated (PostgreSQL in `postgres.rs` AND libSQL in `libsql_backend.rs`)
- New tools must implement the `Tool` trait correctly and be registered in `registry.rs`
- External tool output must pass through the safety layer

### 4a. Correctness and bugs

- Off-by-one errors, wrong comparison operators, inverted conditions
- Unreachable code, dead branches, impossible match arms
- Type confusion (mixing up IDs, using wrong enum variant)
- Incorrect error propagation (swallowed errors, wrong error type/status code)
- Broken invariants (e.g. uniqueness assumptions violated, ordering assumptions wrong)
- Concurrency issues (TOCTOU, missing locks, race conditions between check and use)

### 4b. Edge cases and failure handling

- What happens with empty input, None/null, zero-length collections?
- What happens when external services fail (DB down, HTTP timeout, malformed response)?
- What happens at integer boundaries (overflow, underflow, i64::MAX)?
- What happens with malformed or adversarial input (invalid UTF-8, huge payloads, deeply nested JSON)?
- Are all error paths tested? Does every `?` propagation make sense?
- Are partial failures handled (e.g. wrote to DB but failed to emit event)?

### 4c. Security (assume a malicious actor)

- **Authentication/Authorization bypass**: Can an unauthenticated user reach this? Can workspace A's user access workspace B's data? Are there IDOR vulnerabilities?
- **Injection**: SQL injection via string interpolation? Command injection? Log injection? Header injection?
- **Data leakage**: Are secrets, PII, or conversation content logged? Returned in error messages? Exposed in API responses?
- **Resource exhaustion / DoS**: Can an attacker send unbounded input? Trigger expensive operations without rate limits? Cause OOM via large allocations?
- **Financial abuse**: Can tokens/credits be consumed without being tracked? Can usage limits be bypassed?
- **Replay / race conditions**: Can the same request be replayed for double-spend? Can concurrent requests bypass limits?
- **Cryptographic issues**: Timing attacks on comparisons? Weak randomness? Missing HMAC verification?

### 4d. Test coverage

- Is every new public function/method tested?
- Are error paths tested (not just happy paths)?
- Are edge cases covered (empty input, boundary values, concurrent access)?
- Do existing tests still make sense with the new changes, or do they assert stale behavior?
- Are there integration/e2e tests for the full flow?
- If a test is missing, describe exactly what test should be written.

### 4e. Documentation and assumptions

- Are new assumptions documented in comments? (e.g. "this field is always non-empty because X")
- Are non-obvious algorithms or business rules explained?
- Are API contracts (request/response shapes, error codes, status codes) documented?
- Are there TODO/FIXME/HACK comments that should be tracked as issues?

### 4f. Architectural concerns

- Does this change follow existing patterns in the codebase, or does it introduce a new one without justification?
- Are there unnecessary abstractions or premature generalizations?
- Is there duplicated logic that should be extracted?
- Are dependencies between modules clean, or does this create circular/tight coupling?
- Will this change make future work harder?

### 4g. Engine v2 impact assessment (IronClaw repos only)

**Skip this section** if the repository is not `nearai/ironclaw`.

IronClaw is actively building Engine v2 in `crates/ironclaw_engine/` — a unified thread-capability-CodeAct model replacing ~10 v1 abstractions. When a PR modifies v1 code, assess whether the same change needs a v2 counterpart.

**v1 → v2 mapping:**

| v1 area | v2 equivalent |
|---------|---------------|
| `src/agent/` (agentic loop, dispatcher, sessions) | `crates/ironclaw_engine/executor/` (ExecutionLoop, structured, scripting) |
| `src/tools/` (Tool trait, registry, dispatch) | `crates/ironclaw_engine/capability/` (Capability, CapabilityRegistry, LeaseManager) |
| `src/workspace/` (memory system) | `crates/ironclaw_engine/memory/` (MemoryStore, RetrievalEngine) |
| `src/context/` (JobState, JobContext) | `crates/ironclaw_engine/runtime/` (ThreadManager, ThreadTree) |
| `src/evaluation/` (success evaluation) | `crates/ironclaw_engine/reliability.rs` (ReliabilityTracker) |
| `src/hooks/` (lifecycle hooks) | `crates/ironclaw_engine/capability/policy.rs` (PolicyEngine) |
| `src/skills/` (SkillRegistry, scoring) | `crates/ironclaw_engine/memory/skill_tracker.rs` (SkillTracker) |
| `src/llm/` (LlmProvider trait) | `crates/ironclaw_engine/traits/llm.rs` (LlmBackend trait) |
| `src/db/` (Database trait, Store) | `crates/ironclaw_engine/traits/store.rs` (Store trait) |
| `src/safety/` (SafetyLayer) | `crates/ironclaw_engine/traits/effect.rs` (EffectExecutor boundary) |

**Areas with NO v2 counterpart** (skip assessment): channels, CLI, setup/onboarding, config, CI/CD, tunnel, sandbox/orchestrator, registry, secrets, service, web gateway, WASM runtime.

**Output one verdict** at the top of your findings:

- **v2 Impact: Not related** — PR only touches areas with no v2 counterpart.
- **v2 Impact: Already addressed** — PR includes changes to `crates/ironclaw_engine/`.
- **v2 Impact: Should have affected v2** — PR modifies v1 areas that have v2 counterparts but does not update the engine crate. List specifically which v2 modules/files need equivalent changes and why.

## Step 5: Present findings

### v2 Engine Impact (IronClaw repos only)

If you performed the 4g assessment, display the verdict prominently at the top:

> **v2 Impact: [Not related | Already addressed | Should have affected v2]**
> _(If "Should have affected v2": list the specific v2 modules that need equivalent changes)_

### Findings table

Summarize findings to the user as a table:

| # | Severity | Confidence | Category | File:Line | Finding |
|---|----------|------------|----------|-----------|---------|

**Confidence levels** (required for every finding):
- `[Certain]` — you can demonstrate the bug with a concrete input/scenario
- `[Likely]` — the code path exists and is reachable, but you haven't traced every precondition
- `[Possible]` — theoretical concern, multiple preconditions required

**Severity levels:**
- **Critical**: Security vulnerability, data loss, or financial exploit
- **High**: Bug that will cause incorrect behavior in production
- **Medium**: Robustness issue, missing validation, or incomplete error handling. Must have a *plausible* single- or two-precondition scenario. If you need 3+ preconditions for the exploit/failure to occur, downgrade to Low.
- **Low**: Concrete minor issue with a specific description. If you find yourself writing "unlikely but..." or "theoretically if...", omit the finding entirely rather than listing it as Low.
- **Nit**: Optional suggestion, take-it-or-leave-it

### Cross-PR patterns

If you notice the same issue/pattern across multiple files in this PR, or if this PR continues a systemic pattern (e.g., repeated test erosion, recurring missing validation at a boundary), call it out here. Cross-PR pattern detection is the highest-value output of this review — give it a dedicated paragraph.

### Convention notes

List convention/style observations here (logging levels, import style, naming). These are FYI only, not blocking findings, and should NOT appear in the findings table above.

---

Ask the user which findings to post as PR comments. Always require explicit confirmation before posting any comments. Default recommendation: all Critical, High, and Medium.

## Step 6: Post comments on GitHub

Resolve the repo owner and name if not already known:

```
gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"'
```

For each approved finding, post a review comment on the PR at the specific file and line. Use the `headRefOid` from Step 1 as the `commit_id`:

```
gh api repos/{owner}/{repo}/pulls/{number}/comments \
  -f body="..." \
  -f path="..." \
  -f commit_id="{headRefOid}" \
  -F line=... \
  -f side="RIGHT"
```

For findings that span multiple locations or are architectural, still post inline by anchoring to the most relevant changed file/line. Use regular PR comments only if GitHub API cannot resolve a valid diff line after retrying with an updated line/path.

Format each comment clearly:
- Severity tag (e.g. `**High Severity**`)
- One-line summary
- Detailed explanation of the issue
- Concrete suggestion for the fix (with code if possible)

## Rules

- Read every changed file in full before writing a single finding. Context matters.
- Never post a comment about code you haven't actually read. Verify line numbers against the actual file.
- Be specific. "This might have issues" is useless. "Line 42 returns 404 but should return 400 because X" is useful.
- Distinguish between "this IS a bug" and "this COULD be a bug if X". Be honest about certainty.
- Don't nitpick formatting or style unless it causes actual confusion. Focus on substance.
- If the code is good and you find nothing, say so. Don't invent problems to look thorough.
- Respect the project's CLAUDE.md privacy rules: never include customer data, secrets, or PII in comments.
- When in doubt about severity, round up. It's cheaper to dismiss a false alarm than to miss a real bug.
