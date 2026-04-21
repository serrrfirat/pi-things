# Interrogation Patterns

Question categories ordered by typical risk impact. Apply depth-first within each category before moving to the next.

## 1. Constraint Questions

Expose hard constraints that invalidate branches of the design.

- "What breaks if [X assumption] is false?"
- "What is the failure mode when [dependency] is unavailable?"
- "What is the maximum [scale/load/size] this must handle? What happens at 10x that?"
- "What regulatory, compliance, or policy constraints apply?"

## 2. Alternative Questions

Surface unconsidered alternatives for key decisions.

- "Why [chosen approach] over [obvious alternative]?"
- "What would change if [constraint] were removed?"
- "Is there a simpler version that achieves 80% of the value?"
- "What existing system/library already solves this?"

## 3. Dependency Questions

Map the dependency graph between decisions.

- "If [decision A] changes, what else must change?"
- "What is the order of operations? What can be parallelized?"
- "What must be decided before this can be decided?"
- "What is the migration/rollback path if this fails?"

## 4. Edge Case Questions

Probe boundaries and failure modes.

- "What happens with zero items? One item? Max items?"
- "What if the user does [unexpected action]?"
- "What happens during partial failure — halfway through a multi-step operation?"
- "How does this behave under concurrent access?"

## 5. Sequencing Questions

Challenge the implementation order and timeline.

- "What is the smallest shippable slice?"
- "What can be deferred without blocking the critical path?"
- "What is the riskiest unknown — should it be resolved first?"
- "What would a phased rollout look like?"

## 6. Second-Order Questions

Surface downstream consequences.

- "How does this affect [adjacent system/team/workflow]?"
- "What technical debt does this create or resolve?"
- "What precedent does this set for future decisions?"
- "What monitoring/observability is needed to know if this works?"

## Recommendation Format

For each question, provide a recommendation in this structure:

```
**Recommendation:** [Concrete position on the question].
*Rationale:* [1-2 sentences explaining why, referencing codebase evidence if available].
```

When the codebase provides evidence (existing patterns, constraints, test coverage), cite the specific file and line. Codebase evidence outweighs theoretical arguments.
