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

The **Unified Software Graph (USG)** has two logically and constructively distinct
layers. Both schemas are defined in the canonical specification; section 15
defines the **Semantic Graph** projection and its Code Facts mapping contract.

- **Code Facts:** source observations and supported semantic analysis results,
  centered on Symbol identity, with declarations, expressions, types, name uses,
  contextual bindings, evidence, and explicit uncertainty. This is the detailed
  input to the user-facing graph, not a syntax-only intermediate representation.
- **Semantic Graph:** Module (code file or logical namespace/package/module),
  Unit (structural type), Member (callable or data entity), and Resource (non-code
  file), with containment, imports, calls, access, contracts, and dependencies
  traced to Code Facts. Repository, Project, ExternalLibrary, and Directory are
  shared identities in both layers, not duplicate nodes. Namespaces belong to
  Module, not Unit; parameters belong to their callable Member. File DECLARES
  relationships preserve physical participation separately from logical ownership.
  DERIVED_FROM provides cross-layer navigation to supporting files and Symbols.

Structure Map offers **Code Facts** (18 structures) and **Semantic Graph**
(8 types, including the 4 shared ones), or all 22 structures together. The same
relationship name can have different endpoint types in each layer: Code Facts
Expression INVOKES Symbol supports Semantic Graph Member INVOKES Member.
OVERRIDE means overriding, not overloading. ACCESSES describes data reads/writes;
USES records non-invoking callable references or captures, not calls inside lambdas.
The explorer visualizes the schema; it does not implement a production projection
pipeline or populate the second-layer store from arbitrary repositories.

Source occurrences, contextual binding results and direct targets remain
**Code Facts**, not separate nodes for each step of analysis. Expression owns
call details; `INVOKES` connects it to selected, possible or rejected callable
Symbols. `REFERS_TO` connects local name uses to Symbols, including non-call
reads, writes and type names. Optional `POSSIBLE_IMPLEMENTATION` edges identify
known definitions. There are no separate CallProfile, Reference, Resolution or
ImplementationSet nodes. Callable-to-callable edges and user-facing summaries
are second-layer projections of these occurrence-level facts.

`Import` and `Annotation` also remain integral source occurrences. File membership
and coordinate anchoring share one incoming edge: ProjectFile IMPORTS Import,
or ProjectFile ANNOTATES Annotation. Project membership is transitive. Import
separates directive `form`, `source_form`, `is_reexport`, and local wildcard/name
bindings. Local binding keys connect `INTRODUCES` to local Symbols while written
imported names have their own `REFERS_TO` targets. The reserved `source` assessment
uses embedded `binding_results_json` and `IMPORTS_FROM` to a file or symbol provider, independently
of member binding. Unavailable headers retain explicit unsupported/unresolved
assessments, not invented file or Symbol targets. Reexports do not duplicate the
same provider as an ordinary import: both use IMPORTS_FROM and the directive's
is_reexport flag. Wildcard rules do not enumerate locals.

Annotation has explicit `ANNOTATES` targets and roles, including declaration,
return, file, and assembly applications, with source-order positions. Parameters
use their existing Declaration. Declaration targets use Annotation ANNOTATES Declaration;
same-file/assembly targets use scalar file_targets_json role/position entries on
the incoming file ANNOTATES edge, without an inverse edge or embedded graph IDs.
An annotation type or decorator function has its own ordinary Symbol/Declaration;
Annotation is each distinct application, not another Symbol or its definition.
Arguments use `HAS_ARGUMENT`; actual written
decorator expressions use `HAS_APPLICATION_EXPRESSION` and reuse their argument
occurrences. A type spelling may have TypeUse, but it is not required for every
annotation name. Neither an annotation nor a resolved name creates an implicit
call Expression or proves execution. Local bindings are scalar JSON without graph
IDs; target/argument IDs in the teaching notation always encode relationships.

Evidence is embedded on each fact owner, with local keys and exact
`attribute_path` associations, not separate nodes or global evidence IDs.
Context-dependent entries name their context; context-independent support must
declare `project_independent: true`. `supports` references prerequisite owners
and optional fact paths. Native export uses `SUPPORTED_BY` and `EVIDENCE_SOURCE`.
Build scope is a scalar qualifier in evidence metadata, not a direct project edge.
Whole-owner support is not blanket evidence for every outgoing edge. Dependency
views retain local `evidence_refs` and precise `supporting_facts` alongside the
supporting node IDs.

Coverage remains an independent current assessment, including areas with no
discovered facts. `dimension` describes the analysis aspect; optional
`attribute_path` restricts its scope. There is one current assessment per
subject/context/dimension/path, with explicit exclusions. Local binding
completeness is not duplicated as Coverage state. Diagnostic remains a message
with a namespaced code, optional primary subject/location, and related facts and
locations; severity and wording do not determine truth or completeness. Expected
unknown results need not each emit a warning. Snapshot updates replace affected
evidence, recompute/invalidate Coverage, and remove obsolete Diagnostics together
with the changed facts. Run history and retries remain outside this model.

Repository construction has four conceptual stages:

1. Inventory projects and files, capture project build metadata, and identify versioned external content.
2. Analyze projects asynchronously and in parallel, preserving local results,
   provisional identities, and unavailable cross-project targets without dangling
   references or name-only identity merging.
3. Reconcile cross-project identities and bindings in **Code Facts**, preserving
   configuration differences, evidence, and incomplete or failed areas.
4. Build the **Semantic Graph** from an identified reconciled fact snapshot after
   all inventoried project jobs reach terminal states. Failed jobs do not count
   as successfully analyzed empty projects, and a finished batch is not proof
   of complete semantic knowledge.

Local and already supported cross-project bindings may be established before
the batch finishes. Partial previews must remain explicitly partial. Incremental
updates require reconciliation and rebuilding affected projections so old targets
and edges do not remain active or mix incompatible versions. Job scheduling,
publication, and snapshot bookkeeping are orchestration responsibilities; this
offline explorer does not implement a worker pipeline or a production graph store.

The specification targets a Neo4j property graph for both layers.
Node-to-node connections are native typed relationships, not `_id` properties or
lists of target IDs. Portable endpoint fields and outgoing lists in the teaching
JSON are exchange notation, not a ready-to-load Neo4j property map. Own node IDs
remain stable import keys. Nested maps need explicit scalar encoding in Neo4j;
relationship-associated contexts need an explicit context-qualified mapping,
because a Neo4j relationship cannot be the endpoint of another relationship.
This offline explorer does not install or connect to a Neo4j instance.

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
  Drag a node to rearrange it; drag the background to pan. The mouse wheel and
  two-finger pinch zoom around the pointer or gesture center. Node positions
  survive selection and filtering for the current page session. The relationship
  selector filters both arrows and their endpoint types, alongside layer, search,
  and neighborhood filters. Toggle **Edge labels** to reduce clutter. Viewport
  controls fit all visible nodes, center the selected type, expand the map, or
  reset filters and positions. With the graph focused, arrow keys pan, `+` / `-`
  zoom, and `Home` fits all; with a node focused, arrow keys move it (`Shift` for
  larger steps). All interactions use native browser APIs without network access
  or third-party libraries.
  The map is a directed schema graph with one node per type, starting at
  **Repository → Project** and continuing through analysis, declarations, expressions,
  types, and resolution. Named arrows include cross-links and self-links, not just
  a filesystem or ownership tree. **Structure** shows the main connections plus all
  references involving the selected type; **All links** includes the remaining
  semantic and metadata references. **Focus on connections** isolates the selected
  type's neighborhood. Click an edge label for the exact fields and constraints.
  Structural labels such as **HAS_PROJECT** identify native graph relationships,
  not foreign-key properties on Project nodes. Connections are permitted by the
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
  Optional Expression conditions preserve branch restrictions on call occurrences
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
stored relationships or embedded values. Profiles have independent identities
and attach through `HAS_PROFILE`. The walkthrough's sequence is conceptual, not a set of literal edges.
Generic subject/supporting references are explained in the Connections panel,
rather than drawn as an all-to-all graph.

The walkthrough result in `example-model.js` is hand-authored teaching data, not
an analyzer's output or a conformance-certified dataset. Source spans are computed
from its displayed code. The graph stores only versioned `content_ref` locators;
the offline demo resolves them from a separate `externalContent` teaching store,
not from node properties or a running Elasticsearch service. Symbol profiles have their own
IDs and attach to their Symbol by `HAS_PROFILE`; the fixture's `symbol_id` is
portable endpoint notation. Call syntax, local name uses and binding assessments
belong to the existing source construct, not an additional profile or result ID.
Step views are projections whose references resolve in the full
example. Evidence and coverage explicitly state the example's assumptions and
limited analysis boundaries. Public C++17 standard-library type contracts are
supplied manually; SDK overload sets and stream insertion chains are not claimed.
The original string literals are preserved; Markdown escapes on identifiers and
pointer asterisks were removed before establishing the immutable teaching input.

`Symbol` properties are `name`, `kind`, `origin`, and `identity_state`, in addition
to the common stable `id` and optional semantic properties. Section 5 describes
all 13 symbol kinds and six origins. Semantic ownership uses
`(Symbol)-[:OWNS]->(Symbol)`, occurrences use
`(Symbol)-[:HAS_DECLARATION]->(Declaration)`, and separately identified
CallableProfile, ParameterProfile, or TypeProfile nodes use `HAS_PROFILE`
according to the symbol kind. Semantic types normally follow HAS_DECLARATION
to the declaration's HAS_TYPE; a parallel Symbol type summary is not stored.
Direct Symbol HAS_TYPE is only a fallback for established external/system/intrinsic
symbols without available declarations. `language_identity` is removed; compiler-specific matching keys
may remain producer-internal or in supporting Evidence. Syntactic containment,
semantic ownership, inheritance, and runtime memory ownership remain distinct.

`Declaration` likewise separates scalar node properties from native connections.
`Symbol -[:HAS_DECLARATION]-> Declaration` establishes logical identity;
`ProjectFile -[:CONSISTS_OF]-> Declaration` records actual file membership and the
source version for all coordinates. CONTAINS_DECLARATION between declarations records only the nearest
syntactic declaration parent. This is separate from Symbol `OWNS` membership.
`HAS_INITIALIZER` links to an initializer or parameter-default Expression,
`HAS_TYPE` links to contextual type results. There is no reverse LOCATED_IN file copy.
Native source coordinates are scalar UTF-8 byte-offset pairs
(`start_offset`/`end_offset`, `name_start_offset`/`name_end_offset`, and
`body_start_offset`/`body_end_offset`), not nested maps containing a file ID.
The teaching fixture retains equivalent portable span objects and endpoint fields.
Section 5 explains all declaration forms, visibility and linkage categories,
modifier limitations, optional locations, and relationship cardinalities.

Expression has scalar UTF-8 byte offsets, `kind`, optional `operator`, and decoded
literal properties. Incoming ProjectFile CONSISTS_OF identifies its file and source
version; Declaration CONTAINS_EXPRESSION identifies its nearest declaration.
There is no reverse LOCATED_IN file copy. Ordered `HAS_OPERAND` relationships carry `role` and `position`.
`INTRODUCES` connects a lambda expression to its callable Symbol, not to an
invocation of its body. The fixture retains equivalent span/literal objects and
portable endpoint notation rather than native Neo4j properties.

A call Expression stores `call_kind` and optional occurrence conditions.
`HAS_CALLEE` and ordered `HAS_ARGUMENT` relationships start at the same Expression,
not duplicated in operands. Argument `position`, `name`, `expansion` and
`passing_mode` belong on relationships. Formal parameters, defaults, receiver
conversions and generic substitutions qualify the particular INVOKES target;
section 8 defines their direct detail relationships. The receiver remains the
callee member-access expression's base operand.

There is no separate condition structure. An Expression's `condition_predicate`
is a scalar JSON logical tree with expression placeholders, paired with
`condition_completeness`. `CONDITION_EXPRESSION` connects the call to actual
tested Expressions, with `predicate_path` locating each leaf. Graph IDs are not
hidden in JSON. Target-selection conditions stay associated with individual
INVOKES edges; their expression relationships also identify the target
position. Reaching a call and selecting a target are different questions. The
fixture's embedded `condition: {predicate, completeness}` is portable notation
for these properties and relationships; condition evidence and coverage refer
to the source Expression and precise edge path. Missing conditions are unknown, not true.

Each construct can preserve local `name_uses` (unique local keys, offsets, role and
qualification) and `binding_results` (site/context, state, candidate completeness
and reasons), with no separate IDs or duplicated targets. In Neo4j, name-use values
are scalar JSON without graph endpoints, while assessments use embedded
`binding_results_json` with scalar build-scope qualifiers, not edges to Project.
A whole call uses the reserved site key `call`; callee lookup
is a different local name site and may still name an overload set. A result with
no known target remains explicitly unresolved or unsupported. Unknown candidates
need evidence, rejected candidates produce no dependency, and selected targets
require a complete relevant candidate scope and established identity. Evidence
and coverage attach to the source ID plus paths such as `invokes[0]`; contexts,
conditions and support must not leak between alternatives. The teaching fixture's
outgoing lists are portable graph notation, not nested native Neo4j properties.

**The C++ program is never executed.** The reciprocal component and member
references form a structural dependency cycle. Relationships inside source `if`
blocks remain visible without asserting branch execution, feasibility, or
termination. A `PresenceCondition` concerns source/configuration applicability,
not a runtime branch. Aggregated contexts need not apply simultaneously.

The Code Facts model has **18 named structures across seven documentation groups**
and **two conformance levels**: syntactic and semantic. These are capabilities of
the first USG layer, not the Code Facts / Semantic Graph architecture. The semantic conformance level targets structural component
dependencies; a unique selected target is not required to preserve supported
possible dependencies. Optional implementation facts are source-definition
knowledge, not a linker/runtime completeness guarantee. `SourceMapping`,
`FlowNode`, `FlowEdge`, and `DataFlowRelation` are not part of this model.
Source transformation and execution-path analysis are outside its scope.
Recording known branch or target-selection predicates does not require proving
that a branch executes. Propagating provider-selection conditions through
assignments is optional additional analysis, not a conformance requirement.
The explorer's semantic-edge reference describes first-layer facts, while its
structural dependency views illustrate projections. Neither defines the final
Semantic Graph schema or writes aggregated display entities back as source facts.

`TypeProfile` describes a declared type symbol; `TypeExpression` describes a
semantic type structure; `TypeUse` preserves an actual source spelling.
Direct `HAS_TYPE` edges connect declarations, expressions, and type uses to
`TypeExpression`, carrying context, role, and certainty. Symbol typing is derived
through declarations, with a direct fallback only for known external/system/intrinsic
symbols without declarations; it is not a parallel summary.
Object serialization embeds these edges in the source entity's `has_type` list;
there are no separate binding nodes or edge IDs. Inferred types do not require
fabricated `TypeUse` records. Derived dependencies retain the source subject,
type-expression target, edge path, context, evidence, and candidate uncertainty.

TypeUse has no `form`: it locates written syntax using scalar byte offsets and
incoming ProjectFile CONSISTS_OF. Its syntactic owner uses Declaration CONSISTS_OF
or HAS_TYPE_USE from Expression, Annotation, or parent TypeUse; syntactic `role` and
ordered sibling `position` belong to this relationship, not to the node. Its
`HAS_TYPE` targets the semantic TypeExpression, not TypeProfile directly.
File membership and syntactic ownership are distinct and must agree on the file.
Follow `REFERS_TO -> Symbol -> HAS_PROFILE -> TypeProfile` for a nominal type's
declared identity and available profile. Builtins and composite types need no
new declared Symbol. The offline fixture keeps endpoint/position notation for
these relationships, but no longer stores TypeUse.form.

TypeExpression represents reusable semantic structure: pointers, references,
arrays, callable types, generic applications, and other supported constructors.
`HAS_ELEMENT_TYPE`, `APPLIES_GENERIC`, ordered argument relationships,
`HAS_PARAMETER_TYPE`, `RETURNS_TYPE`, and other relationships in section 6
connect its parts. One structure can serve many written occurrences or inferred
declarations. Qualifiers apply to an individual layer: `const T*` qualifies T,
whereas `T* const` qualifies the pointer. Neither qualifiers nor type structure
imply a runtime object, invocation, or ownership relationship.

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
for both code conformance levels. `Repository` describes a Git checkout and its
required `revision`, the full commit hash processed, including incremental runs;
discovery configuration is stored
outside this model. `Coverage` and `Diagnostic` describe incomplete structural
results. Each recognized project descriptor identifies a
`Project`; `Directory` and `ProjectFile` inventory code and non-code entries.
Direct `CONTAINS` edges record membership, `EXTERNAL` edges link projects to
`ExternalLibrary`, and `DEPENDS_ON` edges link same-repository projects. These
edges have no separate canonical IDs or intermediate relationship nodes.
`HAS_PROJECT` connects repositories to projects. Structural relationships are
serialized in a separate `relationships` collection, not as Project attributes.
`CONTAINS` is the only relationship from Project to Directory or ProjectFile;
its `is_root` and `is_descriptor` flags preserve those roles without extra edges.
Directory hierarchy uses `PARENT_OF`; files use `Directory -CONTAINS-> ProjectFile`.
Directories and inventory files retain both `name` and `uri`; Project records
the primary `language`. ProjectFile is the only file category for both inventory
and analyzed code, including resolved headers and imports. It stores a versioned
`content_ref` to external storage, such as Elasticsearch, never file `content`,
`content_digest`, `original_encoding`, or a per-file `language_version`.
Inventory-only files may lack a content reference. Source coordinates require
retrievable, versioned UTF-8 content; a mutable latest-document URL is insufficient.
`SourceSpan` is an embedded range on a fact or diagnostic, not a graph node.
Symbols obtain locations through their actual Declaration occurrences.
Project hierarchy, physical directories, and build dependencies remain distinct;
shared files may belong to multiple projects. `Project` is the single minimum
boundary of code organization and analysis; no separate `Module` entity exists.
`Project` stores `language_settings`, `target`, `compiler`, `defines`, and ordered
`search_paths`; no separate context or file-group node is required. Code facts
reach Project through their actual ProjectFile and its incoming CONTAINS edges.
Symbol follows its declarations or semantic owners; TypeUse follows its written
location or containing construct. No direct links connect Project with Import,
Annotation, Declaration, TypeUse, Expression, or Symbol. Exports belong to files
or language-module symbols; a project's public API is derived transitively.
Analysis results retain scalar `project_id` qualifiers when needed to distinguish
shared-file build scopes; these qualifiers do not create project relationships.
Different incompatible build configurations use separate project observations.
File-local macro changes and include-site conditions retain supported alternatives;
if analysis cannot distinguish them, coverage stays partial or unknown rather
than claiming a unique target. Language packages and modules remain directories,
declarations, or symbols inside a descriptor-based project.
Declaration nesting uses `parent_declaration_id`; expressions and imports refer
directly to their containing declaration and file. Type uses inherit
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
