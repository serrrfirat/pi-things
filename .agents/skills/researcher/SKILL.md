---
name: researcher
description: Conduct comprehensive research on any topic using web search and structured analysis. Use for competitive analysis, market research, technology evaluation, or exploring new domains. Produces organized markdown reports with sources.
---

# Researcher

Systematic research assistant that uses web search to gather current information and synthesize findings into actionable reports.

## When to Use This Skill

- Competitive analysis (what exists in a market)
- Market research (trends, opportunities, gaps)
- Technology evaluation (comparing tools, frameworks, approaches)
- Product research (before building something new)
- Domain exploration (understanding a new field)
- Due diligence (validating ideas or claims)

## Research Process

### Phase 1: Scope Definition

Before searching, clarify:
1. **Core Question**: What are we trying to learn?
2. **Boundaries**: What's in/out of scope?
3. **Depth**: Quick overview vs. deep dive?
4. **Perspective**: User, technical, business, or all?

### Phase 2: Multi-Query Search

Use WebSearch tool with multiple targeted queries:

```
Query Strategy:
1. Direct query: "[topic] solutions"
2. Competitor query: "[topic] alternatives comparison"
3. Technical query: "[topic] implementation approaches"
4. Problem query: "[topic] challenges problems"
5. Trend query: "[topic] trends 2025 2026"
```

**IMPORTANT**: Always use the WebSearch tool. Do not rely on training data for current market information.

### Phase 3: Synthesis

Organize findings into structured sections:
- What exists (solutions, products, approaches)
- Who uses it (target users, use cases)
- How it works (technical approaches)
- What's missing (gaps, opportunities)
- What to do (recommendations)

## Output Format

```markdown
# Research: [Topic]

## Executive Summary
[2-3 sentences: Key findings and main recommendation]

## Existing Solutions

### [Solution 1 Name]
- **URL**: [link]
- **What it does**: [brief description]
- **Pricing**: [if applicable]
- **Key features**: [bullet list]
- **Limitations**: [what it doesn't do well]

### [Solution 2 Name]
...

## Feature Comparison Matrix

| Feature | Solution 1 | Solution 2 | Solution 3 |
|---------|-----------|-----------|-----------|
| Feature A | ✓ | ✓ | ✗ |
| Feature B | ✗ | ✓ | ✓ |
| Pricing | $X/mo | Free | $Y/mo |

## Target Users & Pain Points

### User Persona 1: [Name]
- **Role**: [description]
- **Pain points**: [what frustrates them]
- **Current workarounds**: [how they cope]

### User Persona 2: [Name]
...

## Market Gaps & Opportunities

1. **[Gap 1]**: [Description of unmet need]
   - Evidence: [What you found that suggests this]
   - Opportunity: [How this could be addressed]

2. **[Gap 2]**: ...

## Technical Considerations

- **Common approaches**: [How solutions typically work]
- **Technical challenges**: [Known difficulties]
- **Emerging trends**: [New technologies or methods]

## Recommendations

### If Building Something New
1. [Recommendation with reasoning]
2. [Recommendation with reasoning]

### If Choosing Existing Solution
1. [Best for X use case]: [Solution name]
2. [Best for Y use case]: [Solution name]

## Sources

- [Source 1 Title](URL)
- [Source 2 Title](URL)
- [Source 3 Title](URL)
```

## Research Depth Levels

### Quick Scan (5-10 min)
- 3-5 search queries
- Top 5 solutions identified
- Basic comparison
- Key recommendation

### Standard Research (15-30 min)
- 8-12 search queries
- Comprehensive solution mapping
- Feature comparison matrix
- User personas
- Gap analysis

### Deep Dive (45+ min)
- 15+ search queries
- Detailed solution profiles
- Technical architecture analysis
- Market sizing estimates
- Competitive positioning
- Strategic recommendations

## Example Prompts

```
Research the current landscape of AI code review tools.
Focus on what's available, pricing, and gaps.
```

```
Do competitive analysis on meal planning apps.
I'm considering building one - what opportunities exist?
```

```
Evaluate vector database options for a RAG system.
Compare Pinecone, Weaviate, Qdrant, and Chroma.
```

```
Research screen recording and annotation tools for developers.
What's missing in the current market?
```

## Best Practices

1. **Always cite sources**: Every claim needs a URL
2. **Distinguish facts from opinions**: Be clear about what's verified vs. inferred
3. **Note recency**: Mark if information might be outdated
4. **Highlight surprises**: Call out unexpected findings
5. **Be actionable**: End with clear next steps
6. **Admit gaps**: Note what you couldn't find

## Integration with Build Process

This skill is designed to be the first stage of the autonomous build pipeline:

```
researcher → product-manager-toolkit (PRD) → scope → architecture → build
```

The research output feeds directly into PRD creation by providing:
- Market context
- Competitive landscape
- User pain points
- Technical constraints
- Differentiation opportunities
