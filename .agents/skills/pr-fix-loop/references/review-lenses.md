# Review Lenses

## File Reading Protocol

Read every changed file in FULL (not just diff hunks). Surrounding context catches:
- Callers of modified functions that now behave differently
- Trait/interface contracts the change may violate
- Invariants established elsewhere that the diff breaks

If PR touches >20 files, prioritize: service logic > routes/handlers > models/types > tests > docs.

## Severity Definitions

| Level | Definition |
|-------|-----------|
| **Critical** | Security vulnerability, data loss, or financial exploit |
| **High** | Bug that will cause incorrect behavior in production |
| **Medium** | Robustness issue, missing validation, or incomplete error handling |
| **Low** | Style, naming, documentation, or minor improvement |
| **Nit** | Optional suggestion, take-it-or-leave-it |

## Lens 1: Correctness and Bugs

- Off-by-one errors, wrong comparison operators, inverted conditions
- Unreachable code, dead branches, impossible match arms
- Type confusion (mixing up IDs, wrong enum variant)
- Incorrect error propagation (swallowed errors, wrong error type/status code)
- Broken invariants (uniqueness violated, ordering assumptions wrong)
- Concurrency issues (TOCTOU, missing locks, race conditions)

## Lens 2: Edge Cases and Failure Handling

- Empty input, None/null, zero-length collections
- External service failures (DB down, HTTP timeout, malformed response)
- Integer boundaries (overflow, underflow, i64::MAX)
- Malformed/adversarial input (invalid UTF-8, huge payloads, deeply nested JSON)
- All error paths tested? Every `?` propagation makes sense?
- Partial failures (wrote to DB but failed to emit event)

## Lens 3: Security (assume malicious actor)

- **Auth bypass**: Can unauthenticated users reach this? IDOR vulnerabilities?
- **Injection**: SQL via string interpolation? Command injection? Log/header injection?
- **Data leakage**: Secrets/PII logged? Returned in error messages? Exposed in API responses?
- **Resource exhaustion/DoS**: Unbounded input? Expensive ops without rate limits? OOM via large allocations?
- **Financial abuse**: Tokens/credits consumed without tracking? Usage limits bypassed?
- **Replay/race**: Same request replayed for double-spend? Concurrent requests bypass limits?
- **Crypto**: Timing attacks? Weak randomness? Missing HMAC verification?

## Lens 4: Test Coverage

- Every new public function/method tested?
- Error paths tested (not just happy paths)?
- Edge cases covered (empty input, boundary values, concurrent access)?
- Existing tests still valid with new changes, or asserting stale behavior?
- Integration/e2e tests for the full flow?
- If a test is missing, describe exactly what test to write.

## Lens 5: Documentation and Assumptions

- New assumptions documented in comments?
- Non-obvious algorithms or business rules explained?
- API contracts (request/response shapes, error codes) documented?
- TODO/FIXME/HACK comments that should be tracked as issues?

## Lens 6: Architectural Concerns

- Follows existing codebase patterns, or introduces new one without justification?
- Unnecessary abstractions or premature generalizations?
- Duplicated logic that should be extracted?
- Clean module dependencies, or creates circular/tight coupling?
- Will this change make future work harder?

## IronClaw-Specific Checks (project-specific, adapt for other repos)

- No `.unwrap()` or `.expect()` in production code (tests are fine)
- Use `crate::` imports, not `super::`
- Error types use `thiserror` in `error.rs`
- If change touches persistence, verify BOTH backends updated (PostgreSQL + libSQL)
- New tools must implement `Tool` trait and be registered in `registry.rs`
- External tool output must pass through the safety layer

## Findings Table Format

Present all findings as:

```
| # | Severity | Category | File:Line | Finding | Suggested Fix |
|---|----------|----------|-----------|---------|---------------|
```

Be specific. "This might have issues" is useless. "Line 42 returns 404 but should return 400 because X" is useful.
Distinguish between "this IS a bug" and "this COULD be a bug if X". Be honest about certainty.
If the code is good and you find nothing, say so. Do not invent problems.
