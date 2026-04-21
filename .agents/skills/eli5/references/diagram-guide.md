# ASCII Diagram Guide for ELI5

## When to Use Which Diagram Type

### Before/After — for architectural or flow changes

```
  BEFORE:                          AFTER:

  Component A ──> Target           Component A ──┐
  Component B ──> Target           Component B ──┤
                                                 v
  (problem description)           ┌──────────────┐
                                  │  New Layer    │
                                  └──────┬───────┘
                                         v
                                      Target
```

### Tree — for file/directory structure

```
  .system/
  ├── settings/          Description
  ├── extensions/        Description
  └── engine/
      ├── knowledge/     Description
      └── runtime/       Description
```

### Flow — for data pipelines or request paths

```
  ┌────────┐     ┌──────────┐     ┌────────┐
  │ Input  │────>│ Process  │────>│ Output │
  └────────┘     └──────────┘     └────────┘
```

### Dual-path — for migration/fallback strategies

```
  write("key", "value")
       │
       ├──> New Path   (preferred)
       │
       └──> Old Path   (kept for safety)

  read("key")
       │
       ├──> Try New Path first
       │       Found? Return it
       │
       └──> Fall back to Old Path
```

### Comparison table — for categorizing behaviors

```
  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │  Category A  │   │  Category B  │   │  Category C  │
  │  (details)   │   │  (details)   │   │  (details)   │
  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
         │                  │                   │
         v                  v                   v
  ┌─────────────────────────────────────────────────┐
  │              Shared Resource                     │
  └─────────────────────────────────────────────────┘
```

## Formatting Rules

- Max width: 70 characters (fits most terminals)
- Use box-drawing chars: `┌ ┐ └ ┘ ─ │ ├ ┤ ┬ ┴ ┼ ▶ ▼`
- Arrows: `──>`, `───>`, `──┐` + `v` for right-angles
- Indent diagrams 2 spaces inside code blocks
- Label with parenthetical annotations: `(description of what happens)`
- One diagram per major concept — dont overload a single diagram
- Side-by-side BEFORE/AFTER when showing transformations
- Vertical flow for pipelines, horizontal for parallel paths
