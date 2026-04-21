---
name: grill-me
description: Stress-test a plan or design via structured interrogation. Walks decision-tree branches, resolves dependencies, provides recommendations. Triggers on "grill me", "stress-test this plan", "poke holes".
version: 1.0.0
---

# Grill Me — Design Interrogation

Conduct a rigorous, structured interview about a plan or design until reaching shared understanding. Walk every branch of the decision tree, resolve dependencies between decisions, and provide a recommended answer with each question.

## When to Activate

Trigger on: "grill me", "stress-test this plan", "poke holes in this", "challenge this design", "interrogate this", "review my architecture", or when user presents a plan/design and asks for critical feedback.

## Process

### 1. Establish Scope

Identify the plan or design under review. If not provided, ask once. Read any referenced files, PRs, or specs before beginning.

### 2. Map the Decision Tree

Before asking questions, silently build a mental model of the design's decision tree:
- Core decisions (what was chosen)
- Alternatives not taken (what was rejected or unconsidered)
- Dependencies between decisions (what constrains what)
- Assumptions (what is taken for granted)

### 3. Interrogate Branch by Branch

Walk the decision tree depth-first. For each decision point:

1. **State the decision** being examined
2. **Ask one focused question** about it
3. **Provide a recommended answer** with brief rationale — prefix with `**Recommendation:**`
4. **Wait for user response** before proceeding

Follow the interrogation patterns in `references/interrogation-patterns.md`.

### 4. Resolve Before Moving On

Do not advance to the next branch until the current one is resolved. Resolution means:
- User accepted the recommendation, OR
- User provided an alternative with reasoning, OR
- Decision is explicitly deferred with a noted dependency

### 5. Explore the Codebase First

Before asking a question that could be answered by reading code, config, schemas, migrations, or tests — **read them**. Use Grep, Glob, Read tools. Only ask the user what the codebase cannot answer.

### 6. Synthesize

After all branches are resolved, produce a summary:
- Decisions made (with rationale)
- Deferred decisions (with dependencies noted)
- Risks acknowledged
- Recommended next steps

## Rules

- One question at a time. Never batch questions.
- Always provide a recommendation. Never ask without an opinion.
- Be adversarial but constructive — strengthen the plan, not tear it down.
- Prioritize questions by risk: highest-impact decisions first.
- If user says "skip" or "move on", respect it and note the gap.
- Track resolved vs unresolved branches explicitly.
