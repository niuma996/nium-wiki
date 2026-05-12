---
name: nium-wiki
description: |
  Analyze source code and produce an enterprise-quality, domain-organized Wiki under `.nium-wiki/`.

  Trigger on: "generate wiki", "create docs", "update wiki", "rebuild wiki", or any documentation generation request.

  Capabilities:
  - Semantic code analysis — understands logic, not just structure
  - Auto-generated Mermaid diagrams (architecture, data flow, class, dependency)
  - Bidirectional cross-linking across all documents
  - SHA256-based change detection for incremental rebuilds
  - Every section traces back to source via relative path links
  - Multi-language output (zh/en/ja/ko/fr/de and more)

---

# Nium Wiki Generator

Produce **professional-grade**, domain-organized project Wiki under the `.nium-wiki/` directory.

> **Core Principle**: Generated documentation must be **detailed, structured, diagrammed, and cross-linked**, meeting enterprise-level technical documentation standards.

## Quality Gate for Generated Documentation

**MANDATORY**: Every piece of generated documentation MUST satisfy the following criteria:

### Depth of Coverage
- Provide **full context** for every topic — never leave bare lists or placeholder outlines
- Write **specific, explanatory** descriptions that address the WHY and HOW behind each concept
- Supply **runnable code examples** paired with their expected output (🔴 secrets must be sanitized - see "Secret & Credential Sanitization")
- Call out **edge cases, caveats, and common mistakes** explicitly

> **Substantive content**: A section has real content if it contains ≥ 3 non-empty, non-heading
> lines, OR at least one code block, diagram, or table. A heading followed by a single sentence
> or a bare list does not count.

### Structural Conventions
- Organize content with **hierarchical headings** (H2 → H3 → H4) to form a clear information hierarchy
- Summarize key concepts in **tables** for scanability
- Illustrate processes and flows using **Mermaid diagrams**
- Interconnect documents via **cross-links**

### 🔴 MANDATORY: Link Path Format

> ALL source file links MUST use project-root-relative POSIX paths starting with `/`.
> NEVER use `file://` URIs, absolute filesystem paths, or OS-specific paths.
> The IDE/editor may provide file paths as `file:///Users/.../project/src/foo.ts` — you MUST strip the prefix and convert to `/src/foo.ts`.

| ❌ Wrong | ✅ Correct | Reason |
|----------|-----------|--------|
| `[foo.ts](file:///Users/x/project/src/foo.ts#L1-L50)` | `[foo.ts](/src/foo.ts#L1-L50)` | Strip `file://` prefix + absolute path |
| `[foo.ts](src/foo.ts#L1-L50)` | `[foo.ts](/src/foo.ts#L1-L50)` | Must start with `/` |
| `[foo.ts](C:\Users\x\project\src\foo.ts)` | `[foo.ts](/src/foo.ts)` | No Windows paths |

**Conversion rule**: Given any absolute path, remove everything up to and including the project root directory name, then prepend `/`. Example: `file:///home/user/my-project/src/core/foo.ts` → `/src/core/foo.ts`.

### 🔴 MANDATORY: Secret & Credential Sanitization

> **CRITICAL**: NEVER include actual secrets, credentials, API keys, or sensitive information in generated documentation.

**MANDATORY sanitization rules**:

| Scenario | Action | Example |
|----------|--------|---------|
| Hard-coded API keys in source | Replace with placeholders | `sk_live_abc123` → `sk_live_XXXXXXXXXXXX` |
| Database credentials | Redact or use example values | `password: "mysecret123"` → `password: "***REDACTED***"` |
| Private tokens/keys | Mask with descriptive placeholders | `TOKEN=secret123` → `TOKEN=<your-api-token-here>` |
| Environment vars with secrets | Show safe example values | `AWS_SECRET_ACCESS_KEY=xyz` → `AWS_SECRET_ACCESS_KEY=<your-secret-key>` |

**Sanitization pattern library**:
- API keys: `sk_live_XXXXXXXX`, `pk_test_XXXXXXXX`, `api_key_XXXXXXXX`
- Passwords: `***REDACTED***`, `<your-password-here>`
- Tokens: `<your-access-token>`, `<auth-token-here>`
- Generic: `XXXXXXXX`, `<secret-value>`, `<sensitive-data>`

**Exception**: Mermaid diagrams, source file path links, and markdown structure MUST still be preserved unchanged (except for secret removal within code blocks).

### Diagram Requirements (at least 2-3 per document)
| Content Type | Diagram Type | Condition |
|--------------|--------------|-----------|
| System architecture | `flowchart TB` with subgraphs | always |
| Request / data flow | `sequenceDiagram` | always |
| Lifecycle / state transitions | `stateDiagram-v2` | only for stateful modules |
| **Class / Interface shape** | `flowchart LR` showing type/module relationships | only when source is read |
| Module dependencies | `flowchart LR` | always |
| Data models / ORM | `erDiagram` | when project has database/ORM |
| Module conceptual relationships | `mindmap` | optional, for abstract module relationships only (NOT file trees) |

> **Diagram diversity**: Count ≥ 2 distinct diagram *types* toward the minimum. Three identical
> flowcharts do not satisfy the requirement — use `flowchart LR`, `sequenceDiagram`,
> `stateDiagram-v2`, `erDiagram` as appropriate for the module.
>
> **Note**: `mindmap` is optional and does **not** count toward the ≥ 2 distinct types requirement. It may supplement but never replace the required diagram types above.

**Layout rules**: Choose direction by content — `TB` for hierarchies, `LR` for flows/dependencies. Use `subgraph` to group related nodes when count > 6. Apply `style` color coding to highlight key nodes.

> **File/directory structure** MUST use plain-text tree format (`├──` `└──`), NEVER use Mermaid diagrams (including `mindmap`).
> Mermaid `mindmap` is only for showing abstract conceptual relationships between modules, never for file paths or directory trees.

### 🔴 Mermaid Syntax Safety Rules (MANDATORY — Read Before Every Diagram)

> ⚠️ **HARD REQUIREMENT**: Before generating ANY Mermaid diagram, you MUST read
> [refs/mermaid-syntax.md](./refs/mermaid-syntax.md) in full. Generating without reading
> this file is a hard requirement violation.

**✅ Hard Rules** — parser errors (must fix). **⚠️ Suggestions** — best practices.

| Category | Rule | Wrong ❌ | Correct ✅ |
|----------|------|----------|------------|
| ✅ | subgraph ID must not collide with node ID | `subgraph CLI[...]\nCLI[...]` | `subgraph CL[...]\nCLI[...]` |
| ✅ | Unescaped quotes in plain labels | `A[Config "x" val]` | `A[Config &quot;x&quot; val]` or `A["Config \"x\" val"]` |
| ✅ | Reserved keywords as IDs | `class[class]` | `NodeClass[class]` (keywords: `class`, `graph`, `digraph`, `subgraph`, `end`, `click`, `style`, `state`, `note`) |
| ⚠️ | Plain labels preferred for simple text | `A["Label"]` | `A[Label]` |
| ⚠️ | Alphanumeric IDs preferred | `Core.1[Core]` | `Core_1[Core]` |
| ⚠️ | English subgraph IDs preferred | `subgraph 核心层[...]` | `subgraph Core[...]` |

**Complexity grouping** (when nodes > 6):

| Node Count | Strategy |
|------------|----------|
| ≤ 6 | Linear — no grouping needed |
| 7-12 | `subgraph` grouping, 2-4 nodes per group |
| 13-20 | Layered abstraction (overview + detail) |
| > 20 | Split into multiple diagrams |

**Example — Grouped vs waterfall**:

```mermaid
%% WRONG — narrow waterfall
flowchart TD
    A --> B --> C --> D --> E --> F --> G --> H
%% CORRECT — grouped by phase
flowchart TD
    subgraph Phase1[Phase 1]
        A --> B
    end
    subgraph Phase2[Phase 2]
        C --> D --> E
    end
    Phase1 --> Phase2
```

### 🔴 MANDATORY: Source File Back-References

**Each section MUST end with links back to the originating source files** (see "Link Path Format" above for path rules):

```markdown
**Source references**
- [cli.ts](/src/cli.ts#L1-L50)
- [index.ts](/src/index.ts#L20-L80)

**Diagram data sources**
- [core/analyzeProject.ts](/src/core/analyzeProject.ts#L1-L100)
```

### 🔴 MANDATORY: Source Attribution for Code Block Excerpts

Any code block that is a direct excerpt from a source file (function body, class definition, type definition, import/export statement) MUST carry a source attribution line immediately **above** the code block. This applies to `.ts`, `.js`, `.py`, `.go`, `.rs`, `.java`, and other language source files.

> **⚠️ CRITICAL**: The attribution line MUST be placed **outside** the code fence (above the opening ```), using plain text format **without any language-specific comment syntax** (no `//`, `#`, `/* */`, etc.). The attribution line is plain text, and the Markdown link inside it will be rendered as a clickable link.

**✅ CORRECT format**:

```markdown
[Source: cli.ts](/src/cli.ts#L42-L67)
```typescript
const result = cli.parse(process.argv);
```
```

**❌ WRONG formats (links will NOT be clickable)**:

```markdown
// Wrong: Inside the code block as a comment — the link won't work
```typescript
// Source: [cli.ts](/src/cli.ts#L42-L67)
const result = cli.parse(process.argv);
```

```markdown
// Wrong: Uses comment syntax (//, #, etc.) — renders as code, not text
// [Source: cli.ts](/src/cli.ts#L42-L67)
```typescript
const result = cli.parse(process.argv);
```
```

Attribution is **not required** for:

| Content type | Example | Why no attribution |
|---|---|---|
| Usage / call-site examples | `cli.run(['--help'])` | Calling code, not source excerpt |
| Teaching / invented examples | Any code that does not exist in the source | Not in any source file |
| Mermaid / shell / CLI commands | `flowchart TD\n  A --> B` | Not source code |
| Output / runtime results | `// Output: { id: 1 }` | Results, not source |

### 🔴 MANDATORY: Complexity-Scaled Quality Targets

**Quality standards scale with module complexity — not fixed numbers.**

| Module Role | Doc Depth | Code Examples | Diagrams |
|-------------|-----------|---------------|----------|
| core | Comprehensive (use `module.md`) | 5+ | 2+ |
| util / config | Concise (use `module-simple.md`) | 1-2 | 1 |
| test / example | Minimal (use `module-simple.md`) | 1 | optional |

**General rules**: larger source files → longer docs; more exports → more examples; more dependents → more diagrams.

> In incremental mode, these targets are overridden — see [Mode Overrides](#mode-overrides).

### Module Document Sections

Use `module.md` (11 sections) for core modules, `module-simple.md` (6 sections) for util/config/helper modules.

**Full template (`module.md`) — for core modules:**

| # | Section | Content | Lines Target | Diagram |
|---|---------|---------|-------------|---------|
| 1 | **Overview** | Intro + value proposition + architecture role | 2-3 paragraphs | — |
| 2 | **Architecture Position** | Mermaid diagram highlighting module position | — | flowchart TB |
| 3 | **Feature Table** | Features with related APIs | N features | — |
| 4 | **File Structure** | File tree + responsibilities | tree | — |
| 5 | **Core Workflow** | Mermaid flowchart | — | sequenceDiagram |
| 6 | **State Diagram** | ⚡ OPTIONAL — only for stateful modules | OPTIONAL | stateDiagram-v2 |
| 7 | **API Summary** | Overview table + link to api.md (no detailed signatures) | table + link | — |
| 8 | **Usage Examples** | 1-3 examples (first = Quick Start) | 5+ (core) / 1-2 (util) | — |
| 9 | **Best Practices** | Recommended / avoid patterns | recommended/avoid | — |
| 10 | **Design Decisions** | ⚡ OPTIONAL — only for core modules with significant choices | OPTIONAL | — |
| 11 | **Dependencies & Related Docs** | Dependency diagram + cross-links | — | flowchart LR |

**Lightweight template (`module-simple.md`) — for util/config/helper/test modules:**

| # | Section | Content |
|---|---------|---------|
| 1 | **Overview** | 1 paragraph |
| 2 | **API Summary** | Overview table + link to api.md |
| 3 | **Usage Examples** | 1-2 examples |
| 4 | **File Structure** | File tree |
| 5 | **Best Practices** | ⚡ OPTIONAL |
| 6 | **Related Docs** | Cross-links |

**Template selection**: Before generating each module's documentation, run `cd <skill-root> && node scripts/index.cjs analyze-module <module-path> --json` to get structured signals. Use `docScope` as the primary signal — it appears as `"docScope": "core"` in the JSON output:

| `docScope` | Use this template | Lines target | Diagrams |
|---|---|---|---|
| `core` | `module.md` (11-section) | 400+ | 2+ distinct types required |
| `overview` | `overview.md` (5-section) | 80-150 | optional |
| `_index` | `_index.md` only | 30-50 | none |

The `templateRecommendation` and `roleRecommendation` fields are also present in the output and are based on quantifiable metrics but are **overrideable**: your semantic understanding of the module's business role takes precedence.

> Code provides signals. You make the final decision.

### 🔴 Code Examples

Every code example must:

1. **Complete and runnable**: Include import, initialization, invocation, result handling
2. **Cover exported interfaces**: At least 1 example per major exported API
3. **Include comments**: Explain key steps and design intent
4. **Match project language**: Follow language best practices
5. **Tiered examples for core APIs** (minimum 5 examples per core doc): Three levels — basic usage, advanced usage, and error handling — for each major exported function
6. **Sanitized secrets**: NO actual credentials — use placeholders (see "Secret & Credential Sanitization" above)

### Cross-Document Linking
- Every document MUST contain a **"Related Documents"** section at the end
- Module docs should link outward to: architecture position, API reference, dependency graph
- API docs should link back to: parent module, usage examples, type definitions

**Path format rules for "Related Docs" table ("Related Docs" in `module-simple.md` / "Dependencies & Related Docs" in `module.md`)**:
- **Wiki page links**: Use **relative paths** from the current doc's location. E.g., from `modules/badge.md`: `[version]({{ ../api/version.md }})` → resolved to `../api/version.md`
- **Source file references**: Do NOT put source files (`.ts`, `.js`, etc.) in the Related Docs table. Source files belong in **section footers** with absolute paths: `[version.ts](/src/utils/version.ts#L1)`
- **Wrong**: `[version.ts](/wiki/utils/version.md)` — mixes wiki path prefix with source file name
- **Wrong**: `[version.ts](../modules/version.md)` — links to a wiki page, not the source file
- **Correct (source)**: `[version.ts](/src/utils/version.ts#L1)`
- **Correct (wiki page)**: `[API reference](../api/version.md)`

### Facts-First Rule

Before writing any API description, function signature, or export list for a module:

1. Read `.nium-wiki/cache/facts/<module-path-with-slashes-replaced-by-double-underscores>.json`
2. All export names and signatures in the documentation MUST match `exports[]` in the facts file
3. If a symbol is not in `exports[]`, do not document it as a public API. If `exports[]` contains symbols not yet in the document, add them.
4. If the facts file does not exist, run `cd <skill-root> && node scripts/index.cjs analyze-batch <project-root>` before proceeding — this writes facts to `.nium-wiki/cache/facts/`. Do NOT generate documentation without facts.

### Multi-Module Generation Mode

When generating documentation for multiple modules at once using `analyze-batch`:

1. Run `cd <skill-root> && node scripts/index.cjs discover-modules <project-root> --json` to get the full module list
2. Run `cd <skill-root> && node scripts/index.cjs analyze-batch <project-root>` to extract facts for all modules
3. Output one summary table before starting generation:
   - Total modules discovered
   - Modules with `needsReview: true` (list paths and reasons)
   - Estimated documents to generate
4. For modules with `needsReview: true`: pause and list them with their reason (`confidence < 0.3` or `secret detected`). Wait for user confirmation before generating those modules. All other modules proceed automatically.
5. Do NOT output a per-module Exploration Report in Multi-Module Generation Mode — the summary table replaces it.

### Incremental Facts Rule

On patch operations (updating existing documentation after code changes), run this **before Step 1 (Read the baseline) of the Surgical Edit sequence**:

1. Re-read the module's `facts.json` even if the document already exists
2. The facts file is the authoritative source for what the current API looks like
3. The existing document is a starting point for structure, not a source of truth for API signatures

---

## Mode Overrides

> **Applies when**: Running in incremental mode, triggered by the `incremental` pipeline.
> **Priority**: These overrides take precedence over the Quality Gate rules above.
> See [Surgical Edit: Modifying Existing Docs](#surgical-edit-modifying-existing-docs) for the full execution guide.

| Quality Gate Rule | Incremental Mode Behavior |
|---|---|
| core doc ≥ 5 code examples | Add **0–1 example** only when a new API is introduced by the changed source |
| ≥ 2 distinct diagram types | **Do NOT regenerate any diagram** — preserve existing diagrams unchanged |
| Full 11-section `module.md` template | **Patch only the affected section(s)** based on which source files are listed in `triggeredBy` |
| `flowchart LR` for type/module relationships | **Skip** unless the class was modified **and** its source was read |
| API summary must cover all exports | **Only cover exports that changed** |
| core doc ≥ 400 lines | **No minimum** — a 50-line targeted patch is preferable to a 400-line rewrite |
| ≥ 3 source reference links | **Only links related to changed source files** |

---

## Input Classification

Before invoking any CLI commands, parse the user input to determine the execution path:

| InputType | Trigger Phrases | Execution Path |
|-----------|----------------|----------------|
| `FULL` | "generate wiki", "create docs", "rebuild wiki" | Full pipeline — all modules |
| `MODULE_TARGETED` | "generate wiki for X", "update X docs", "upgrade X docs" | Module-level pipeline |
| `MAINTENANCE` | "upgrade wiki", "refresh wiki", "audit docs" | Maintenance pipeline |
| `EXPLORE` | "analyze module X", "explore X" | Read-only analysis, no file writes |

---

## Module-Targeted Generation

> **Applies when**: InputType = `MODULE_TARGETED` (user specifies a specific module).
> **Otherwise**: For `FULL` mode (no module specified, e.g. "generate wiki" / "rebuild wiki"), skip this entire section and follow [Multi-Module Generation Mode](#multi-module-generation-mode) — the summary table there replaces the per-module Exploration Report.

### Step 0 — Path Resolution

Extract the module path from user input:
```
"generate wiki for src/core/analyzeProject"  →  src/core/analyzeProject
"update modules/auth docs"                   →  modules/auth
"explore utils/fileWalker"                   →  src/utils/fileWalker
```

Normalize all paths relative to the project root.

### Step 1 — Pre-flight Check

```bash
cd <skill-root> && node scripts/index.cjs analyze-module <module-path> --json
```

Read the returned `docScope` and `roleRecommendation`:
```
docScope: core      →  module.md (11-section, 400+ lines, 2+ diagrams)
docScope: overview   →  overview.md (5-section, 80-150 lines)
docScope: _index     →  _index.md only
```

Also read the module's facts file (Facts-First Rule):
```
<project-root>/.nium-wiki/cache/facts/<module-path-with-slashes-as-double-underscores>.json
```
If missing, run `cd <skill-root> && node scripts/index.cjs analyze-batch <project-root>` first.

Determine document state:
```
if wiki file already exists for this module:
    →  EXPLORE_THEN_PATCH (surgical edit, preserve existing content)
else:
    →  EXPLORE_THEN_GENERATE (first-time generation)
```

### Step 2 — Code Exploration (Read-Only, No File Writes)

Read the actual source code — do not rely on file names or structure alone:
```
read_file: all source files in the module directory (*.ts/*.js, *.py, *.go, *.rs, *.java, *.cs, *.rb, *.php, etc.)
read_file: entry/index file (index.ts, __init__.py, mod.rs, package-info.java, etc.)
read_file: type/interface definitions if present (types.ts, types.d.ts, interfaces/, etc.)
```

Analyze:
- Function signatures: purpose, parameters, return values, side effects
- Class hierarchies and inheritance
- Data flow paths and state mutations
- Error handling strategies
- Design patterns in use
- 🔴 **Secrets detection**: identify hard-coded credentials, API keys, tokens

### Step 3 — Exploration Report (Output to User, No File Writes)

Display a structured report and **await user confirmation before proceeding**:

```markdown
## Module Exploration Report: <module-name>

**Role**: <roleRecommendation>
**Template**: <module.md / module-simple.md>
**State**: <EXPLORE_THEN_GENERATE / EXPLORE_THEN_PATCH>

### Key Findings
- Exports: N functions, M types
- Dependents: N modules depend on this

### Recommended Sections
(see [Module Document Sections](#module-document-sections) for section list, lines targets, and diagram types)

---
Proceed with generation? [yes / no / customize]
```

**This step is mandatory.** A confirmation gate prevents generating content before understanding the code. Do not skip to Step 4 without presenting this report.

### Step 4 — User Response

| Response | Action |
|----------|--------|
| `yes` | Proceed to Step 5 using the recommended template |
| `no` | Exit — write nothing, report nothing |
| `customize` | Apply user-specified section additions or removals, then proceed |

### Step 5 — Execution

**If `incremental` returns empty** (no code changes detected, but user explicitly specified a module):

```
Skip incremental dependency computation
Use user-specified module path as the sole target
Do NOT treat as surgical patch (no old doc to compare against)
Resume from Step 1 Pre-flight Check, then proceed to generation
```

**If `incremental` returns affected docs**: use the pipeline's `triggeredBy` + `updateStrength` to decide full vs. surgical.

---

## Full Decision Tree

```
User Input
  │
  ├─ "generate wiki" (no module specified)
  │    ├─ .nium-wiki does not exist → init → FULL pipeline (Sections 1–9, + Section 10 if multi-language)
  │    └─ .nium-wiki exists → FULL pipeline (Sections 1–9, + Section 10 if multi-language)
  │         │
  │         ├─ Section 4 runs: build-deps → discover-modules → analyze-batch
  │         │    └─ Follow Multi-Module Generation Mode rules during Section 8 (Content Generation)
  │         │
  │         └─ After Section 4: check project size
  │              ├─ module count > 10 OR source files > 50 OR LOC > 10,000
  │              │    └─ Switch to Progressive Scanning (see "Progressive Scanning for Large Projects")
  │              └─ otherwise → continue full pipeline normally
  │
  ├─ "generate wiki for <module>"
  │    ├─ .nium-wiki does not exist → init → MODULE_TARGETED
  │    └─ .nium-wiki exists
  │         ├─ incremental has changes → affected docs from pipeline
  │         └─ incremental is empty  → use user-specified module as target
  │    → Exploration Report → User confirms → Generate
  │
  ├─ "upgrade <module> docs"
  │    └─ MODULE_TARGETED + force full regeneration
  │
  ├─ "analyze module X"
  │    └─ Run `cd <skill-root> && node scripts/index.cjs analyze-module <module-path> --json` — JSON signals only, no wiki files written
  │
  └─ "refresh / upgrade wiki" (no module)
       └─ MAINTENANCE → audit → regenerate failing docs
```

---

## Workflow

### 1. CLI Commands Quick Reference

> **🔴 Execution context**: Skill CWD is not guaranteed to be the skill root across Coding Agents, so `scripts/index.cjs` cannot be resolved from the default CWD. Every runnable example is written as `cd <skill-root> && node scripts/index.cjs ...` — the Agent MUST `cd` in first, then pass `<project-root>` as an argument.
>
> `<skill-root>` is the directory containing this `SKILL.md` file. Resolve it from this file's absolute path, do not guess from agent-specific conventions.

```bash
# Signatures (paths shown without the `cd <skill-root> &&` prefix for readability)
node scripts/index.cjs init <project-root> --lang <code>              # Initialize .nium-wiki directory (lang: zh/en/ja/ko/fr/de)
node scripts/index.cjs build-deps <project-root>                      # Build import/require dependency graph
node scripts/index.cjs discover-modules <project-root>                # Discover all modules via import graph + directory scan
node scripts/index.cjs analyze-batch <project-root> [--force] [--min-confidence <n>]  # Extract facts for all modules
node scripts/index.cjs analyze-module <module-path> [--json]          # Analyze one module: classify role, recommend template
node scripts/index.cjs incremental <project-root> [--no-commit] [-v]  # Full pipeline: diff → deps → doc-index → affected docs
node scripts/index.cjs diff-index <project-root>                      # Detect file changes (--no-update to skip hash write)
node scripts/index.cjs build-index <project-root>                     # Build source ↔ doc mapping index
node scripts/index.cjs generate-sidebar <wiki-path> [--all]           # Generate sidebar.json for all language directories
node scripts/index.cjs audit-docs <wiki-path> [--verbose|--json|--mermaid-strict|--role <role>]  # Check doc quality
node scripts/index.cjs serve <wiki-path>                              # Start docsify server
```

For detailed usage, see `cd <skill-root> && node scripts/index.cjs --help`

> **⚠️ Path argument convention**: This document uses four distinct path notations — do not confuse them:
>
> | Notation | Meaning |
> |---|---|
> | `<skill-root>` | **The directory containing this `SKILL.md` file.** Always `cd` here before invoking `node scripts/index.cjs ...` so the relative path `scripts/index.cjs` resolves regardless of the Agent's default CWD |
> | `<project-root>` | **Absolute path of the user's current workspace root** — the directory the user is working in (e.g. `/Users/alice/repos/my-app`). Passed as a command argument, NOT as CWD |
> | `<module-path>` | Project-root-relative path to a single module (e.g. `src/core/analyzeProject`). Used only with `analyze-module` |
> | `<wiki-path>` | Path to the `.nium-wiki` directory, usually `<project-root>/.nium-wiki`. Used with `generate-sidebar`, `audit-docs`, `serve`, `i18n` |
>
> The Agent is responsible for substituting every placeholder with a real value before executing. Do NOT
> pass the placeholder string literally, and do NOT pass `.` — `.` would resolve against an unpredictable
> CWD depending on the host Agent.

### 2. Language Detection (MANDATORY)

> **⚠️ CRITICAL: This step must be completed BEFORE any other operation.**

Before running any CLI commands or generating any documentation:

1. Check if `.nium-wiki/config.json` exists
2. **If exists**: Read the `language` field — this is the **primary documentation language** and the **source of truth**
3. **If not exists**: You will set it when running `init --lang <code>` (determine from project's natural language + user conversation language)

> **Rule**: The `language` field in `config.json` is the **only authoritative source** for documentation language.
> Do NOT infer language from source code comments, README, file names, or conversation context.

#### 2.1 Language Conflict Resolution

> **🔴 CRITICAL: Never modify `config.json` directly via file write or text replacement.**
> Use the following procedures instead:

| Scenario | Action |
|----------|--------|
| Config exists, user wants to add a secondary language (e.g. config=`en`, user wants to also generate `zh`) | Run `cd <skill-root> && node scripts/index.cjs init <project-root> --lang zh` — appends `zh` as a secondary language to config |
| User wants to change the primary language (e.g. config=`en`, user wants `zh` as primary) | Run `cd <skill-root> && node scripts/index.cjs init <project-root> --lang zh --force` — overwrites primary language to `zh` |
| User wants to generate docs in a language already in config | No config change needed — run `cd <skill-root> && node scripts/index.cjs incremental <project-root>` directly |

**Why**: Direct file edits to `config.json` bypass the CLI's validation and can corrupt the JSON structure. Always go through the CLI.

### 3. Language Configuration

Read `.nium-wiki/config.json` and extract the `language` setting.
Format is slash-separated: the first language is the **primary language** (e.g. `zh`, `en`, `zh/en`).

- Generate **all primary documentation** in the primary language to `.nium-wiki/wiki/`.
- If secondary languages are configured (e.g. `zh/en` means primary=zh, secondary=en), after primary docs are written, translate all wiki documents into `wiki_{lang}/` directories (e.g. `.nium-wiki/wiki_en/`). See **Section 10** for details.

> **Convention**: `wiki/` = primary language, `wiki_{lang}/` = secondary language. The translated directory must mirror the exact same structure and filenames as `wiki/`.

> **🔴 IMPORTANT: Single-language output only.** Templates contain bilingual headings (e.g. `## Architecture Preview / 架构预览`) for reference purposes only. When generating documentation, output **only** the primary language. Do NOT mix languages or copy the `English / 中文` format into the output.
> - If `language` is `en`: headings should be `## Architecture Preview`, NOT `## Architecture Preview / 架构预览`
> - If `language` is `zh`: headings should be `## 架构预览`, NOT `## Architecture Preview / 架构预览`

### 4. Project Analysis (Deep)

Run the following commands to build the dependency graph, discover modules, and extract facts:

```bash
cd <skill-root> && node scripts/index.cjs build-deps <project-root>
cd <skill-root> && node scripts/index.cjs discover-modules <project-root>
cd <skill-root> && node scripts/index.cjs analyze-batch <project-root>
```

> `build-deps` is auto-triggered by `discover-modules` and `analyze-batch` if `dep-graph.json` is missing — you can skip it if the graph is already up to date.

1. **Identify tech stack**: Check dependency manifests (e.g. package.json, requirements.txt, go.mod, Cargo.toml, pom.xml, etc.)
2. **Find entry points**: Locate main source files (e.g. src/index.ts, main.py, main.go, main.rs, src/main/java/App.java, etc.)
3. **Identify modules**: Use `discover-modules` output — it merges import-graph discovery with directory scan for full coverage
4. **Find existing docs**: README.md, CHANGELOG.md, etc.

### 5. Deep Code Analysis (CRITICAL)

**IMPORTANT**: For every module, read the actual source code — do not rely on file names or directory structure alone:

1. **Read source files**: Open key files with read_file tool
2. **Parse semantics**: Determine what the code does, not merely how it is organized
3. **Capture details**:
   - Function signatures: purpose, parameters, return values, side effects
   - Class hierarchies and inheritance chains
   - Data flow paths and state mutations
   - Error handling strategies
   - Design patterns in use
   - 🔴 **Secrets detection**: Identify hard-coded credentials, API keys, tokens, and sensitive data that need sanitization
4. **Map relationships**: Module dependencies, call graphs, data flow
5. **Flag complexity hotspots**: Functions with deep nesting (> 4 levels), high branching (> 10 conditions), or excessive length (> 100 LOC). Document these in module docs with logic explanations and refactoring suggestions.

### 6. Change Detection

Use the **automated incremental pipeline** to detect changes and compute the precise list of affected docs in one step:

```bash
cd <skill-root> && node scripts/index.cjs incremental <project-root> [--no-commit] [-v]
```

This runs the full pipeline: `diff-index` → `build-deps` → `build-index` → transitive-impact → doc-dep analysis. It outputs:
- Which source files changed (+added, ~modified, -deleted)
- Which wiki docs need regeneration (with reason: source_changed, dep_changed, doc_dep_changed, inferred)
- Which docs will be deleted
- Which docs are preserved (unchanged)

**If wiki doesn't exist yet**: the pipeline automatically falls back to full-generation mode.

> **IMPORTANT**: Always run `incremental` before generating, not `diff-index` alone.
> `diff-index` only detects source changes — it does NOT map them to wiki docs.
> After `incremental` completes, always check i18n sync status (see **Section 10**) before declaring the update done.

### 7. Target Docs (resolved by the pipeline above)

The `incremental` command in Section 6 already resolves this. Each affected doc includes:
- `docPath`: relative wiki path (e.g. `modules/core/source-index.md`)
- `reason`: why it needs updating
- `triggeredBy`: source files that triggered the update

Manual fallback (if pipeline not available): Read `.nium-wiki/cache/doc-index.json` → `sourceToDoc` field. If a changed source file has no entry, infer by naming convention: `src/fooBar.ts` → `modules/foo-bar.md`, and nested paths: `src/core/analyzeProject.ts` → `modules/core/analyze-project.md`.

### 8. Content Generation

> **🔴 Language**: use `language` from `.nium-wiki/config.json` — see Section 3. Do NOT infer from source code or conversation.

Generate content adhering to the **quality gate** defined above:

#### 8.1 Template Selection Rules

Read the named template file from `templates/` before writing each doc. Not all templates are needed for every project — apply these rules:

| Doc | Template file | When to generate | Notes |
|---|---|---|---|
| `index.md` | `templates/index.md` | always | — |
| `architecture.md` | `templates/architecture.md` | always | — |
| `modules/<name>.md` | `templates/module.md` (core) or `templates/module-simple.md` (util/config/helper/test) | always (choose by `docScope`) | Module docs only contain an API overview table + link. Detailed signatures and type definitions belong exclusively in `api.md`. |
| `<domain>/_index.md` | `templates/_index.md` | one per domain directory under `wiki/` | Short overview + architecture diagram + sub-module table. No detailed API docs. |
| `getting-started.md` | `templates/getting-started.md` | project has install steps OR is a library/framework | — |
| `api/<name>.md` | `templates/api.md` | project exports programmatic APIs (functions/classes/types) | Single source of truth for all API signatures/types. Mark `@deprecated` with migration guidance. Include parameter constraints where applicable (e.g. "must not be empty", "range 0-100"). |
| `doc-map.md` | `templates/doc-map.md` | module count >= 5 | — |

#### 8.2 Source Links

Attach navigable source links next to documented symbols:

```markdown
### `functionName` [📄](/src/file.ts#L42)
```

### 9. Save

- Write wiki files to `.nium-wiki/wiki/`
- Sanitize link paths and build indexes **after** wiki files are written:

```bash
cd <skill-root> && node scripts/index.cjs sanitize-links <project-root>
cd <skill-root> && node scripts/index.cjs build-index <project-root>
cd <skill-root> && node scripts/index.cjs diff-index <project-root>  # --no-update to skip hash write
```

> `sanitize-links` scans all wiki `.md` files and converts any `file://` absolute paths to project-root-relative paths. **MUST** run before `build-index`.
> `build-index` scans source path links in wiki files to build `cache/doc-index.json` (source ↔ doc mapping for incremental updates).
> `diff-index` (without `--no-update`) is called last so the hash snapshot reflects the final state.

- Refresh `meta.json` timestamp
- 🔴 **MANDATORY** — Generate sidebar:

```bash
cd <skill-root> && node scripts/index.cjs generate-sidebar <wiki-path> --all
```

> This generates `sidebar.json` for all language directories. It is **idempotent** — if `sidebar.json` already exists it will be skipped. If a legacy `_sidebar.md` exists it will be migrated automatically. **This step is mandatory after every wiki generation** — the preview server and all modern tooling depend on `sidebar.json`. Do NOT skip it.

### 10. Multi-language Translation

> **Applies to both full generation and incremental updates.** Every time `wiki/` is modified, secondary language files in `wiki_{lang}/` that correspond to changed docs must be kept in sync — do not leave them stale.
>
> **Skip this step if `language` contains only one language.**

#### 10.1 Build Translation Task List

Run `cd <skill-root> && node scripts/index.cjs i18n status <wiki-path>` to get the sync report. Extract every file marked `Missing` or `Outdated` into an explicit checklist (e.g. `❌ [Missing] index.md`, `⚠️ [Outdated] architecture.md`).

**You MUST translate every file in this list — no exceptions, no skipping.**

> **Incremental mode**: If this is a partial update (incremental pipeline detected changes), only translate files that are `Outdated` or `Missing` — do NOT re-translate all `Synced` files.
> **Full generation mode**: Translate all `Missing` files (`Outdated` may not exist yet since memory has not been populated).**

#### 10.2 Translate Files One by One

**🔴 MANDATORY: Process EVERY file in the checklist sequentially.**

For each file:
1. Read the primary wiki file from `wiki/`
2. Translate content to the target language
3. Write to `wiki_{lang}/` with **identical path and filename** (e.g. `wiki/core/auth.md` → `wiki_en/core/auth.md`)
4. **Preserve unchanged**: all Mermaid diagrams, code blocks (EXCEPT sanitize any secrets/credentials if found), source path links, and markdown structure
   - **Secret sanitization exception**: If code blocks contain secrets/credentials, sanitize them using the rules from the "Secret & Credential Sanitization" section

After each file, report progress: `✅ [3/17] wiki_en/core/_index.md`

> **Batching rule**: If the file count exceeds 10, translate in batches of 5. After each batch, report progress and continue immediately — do NOT stop or ask the user unless you hit a context limit. If you must stop, clearly list the remaining untranslated files so the user can say "continue" to resume.

#### 10.3 Finalize

After ALL files are translated:
```bash
cd <skill-root> && node scripts/index.cjs i18n sync-memory <wiki-path>
```

Run `cd <skill-root> && node scripts/index.cjs i18n status <wiki-path>` again to verify all files show as `Synced`. If any files are still `Missing` or `Outdated`, go back and translate them.

**Delete rule**: When deleting any file from `wiki/` (e.g. because the source file was deleted), you **MUST** also delete the corresponding file from ALL `wiki_{lang}/` directories.

---

## Surgical Edit: Modifying Existing Docs

> **Applies when**: Updating 1-3 existing wiki documents (incremental pipeline result), not full generation.
>
> When an existing doc already exists, your goal is to **patch the minimum surface area**, not regenerate the full file. Every line you leave untouched is a line that does not need to be reviewed, diffed, or reverted.

### 🔴 Quality Gate Disabled During Incremental Updates

> **⚠️ CRITICAL**: When running in incremental mode (triggered by `incremental` pipeline), the
> **global Quality Gate rules above do NOT apply** to existing docs being surgically patched.
> Applying those rules blindly is the primary cause of oversized diffs and unnecessary rewrites.

**See [Mode Overrides](#mode-overrides) for the full table of Quality Gate rule overrides in incremental mode.**

**`updateStrength` from the `incremental` pipeline controls patch depth:**

| `updateStrength` | Meaning | Action |
|-----------------|---------|--------|
| `full` | Function signature changed OR module role changed | Full regeneration of this doc |
| `incremental` | Transitive/dep/doc-dep propagation | **Surgical patch only** — no quality gate, no template |

> **Rule**: If the pipeline says `updateStrength: incremental` for a doc, treat it as a targeted
> patch — update only the section that mentions the triggering source, leave everything else untouched.

### Mandatory Steps (Execute in Order)

**Never start from the template when updating an existing doc.**

**Step 1 — Read the baseline**
- read_file: the existing wiki doc (read-only, this is what you are preserving)
- read_file: all source files that triggered the update (from `incremental` output)

**Step 2 — Evaluate match degree**
Cross-read the existing doc against the changed source files. Answer:
- Which sections of the existing doc directly correspond to the changed code?
- Which sections are completely unaffected?
- What is your overall match degree?

**Step 3 — Decide strategy by match degree**

| Match degree | Signals | Action |
|---|---|---|
| **≥ 80%** | Internal change only (comment, variable rename, refactor); function signatures unchanged; core topics not touched | **Default: PRESERVE** — update version footer only, do not touch the body. If no version footer exists, create one (a single line). |
| **40–80%** | One function's behavior changed; new export added; file structure changed | Patch only the affected sections — leave everything else untouched |
| **< 40%** | Function renamed or signature changed; module role changed; multiple sections invalidated | Full regeneration of this document |

**Step 4 — Write the patched doc**
- Output MUST be a minimal diff from the original — significantly smaller than a full regeneration
- Do not use the module template as the starting point for an existing doc

**Step 5 — Self-verify**
Before finalizing, mentally check: does the new file differ from the original in anything beyond the source-change-affected sections, newly-added sections, and now-incorrect sections? If yes, you are rewriting too much — restore the preserved sections.

### Principle 1 — Preservation Priority

Unless the source has actually changed, the following MUST be preserved exactly as-is:

| Content type | When to update |
|---|---|
| Accurate description paragraphs | Never (unless source logic changed) |
| Correct code examples | Never (unless the code itself changed) |
| Mermaid diagrams | Never (unless the underlying flow/calls changed) |
| File structure tree | Only when files were added/removed |
| API summary table | Only when function signatures changed |
| Best practices section | Never (unless the module logic changed) |
| Cross-links | Only when linked docs were moved/renamed |

### Principle 2 — Change Scope Isolation

Before editing, write down the minimum scope:

```
Change type → Minimum doc impact

1. Function logic changed (signature unchanged)
   → Update only that function's description paragraph
   → Code example only if the behavior changed in a user-visible way (callers must change)
   → If change only affects internal call chains, not external callers: update version footer only
   → Do NOT rewrite other functions' descriptions

2. New exported function added
   → Append one row to the API summary table
   → Add one usage example (optional)
   → Do NOT rewrite existing examples

3. File added/removed
   → Update the File Structure tree
   → Do NOT regenerate Architecture Position diagram (unless the module's position actually changed)

4. Bug fix (doc described old/wrong behavior)
   → Fix only the affected paragraph
   → Do NOT restructure the entire section
```

### Principle 3 — When in Doubt, Don't Touch

> **🔴 PRESERVE is the default at ≥ 80% match.** If a paragraph is accurate (correctly describes the code) and not outdated (code hasn't changed in a way that contradicts it), leave it alone. Rewriting for style, phrasing, or "cleaner" expression is always wrong — a smaller diff beats a prettier paragraph. The burden of proof is on rewriting, not on preserving.

### Bug-Level Violations (Anti-Patterns + Hard Rules)

Treat the following as bugs, not stylistic choices:

| Violation | Why it's wrong |
|---|---|
| Starting from the module template when patching an existing doc | Creates massive diff for no reason; contradicts "read the baseline first" |
| Full regeneration when function signature is unchanged | Internal implementation change ≠ doc invalidation |
| Rewriting a paragraph that remains accurate | Accurate = leave alone; "improving" wording yields diff noise |
| Rewriting code examples whose code has not changed | Even correct examples get rephrased |
| Regenerating a Mermaid diagram whose source has not changed | Diagram was fine before |
| Reordering sections | Changes diff noise, no factual benefit |
| Rephrasing the file structure tree | Only update when structure changed |
| Writing to an existing doc without reading it first | You can't preserve what you haven't read |

---

## Output Structure

### 🔴 MANDATORY: Domain-Based Directory Hierarchy (No Flat Layout!)

**Organize by business domain, not flat modules/ directory.**

> **Directory naming rule**: All wiki directory names MUST use **lowercase + hyphens** (kebab-case), e.g. `core/`, `language-handlers/`, `utils/`. Never use PascalCase or camelCase.

```
.nium-wiki/
├── config.json
├── meta.json
├── cache/
├── wiki/                              # Primary language docs
│   ├── index.md                    # Project homepage
│   ├── architecture.md             # System architecture
│   ├── getting-started.md          # Quick start
│   ├── doc-map.md                  # Document relationship map
│   │
│   ├── <Domain-1>/                 # Business domain 1
│   │   ├── _index.md              # Domain overview
│   │   ├── <Sub-domain>/          # Sub-domain
│   │   │   ├── _index.md
│   │   │   └── <module>.md        # 400+ lines
│   │   └── ...
│   │
│   ├── <Domain-2>/                 # Business domain 2
│   │   └── ...
│   │
│   └── api/                        # API reference
├── wiki_en/                           # Secondary language (if configured)
│   ├── index.md                    # Same structure as wiki/
│   ├── architecture.md
│   └── ...
```

### Automatic Domain Discovery

Infer business domains from the project's directory structure, package boundaries, and import graph. Group modules that share a cohesive responsibility into the same domain directory. Each domain MUST contain:

| File | Description |
|------|-------------|
| `_index.md` | Domain overview, architecture diagram, sub-module list |
| Sub-domain dirs | Related modules grouped by function |
| Each document | **Depth scales with module role — see [Complexity-Scaled Quality Targets](#-mandatory-complexity-scaled-quality-targets)** |

---

## Progressive Scanning for Large Projects

When module count > 10, source files > 50, or LOC > 10,000, switch to Progressive Scanning:

1. **Prioritize modules** — entry points (weight 5) > dependents (4) > has docs (3) > code size (2) > recently modified (1)
2. **Generate 1-2 modules per batch** — depth scales with complexity
3. **Track progress** in `cache/progress.json` — record completed/pending modules and current batch number
4. **After each batch** — run `cd <skill-root> && node scripts/index.cjs audit-docs <wiki-path> --verbose --mermaid-strict`, report results to user, then prompt:
   - `"continue"` — next batch
   - `"audit docs"` — re-run validation
   - `"regenerate <module>"` — redo a specific module
   - If `--mermaid-strict` reports errors: **fix them before continuing** — Mermaid syntax errors degrade the diagram catalog silently and accumulate technical debt.
5. **Resume** — when user says "continue wiki generation", read `cache/progress.json` and pick up where you left off

---

## Documentation Upgrade & Maintenance

When existing wiki docs are outdated or below quality gate, use one of these strategies:

| Strategy | When to Use | User Command |
|----------|-------------|--------------|
| `full_refresh` | Large version gap or poor overall quality | "refresh all wiki" |
| `incremental_upgrade` | Many modules, want to keep existing content | "upgrade wiki" |
| `targeted_upgrade` | Only specific modules need attention | "upgrade \<module\> docs" |

Execution: scan existing docs with `cd <skill-root> && node scripts/index.cjs audit-docs <wiki-path> --mermaid-strict`, generate an upgrade report, then re-generate failing docs batch by batch. **Always include `--mermaid-strict`** so that Mermaid syntax errors block the upgrade and prevent bad diagrams from entering the wiki.

**Version footer** — append to every generated document:
`*Generated by [Nium-Wiki v{{ NIUM_WIKI_VERSION }}](https://github.com/niuma996/nium-wiki) | {{ GENERATED_AT }}*`

---

## Finalization Checklist (MANDATORY — Run After Every Generation)

> **Applies after every wiki generation**: full pipeline, module-targeted, incremental, or surgical patch.
> This checklist is the **last step of every execution path**. Do not skip any item.

- [ ] `cd <skill-root> && node scripts/index.cjs generate-sidebar <wiki-path> --all`
  → Generates `sidebar.json` for all language directories. Idempotent — safe to run multiple times.
  → Migrates legacy `_sidebar.md` to `sidebar.json` automatically if encountered.
  → **⚠️ Do NOT skip**: the preview server and modern tooling depend on `sidebar.json`.

- [ ] `cd <skill-root> && node scripts/index.cjs i18n sync-memory <wiki-path>` (if multi-language)
  → Updates translation memory so subsequent runs show accurate sync status.

- [ ] `cd <skill-root> && node scripts/index.cjs audit-docs <wiki-path> --mermaid-strict` (full generation only)
  → Validates all Mermaid diagrams. Mermaid errors block the run — fix them before declaring done.

> **Rule**: These finalization steps must run **after** all wiki content is written and **after** all translation files are updated. They are not optional cleanup — they are part of the generation contract.
(read version from `scripts/version.json` — `version` field)
