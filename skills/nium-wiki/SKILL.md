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
> this file is a hard requirement violation and causes **silent render failures**.

**Core principle**: IDs = English alphanumeric | Labels = unquoted | Special chars = HTML entities

| # | Rule | Wrong ❌ | Correct ✅ |
|---|------|----------|------------|
| 1 | Plain labels need no quotes | `A["CLI"]` | `A[CLI]` |
| 2 | IDs must be `[a-zA-Z0-9_]` only | `Core.1[Core]` | `Core_1[Core]` |
| 3 | subgraph IDs must be English | `subgraph 核心层[...]` | `subgraph Core[...]` |
| 4 | subgraph ID must not collide with node ID | `subgraph CLI[...]\nCLI[...]` | `subgraph CL[...]\nCLI[...]` |
| 5 | Inner quotes use `&quot;` | `A[Config "x" val]` | `A[Config &quot;x&quot; val]` |
| 6 | sequenceDiagram participants alphanumeric | `participant User.1` | `participant User_1` |
| 7 | Avoid Mermaid reserved words as IDs | `class[class]` | `NodeClass[class]` |

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

Any code block that is a direct excerpt from a source file (function body, class definition, type definition, import/export statement) MUST carry a source attribution comment immediately above the block. This applies to `.ts`, `.js`, `.py`, `.go`, `.rs`, `.java`, and other language source files.

```markdown
// Source: [cli.ts](/src/cli.ts#L42-L67)
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

The attribution comment is a markdown HTML comment (`<!-- -->`) so it does not render in the output wiki. It is a metadata signal for readers and for the `build-index` pipeline.

### 🔴 MANDATORY: Complexity-Scaled Quality Targets

**Quality standards scale with module complexity — not fixed numbers.**

| Module Role | Doc Depth | Code Examples | Diagrams |
|-------------|-----------|---------------|----------|
| core | Comprehensive (use `module.md`) | 5+ | 2+ |
| util / config | Concise (use `module-simple.md`) | 1-2 | 1 |
| test / example | Minimal (use `module-simple.md`) | 1 | optional |

**General rules**: larger source files → longer docs; more exports → more examples; more dependents → more diagrams.

#### Context Adaptation

| Project Type | Focus Areas |
|-------------|-------------|
| **frontend** | Component Props, state management, UI interaction |
| **backend** | API endpoints, data models, middleware |
| **fullstack** | Frontend-backend interaction, data flow, deployment |
| **library** | API docs, type definitions, compatibility |
| **cli** | Command arguments, config files, usage |

| Language | Example Style |
|----------|--------------|
| **TypeScript** | Type annotations, generics, interfaces |
| **Python** | Docstrings, type hints, decorators |
| **Go** | Error handling, concurrency, interfaces |
| **Rust** | Ownership, lifetimes, error handling |

### Module Document Sections

Use `module.md` (11 sections) for core modules, `module-simple.md` (6 sections) for util/config/helper modules.

**Full template (`module.md`) — for core modules:**

| # | Section | Content |
|---|---------|---------|
| 1 | **Overview** | Intro + value proposition + architecture role (2-3 paragraphs) |
| 2 | **Architecture Position** | Mermaid diagram highlighting module position |
| 3 | **Feature Table** | Features with related APIs |
| 4 | **File Structure** | File tree + responsibilities |
| 5 | **Core Workflow** | Mermaid flowchart |
| 6 | **State Diagram** | ⚡ OPTIONAL — only for stateful modules |
| 7 | **API Summary** | Overview table + link to api.md (no detailed signatures) |
| 8 | **Usage Examples** | 1-3 examples (first = Quick Start) |
| 9 | **Best Practices** | Recommended / avoid patterns |
| 10 | **Design Decisions** | ⚡ OPTIONAL — only for core modules with significant choices |
| 11 | **Dependencies & Related Docs** | Dependency diagram + cross-links |

**Lightweight template (`module-simple.md`) — for util/config/helper/test modules:**

| # | Section | Content |
|---|---------|---------|
| 1 | **Overview** | 1 paragraph |
| 2 | **API Summary** | Overview table + link to api.md |
| 3 | **Usage Examples** | 1-2 examples |
| 4 | **File Structure** | File tree |
| 5 | **Best Practices** | ⚡ OPTIONAL |
| 6 | **Related Docs** | Cross-links |

**Template selection**: Before generating each module's documentation, run `nium-wiki analyze-module <module-path>` (or `--batch` for all modules) to get structured signals. Use `docScope` as the primary signal:

| `docScope` | Use this template | Lines target | Diagrams |
|---|---|---|---|
| `core` | `module.md` (11-section) | 400+ | 2+ distinct types required |
| `overview` | `overview.md` (5-section) | 80-150 | optional |
| `_index` | `_index.md` only | 30-50 | none |

The `templateRecommendation` and `roleRecommendation` are based on quantifiable metrics but are **overrideable**: your semantic understanding of the module's business role takes precedence.

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

---

## Mode Overrides

> **Applies when**: Running in incremental mode, triggered by the `incremental` pipeline.
> **Priority**: These overrides take precedence over the Quality Gate rules above.
> See [Surgical Edit: Modifying Existing Docs](#surgical-edit-modifying-existing-docs) for the full execution guide.

| Quality Gate Rule | Incremental Mode Behavior |
|---|---|
| core doc ≥ 5 code examples | Add **0–1 example** only when a new API is introduced by the changed source |
| ≥ 2 distinct diagram types | **Do NOT regenerate any diagram** — preserve existing diagrams unchanged |
| Full 11-section `module.md` template | **Patch only the affected section(s)** listed in `triggeredBy` |
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
(cd skills/nium-wiki/scripts && node index.js analyze-module <path> [--json])
```

Read the returned `docScope` and `roleRecommendation`:
```
docScope: core      →  module.md (11-section, 400+ lines, 2+ diagrams)
docScope: overview   →  overview.md (5-section, 80-150 lines)
docScope: _index     →  _index.md only
```

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
read_file: all *.ts/*.js source files in the module directory
read_file: index.ts / index.js (main exports)
read_file: types.ts / types.d.ts (type definitions, if present)
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
- LOC: ~X (estimated)
- Dependents: N modules depend on this

### Recommended Sections
| # | Section | Lines Target | Diagram |
|---|---------|-------------|---------|
| 1 | Overview | 2-3 paragraphs | — |
| 2 | Architecture Position | — | flowchart TB |
| 3 | Feature Table | N features | — |
| 4 | File Structure | tree | — |
| 5 | Core Workflow | — | sequenceDiagram |
| 6 | State Diagram | OPTIONAL | stateDiagram-v2 |
| 7 | API Summary | table + link | — |
| 8 | Usage Examples | 5+ (core) / 1-2 (util) | — |
| 9 | Best Practices | recommended/avoid | — |
| 10 | Design Decisions | OPTIONAL | — |
| 11 | Dependencies | — | flowchart LR |

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

## Explore Mode

> **Applies when**: InputType = `EXPLORE` — user only wants to understand the code, no documentation generated.

```bash
(cd skills/nium-wiki/scripts && node index.js analyze-module <path> [--json])
```

Output: JSON format structured analysis. Display to user. **Do not write any wiki files.**

---

## Full Decision Tree

```
User Input
  │
  ├─ "generate wiki" (no module specified)
  │    └─ FULL pipeline → Section 1–12
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
  │    └─ EXPLORE mode → JSON output, no file writes
  │
  └─ "refresh / upgrade wiki" (no module)
       └─ MAINTENANCE → audit → regenerate failing docs
```

---

## Workflow

### 1. CLI Commands Quick Reference

```bash
(cd skills/nium-wiki/scripts && node index.js init [path] --lang <code>)  # Initialize .nium-wiki directory (lang: zh/en/ja/ko/fr/de)
(cd skills/nium-wiki/scripts && node index.js analyze [path])           # Analyze project structure
(cd skills/nium-wiki/scripts && node index.js analyze-module <path> [--batch|--json])  # Analyze module: classify role, recommend template
(cd skills/nium-wiki/scripts && node index.js incremental [path])      # Run incremental pipeline: diff + deps + doc-index → affected docs
(cd skills/nium-wiki/scripts && node index.js diff-index [path])        # Detect file changes (--no-update to skip hash write)
(cd skills/nium-wiki/scripts && node index.js build-index [path])       # Build source ↔ doc mapping index
(cd skills/nium-wiki/scripts && node index.js build-deps [path])        # Build import/require dependency graph
(cd skills/nium-wiki/scripts && node index.js audit-docs <dir> [--verbose|--json|--mermaid-strict|--role <role>])  # Check doc quality
(cd skills/nium-wiki/scripts && node index.js serve [wiki-path])        # Start docsify server
```

For detailed usage, see `node skills/nium-wiki/scripts/index.js --help`

### 2. Language Detection (MANDATORY)

> **⚠️ CRITICAL: This step must be completed BEFORE any other operation.**

Before running any CLI commands or generating any documentation:

1. Check if `.nium-wiki/config.json` exists
2. **If exists**: Read the `language` field — this is the **primary documentation language** and the **source of truth**
3. **If not exists**: You will set it when running `init --lang <code>` (determine from project's natural language + user conversation language)

> **Rule**: The `language` field in `config.json` is the **only authoritative source** for documentation language.
> Do NOT infer language from source code comments, README, file names, or conversation context.

### 3. Initialization Check

Check if `.nium-wiki/` exists:
- **Not exists**: Run `(cd skills/nium-wiki/scripts && node index.js init --lang <code>)` to create directory structure.
  Determine `<code>` by examining the project's natural language (README, code comments, docs) and the language the user is communicating in. Use `en` if unclear.
- **Exists**: Read `config.json` and cache, perform incremental update

### 4. Language Configuration

Read `.nium-wiki/config.json` and extract the `language` setting.
Format is slash-separated: the first language is the **primary language** (e.g. `zh`, `en`, `zh/en`).

- Generate **all primary documentation** in the primary language to `.nium-wiki/wiki/`.
- If secondary languages are configured (e.g. `zh/en` means primary=zh, secondary=en), after primary docs are written, translate all wiki documents into `wiki_{lang}/` directories (e.g. `.nium-wiki/wiki_en/`). See **Step 12** for details.

> **Convention**: `wiki/` = primary language, `wiki_{lang}/` = secondary language. The translated directory must mirror the exact same structure and filenames as `wiki/`.

> **🔴 IMPORTANT: Single-language output only.** Templates contain bilingual headings (e.g. `## Architecture Preview / 架构预览`) for reference purposes only. When generating documentation, output **only** the primary language. Do NOT mix languages or copy the `English / 中文` format into the output.
> - If `language` is `en`: headings should be `## Architecture Preview`, NOT `## Architecture Preview / 架构预览`
> - If `language` is `zh`: headings should be `## 架构预览`, NOT `## Architecture Preview / 架构预览`

### 5. Project Analysis (Deep)

Run `(cd skills/nium-wiki/scripts && node index.js analyze [path])` or analyze manually:

1. **Identify tech stack**: Check dependency manifests (e.g. package.json, requirements.txt, go.mod, Cargo.toml, pom.xml, etc.)
2. **Find entry points**: Locate main source files (e.g. src/index.ts, main.py, main.go, main.rs, src/main/java/App.java, etc.)
3. **Identify modules**: Scan src/ directory structure
4. **Find existing docs**: README.md, CHANGELOG.md, etc.

Save structure to `cache/structure.json`.

### 6. Deep Code Analysis (CRITICAL)

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

### 7. Change Detection

Use the **automated incremental pipeline** to detect changes and compute the precise list of affected docs in one step:

```bash
(cd skills/nium-wiki/scripts && node index.js incremental [--no-commit] [-v])
```

This runs the full pipeline: `diff-index` → `build-deps` → `build-index` → transitive-impact → doc-dep analysis. It outputs:
- Which source files changed (+added, ~modified, -deleted)
- Which wiki docs need regeneration (with reason: source_changed, dep_changed, doc_dep_changed, inferred)
- Which docs will be deleted
- Which docs are preserved (unchanged)

**If wiki doesn't exist yet**: the pipeline automatically falls back to full-generation mode.

> **IMPORTANT**: Always run `incremental` before generating, not `diff-index` alone.
> `diff-index` only detects source changes — it does NOT map them to wiki docs.
> After `incremental` completes, always check i18n sync status (Step 8 "After saving, sync secondary languages") before declaring the update done.

### 8. Target Docs (resolved by the pipeline above)

The `incremental` command in Step 5 already resolves this. Each affected doc includes:
- `docPath`: relative wiki path (e.g. `modules/core/source-index.md`)
- `reason`: why it needs updating
- `triggeredBy`: source files that triggered the update

Manual fallback (if pipeline not available): Read `.nium-wiki/cache/doc-index.json` → `sourceToDoc` field. If a changed source file has no entry, infer by naming convention: `src/fooBar.ts` → `modules/foo-bar.md`, and nested paths: `src/core/analyzeProject.ts` → `modules/core/analyze-project.md`.

### 9. Content Generation (Enterprise Quality)

> **🔴 MANDATORY: Language from config.json**
>
> Before generating ANY documentation content, you MUST read `.nium-wiki/config.json` and extract the `language` field.
> Use this language for **ALL** documentation in `wiki/` — do NOT infer language from source code comments, README, or user conversation.
> See **Step 4** for supported language codes and output conventions.
>
> **Wrong**: "Source code is in English, so I'll generate English docs"
> **Correct**: "config.json says `language: "zh"`, so I generate Chinese docs"

Generate content adhering to the **quality gate** defined above:

#### 10.1 Template Selection Rules

Not all templates are needed for every project. Apply these rules:

| Template | When to Generate |
|----------|-----------------|
| `index.md` | always |
| `architecture.md` | always |
| `module.md` / `module-simple.md` | always (choose by module role) |
| `getting-started.md` | project has install steps OR is a library/framework |
| `api.md` | project exports programmatic APIs (functions/classes/types) |
| `doc-map.md` | module count >= 5 |

#### 10.2 Homepage (`index.md`)
**Template**: Read `templates/index.md` for full structure.

#### 10.3 Architecture Doc (`architecture.md`)
**Template**: Read `templates/architecture.md` for full structure.

#### 10.4 Module Docs (`modules/<name>.md`)
**Templates**: Read `templates/module.md` (core) or `templates/module-simple.md` (util/config/helper/test).
- **Key rule**: Detailed API signatures and type definitions belong exclusively in api.md. Module docs only contain an API overview table with a link.

#### 10.5 API Docs (`api/<name>.md`)
**Template**: Read `templates/api.md` for full structure.
- Single source of truth for all API signatures and type definitions.
- Mark `@deprecated` APIs with migration guidance (what to use instead).
- Include parameter constraints where applicable (e.g. "must not be empty", "range 0-100").

#### 10.6 Getting Started (`getting-started.md`)
**Template**: Read `templates/getting-started.md` for full structure.

#### 10.7 Doc Map (`doc-map.md`)
**Template**: Read `templates/doc-map.md` for full structure.

### 10. Source Code Links

Attach navigable source links next to documented symbols:
```markdown
### `functionName` [📄](/src/file.ts#L42)
```

### 11. Save

- Write wiki files to `.nium-wiki/wiki/`
- Sanitize link paths and build indexes **after** wiki files are written:

```bash
(cd skills/nium-wiki/scripts && node index.js sanitize-links)
(cd skills/nium-wiki/scripts && node index.js build-index)
(cd skills/nium-wiki/scripts && node index.js build-deps)
(cd skills/nium-wiki/scripts && node index.js diff-index)
```

> `sanitize-links` scans all wiki `.md` files and converts any `file://` absolute paths to project-root-relative paths. **MUST** run before `build-index`.
> `build-index` scans source path links in wiki files to build `cache/doc-index.json` (source ↔ doc mapping for incremental updates).
> `build-deps` parses import/require statements to build `cache/dep-graph.json` (dependency graph for impact analysis).
> `diff-index` (without `--no-update`) is called last so the hash snapshot reflects the final state.

- Refresh `meta.json` timestamp

### 12. Multi-language Translation

> **Applies to both full generation and incremental updates.** Every time `wiki/` is modified, secondary language files in `wiki_{lang}/` that correspond to changed docs must be kept in sync — do not leave them stale.
>
> **Skip this step if `language` contains only one language.**

#### 12.1 Build Translation Task List

Run `(cd skills/nium-wiki/scripts && node index.js i18n status)` to get the sync report. Extract every file marked `Missing` or `Outdated` into an explicit checklist (e.g. `❌ [Missing] index.md`, `⚠️ [Outdated] architecture.md`).

**You MUST translate every file in this list — no exceptions, no skipping.**

> **Incremental mode**: If this is a partial update (incremental pipeline detected changes), only translate files that are `Outdated` or `Missing` — do NOT re-translate all `Synced` files.
> **Full generation mode**: Translate all `Missing` files (`Outdated` may not exist yet since memory has not been populated).**

#### 12.2 Translate Files One by One

**🔴 MANDATORY: Process EVERY file in the checklist sequentially.**

For each file:
1. Read the primary wiki file from `wiki/`
2. Translate content to the target language
3. Write to `wiki_{lang}/` with **identical path and filename** (e.g. `wiki/core/auth.md` → `wiki_en/core/auth.md`)
4. **Preserve unchanged**: all Mermaid diagrams, code blocks (EXCEPT sanitize any secrets/credentials if found), source path links, and markdown structure
   - **Secret sanitization exception**: If code blocks contain secrets/credentials, sanitize them using the rules from the "Secret & Credential Sanitization" section

After each file, report progress: `✅ [3/17] wiki_en/core/_index.md`

> **Batching rule**: If the file count exceeds 10, translate in batches of 5. After each batch, report progress and continue immediately — do NOT stop or ask the user unless you hit a context limit. If you must stop, clearly list the remaining untranslated files so the user can say "continue" to resume.

#### 12.3 Finalize

After ALL files are translated:
```bash
(cd skills/nium-wiki/scripts && node index.js i18n sync-memory)
```

Run `(cd skills/nium-wiki/scripts && node index.js i18n status)` again to verify all files show as `Synced`. If any files are still `Missing` or `Outdated`, go back and translate them.

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
| `full` | Source directly changed (function body, signature, etc.) | Regenerate this doc fully, apply quality gate |
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
| **≥ 80%** | Internal change only (comment, variable rename, refactor); function signatures unchanged; core topics not touched | Update version footer only — do not touch the body |
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
   → Code example only if the behavior changed
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

### Principle 3 — Match Degree Evaluation Guide

When evaluating match degree, use these concrete signals:

**High match (≥ 80%) — signals:**
- Changed code is internal implementation detail (comment, variable rename, refactor)
- Doc describes concepts/topics that the change does not touch
- Function signature unchanged; only body logic shifted

**Medium match (40–80%) — signals:**
- Changed code affects one function's behavior → that function's section needs update
- New export added → append to API table, leave other sections intact
- File added/removed → update file structure tree only

**Low match (< 40%) — signals:**
- Function renamed or signature changed → rewrite that function's section
- Module role changed (e.g. core → utility) → full regeneration needed
- Multiple sections invalidated → regenerate the whole doc

### Principle 4 — When in Doubt, Don't Touch

A common failure mode is rewriting a correct paragraph "for better wording" — this creates a large diff with no factual improvement.

Rule:

> **If the existing description is accurate and not outdated, preserve it exactly.**
> "Accurate" means: correctly describes what the code does.
> "Not outdated" means: the code has not changed in a way that contradicts the description.
>
> Do not rewrite for stylistic preference, different phrasing, or "cleaner" expression.

If the description is merely "not ideal" but still correct, leave it alone. A smaller diff is always better than a prettier paragraph.

### Anti-Patterns (What Not to Do)

| Anti-pattern | Why it's wrong |
|---|---|
| Regenerate full file from template | Creates massive diff for no reason |
| Rewrite all code examples | Even correct examples get rephrased |
| Reorder sections | Changes the diff noise, no factual benefit |
| Regenerate Mermaid diagrams unnecessarily | Diagram was fine before |
| "Improve" existing descriptions | Accurate = leave alone |
| Rephrase file structure tree | Only update when structure changed |

### HARDCODEd RULES — Violation is a Bug

- **You MUST read the existing doc before writing anything to it**
- **You MUST NOT regenerate a Mermaid diagram if its underlying source has not changed**
- **You MUST NOT rewrite a paragraph that remains accurate**
- **You MUST NOT rewrite a code example whose code has not changed**
- **You MUST NOT use the module template as the starting point for an existing doc**

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
| Each document | **400+ lines, 5+ code examples** |

---

## Progressive Scanning for Large Projects

When module count > 10, source files > 50, or LOC > 10,000, switch to batch mode:

1. **Prioritize modules** — entry points (weight 5) > dependents (4) > has docs (3) > code size (2) > recently modified (1)
2. **Generate 1-2 modules per batch** — depth scales with complexity
3. **Track progress** in `cache/progress.json` — record completed/pending modules and current batch number
4. **After each batch** — run `(cd skills/nium-wiki/scripts && node index.js audit-docs .nium-wiki --verbose --mermaid-strict)`, report results to user, then prompt:
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

Execution: scan existing docs with `(cd skills/nium-wiki/scripts && node index.js audit-docs --mermaid-strict)`, generate an upgrade report, then re-generate failing docs batch by batch. **Always include `--mermaid-strict`** so that Mermaid syntax errors block the upgrade and prevent bad diagrams from entering the wiki.

**Version footer** — append to every generated document:
`*Generated by [Nium-Wiki v{{ NIUM_WIKI_VERSION }}](https://github.com/niuma996/nium-wiki) | {{ GENERATED_AT }}*`
(read version from `skills/nium-wiki/scripts/version.json` — `version` field)
