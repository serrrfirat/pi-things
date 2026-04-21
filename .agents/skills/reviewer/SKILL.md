---
name: reviewer
description: Provide critical review, feedback, and devil's advocate analysis on any artifact. Use when the user needs critique, gap analysis, stress-testing of ideas, or asks for feedback on plans, designs, code, content, or decisions. Triggers include "review", "critique", "feedback", "what am I missing", "devil's advocate", "stress test", "evaluate", "assess".
---

# Reviewer

## Overview

This skill provides critical, constructive feedback on any artifact - plans, designs, code, content, ideas, or decisions. It goes beyond surface-level review to identify gaps, challenge assumptions, stress-test scenarios, and provide actionable recommendations.

## When to Use This Skill

- User asks for feedback or critique on something they've created
- User wants a devil's advocate perspective
- User asks "what am I missing?" or "what could go wrong?"
- User wants to stress-test an idea or plan
- User needs to evaluate trade-offs or assess risks
- Before finalizing important decisions or artifacts

## Review Framework

### Phase 1: Understand First

Before critiquing, establish context:

1. **Goal**: What is this trying to achieve?
2. **Constraints**: What limitations exist (time, budget, technical, organizational)?
3. **Audience**: Who is this for? Who will be affected?
4. **Stage**: Is this early exploration or near-final?
5. **Prior feedback**: Has this been reviewed before? What changed?

### Phase 2: Devil's Advocate

Challenge the artifact from multiple angles:

| Perspective | Questions |
|-------------|-----------|
| **Skeptic** | What assumptions are being made? Are they valid? |
| **Pessimist** | What could go wrong? What's the worst case? |
| **Competitor** | How could someone exploit weaknesses in this? |
| **User** | Would real users actually want/use this? |
| **Maintainer** | What happens 6 months from now? Who owns this? |

### Phase 3: Gap Analysis

Systematically identify what's missing:

- **Scope gaps**: What's not addressed that should be?
- **Edge cases**: What unusual scenarios aren't handled?
- **Dependencies**: What external factors could break this?
- **Blind spots**: What biases might be affecting this?
- **Alternatives**: What other approaches weren't considered?

### Phase 4: Stress Test

Push the artifact to its limits:

- **Scale**: Does this work at 10x volume? 100x?
- **Time**: What if this takes twice as long as expected?
- **Change**: What if requirements shift halfway through?
- **Failure**: How does this fail gracefully? Does it?
- **Integration**: How does this interact with existing systems/processes?

### Phase 5: Actionable Feedback

Structure recommendations by impact and effort:

| Priority | Criteria |
|----------|----------|
| **Critical** | Must fix - blocks success or creates major risk |
| **Important** | Should fix - significantly improves quality |
| **Nice-to-have** | Could fix - minor improvements |
| **Out of scope** | Worth noting but not for this iteration |

For each issue, provide:
1. **What**: Specific problem identified
2. **Why**: Impact if not addressed
3. **How**: Concrete suggestion to fix

## Output Format

Structure every review as follows:

```markdown
## Summary

[One paragraph overall assessment - is this ready, needs work, or back to drawing board?]

## Strengths

What's working well:
- [Strength 1]
- [Strength 2]
- [Strength 3]

## Critical Issues

Must address before proceeding:

### [Issue 1 Title]
**Problem**: [What's wrong]
**Impact**: [Why it matters]
**Recommendation**: [How to fix]

### [Issue 2 Title]
...

## Important Concerns

Should address for quality:

- [Concern 1]: [Brief recommendation]
- [Concern 2]: [Brief recommendation]

## Questions to Resolve

Ambiguities or decisions needed:

1. [Question 1]
2. [Question 2]

## Minor Suggestions

Nice-to-haves if time permits:

- [Suggestion 1]
- [Suggestion 2]
```

## Review Types

### Plan Review

Focus areas:
- Are goals clear and measurable?
- Is scope realistic for constraints?
- Are dependencies identified?
- What's the critical path?
- What happens if X doesn't work?

### Technical Design Review

Focus areas:
- Does it solve the actual problem?
- Is it simpler than it needs to be? More complex?
- How does it handle failure?
- What are the performance implications?
- Is it maintainable and testable?

### Content Review

Focus areas:
- Is the message clear?
- Will the audience care?
- What's the one thing readers should remember?
- Is anything missing or redundant?
- Does it achieve its goal?

### Decision Review

Focus areas:
- Are all options truly considered?
- Is the reasoning sound?
- What are we trading off?
- Is this reversible if wrong?
- Who disagrees and why?

### Code Review

Focus areas:
- Does it work correctly?
- Is it readable and maintainable?
- Are there security implications?
- What about error handling?
- Is it tested adequately?

## Tone Guidelines

Effective critique is:

| Do | Don't |
|----|-------|
| Specific and concrete | Vague generalizations |
| Issue-focused, not person-focused | Personal criticism |
| Balanced (strengths AND weaknesses) | Only negative |
| Actionable with suggestions | Problems without solutions |
| Calibrated to stage (early = directional, late = detailed) | Same depth for everything |
| Honest but respectful | Harsh or dismissive |

## Red Flags Checklist

Common issues to watch for:

- [ ] Solving the wrong problem
- [ ] Scope creep or unclear boundaries
- [ ] Unstated assumptions
- [ ] Missing failure modes
- [ ] "Happy path" only thinking
- [ ] Ignoring maintenance burden
- [ ] No success criteria defined
- [ ] Dependencies on things not controlled
- [ ] Complexity without justification
- [ ] Missing stakeholder input

## Example Prompts

When users invoke this skill, they might say:

- "Review this PRD and tell me what's missing"
- "Play devil's advocate on my startup idea"
- "What could go wrong with this architecture?"
- "Give me honest feedback on this blog post"
- "Stress test this launch plan"
- "What am I not seeing here?"
- "Critique this API design"
- "Is this decision sound?"

## Best Practices

1. **Ask before assuming**: If context is unclear, ask clarifying questions first
2. **Calibrate depth**: Quick gut-check vs. thorough analysis depends on context
3. **Lead with strengths**: Acknowledge what's working before critiquing
4. **Prioritize ruthlessly**: Not all feedback is equally important
5. **Provide alternatives**: Don't just say "this is wrong" - suggest better
6. **Know when to stop**: Diminishing returns on minor polish
7. **Be direct but kind**: Clarity over comfort, but respect the effort
