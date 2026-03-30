# Mermaid Syntax Reference

> **Audience**: Claude (used in code generation context).
> This is the authoritative reference for Mermaid diagram rules enforced by Nium-Wiki.
> Skipping these rules causes **silent render failures** (blank or broken diagrams).

## 1. Diagram Complexity Optimization

When linear flowcharts exceed 6 nodes, **MUST** apply visual optimization to avoid long, narrow waterfall-style diagrams.

| Node Count | Optimization Strategy | Description |
|------------|----------------------|-------------|
| <= 6 | No optimization needed | Use linear flow directly |
| 7-12 | `subgraph` grouping | Group nodes into 2-4 subgraphs by logical phases |
| 13-20 | Layered abstraction | High-level overview + detailed phase diagrams |
| > 20 | Split into multiple diagrams | Each diagram focuses on one phase, linked via cross-references |

**Grouping principles**:
- Group by business phases (e.g., Initialization, Detection, Collection, Output)
- Each `subgraph` contains 2-4 nodes, max 5
- Connect subgraphs with concise edges to show phase transitions
- Add semantic titles to subgraphs: `subgraph PhaseName["Phase Title"]`

**Example — Avoid linear waterfall**:

```mermaid
%% WRONG — narrow waterfall with no structure
flowchart TD
    A --> B --> C --> D --> E --> F --> G --> H
```

**Recommended — Grouped by phase**:

```mermaid
%% CORRECT — grouped into logical phases
flowchart TD
    subgraph Phase1["Phase 1: Preparation"]
        A["Step 1"] --> B["Step 2"]
    end
    subgraph Phase2["Phase 2: Processing"]
        C["Step 3"] --> D["Step 4"] --> E["Step 5"]
    end
    subgraph Phase3["Phase 3: Output"]
        F["Step 6"] --> G["Step 7"] --> H["Step 8"]
    end
    Phase1 --> Phase2 --> Phase3
```

## 2. Syntax Safety Rules (Mermaid v10.9+ Compatible)

### Node Labels — Always Quote

Labels containing spaces, non-ASCII characters, or special symbols **must** be wrapped in double quotes.

```mermaid
%% WRONG — unquoted labels with spaces break rendering
flowchart TD
    A[CLI Entry] --> B[Source Index]

%% CORRECT — all labels quoted
flowchart TD
    A["CLI Entry"] --> B["Source Index"]
```

### Node IDs — Alphanumeric Only

Use only `[a-zA-Z0-9_]` in node IDs. Non-ASCII characters in IDs cause compatibility issues.

```mermaid
%% WRONG — non-alphanumeric ID
CoreModule_123["Core Module"]

%% CORRECT
CoreModule["Core Module"]
```

### subgraph IDs — English Only

subgraph IDs must be English alphanumeric. Non-ASCII subgraph IDs produce unstable rendering across Mermaid versions.

```mermaid
%% WRONG — non-ASCII subgraph ID
subgraph 核心层["Core Layer"]

%% CORRECT — English alphanumeric subgraph ID
subgraph CoreLayer["Core Layer"]
```

### subgraph ID vs Node ID — Shared Namespace

subgraph IDs and node IDs share a **single namespace**. A subgraph ID must **not** duplicate any node ID in the same diagram.

```mermaid
%% WRONG — subgraph ID "CLI" collides with node ID "CLI"
subgraph CLI["CLI Layer"]
    C1["cli.ts"] --> C2["commands"]
end
CLI["cli.ts"] --> A["Analyzer"]  %% ERROR: CLI already used as subgraph ID

%% CORRECT — use distinct IDs
subgraph CL["CLI Layer"]
    C1["cli.ts"] --> C2["commands"]
end
CLI["cli.ts"] --> A["Analyzer"]
CL --> A
```

### Labels with Quotes — Escape with HTML Entities

Nested quotes inside labels must use HTML entities (`&quot;`).

```mermaid
%% WRONG — unescaped quotes inside label
A["Config "key" value"]

%% CORRECT — escaped inner quotes
A["Config &quot;key&quot; value"]
```

### sequenceDiagram Participants — Alphanumeric IDs

Participant IDs in `sequenceDiagram` must be alphanumeric.

```mermaid
%% WRONG — non-alphanumeric participant ID
participant User_123

%% CORRECT
participant User123
participant User as User123
```

### Reserved Keywords — Avoid as IDs

Mermaid has reserved words (`class`, `graph`, `digraph`, `subgraph`, `end`, `click`, `style`, etc.) that must not be used bare as IDs.

```mermaid
%% WRONG — "class" is a reserved word
class["class"]

%% CORRECT — rename to avoid conflict
NodeClass["class"]
```

## 3. One-Line Principle

> **IDs: English alphanumeric | Labels: always quoted | Special chars: HTML entities**

## 4. Layout Direction

Choose the chart direction by content type:

| Direction | Use When |
|-----------|---------|
| `TB` (Top→Bottom) | Hierarchies, inheritance, call trees |
| `LR` (Left→Right) | Flows, dependencies, pipelines |
| `BT` (Bottom→Top) | Reversed hierarchies (rare) |
| `RL` (Right→Left) | Reverse flows (rare) |

## 5. Color Coding

Use `style` to highlight key nodes:

```mermaid
flowchart TD
    A["Start"] --> B["Process"]
    style A fill:#e1f5fe,stroke:#01579b
    style B fill:#f3e5f5,stroke:#4a148c
```
