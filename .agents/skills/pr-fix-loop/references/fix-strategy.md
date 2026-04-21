# Fix Strategy

## Priority Order

Fix in this order: **Critical > High > Medium**.
Within same severity: security > correctness > robustness.

## Safe to Auto-Fix

These categories can be fixed with high confidence:

- **Missing error handling**: Add `?` propagation, add validation checks, replace panics with proper error returns
- **Missing null/empty guards**: Add guard clauses for None, empty collections, zero-length strings
- **Off-by-one errors**: Fix comparison operators (`<` vs `<=`), loop bounds, slice indices
- **Missing input validation**: Add length checks, type checks, range validation at boundaries
- **Unsafe unwrap/expect**: Replace with `map_err`, `ok_or`, `?` operator, or match expressions
- **SQL injection**: Switch string interpolation to parameterized queries
- **Missing test cases**: Add unit tests for uncovered error paths and edge cases
- **Incomplete error propagation**: Fix swallowed errors, add missing error context
- **Resource cleanup**: Add missing `drop`, `close`, or cleanup in error paths
- **Missing bounds checks**: Add bounds validation before array/slice access

## Do NOT Auto-Fix (report as remaining)

- **Architectural redesigns**: Coupling changes, abstraction overhauls, module reorganization
- **Ambiguous business logic**: Where correct behavior is unclear without domain knowledge
- **Scope expansion**: Changes that go beyond the PR's original intent
- **Performance optimizations**: Changes requiring benchmarking to validate
- **Risky cascading fixes**: If fixing one thing requires changing >5 files
- **Trade-off decisions**: Where multiple valid approaches exist and intent is unclear
- **Breaking API changes**: Altering public interfaces, response shapes, or status codes

## Fix Verification Protocol

After each edit:
1. Re-read the edited region plus ~10 lines above and below
2. Verify types match, imports exist, function signatures align
3. If fix requires a new import, add it
4. If fix touches a function signature, check ALL callers in the PR
5. If fix adds a new code path, verify it handles errors correctly
6. Never leave partial fixes — either complete the fix or skip it entirely

## Commit Conventions

- Message format: `fix: address review findings (iteration N)`
- Stage ONLY files you actually modified: `git add file1.rs file2.rs`
- Never stage unrelated changes
- One commit per iteration (batch all fixes for that iteration)

## When to Skip a Fix

- Cascading to >5 files — skip, report as remaining
- Uncertain about correctness — skip, report as remaining
- Fix would change PR intent or scope — skip, report as remaining
- Better to report a remaining finding than introduce a new bug
- If confidence in the fix is below ~80%, skip it
