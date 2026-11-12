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
  Overview mode uses compact, balanced columns so structure names and connections
  remain readable; full descriptions stay in the attributes below the map.
  Click relationship badges or edge labels to see their fields and explanations.
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
- **Semantic relations:** a dedicated reference for all 13 relation kinds in
  §9, with exact endpoint categories, plain-language explanations, source
  fragments, JSON record shapes, and common misinterpretations. Open it from
  the header or the SemanticRelation structure; `index.html#semantics` opens it
  directly. The `imports_from` example links to the actual C++ walkthrough
  record. Other fragments are independent illustrations, not invented facts
  about the supplied C++ program. Kind names, endpoints, and kind-specific
  information are read from the active specification.

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

Press `Escape` to leave the expanded map. Validate the teaching model with
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
