<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="codatori-logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="codatori-logo-light.svg">
    <img src="codatori-logo-light.svg" width="48" height="48" align="absmiddle" alt="">
  </picture>
  codatori.
</h1>
<p align="center">Understanding beyond syntax</p>

## Code Graph model explorer

Open `index.html` in a browser. The single-page presentation works offline, with
plain HTML, CSS, and JavaScript and no packages or external services.

The header switches between **Zen Graph** (light, default) and **Midnight
Satori** (dark), remembering the choice when browser storage is available.
The palette, semantic roles, readability guidance, and editable visual board
are saved in [color-design.md](color-design.md) and
[color-design.svg](color-design.svg). Canonical colors live in `themes.css`;
component styles and graph edges reference semantic tokens.

- **Explore the model:** select a structure to read its original attributes,
  explanations, and incoming/outgoing references. Filter by layer, search names
  or documentation, or focus on the selected structure's connections. The map
  has room for the full structure, with attributes below rather than squeezing
  it into a narrow column. Use zoom, **Fit all**, or **Expand map** for an overview.
  The map is a directed schema graph with one node per type, starting at
  **Repository → Project** and continuing through analysis, declarations, expressions,
  types, and resolution. Named arrows include cross-links and self-links, not just
  a filesystem or ownership tree. **Structure** shows the main connections plus all
  references involving the selected type; **All links** includes the remaining
  semantic and metadata references. **Focus on connections** isolates the selected
  type's neighborhood. Click an edge label for the exact fields and constraints.
  Inverse labels such as **HAS PROJECT** explicitly identify the stored reference
  (`Project.repository_id`) in their explanation. Connections are permitted by the
  schema, not mandatory for every record or evidence that a program executes.
- **Guided walkthrough:** explore the supplied C++ `Engine` example, with
  `SceneManager`, `RenderContext`, and `main`. Focused excerpts link forward
  declarations, out-of-class definitions, nested and member calls, smart-pointer
  types, resolutions, and structural dependencies to record cards or JSON.
  Expand the **Full source** disclosure to read the complete code, or choose
  **Full example** to inspect all illustrated records. Click a record ID or
  member-reference row to follow its references. **Components** aggregates
  supporting occurrences; **Member references** shows declaration-level call
  dependencies without implying execution order.
- **Structural dependency graph:** the model derives relationships rather than adding
  another canonical entity. Selected targets establish links; supported
  applicable or unknown candidates remain possible, and inapplicable candidates
  are excluded. Expand a component pair to inspect provenance, static contexts,
  relationship kinds, and per-occurrence certainty.
  Optional `CallCondition` values preserve branch restrictions on call occurrences
  separately from configuration-dependent target-selection restrictions. Derived
  call edges retain both predicates and their completeness per occurrence/context;
  absent conditions mean unknown, not unconditional.
- **Full specification:** read every section of the canonical document with
  clickable structure names.
- **Semantic relations:** a dedicated reference for all 12 direct edge labels in
  §9, with exact endpoint categories, plain-language explanations, source
  fragments, source-node JSON excerpts, and common misinterpretations. Open it from
  the header or a participating source structure; `index.html#semantics` opens it
  directly. The `imports_from` example links to the actual C++ walkthrough
  record. Other fragments are independent illustrations, not invented facts
  about the supplied C++ program. Kind names, endpoints, and kind-specific
  information are read from the active specification. Each relationship is a
  direct edge, without an intermediate node or canonical edge ID. Object
  serialization uses outgoing lists such as `inherits`, `overrides`, and
  `imports_from` on the source node, with context, state, and typed edge details.

Use `/` to focus search and `Escape` to clear it. The graph's arrows indicate
stored references or embedded values; dashed connections denote shared-identity
extensions. The walkthrough's sequence is conceptual, not a set of literal edges.
Generic subject/supporting references are explained in the Connections panel,
rather than drawn as an all-to-all graph.

The walkthrough result in `example-model.js` is hand-authored teaching data, not
an analyzer's output or a conformance-certified dataset. Source spans and FNV-1a
fingerprints are computed from its displayed code. Profiles share their base
entity IDs; step views are projections whose references resolve in the full
example. Evidence and coverage explicitly state the example's assumptions and
limited analysis boundaries. Public C++17 standard-library type contracts are
supplied manually; SDK overload sets and stream insertion chains are not claimed.
The original string literals are preserved; Markdown escapes on identifiers and
pointer asterisks were removed before establishing the immutable teaching input.

**The C++ program is never executed.** The reciprocal component and member
references form a structural dependency cycle. Relationships inside source `if`
blocks remain visible without asserting branch execution, feasibility, or
termination. A `PresenceCondition` concerns source/configuration applicability,
not a runtime branch. Aggregated contexts need not apply simultaneously.

The model has **29 named structures across seven layers** and **two conformance levels**:
syntactic and semantic. The semantic level targets structural component
dependencies; a unique selected target is not required to preserve supported
possible dependencies. `ImplementationSet` is optional source-definition
knowledge, not a linker/runtime completeness guarantee. `SourceMapping`,
`FlowNode`, `FlowEdge`, and `DataFlowRelation` are not part of this model.
Source transformation and execution-path analysis are outside its scope.
Recording known branch or target-selection predicates does not require proving
that a branch executes. Propagating provider-selection conditions through
assignments is optional additional analysis, not a conformance requirement.

`TypeProfile` describes a declared type symbol; `TypeExpression` describes a
semantic type structure; `TypeUse` preserves an actual source spelling.
Direct `HAS_TYPE` edges connect declarations, expressions, type uses, and optional
symbol summaries to `TypeExpression`, carrying context, role, and certainty.
Object serialization embeds these edges in the source entity's `has_type` list;
there are no separate binding nodes or edge IDs. Inferred types do not require
fabricated `TypeUse` records. Derived dependencies retain the source subject,
type-expression target, edge path, context, evidence, and candidate uncertainty.

Any existing node or edge may optionally contain `semantic_properties` with
available analysis results. Entries carry a name, typed value, state, and context;
they may inherit the owning node or edge's explicit context. They have no IDs or
separate subject references and can be saved with the existing create/update
operation. No dedicated property collection pass is required. Absence means not
recorded; explicit unknown or not-applicable values use `null`, not `false` or zero.
Candidate values and different contexts remain distinct, and canonical fields or
typed edge details are not duplicated. Evidence and coverage identify an embedded
edge or property through its source node and precise path, such as
`imports_from[0]` or `semantic_properties[0]`. Property-specific support does not
establish the containing relationship. The C++ example attaches `value_category:
prvalue` to its integer argument expression without duplicating the literal value.

Project structure is available before code analysis and supplies the boundaries
for both code conformance levels. `Repository` describes the workspace; discovery configuration is stored
outside this model. `Coverage` and `Diagnostic` describe incomplete structural
results. Each recognized project descriptor identifies a
`Project`; `Directory` and `ProjectFile` inventory code and non-code entries.
Direct `CONTAINS` edges record membership, `EXTERNAL` edges link projects to
`ExternalLibrary`, and `DEPENDS_ON` edges link same-repository projects. These
edges have no separate canonical IDs or intermediate relationship nodes. Object
serialization uses outgoing `contains`, `external`, and `depends_on` lists on
each project; graph serialization represents those same facts as direct edges.
Project hierarchy, physical directories, and build dependencies remain distinct;
shared files may belong to multiple projects. `Project` is the single minimum
boundary of code organization and analysis; no separate `Module` entity exists.
`AnalysisContext.project_id` connects analysis directly to its project; multiple
build configurations use multiple contexts of that same project.
`SourceFile.project_file_id` connects analyzed text to the inventory without
conflating filesystem entries with source text versions. Language packages and
modules remain directories, declarations, or symbols inside a descriptor-based project.
Declaration nesting uses `parent_declaration_id`; expressions and imports refer
directly to their containing declaration and analysis unit. Type uses inherit
containment through their subjects. Standalone lexical-area nodes are not part
of the model. Block name lookup remains internal to the analyzer; resolved
references, distinct symbol identities, and recorded conditions preserve its
available results. Lambda and local-function body calls belong to their own
callable declarations, not the enclosing function.
The app documents these records; it does not scan repositories or resolve builds.
The C++ teaching example includes an explicitly hand-authored `CMakeLists.txt`
descriptor in its records, separate from the original C++ snippet. It is not a
discovered repository file, and no build or library resolution is performed.

Press `Escape` to leave the expanded map. Validate the teaching model and schema graph with
`node --test example-model.test.mjs`.

## Updating the document

`Code Graph Data Model v2.md` is the sole specification and source of truth.
After editing the specification, run:

```sh
node build-model.mjs
```

This regenerates `model-data.js`, the offline copy consumed by the presentation.
The app extracts structures, original tables, and descriptions from that copy;
short summaries and references not explicitly typed in the tables live in
`app.js` and should be reviewed when the schema changes.
`structural-dependencies.js` derives the example's relationship views from its
canonical records; these views are never added to its canonical JSON.

To serve the page over HTTP instead of opening the file directly:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765`.
