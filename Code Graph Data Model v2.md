# Unified Software Graph: Code Facts and Semantic Code Graph

## 1. Purpose and Conventions

This specification defines both layers of the **Unified Software Graph (USG)**, targeting a Neo4j property graph. **Code Facts** preserves observed syntax and supported semantic facts independently of programming language and parser. **Semantic Code Graph** projects those facts into user-facing code organization and dependencies. Sections 2-14 define the supporting Code Facts contract; section 15 defines the Semantic Code Graph schema and its mapping rules. Repository, Project, Directory, ProjectFile, and Resource are shared nodes, not copies per layer.

#### USG Layer Boundaries

| USG Layer | Responsibility | Primary Concepts |
| --- | --- | --- |
| Code Facts | Preserve source observations, logical identities, contextual semantic results, evidence, and explicit uncertainty. | Symbol is the central logical code identity; Declaration, Expression, TypeUse, direct binding relationships, types, and project/source records retain the supporting detail. |
| Semantic Code Graph | Present repository structure and meaningful containment, imports, calls, and other relationships to users, derived from Code Facts with traceable support. | Module, Namespace, Unit, and Member, plus shared Repository, Project, Directory, ProjectFile, and Resource. Projection-specific nodes are not additional Code Facts categories. |

The boundary is between analysis facts and a user-facing semantic projection, not between syntax and semantics. Code Facts includes semantic information such as types, name and overload binding, inheritance, overrides, and supported target candidates. A Symbol and its Declarations identify an entity and its occurrences; they do not by themselves identify which entity a particular source name or call denotes in a Project. The Semantic Code Graph MUST NOT reconstruct bindings by matching names when Code Facts cannot establish them.

Direct binding results belong to Code Facts, whether produced during project analysis or later repository reconciliation. A source construct owns name-use details and contextual assessments; REFERS_TO and INVOKES connect it directly to selected, possible, or rejected Symbols. Optional POSSIBLE_IMPLEMENTATION relationships retain known definitions with an explicit completeness assessment. No separate call profile, reference-occurrence node, binding-result node, or implementation-set node is required. User-facing callable-to-callable edges, implementation summaries, and aggregated dependencies belong to the Semantic Code Graph and retain links to these occurrence-level facts. The second layer aggregates supported semantics; it does not invent missing bindings.

In Semantic Code Graph, a Module represents a language-defined module, not a code file by default. A Namespace represents a naming scope such as a C++ namespace or Java package. A Unit represents a structural type or a function or variable at namespace or module scope, including global scope. A Member represents a contained entity of a Unit, directly or through another Member. Resource classifies an inventoried non-code ProjectFile in both layers. File placement, module participation, and semantic ownership are independent.

The syntactic/semantic conformance levels below are capabilities of Code Facts, not the two-layer architecture. The semantic-edge reference documents Code Facts relationships; it is distinct from the Semantic Code Graph schema in section 15. The teaching dependency views illustrate occurrence-backed projections, not an implementation of the complete second-layer store.

#### Repository Construction and Reconciliation

1. Establish the repository's project inventory and select the source versions and Projects for a construction batch. Project discovery and job scheduling remain outside the canonical Code Facts schema.
2. Analyze projects asynchronously and in parallel. Each producer emits available local syntax and semantic facts with collision-free identities, context, evidence, and explicit unresolved or provisional results where supported by the fact schema. Independent workers MUST NOT merge symbols by spelling alone or create dangling cross-project references.
3. Reconcile Code Facts across the repository: establish supported cross-project identities, bind references and calls against available project/dependency facts, and preserve unresolved candidates and failed or unsupported analysis boundaries. This is completion of the first layer, not construction of the Semantic Code Graph. Distinct contexts and incompatible results MUST NOT be collapsed.
4. Build and publish the Semantic Code Graph from an identified, reconciled Code Facts snapshot. Repository-wide publication waits until every inventoried project's analysis job has reached a terminal state and reconciliation has run for that batch. A failed or unsupported project is explicitly incomplete, not an empty successfully analyzed project; completion of jobs does not imply semantic completeness.

Independent local bindings and already supported cross-project facts need not wait for all projects. Partial previews and incremental reconciliation MAY be produced as dependencies become available, but MUST be marked partial and MUST NOT be published as a complete repository graph. Every published projection MUST identify its input fact snapshot, preserve effective contexts, evidence, and uncertainty, and avoid mixing incompatible source versions or analysis batches. Later changes require reconciliation and rebuilding affected projections; replacing a previous result MUST NOT leave stale selected targets or derived relationships active. Publication boundaries and worker/job state are orchestration concerns, not new canonical nodes or properties defined here.

Repository reconciliation MAY enrich Code Facts only with supported analysis results and their evidence. Semantic Code Graph grouping, display names, aggregation, and navigation MUST NOT be written back as newly observed source facts. Neither an analysis job barrier nor a finished reconciliation establishes every runtime target or the availability of external implementations.

Analysis reads source text without modifying it or producing transformed source files. Source transformation and mappings between transformed and original text are outside the scope of this model.

The goal is to preserve enough supported source and semantic detail to build reliable project/component representations and structural dependencies, including conditional and possible relationships, without forcing presentation concepts into Code Facts. Execution order, path feasibility, and prediction of concrete runtime behavior are outside the scope of this model.

**MUST** denotes a model requirement; **MAY** denotes a permitted variation. Attributes marked `!` are required; attributes marked `?` may be absent. An absent value means unknown, not `false`, zero, or an empty list. Applicability and completeness are represented explicitly.

Node labels use `PascalCase`; properties and enumeration values use `snake_case`; relationship types use `UPPER_SNAKE_CASE`. Connections between existing nodes MUST use native directed Neo4j relationships, not foreign-key properties or lists of target IDs on nodes. A node's own `id` is a stable producer-controlled key, not Neo4j's internal ID and not a substitute for a relationship. Order is significant only for explicitly ordered relationships and is preserved by a `position` property. Reverse relationships duplicating the same fact are not stored; traverse the existing relationship in either direction.

Some tables and the offline teaching fixture retain portable `_id`, `_ids`, or outgoing-list notation to describe endpoints without a running database. These are transport references, NOT Neo4j node properties or additional stored copies of relationships. A transport's `source_id` and `target_id` select relationship endpoints during import and are not relationship properties. An explicit relationship table takes precedence over that shorthand. The Symbol section defines its native graph contract directly. Embedded structured values are also transport notation: Neo4j properties accept supported scalar values and homogeneous scalar lists, not nested maps or lists of maps. A Neo4j adapter MUST explicitly encode such values in scalar properties, for example JSON strings, without turning embedded values into separately identified fact nodes or hiding cross-node links in JSON. Context links associated with relationship facts require an explicit context-qualified graph mapping; a Neo4j relationship cannot itself be an endpoint of another relationship.

## 2. Core Principles

1. `Symbol` represents a logical language entity; `Declaration` represents a particular declaration or definition of that entity. Multiple declarations may refer to one symbol.
2. Source syntax is preserved independently of semantic conclusions. An unresolved reference is not removed from the model.
3. Types, visibility, code activation, and call targets may depend on the analysis configuration.
4. Names are stored in symbols, coordinates on source occurrences, and type structures in type entities. Source constructs own binding assessments and direct targets; analysis steps are not mandatory fact nodes.
5. The same information is not exported simultaneously as a nested object, duplicated attributes, and an independent graph edge.
6. Unknown, ambiguous, and incomplete information is represented as data states, not as grounds for selecting an arbitrary target.
7. Repository-wide identity and binding reconciliation enriches Code Facts; user-facing grouping and dependency aggregation constructs the Semantic Code Graph. Semantic analysis is not deferred wholesale to the second layer.

## 3. Common Types and Identity

| Type | Definition | Purpose |
| --- | --- | --- |
| `Id` | A nonempty opaque identifier unique within the dataset | Stable node lookup during import and exchange; graph traversal uses relationships. |
| `SourceSpan` | A range within a particular source file version | Association with source text. |
| `PresenceCondition` | A structured expression of conditional activation | Preprocessing and configuration variants. |
| `AttributePath` | A path to a record attribute | Association of evidence or completeness assessments with a specific property. |

Every standalone node MUST have an `id`; this common property is not repeated in the tables. Embedded values do not require a separate identity. CallableProfile, ParameterProfile, and TypeProfile are independently identified nodes attached to a Symbol by HAS_PROFILE. A profile ID MUST differ from its owner's ID. Call syntax and binding results are part of the source Expression and direct relationships, not separate profile or result nodes.

Occurrence identifiers distinguish identical constructs at different locations. A symbol identifier MUST NOT depend solely on its name: language, owner, category, and distinguishing entity properties are taken into account. Until equivalence is established, declarations MAY reference different provisional symbols.

An identifier MAY be reused across datasets only if its identity is preserved. An identical `id` does not permit silent replacement of a source file, context, or conflicting semantic content. The identifier generation algorithm is not prescribed.

#### Embedded Semantic Properties

Any existing node or edge MAY carry an optional `semantic_properties` list of additional analysis results. Entries are embedded values, not standalone entities: they have neither `id` nor `subject_id`. Producers MAY attach available results in the same operation that creates or updates the owning node or edge; collecting these properties or performing a separate analysis pass is not required for conformance.

| Entry Attribute | Type | Purpose |
| --- | --- | --- |
| `name` ! | Normalized key | For example, `value_category`, `constant_value`, `nullability`, or `storage_duration`. |
| `value` ! | Typed value or explicit `null` | Preserve `false` and zero; use `null` for `unknown` or `not_applicable`. |
| `project_id` ? | Scalar project observation key | Build-scope qualifier; required unless inherited from the owning result or edge. Never creates a relationship to Project. |
| `state` ! | `established`, `candidate`, `unknown`, `not_applicable` | State of this property, independent of the owning edge or other properties. |

Different contexts and incompatible candidate values remain separate entries. An explicit property context MUST match the owning node or edge's context when that owner has one. Absence means not recorded, not `false` or proof that a property does not apply. Properties MUST NOT duplicate canonical attributes, type edges, resolution results, or typed semantic edge properties. Language extensions use a language prefix such as `cpp.thread_local`. A separately identified profile does not duplicate its owning entity's properties.

For example, an Expression MAY contain `"semantic_properties": [{"name":"constant_value","value":42,"project_id":"project:example","state":"established"}]`. A semantic edge already carrying `project_id` MAY omit that field from its property entries. The effective context is preserved during serialization and projection. Embedded evidence belongs to the owning node and uses a precise `attribute_path`, such as `semantic_properties[0]` or `inherits[0].semantic_properties[0]`. Neither properties nor edges gain a canonical identity for this purpose. Exporters MUST preserve these associations when reordering lists.

#### SourceSpan (Embedded Coordinates)

| Attribute | Type | Purpose |
| --- | --- | --- |
| `file_id` ! | `Id -> ProjectFile` | Source text version. |
| `start_offset` ! | Integer >= 0 | Inclusive start of the range. |
| `end_offset` ! | Integer >= `start_offset` | Exclusive end of the range. |

Offsets are measured in bytes of the exact UTF-8 text retrieved through ProjectFile.content_ref, not content stored in the graph. Lines and columns are computed from that text and are not independent canonical coordinates. SourceSpan has no id, graph node, or standalone edge. A zero-length range MAY represent a recovered missing construct and MUST be accompanied by a diagnostic. Synthetic entities without source text are not assigned fabricated coordinates.

### PresenceCondition

Permitted variants: `constant(value)`, `defined(name)`, `comparison(operator, operands)`, `not(condition)`, `and(conditions)`, `or(conditions)`, and `unknown(reason)`. Values depend on `Project` settings; an unknown condition is not treated as true or false. An absent condition means unconditional applicability within the known context, not across every possible program configuration.

## 4. Dataset, Sources, and Configuration

### Repository

| Attribute | Type | Purpose |
| --- | --- | --- |
| `uri` ! | Normalized URI | Identity of the prepared datasource, not merely its name or revision. |
| `name` ? | String | Human-readable repository name. |
| `source_kind` ? | String | `git` or `zip`. Absent means `git` for records written before ZIP support; ZIP records MUST set `zip`. |
| `revision` ! | String | Full Git commit hash for `git`; archive SHA-256 for `zip`. |

Git and ZIP datasources are supported. Separate checkouts MUST NOT be merged solely because they share a remote URL. ZIP sources MUST have an identity distinct from Git sources and stable across archive revisions; Codatori uses `zip+file:` for prepared ZIP URIs. Projects are connected through `Repository -HAS_PROJECT-> Project`; duplicated project lists are not stored. For Git, `revision` records the processed commit, not a branch, tag, or abbreviated hash, and does not assert that the working tree is clean. Git incremental processing MUST record the resulting processed commit, not the previous baseline commit. Results retained from earlier commits MUST be reconciled with that revision before publication. ZIP discovery uses full scans; the SHA-256 identifies the archive used during preparation and does not attest to later filesystem contents. Readers that only process Git MUST exclude ZIP records. Discovery configuration, scan policies, and orchestration are outside this model and MAY be stored externally per repository. The dataset contains the resulting structure, not a discovery-run or configuration entity. Results from incompatible repository observations MUST NOT be silently combined into one current structure.

### Project

The single minimum boundary of code organization and analysis, identified by a project descriptor such as a `.csproj`, `.vcxproj`, `pom.xml`, or `CMakeLists.txt` file. Build configuration determines the analyzed inputs of that project; no separate Module entity or descriptor-free source-group boundary is introduced.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `name` ? | String | Declared project name, when available. |
| `language` ! | Language identifier or `unknown` | Primary project language; per-language rules for mixed-language projects belong to language_settings. |
| `language_settings` ! | Language, version, and dialect settings | Language rules for the represented project build configuration. |
| `target` ? | Architecture, platform, ABI | Platform-dependent types and binding. |
| `compiler` ? | Name, version, and significant options | Compiler-based semantics. |
| `defines` ! | Mapping from names to values | Project conditional compilation settings. |
| `search_paths` ! | Ordered records: `uri`, `kind` | Include, import, and module search order. |
| `build_system` ! | String | Recognized descriptor ecosystem, such as `msbuild` or `maven`. |
| `kind` ! | `library`, `executable`, `aggregator`, `language_specific`, `unknown` | Declared project role, not inferred from directory nesting. |
| `coordinates` ? | Structured ecosystem-specific record | Declared identity, for example Maven group/artifact/version or an MSBuild project GUID. |

Project identity MUST include the repository and descriptor identity; matching names or artifact coordinates alone are insufficient. Two descriptors in one directory identify two projects. A descriptor with multiple targets or profiles remains one project; incompatible configuration-specific results use separate project observations. Solution files and other workspace indexes MAY guide discovery but do not replace individual project descriptors. A recognized descriptor whose parameters cannot be fully read still produces a project with unknown parameters and a diagnostic.

A project has one represented set of build metadata in the current snapshot; different target frameworks, platforms, or build profiles MUST NOT be silently combined into it. An aggregator project MAY have no analyzed code. Language packages, namespaces, and source-language modules are represented by directories, declarations, and symbols within a project, not by additional project boundaries unless they have their own recognized project descriptors. Code analysis MUST reference an established descriptor-based project; standalone files without such a boundary do not form a conforming analysis dataset under this model. ExternalLibrary nodes and external symbols remain valid dependency targets without requiring their source projects.

Discovery produces a forest: a single-project repository has one root; a multi-project repository may have several roots. A parent is established from explicit aggregation metadata or a documented nearest enclosing descriptor rule, recorded in evidence; ambiguous parents remain absent with a diagnostic. Maven aggregation, Maven parent-POM inheritance, physical directory nesting, and dependencies are different facts: `Project -PARENT_OF-> Project` represents only the chosen discovery hierarchy and MUST NOT imply inheritance or a dependency. Projects from other repositories are not same-repository dependencies.

#### Project Edges

Project membership and dependencies are direct graph edges, not standalone entities or intermediate nodes. They have no canonical `id`. A project depends on another project as `Project -DEPENDS_ON-> Project`.

| Edge | Source -> target | Edge Properties | Meaning |
| --- | --- | --- | --- |
| `HAS_PROJECT` | `Repository -> Project` | None beyond common structural edge properties. | Repository membership; exactly one repository per project. |
| `PARENT_OF` | `Project -> Project` | None beyond common structural edge properties. | Discovery hierarchy; at most one known parent per project. |
| `PARENT_OF` | `Directory -> Directory` | None beyond common structural edge properties. | Immediate physical parent; at most one per directory. |
| `CONTAINS` | `Project -> Directory` or `ProjectFile` | `membership` !: `physical`, `declared`, `both`; `item_role` ?: ecosystem-specific build role; `is_descriptor` ?: Boolean, ProjectFile only; `is_root` ?: Boolean, Directory only. | Explicit project membership; descriptor and base directory roles use this same edge. |
| `CONTAINS` | `Directory -> ProjectFile` | None beyond common structural edge properties. | Immediate physical directory; at most one per file. |
| `EXTERNAL` | `Project -> ExternalLibrary` | `requested_version` ?, `scope` ?, `directness` !: `direct`, `transitive`, `unknown`. | External library dependency. |
| `DEPENDS_ON` | `Project -> Project` | `scope` ?, `reference_kind` ?: ecosystem-specific reference mechanism; `directness` !: `direct`, `transitive`, `unknown`. | Dependency on another project in the same repository. |

Every structural edge has `state` ! (`established`, `candidate`) and MAY carry `project_id` (`Id -> Project`), `site_file_id` (`Id -> ProjectFile`), and `presence_condition` (`PresenceCondition`). These are edge properties, not another record category. Conditions preserve source/build applicability; unavailable configuration values remain unknown. Embedded evidence belongs to the source node with an `attribute_path` identifying the outgoing edge; no edge or evidence ID is required.

Structural relationships MUST NOT be stored as node attributes, foreign-key fields, or outgoing lists. A portable serialization MAY keep a separate `relationships` collection whose entries contain `source_id`, `type`, `target_id`, and applicable edge properties. These entries are direct edges, not standalone node categories, and have no canonical `id`. An absent edge means no relationship was recorded, not proof that none exists.

```json
{
	"relationships": [
		{ "source_id": "project:app", "type": "DEPENDS_ON", "target_id": "project:core", "state": "established", "directness": "direct" }
	]
}
```

This fragment shows only a direct project dependency; endpoint nodes are omitted for brevity.

Every discovered project MUST have established `CONTAINS` edges to exactly one descriptor (`is_descriptor: true`) and one root directory (`is_root: true`). No separate descriptor or root-directory relationship is stored. Every inventoried project file and directory MUST have explicit project membership. Directory `PARENT_OF` edges record directory hierarchy; `Directory -CONTAINS-> ProjectFile` records a file's physical parent. Membership in a directory does not implicitly include all its descendants. Nested-project files do not automatically belong to every enclosing project. Shared or linked files MAY belong to several projects, including files outside their base directories. `physical` membership does not assert build inclusion. For one project, target, and optional context, there MUST be only one `CONTAINS` edge; physical and declared membership are merged as `both` when applicable, preserving descriptor or root roles on that same edge.

A same-repository project reference MUST use `DEPENDS_ON` once its descriptor target is established, not `EXTERNAL` solely because its syntax uses package coordinates. A matching name is insufficient: use descriptor paths, workspace resolution, or established ecosystem identity evidence. An unresolved path MUST NOT create a dangling endpoint or fabricated project; preserve its requested path in evidence on the source project, emit a diagnostic, and assess project dependencies as partial or unknown. Unknown applicability is retained as a candidate with its conditions, not promoted to an unconditional established dependency. External dependencies follow the same evidence and completeness requirements. Direct and derived transitive dependencies remain distinguishable. Project dependency cycles MAY exist and do not imply execution order. Aggregation, inheritance, co-location, and code references alone do not establish a build dependency.

For example, `repo/pom.xml`, `repo/app/pom.xml`, and `repo/core/pom.xml` identify three projects. Root aggregation MAY establish `Project -PARENT_OF-> Project` for app and core, but does not itself create dependencies. A resolved app-to-core dependency creates `app -DEPENDS_ON-> core`; app's third-party dependency creates `app -EXTERNAL-> library`. An inventoried `app/src/Main.java` and its directories each have `app -CONTAINS-> entry`; `app -PARENT_OF-> src` records the directory hierarchy and `src -CONTAINS-> Main.java` records the file's physical parent.

### Directory

| Attribute | Type | Purpose |
| --- | --- | --- |
| `uri` ! | Normalized URI | Directory location, including linked directories outside the repository when observed. |
| `name` ! | String | Observed directory name, including the filesystem root name when applicable. |

### ProjectFile

A project file, whether source code, an included header, an imported file, a descriptor, or another inventory entry. This is the single file node category; analysis does not create a second node for the same file.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `uri` ! | Normalized URI | File location; project-relative paths are derived. |
| `name` ! | String | Observed file basename, including its extension. |
| `kind` ! | `source`, `descriptor`, `resource`, `configuration`, `documentation`, `binary`, `generated`, `other`, `unknown` | Inventory classification, not a language-analysis result. |
| `content_ref` ? | Opaque external storage reference | Retrieval of the exact analyzed file content from external storage, for example an Elasticsearch document. Required for files referenced by source coordinates. |
| `language` ? | Language identifier | Syntax interpretation when this file contains analyzed code. |
| `origin` ! | `source`, `generated`, `external`, `system` | Separation of project, generated, external, and platform files. |

Within one dataset there MUST be at most one file or directory node per normalized location and category. Symlink aliases MUST NOT be silently conflated or recursively followed into cycles. Shared files and directories use the same nodes with membership in multiple projects, rather than copies per project. File content is not stored in the graph. `content_ref` MUST resolve to an immutable or explicitly versioned external document for the represented repository revision; an unversioned mutable URL is insufficient for source coordinates. External storage defines its locator format and preserves the UTF-8 text against which offsets were measured. Elasticsearch is one possible backend, not a required dependency. Inventory-only files need not have stored content. The `generated` origin denotes inputs generated before analysis, not text generated by this model.

SourceSpan is an embedded coordinate value attached to a fact, evidence entry, or diagnostic, never a graph node or a standalone relationship target. Its file endpoint is the actual ProjectFile. Native scalar coordinates use the incoming file relationship as their source-version anchor: IMPORTS for Import, ANNOTATES for Annotation, and CONSISTS_OF for Declaration, Expression, and TypeUse. Do not add a reverse LOCATED_IN copy. Diagnostic retains LOCATED_IN for its primary location. Symbol locations are obtained through HAS_DECLARATION and the declaration's file membership; a logical symbol can have several written occurrences.

### Resource

An inventoried non-code artifact, such as a descriptor, configuration, document, image, or binary asset. Resource and its ProjectFile are shared across both layers. ProjectFile is the file identity and sole owner of its URI, content reference, and physical placement; Resource adds a classification, not a second file record.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `kind` ! | `descriptor`, `configuration`, `documentation`, `image`, `binary`, `other` | Supported non-code classification under the inventory policy. |
| `media_type` ? | MIME type | Observed media type, when known. |

| Edge | Source -> target | Edge Properties | Meaning |
| --- | --- | --- | --- |
| `CLASSIFIES` | Resource -> ProjectFile | None. | Exactly one backing file per Resource and at most one Resource per file in the same snapshot. Traverse the file's CONTAINS edges for project membership and directory placement. |

Resource identity is based on the backing file. Generated non-code artifacts may be Resources; generated code is not a Resource merely because it was generated. Unknown classifications remain unclassified. Resource access is not inferred from matching string literals.

### ExternalLibrary

| Attribute | Type | Purpose |
| --- | --- | --- |
| `ecosystem` ! | String | Identity rules, such as Maven, NuGet, or a native binary ecosystem. |
| `name` ! | String | Observed package or library name. |
| `coordinates` ! | Structured ecosystem-specific record | Known identity components: namespace/group, artifact, source registry or URI, classifier, and target variant where applicable. |
| `version` ? | String | Exact resolved version; a requested range is not an exact version. |
| `identity_state` ! | `established`, `provisional` | Confirmed artifact identity or an unresolved external dependency. |

Different versions, registries, or incompatible artifact variants MUST NOT be merged solely by name. An unresolved declaration MAY reference a provisional library preserving the observed coordinates without fabricated values. Requested versions and dependency scopes belong to the relationship; the resolved library version belongs here. Library nodes do not require downloaded source, a `ProjectFile`, or symbols. Transitive libraries MAY be included only with supporting dependency-resolution evidence and explicit completeness boundaries.

#### Project Analysis Boundary

Project is the minimum build and analysis context. Its settings apply to all analyzed project files; no artificial group of participating files is stored. Analysis records discovered project files and supported include/import relationships. Material input limitations are reported with Diagnostic rather than invented results. Resolved include/import targets are ProjectFile nodes even when external to the repository; unavailable content does not justify fabricated declarations or symbols.

An unavailable project configuration remains unknown and is reported with Diagnostic; empty settings alone do not establish absence. Project dependencies remain direct DEPENDS_ON or EXTERNAL edges. Different build configurations use separate project observations, not silently merged settings. File-local macro changes and include-site conditions MUST retain distinct supported alternatives with their applicability and precise evidence, even within one project. If the analyzer cannot distinguish them without a separate compilation instance, it MUST NOT publish a falsely unique binding. The same file path or coordinates alone do not prove semantic identity across incompatible preprocessing states.

Project membership of Import, Annotation, Declaration, TypeUse, Expression, and Symbol is obtained transitively, never by a direct relationship to Project. Follow the actual file through its IMPORTS, ANNOTATES, or CONSISTS_OF relationship, then incoming Project CONTAINS. TypeUse can also follow its syntactic owner through CONSISTS_OF or HAS_TYPE_USE; Symbol follows HAS_DECLARATION or semantic ownership to available declarations. Shared files can lead to several projects; external symbols without source do not gain a fabricated project.

The portable `project_id` on analysis results is a scalar scope qualifier, not a relationship endpoint or a redundant membership property on a code node. It selects an applicable project observation when a shared file has different results under different build metadata; it MUST NOT create an edge to Project. Native relationship properties and embedded assessment/evidence JSON preserve this scalar qualifier. Structural membership is still discovered transitively. A qualifier alone does not establish membership.

All analyzed project files and resolved include/import files are represented directly as ProjectFile nodes. File membership, source locations, and project-qualified facts replace artificial file groups. A shared file can supply distinct facts to several projects without being cloned. Internal analyzer translation units or compiler invocations MAY still be used during processing; they are not canonical nodes.

## 5. Symbols and Declarations

### Symbol

The logical identity of a language entity in Code Facts, independent of its written declaration occurrences. In Neo4j this is a `Symbol` node. Its own `id` is the stable import key; all connections below are native relationships, not node properties.

| Node Property | Type | Purpose |
| --- | --- | --- |
| `name` ? | String | The single canonical simple name; absent for an anonymous entity. |
| `kind` ! | Category from the table below | What kind of language entity this symbol identifies, not its spelling or source form. |
| `origin` ! | Category from the table below | Primary provenance, independent of identity certainty or evidence authority. |
| `identity_state` ! | `established`, `provisional` | Established or provisional identity. |

`owner_symbol_id`, `language_identity`, and `has_type` are NOT Symbol node properties. Qualified names are computed by traversing incoming OWNS relationships and applying language rules. A full signature string, display name, or mangled name does not replace structural identity. A producer MAY use compiler keys internally to establish identity and preserve supporting keys in Evidence; no universal compiler-key format or additional identity property is required. Overloads and shadowed locals have distinct identities even when their simple names match.

#### Symbol Kinds

| `kind` | Meaning | Examples and Boundaries |
| --- | --- | --- |
| `namespace` | A named or anonymous language namespace organizing entities. | C++ namespace or a language package where it has namespace semantics; reopened declarations may identify one symbol. Not a directory or descriptor-based Project. |
| `module` | A source-language module with its own semantic identity. | JavaScript module, Python module, or named C++ module where supported. Not the removed build Module entity and not automatically a Project or ProjectFile. |
| `type` | A declared type identity. | Class, struct, interface, enum, alias, or other category refined by TypeProfile. Pointer and generic application structures are TypeExpression, not extra declared symbols. |
| `callable` | A language entity with callable semantics. | Function, method, constructor, destructor, operator, accessor, lambda, or local function, refined by CallableProfile. A callable-typed variable is still a variable. |
| `field` | A data member belonging to a type or equivalent language owner. | Instance or static class field. Static storage does not make a field a global variable; an accessor-backed property is distinct. |
| `variable` | A variable that is not a field or formal parameter. | Local, global, namespace variable, or language binding. Shadowed variables are distinct symbols. Lifetime or storage duration is not the kind. |
| `parameter` | An explicit formal value parameter of a callable. | Function argument binding, including rest/pack parameters, refined by ParameterProfile. Not an argument Expression or an implicit receiver. |
| `type_parameter` | A generic/template type parameter identity. | C++ `typename T`, Java `T`, TypeScript generic type parameter. A non-type template parameter is represented by its language-defined value-parameter category, not misclassified as a type parameter. |
| `enum_value` | A named enumerator. | C++ `Color::red` or another language's enum case where it denotes an enumerator. Not the enum type or an ordinary numeric literal. |
| `property` | A language-level property identity. | C# property or an established getter/setter property. Not an arbitrary field, a method whose name begins with get, or a semantic_properties entry. |
| `label` | A control-transfer label identity. | A goto target or named statement label when supported. Source metadata and UI labels are not program symbols. |
| `macro` | A preprocessor or language macro identity. | Object-like or function-like C/C++ macro. Invocation syntax does not turn a function-like macro into an ordinary callable. |
| `language_specific` | A positively identified language category outside the normalized set. | Record the actual language category in supported language-prefixed data or Evidence. Not a catch-all for unsupported analysis or an unresolved name. |

#### Symbol Origins

| `origin` | Meaning | Examples and Boundaries |
| --- | --- | --- |
| `source` | Identified in ordinary analyzed source. | User-written class, method, variable, or parameter. Source presence alone does not establish cross-declaration identity. |
| `generated` | Known to come from generated code or a language-mandated synthesized declaration. | Generator-produced client class or established implicit constructor. Generated source files may have real spans; implicit declarations need not. No transformed source is created by this model. |
| `external` | A known non-platform dependency outside the analyzed source boundary. | Third-party library symbol from dependency metadata or signatures, with or without accessible source. Not an invented target for an unresolved name. |
| `system` | Provided by the language's standard library, platform, or system SDK. | C++ standard-library shared_ptr symbol or platform API. Does not imply complete SDK analysis or an intrinsic. |
| `intrinsic` | A compiler/language-provided entity without an ordinary library declaration. | A compiler builtin where modeled as a symbol. Not every system function or built-in TypeExpression requires an intrinsic Symbol. |
| `placeholder` | A deliberately provisional identity for an unavailable or incompletely identified entity. | An explicitly limited external target whose identity is not yet established. Requires provisional identity and supporting limitations; do not fabricate one symbol for every unresolved spelling. |

Use the most specific established provenance: placeholder for a provisional stand-in; intrinsic for a known compiler entity; generated when generation or synthesis is known; system for a platform provider; external for another known dependency; source otherwise. These values do not express trust. A source symbol may be provisional; a system symbol may be established even when not all of its members are known. If provenance is not established, do not claim a specific provider without Evidence. Placeholder symbols MUST have identity_state `provisional`.

#### Symbol Relationships

| Relationship | Source -> target | Cardinality | Meaning |
| --- | --- | --- | --- |
| `OWNS` | `Symbol -> Symbol` | Owner: 0..many children; child: 0..1 owner. | Immediate semantic ownership, for example namespace to class, class to method, or callable to parameter/local. Acyclic; not lexical containment, type use, or runtime memory ownership. |
| `HAS_DECLARATION` | `Symbol -> Declaration` | Symbol: 0..many occurrences; Declaration: exactly 1 symbol. | Connects logical identity to each declaration or definition. External symbols may have no available declarations. Declaration form distinguishes definition from forward declaration. |
| `HAS_PROFILE` | `Symbol(callable) -> CallableProfile` | Symbol: 0..1; profile: exactly 1 owning Symbol. | Optional available callable details on a separately identified node. |
| `HAS_PROFILE` | `Symbol(parameter) -> ParameterProfile` | Symbol: 0..1; profile: exactly 1 owning Symbol. | Optional available explicit parameter details on a separately identified node. |
| `HAS_PROFILE` | `Symbol(type) -> TypeProfile` | Symbol: 0..1; profile: exactly 1 owning Symbol. | Optional available declared-type details on a separately identified node. |
| `HAS_TYPE` | `Symbol -> TypeExpression` | 0..many contextual results, only without available declarations. | Known external or intrinsic type information when no Declaration can carry it. Never a summary or duplicate of available declaration types; no fabricated type for namespaces or unresolved names. |

The matching profile is required when claiming its complete specialized facts; absence means unavailable, not a fabricated empty signature. A Symbol MUST NOT have profiles incompatible with kind, and a profile MUST NOT be shared between symbols. Profiles do not supply a second program identity, even though their graph nodes have distinct storage identities. HAS_PROFILE is preferable to IDENTIFY_OF because the profile describes, rather than establishes, symbol identity. OWNS is preferable to CONSISTS_OF because semantic membership is not general composition. HAS_DECLARATION reads from identity to occurrence; the reverse traversal is not a second stored edge.

For example: `Symbol(Renderer) -[OWNS]-> Symbol(draw)`, `Symbol(draw) -[HAS_DECLARATION]-> Declaration(draw definition)`, and `Symbol(draw) -[HAS_PROFILE]-> CallableProfile(draw signature)`. A method definition outside the class body still belongs to the class through OWNS, while its Declaration retains its actual syntactic parent.

### Declaration

One declaration or definition occurrence of a Symbol in a project, located in its actual ProjectFile when source text is available. In Neo4j this is a Declaration node with its own stable `id`. Its logical identity comes from the incoming HAS_DECLARATION relationship, not from its spelling or coordinates. Several Declaration nodes may describe one Symbol.

| Node Property | Type | Purpose |
| --- | --- | --- |
| `form` ! | Category from the table below | Whether this occurrence declares, defines, forward-declares, or is implicit. |
| `start_offset` ?, `end_offset` ? | Integer >= 0 | Full declaration range in the incoming file CONSISTS_OF source version; start inclusive, end exclusive. |
| `name_start_offset` ?, `name_end_offset` ? | Integer >= 0 | Name range within the full declaration; do not copy the canonical Symbol name. |
| `body_start_offset` ?, `body_end_offset` ? | Integer >= 0 | Body range within the full declaration when a source body is available. |
| `visibility` ? | Category from the table below | Accessibility of this particular declaration, not a second Symbol kind. |
| `linkage` ? | Category from the table below | Language linkage of the declared entity as established at this occurrence. |
| `modifiers` ! | Set of normalized strings | Available declaration modifiers, stored as a Neo4j string list. An omitted modifier is not necessarily ruled out. |
| `presence_condition` ? | Encoded PresenceCondition value | Optional source/configuration applicability, encoded as a scalar JSON string in Neo4j; not a runtime branch condition. |

`symbol_id`, `file_id`, `parent_declaration_id`, `initializer_expression_id`, and `has_type` are portable endpoint notation only, NOT Declaration node properties. A Declaration has no direct project endpoint or project membership property. Portable `span`, `name_span`, and `body_span` objects map to the offset properties above and the single incoming ProjectFile CONSISTS_OF relationship; their `file_id` is not embedded in a Neo4j property. The common optional semantic_properties convention also applies.

#### Declaration Forms

| `form` | Meaning | Examples and Boundaries |
| --- | --- | --- |
| `declaration` | An explicit declaration that is not classified as a definition or forward declaration. | Function prototype or another language declaration. Source text exists; a mere name use does not introduce a declaration. |
| `definition` | A declaration that defines the entity under the source language rules. | Class definition, function body, or variable definition. A body is not required: a variable definition may have no initializer. This does not claim that code executes. |
| `forward_declaration` | An explicit forward declaration supported by the language. | C++ `class Renderer;`. Do not classify every declaration without a body as a forward declaration. |
| `implicit` | A language-mandated or established synthesized declaration without an explicit declaration occurrence. | Implicit constructor or another supported implicit construct. Lack of accessible external source alone does not make an otherwise explicit declaration implicit. |

#### Declaration Visibility and Linkage

| `visibility` | Meaning |
| --- | --- |
| `public` | Accessible to other code subject to the language's module, export, and other access rules; not proof of export. |
| `protected` | Accessible under the language's protected-member rules, typically involving the declaring type and derived types. |
| `private` | Restricted under the language's private-access rules, with language-specific exceptions such as friendship. |
| `internal` | Restricted to a language-defined assembly, module, or comparable internal boundary. |
| `package` | Restricted by the language's package-access rules. |
| `local` | A locally introduced binding whose availability is determined by its lexical declaration context. |
| `language_specific` | An established access category outside this normalized set; preserve its actual meaning in language-prefixed data or Evidence. |

| `linkage` | Meaning |
| --- | --- |
| `external` | The language permits corresponding declarations across its external-linkage boundary to identify the same entity. This is not Symbol origin `external`. |
| `internal` | Identity is restricted to the language's internal-linkage boundary, such as a C++ translation unit. |
| `none` | Established absence of language linkage, for example an ordinary C++ local variable. Not the default for an unassessed declaration. |
| `language_specific` | An established linkage category outside this normalized set, with its precise meaning retained in language-prefixed data or Evidence. |

Absent visibility or linkage means unrecorded or unknown, not public accessibility or no linkage. Normalized modifiers include `static`, `abstract`, `virtual`, `override`, `final`, `const`, and `async` where the language applies them to this declaration. `static` has language- and declaration-specific meaning; it does not by itself establish visibility, linkage, or runtime storage ownership. A written `override` modifier is not a replacement for a separately established OVERRIDES relationship. Do not copy semantic_properties results into modifiers or invent modifiers from unsupported syntax.

#### Declaration Relationships

| Relationship | Source -> target | Cardinality | Meaning |
| --- | --- | --- | --- |
| `HAS_DECLARATION` | `Symbol -> Declaration` | Symbol: 0..many occurrences; Declaration: exactly 1 symbol. | Logical identity of this occurrence; the same relationship as in the Symbol section, not a duplicate inverse edge. |
| `CONSISTS_OF` | `ProjectFile -> Declaration` | File: 0..many declarations; Declaration: exactly 1 file anchor. | File membership and source-version anchor of every occurrence, including nested or file-associated implicit declarations. Recorded offsets use this file's versioned content. |
| `CONTAINS_DECLARATION` | `Declaration -> Declaration` | Parent: 0..many immediate children; child: 0..1 nearest declaration parent. | Immediate syntactic declaration nesting within the same project. Acyclic, without fabricated declarations for blocks. Top-level declarations have no declaration parent but still belong to their actual file. |
| `HAS_INITIALIZER` | `Declaration -> Expression` | Declaration: 0..1 initializer; expression: 0..many associated declarations. | Variable, field, or enum value initializer, or a parameter default at this occurrence. The expression belongs to the same project. Not a function body, selected constructor, or runtime initialization event. |
| `HAS_TYPE` | `Declaration -> TypeExpression` | 0..many contextual results. | Available declared, inferred, return, receiver, or constraint type, with role, state, and context preserved as specified in section 6. No type result is required for every declaration kind. |

Every Declaration has exactly one incoming HAS_DECLARATION relationship and exactly one incoming CONSISTS_OF from its file anchor. Project membership is obtained through that file, not a direct project edge. File membership and nearest-parent nesting are different facts, not duplicated transitive containment. The file edge is also the source-version anchor; no reverse LOCATED_IN is stored. Do not store additional ancestor-to-descendant declaration edges or a parallel parent-ID property.

Every recorded offset pair is complete and satisfies `0 <= start <= end`. Offsets count bytes in the ProjectFile identified by incoming CONSISTS_OF, not characters or current filesystem contents. An explicit declaration with accessible analyzed text MUST have full offsets. For an implicit or external declaration without accessible text, offsets MAY be absent; its file anchor does not imply accessible content or a fabricated source range. Name and body offsets require full offsets, use the same source version, and lie within the full range. An anonymous declaration need not have name offsets. A name range preserves occurrence-local spelling, which may differ between corresponding parameter declarations. A zero-length recovered range requires a Diagnostic. No body offsets does not establish that no body exists.

Declaration nesting replaces a separate lexical-area entity in the canonical graph. Namespaces, types, callables, parameters, and local variables retain their own declaration occurrences and available parent links. A method defined outside its class body has a syntactic parent at its written definition site, while the class Symbol's OWNS relationship preserves semantic class membership. Reopened namespaces may have several declarations of one symbol. Parent declarations belong to the same project; their source files need not be identical when language inclusion rules permit this. Such cross-file nesting requires supported include-site evidence and MUST NOT merge incompatible preprocessing states.

Blocks, branches, comprehensions, and other lexical regions do not require fabricated declarations. Their name-lookup environments are internal analyzer data, not canonical nodes. Direct name targets, distinct local symbol identities, source spans, and evidence preserve available semantic results without reconstructing lexical lookup from declaration nesting. Incomplete bindings remain explicit. Conditional call restrictions are recorded on the call Expression rather than block declarations.

### CallableProfile

A separately identified node describing `Symbol(kind: callable)`, connected by incoming HAS_PROFILE. It is not a second callable symbol, and it does not share the Symbol's `id`.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `callable_kind` ! | `function`, `method`, `constructor`, `destructor`, `lambda`, `operator`, `accessor`, `local_function` | Callable semantics. |
| `parameter_ids` ! | Ordered list of `Id -> Symbol(parameter)` | Explicit formal parameters. |
| `type_parameter_ids` ! | Ordered list of `Id -> Symbol(type_parameter)` | Generic or template parameters. |
| `receiver_mode` ? | `none`, `instance`, `extension`, `explicit_object`, `language_specific` | Receiver semantics without adding implicit `this` to explicit parameters. |
| `variadic_style` ? | `none`, `ellipsis`, `parameter_pack`, `rest`, `keyword_rest` | Variable argument count. |
| `calling_convention` ? | String | ABI and function compatibility. |
| `receiver_qualifiers` ! | Set of values | Member const/volatile and lvalue/rvalue ref qualifiers. |

Parameter count is computed from the list; there is no separate `arity`. The signature consists of parameters, type bindings, return type, receiver qualifiers, and language-specific generic rules. Repeated parameter declarations refer to one parameter symbol only when their correspondence is established; occurrence-local spelling is read from the corresponding Declaration's name offsets in its incoming file CONSISTS_OF source version, not a copied Symbol name.

### ParameterProfile

A separately identified node describing `Symbol(kind: parameter)`, connected by incoming HAS_PROFILE. It is not a second parameter symbol, and it does not share the Symbol's `id`.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `binding_kind` ! | `positional`, `positional_only`, `keyword_only`, `rest`, `keyword_rest`, `pack` | Argument binding. |
| `passing_mode` ? | `value`, `reference`, `in`, `out`, `inout`, `language_specific` | Value passing and write effects. |

A default belongs to the particular parameter Declaration through HAS_INITIALIZER to its Expression: defaults in different declarations may have different values and visibility. The fixture's initializer_expression_id is portable endpoint notation only. The parameter index is determined by the position in CallableProfile.parameter_ids in portable data, mapped to an ordered relationship in Neo4j.

### TypeProfile

A separately identified node describing `Symbol(kind: type)`, connected by incoming HAS_PROFILE. It is not a second declared type symbol, and it does not share the Symbol's `id`.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `type_kind` ! | `class`, `struct`, `interface`, `trait`, `enum`, `union`, `alias`, `record`, `annotation`, `language_specific` | Type declaration semantics. |
| `type_parameter_ids` ! | Ordered list of `Id -> Symbol(type_parameter)` | Generic parameters. |

Fields, methods, enum values, and nested types are connected by outgoing OWNS relationships from their owning Symbol; a duplicated member-ID list is not stored. Inheritance, alias targets, and enum underlying types are represented by direct semantic relationships, not by OWNS.

TypeProfile describes the declared type symbol, not every structure that uses it. One type symbol can participate in many pointer, reference, array, qualified, or generic TypeExpression structures. Built-in and composite TypeExpression values do not require a separate TypeProfile.

## 6. Type Expressions and Type Uses

### TypeExpression

A semantic type structure, not a source declaration, executable Expression, or particular spelling. A nominal type refers to a type Symbol; a pointer, array, function type, or generic application adds structural layers around other TypeExpression nodes. Several declarations, expressions, and written TypeUse occurrences MAY refer to one established structure. Inferred types need no invented TypeUse or source range. A TypeExpression may therefore exist without any directly associated written occurrence.

| Node Property | Type | Purpose |
| --- | --- | --- |
| `kind` ! | Category from the table below | Semantic type constructor for this layer, not a source-spelling classification. |
| `qualifiers` ! | Set of normalized strings | Semantic qualifiers of this particular layer, stored as a Neo4j string list; see below. |
| `completeness` ! | `complete`, `partial`, `unknown` | Available structure and referenced identity within the analysis boundary; independent of certainty on HAS_TYPE relationships. |

The common stable `id` and optional semantic_properties convention apply. Only the following variant-specific scalar properties are stored on the node. All references to existing graph entities are relationships, not `_id` properties or nested argument maps.

| `kind` | Additional Node Properties | Meaning and Structural Relationships |
| --- | --- | --- |
| `builtin` | `builtin_name` !, `language` ! | Canonical built-in type under language rules. |
| `nominal` | `unresolved_name` ! when no REFERS_TO target is available | A declared type or alias identity via REFERS_TO; unconfirmed spelling is not symbol identity. |
| `type_parameter` | None | A generic type parameter identity via REFERS_TO to Symbol(type_parameter), not a concrete substitution. |
| `pointer` | None | A pointer layer around HAS_ELEMENT_TYPE; no runtime pointee identity or ownership is implied. |
| `reference` | `reference_kind` !: `lvalue`, `rvalue`, `language_specific` | A language-defined reference layer around HAS_ELEMENT_TYPE. |
| `nullable` | None | A language-defined nullable layer around HAS_ELEMENT_TYPE; not an expression-level nullability result. |
| `array` | `dimensions` ! as a scalar JSON string in Neo4j | Ordered constant, expression-backed, or unknown dimensions; expression references use HAS_DIMENSION_EXPRESSION with position, never IDs inside the JSON value. Element type uses HAS_ELEMENT_TYPE. |
| `function` | `variadic_style` ?, `calling_convention` ? | Callable value type via ordered HAS_PARAMETER_TYPE and RETURNS_TYPE, independent of a declared callable's Symbol and CallableProfile. No implicit execution or implementation target. |
| `generic_application` | None | APPLIES_GENERIC plus ordered HAS_TYPE_ARGUMENT, HAS_VALUE_ARGUMENT, or HAS_TEMPLATE_ARGUMENT. For example, shared_ptr<RenderContext> is distinct from the generic shared_ptr type. |
| `tuple` | None | Ordered HAS_COMPONENT_TYPE entries, retaining repeated components and their positions. |
| `union` | None | Alternative semantic member types via HAS_COMPONENT_TYPE; not unresolved lookup candidates, which belong on contextual analysis relationships. |
| `intersection` | None | Combined semantic type requirements via HAS_COMPONENT_TYPE. |
| `wildcard` | `bound_kind` !: `unbounded`, `upper`, `lower` | HAS_BOUND_TYPE for an upper or lower bound; no bound target for unbounded. |
| `dependent` | None | An unresolved structure that depends on declared parameters or source expressions, represented by REFERS_TO, DEFINED_BY, and DEPENDS_ON as available. Do not select a concrete type without analysis support. |
| `unknown` | `reason` ! | Unavailable or unsupported structure. |

#### TypeExpression Qualifiers

Qualifiers refine one type layer without changing its structural constructor. `const` means the language's const-qualified type at that layer, and `volatile` means volatile qualification under that language's rules, not a general concurrency guarantee. A language extension MAY use a prefixed qualifier such as `cpp.restrict` only where supported and established. Do not infer immutability, memory ownership, or a runtime value from a qualifier.

For `const T*`, the pointer layer has an empty qualifier set and its nominal T element has `const`. For `T* const`, the pointer layer has `const` and its nominal T element has an empty set. These are different type structures. Only language-permitted layers may carry a qualifier; for example, C++ cv-qualification is not added to a reference layer as if it were pointer qualification. `*`, `&`, and `&&` are represented by kind and reference_kind, not qualifier strings. Nullable structure, declaration modifiers such as `static`, and inferred expression properties are not qualifiers. An empty set establishes no qualifiers only when the corresponding structure is complete enough to support that claim.

#### TypeExpression Relationships

| Relationship | Source -> target | Cardinality | Meaning |
| --- | --- | --- | --- |
| `HAS_TYPE` | `Declaration -> TypeExpression` | 0..many contextual results. | Type of a declaration or callable return/receiver/constraint as specified in section 6; the existing relationship, not another stored copy. |
| `HAS_TYPE` | `Expression -> TypeExpression` | 0..many contextual results. | Result type of an actual expression, including inferred results with no written TypeUse. |
| `HAS_TYPE` | `Symbol -> TypeExpression` | 0..many contextual results, only without available declarations. | Fallback for known external or intrinsic type information, not a declaration-type summary. |
| `HAS_TYPE` | `TypeUse -> TypeExpression` | 0..many contextual results. | Semantic meaning established or considered for an actual written occurrence. |
| `REFERS_TO` | `TypeExpression -> Symbol` | 0..1 identity target. | Nominal types target Symbol(type); type_parameter targets Symbol(type_parameter). A dependent type may reference an established relevant symbol. Not a direct connection to TypeProfile. |
| `HAS_ELEMENT_TYPE` | `TypeExpression -> TypeExpression` | Exactly 1 for pointer, reference, nullable, and array. | Immediate wrapped or element type, preserving each structural layer. |
| `HAS_PARAMETER_TYPE` | `TypeExpression -> TypeExpression` | Function: 0..many ordered entries. | Explicit function-type parameter types, with a required zero-based position per parameter. These targets are types, not Symbol(parameter) nodes. |
| `RETURNS_TYPE` | `TypeExpression -> TypeExpression` | Function: exactly 1 return type. | A known void result uses a builtin void type, not a missing relationship. |
| `APPLIES_GENERIC` | `TypeExpression -> TypeExpression` | Generic application: exactly 1 generic type. | The generic definition's type structure, typically a nominal structure referring to the generic Symbol. |
| `HAS_TYPE_ARGUMENT` | `TypeExpression -> TypeExpression` | Generic application: 0..many ordered entries. | An argument whose category is a type. |
| `HAS_VALUE_ARGUMENT` | `TypeExpression -> Expression` | Generic application: 0..many ordered entries. | A non-type argument represented by its source expression. |
| `HAS_TEMPLATE_ARGUMENT` | `TypeExpression -> Symbol` | Generic application: 0..many ordered entries. | An established language template argument identity. |
| `HAS_COMPONENT_TYPE` | `TypeExpression -> TypeExpression` | Tuple, union, intersection: 0..many known components. | Tuple entries require position; union/intersection ordering is not semantic. Missing components require partial or unknown completeness. |
| `HAS_BOUND_TYPE` | `TypeExpression -> TypeExpression` | Wildcard: 0..1 bound. | Exactly 1 for an upper/lower bound, none for unbounded. |
| `HAS_DIMENSION_EXPRESSION` | `TypeExpression -> Expression` | Array: 0..many dimension expressions. | Required position selects the corresponding expression-backed array dimension. Constant and unknown dimensions need no fabricated Expression. |
| `DEFINED_BY` | `TypeExpression -> Expression` | Dependent type: 0..1 defining expression. | Available source expression determining a dependent type, without implying evaluation. |
| `DEPENDS_ON` | `TypeExpression -> Symbol` | Dependent type: 0..many known symbol dependencies. | Established symbolic prerequisites for the type structure, not project build dependencies. |
| `DEPENDS_ON` | `TypeExpression -> Expression` | Dependent type: 0..many known expression dependencies. | Available expression prerequisites, not execution order. |

All three generic-argument relationship types share one zero-based position sequence per application, preserving mixed type/value/template argument order. Repeated argument or parameter types may target the same node at different positions. Relationship counts describe known structure: incomplete analysis MUST retain partial or unknown completeness rather than fabricate missing targets. Complete nominal and type-parameter structures require an established REFERS_TO target. Structural reuse MUST preserve qualifiers, generic arguments, language rules, and established identity; matching spelling alone is not sufficient to merge types.

Nullable, pointer, and qualifier layers are not removed during normalization. An alias is not expanded in a way that loses the original symbol. A nominal type without an established symbol cannot be `complete`.

TypeExpression DEPENDS_ON records only additional established prerequisites that cannot already be obtained from its structural components or DEFINED_BY expression. Do not copy a defining expression's REFERS_TO targets into another dependency list. HAS_VALUE_ARGUMENT, HAS_DIMENSION_EXPRESSION, and DEFINED_BY distinguish generic values, array dimensions, and dependent-type definitions; the same endpoint does not make these roles interchangeable. Expression REFERS_TO binds a written name, INVOKES selects a callable, and INTRODUCES creates a language identity; none is an inverse or alias of HAS_TYPE. A callee-name binding does not establish overload selection, and a type identity is not a called function.

All type-valued transport references, including `element_type_id`, `return_type_id`, `generic_type_id`, type arguments, substitutions, and conversion endpoints, identify TypeExpression endpoints; in Neo4j these are relationships, not foreign-key properties. TypeProfile is a separate profile node of a declared-type Symbol via HAS_PROFILE, not a profile of TypeExpression.

### TypeUse

A particular written type occurrence, not a second type definition or an alternative type structure. Several TypeUse nodes at different locations may lead to one TypeExpression; an inferred type may have a TypeExpression and no TypeUse. TypeProfile describes a declared type Symbol, not a source occurrence.

| Node Property | Type | Purpose |
| --- | --- | --- |
| `start_offset` !, `end_offset` ! | Integer >= 0 | Actual written type range in the incoming file CONSISTS_OF UTF-8 source version, start inclusive and end exclusive. |

The common stable `id` and optional semantic_properties convention apply. There is no `form` property: source spelling and punctuation remain in the source range, and semantic structure is represented by TypeExpression.kind and its relationships. A spelling does not itself establish a resolved type: `Alias`, `T`, and `auto` may refer to structurally different types after analysis. Removing form does not mean that written syntax and semantic structure are equivalent.

#### TypeUse Relationships

| Relationship | Source -> target | Cardinality | Meaning |
| --- | --- | --- | --- |
| `CONSISTS_OF` | `Declaration -> TypeUse` | Source: 0..many; occurrence: exactly 1 syntactic owner across the CONSISTS_OF and HAS_TYPE_USE owner categories. | Written declaration type, callable return type, base, or constraint. Relationship role identifies the purpose; file membership is not another syntactic owner. |
| `HAS_TYPE_USE` | `Expression -> TypeUse` | Source: 0..many; occurrence: exactly 1 containing source. | Written cast type, explicit generic argument, or other expression-local type spelling. |
| `HAS_TYPE_USE` | `Annotation -> TypeUse` | Source: 0..many; occurrence: exactly 1 containing source. | Type syntax within an annotation. |
| `HAS_TYPE_USE` | `TypeUse -> TypeUse` | Parent: 0..many immediate children; child: exactly 1 containing source. | Nested written component, such as RenderContext inside shared_ptr<RenderContext>; acyclic and immediately nested, not duplicate ancestor links. |
| `CONSISTS_OF` | `ProjectFile -> TypeUse` | Occurrence: exactly 1 source version; file: 0..many occurrences. | File membership and exact source version for the recorded byte offsets; no inverse LOCATED_IN edge or copied spelling. Distinct from the incoming syntactic-owner relationship. |
| `HAS_TYPE` | `TypeUse -> TypeExpression` | 0..many contextual semantic results. | Known or candidate semantic structure of this spelling; role, state, and context follow the common HAS_TYPE rules. Not a node property. |

The incoming syntactic-owner relationship is CONSISTS_OF from Declaration and HAS_TYPE_USE from Expression, Annotation, or a parent TypeUse. It has a required `role`: `declared`, `return`, `base`, `constraint`, `cast`, `argument`, `annotation`, or `language_specific`. Its `position` property is a zero-based sibling index, required for ordered type arguments and nested written components, optional otherwise. Positions are unique within one source and role. They are not byte offsets and not a property of the type itself. Portable subject_id, role, and position describe this owner relationship, not TypeUse node properties. Portable span maps to the separate incoming ProjectFile CONSISTS_OF and scalar offsets; this file edge has no syntactic role or sibling position. Portable has_type is outgoing-edge notation.

The containing declaration is obtained through the syntactic-owner chain and the enclosing Declaration, Expression, or Annotation relationships. The file comes directly from incoming ProjectFile CONSISTS_OF; projects follow that file's memberships. Both paths MUST agree on the source file. Nested written type ranges lie within the parent's range and refer to the same source version. Type lookup results remain in direct REFERS_TO and HAS_TYPE relationships with contextual assessments, not in an exported lexical environment. Inferred types MUST NOT create fabricated type spellings. For example, written `auto` MAY have a TypeUse whose HAS_TYPE targets the deduced structure, but a deduced pointer type has no invented source range. A HAS_TYPE relationship on a declaration or expression does not require a TypeUse.

A TypeUse does not point directly to TypeProfile, nor does it imply that exactly one Symbol represents the whole type. Follow TypeUse -[HAS_TYPE]-> TypeExpression and its structural relationships; nominal or type-parameter structures use REFERS_TO to the relevant Symbol, whose HAS_PROFILE supplies available declared-type details. Name uses on TypeUse may independently have contextual REFERS_TO targets as defined in section 8; these bind names, not the entire composite type. A pointer to a class remains a TypeExpression(pointer) around TypeExpression(nominal), not a new declared type Symbol.

#### HAS_TYPE Edges

`Declaration`, `Expression`, `TypeUse`, and `Symbol` MAY have direct `HAS_TYPE` edges to `TypeExpression`. The edge means that its source has the target semantic type under a specified Project build configuration. It has no separate canonical ID or intermediate node. A parallel `type` or `inferred_type` field is not added to each entity, and HAS_TYPE is not duplicated as other semantic edges.

| Edge Property | Type | Purpose |
| --- | --- | --- |
| `project_id` ! | Scalar project observation key | Build-scope qualifier of the value, not another relationship to Project. |
| `role` ! | `declared`, `inferred`, `return`, `receiver`, `constraint` | Distinction between source types, inference, and other purposes. |
| `state` ! | `established`, `candidate`, `unknown` | Binding resolution state. |

For object serialization, the source entity's `has_type` list contains embedded edges with `target_id` ! (`Id -> TypeExpression`) and the three required properties above. The source is the enclosing entity, and the label is HAS_TYPE; neither `id`, `source_id`, nor a redundant `kind` is stored. Graph serialization stores the same facts as direct edges, not additional parallel lists or relationship nodes. Missing or empty `has_type` does not establish that the source has no type. Unknown results MAY use an edge with `state: unknown` to a TypeExpression of kind `unknown` with an explicit reason.

```json
{
	"id": "decl:copy",
	"has_type": [
		{ "target_id": "type:scene-pointer", "project_id": "project:cpp20", "role": "inferred", "state": "established" }
	]
}
```

This fragment omits the other declaration attributes. Its inferred type does not imply that `Scene*` was written in the source.

The type of a particular declaration is associated with Declaration, the result type of an expression with Expression, and the resolved structure of a spelling with TypeUse. Return and receiver edges start at the corresponding callable Declaration when one is available. Symbol HAS_TYPE is allowed only for a known external, system, or intrinsic symbol without available declarations; a symbol-level type summary is derived through HAS_DECLARATION, never stored as parallel HAS_TYPE edges. Incompatible declaration types remain separate results, not a single summary. Syntactic type ownership uses CONSISTS_OF.role for Declaration or HAS_TYPE_USE.role for the other owners; HAS_TYPE.role describes semantic typing rather than syntax.

Incompatible candidate types and results from different contexts remain separate edges. They MUST NOT be collapsed into one established type. TypeExpression.completeness describes the target structure, not the certainty of an edge. TypeUse locates actual written syntax; HAS_TYPE associates a subject with a semantic structure. Embedded evidence belongs to the source entity with an `attribute_path` identifying the edge, such as `has_type[0]`. Exporters MUST retain the edge association when serializing, aggregating, or reordering records. Derived dependencies preserve the source subject, target type structure, context, edge path, local evidence references, and uncertainty rather than inventing a binding-node ID.

## 7. Expressions and Calls

### Expression

An actual source expression occurrence, not a semantic type, a logical symbol, or a record of execution. Two occurrences of the same text remain distinct expressions. The following table lists native Neo4j node properties in addition to the common `id` and optional semantic properties.

| Property | Type | Purpose |
| --- | --- | --- |
| `kind` ! | `name`, `literal`, `member_access`, `call`, `construction`, `operator`, `assignment`, `cast`, `index`, `lambda`, `conditional`, `collection`, `await`, `language_specific`, `unknown` | Significant syntactic form. |
| `start_offset`, `end_offset` ! | Nonnegative integer pair | Half-open UTF-8 byte range in the source version supplied by incoming ProjectFile CONSISTS_OF. |
| `operator` ? | Normalized operator | Operation kind, including direct or indirect member access. |
| `literal_category` ? | String | Literal category, such as integer, floating, string, character, boolean, null, or a prefixed language-specific category; only for `kind: literal`. |
| `literal_value` ? | Scalar JSON string | Available decoded literal value, not its spelling; only for `kind: literal`. JSON `null` is a recorded null literal, not a missing value. |

#### Expression Kinds

| `kind` | Meaning | Example or structural distinction |
| --- | --- | --- |
| `name` | A name used as an expression. | `owner`; local name-use details and direct REFERS_TO targets describe its binding. |
| `literal` | A literal written in source. | `42`, `"hello"`; original spelling comes from the source range. |
| `member_access` | A member selected from a base expression. | `owner->update`; the base is an operand, the member name is a local name use. |
| `call` | Source invocation syntax. | `update(42)`; the same Expression owns callee, arguments, binding assessment and INVOKES targets. |
| `construction` | Source syntax explicitly constructing a value. | C++ `User{42}`; a factory call is not reclassified from its result type. |
| `operator` | A unary, binary, or other operator expression. | `a + b`; overload selection is a separate semantic result. |
| `assignment` | Assignment syntax. | `owner = value`; target and value are operands. |
| `cast` | An explicit source conversion. | `static_cast<User*>(value)`; written target type is a TypeUse. |
| `index` | Indexing or subscripting syntax. | `items[index]`; overloads do not change the source form. |
| `lambda` | A lambda or function expression. | Introduces its callable Symbol; its body belongs to that callable's Declaration. |
| `conditional` | A source conditional expression. | `test ? left : right`; it is not itself a complete call-reachability assessment. |
| `collection` | A collection or aggregate expression. | List, tuple, or record expression; elements retain source order. |
| `await` | Source awaiting syntax. | `await operation()`; does not assert scheduling or completion. |
| `language_specific` | A recognized form without a portable category. | Preserve source and available operands, with an extension or diagnostic. |
| `unknown` | An expression whose syntactic category is unavailable. | Preserve actual range and explicit assessment limitations. |

#### Expression Relationships

| Relationship | Direction | Cardinality | Meaning / Relationship Properties |
| --- | --- | --- | --- |
| `CONSISTS_OF` | ProjectFile -> Expression | Expression: exactly 1 file | Actual file membership and source-version anchor of every occurrence, including nested expressions. |
| `CONTAINS_EXPRESSION` | Declaration -> Expression | Expression: 0..1 nearest declaration | Nearest containing declaration; absent for file-level expressions. Not an edge from the caller Symbol or an outer call. |
| `HAS_OPERAND` | Expression -> Expression | 0..N ordered operands | Required `role` and zero-based `position`, unique per source expression across roles; e.g. base, left, right, target, value, test, then, else, element, operand. |
| `INTRODUCES` | Expression -> Symbol | Expression: 0..1 callable | Callable identity introduced by a lambda or function expression, not a call to its body. |
| `HAS_TYPE` | Expression -> TypeExpression | 0..N contextual results | Result type; edge properties are defined in section 6. |
| `HAS_TYPE_USE` | Expression -> TypeUse | 0..N source type spellings | Syntactic `role` and optional ordered `position`, as defined in section 6. |

Syntax relationships MUST be acyclic and preserve actual occurrences and source order, not execution order. Non-body operands and the callee/arguments of one call belong to the same project, file, and nearest declaration as that expression. Calls and constructions MUST NOT duplicate their callee and arguments as HAS_OPERAND edges. A member-access receiver remains its base operand. Lambda body expressions belong to the introduced callable's Declaration, not to the declaration containing the lambda expression.

Portable `file_id`, `declaration_id`, `span.file_id`, `operands[].expression_id`, `introduced_symbol_id`, and `has_type` encode these relationships, not native node properties. `operands` array indices provide HAS_OPERAND.position. Portable `literal: {category, value}` maps to literal_category and literal_value; decoded values that cannot be represented losslessly by ordinary JSON numbers MUST use an explicit tagged scalar encoding inside the JSON string, not rounding or graph IDs. Absent decoded values remain absent. Literal decoding is not arbitrary expression evaluation.

An expression type is represented by HAS_TYPE edges; name uses and their REFERS_TO relationships are part of the expression or other source construct, as defined in section 8. Available value category, constant value, and nullability results MAY be attached directly to the expression in its optional semantic_properties list; see section 3.

The structure of nested calls, member-access base expressions, assignments, and lambdas MUST be preserved. A full concrete syntax tree is not required; punctuation is available through source text. Synthetic implicit expressions MAY be represented by a separate language-specific extension without a fabricated source span.

#### Invocation Properties

For `kind: call` or `construction`, the same Expression owns the following additional properties and relationships. There is no separate call profile node. A call occurrence, its syntax, known target, candidates, and binding details form one coherent fact, not a chain of mandatory analysis records.

| Property | Type | Purpose |
| --- | --- | --- |
| `call_kind` ! | `ordinary`, `constructor`, `operator`, `indirect`, `delegated_constructor`, `language_specific` | Invocation semantics. |
| `condition_predicate` ? | Scalar JSON string | Optional logical restriction on reaching this occurrence; expression leaves are placeholders resolved by CONDITION_EXPRESSION, never graph IDs hidden in JSON. |
| `condition_completeness` ? | `complete`, `partial`, `unknown` | Required with condition_predicate; completeness within the explicitly assessed area, not proof of execution or feasibility. |

#### Call Kinds

| `call_kind` | Meaning |
| --- | --- |
| `ordinary` | Ordinary call syntax, including named functions, members, and factory functions; resolution determines the target. |
| `constructor` | Explicit constructor invocation or construction syntax supported by the language. |
| `operator` | An invocation represented as a call with operator semantics; ordinary operator syntax can remain an Expression of kind operator. |
| `indirect` | Invocation through a function pointer, function value, or callable object when established; unknown targets are not fabricated. |
| `delegated_constructor` | A constructor delegates to another constructor of its own type. |
| `language_specific` | An invocation form requiring language-specific interpretation. |

#### Invocation Relationships

| Relationship | Direction | Cardinality | Meaning / Relationship Properties |
| --- | --- | --- | --- |
| `HAS_CALLEE` | Expression -> Expression | call/construction: exactly 1 callee | Called name, member access, function pointer, or callable object. Not the selected target Symbol. |
| `HAS_ARGUMENT` | Expression -> Expression | call/construction: 0..N source arguments | Required zero-based `position` and `expansion` (none, sequence, mapping, pack); optional `name` and `passing_mode`. Positions are unique and contiguous in source order. |
| `CONDITION_EXPRESSION` | Expression -> Expression | Exactly 1 edge per expression leaf | Required `predicate_path` (JSON Pointer); target-specific conditions also carry `target_position` and context to identify their INVOKES relationship. |

An argument's `name` is its source named-argument label, not a copy of a resolved parameter name. `expansion: none` is an ordinary argument; sequence, mapping, and pack preserve the source spread/unpacking form without inventing expanded values. `passing_mode` records an explicit source mode, such as ref, out, or in, when applicable. Formal-parameter association, defaults, receiver conversions, overload selection, and inferred generic substitutions qualify the particular INVOKES target as defined in section 8. No argument count or source argument record node is required: relationships preserve occurrences and order, including repeated text at different positions.

Portable `callee_expression_id` and `arguments[]` on Expression encode HAS_CALLEE and HAS_ARGUMENT relationships with their properties, not native node properties. A zero-argument call has no HAS_ARGUMENT relationships, not a fabricated empty argument node.

Explicit written type arguments are represented by call Expression -[HAS_TYPE_USE {role: argument, position: index}]-> TypeUse. Non-type template arguments retain their actual Expressions and positions in the combined type, value, and template argument sequence. This call-site syntax is distinct from the HAS_TYPE_ARGUMENT, HAS_VALUE_ARGUMENT, and HAS_TEMPLATE_ARGUMENT relationships of a semantic generic TypeExpression; a call's explicit arguments do not by themselves establish its result type.

For call or construction expressions, HAS_OPERAND does not duplicate HAS_CALLEE and HAS_ARGUMENT. The receiver is stored as the base operand of the callee member-access expression; an independent syntactic receiver copy in the call is not required. Semantic receiver conversions qualify the target binding without changing the source expression.

There are no separate method name, signature string, caller name, or argument count fields. The containing callable is determined from the incoming Declaration CONTAINS_EXPRESSION relationship and the declaration parent chain, selecting the nearest declaration whose Symbol is callable. The declaration and expression belong to the same project. Expressions in local initializers may belong to the variable declaration, whose parent chain identifies the containing callable. Nested expressions keep their actual containing declaration; an outer call does not become a declaration container.

A lambda or local function has its own callable symbol and declaration. Expressions in its body belong to that declaration, not to the outer callable. The lambda expression itself belongs to its enclosing declaration and refers to its introduced symbol through INTRODUCES; creating the lambda does not establish a call to its body. A call without an enclosing callable retains its actual declaration, if any, and its project and actual file rather than a fabricated function. Calls in branches stay attached to their containing declaration, with restrictions recorded on the Expression and CONDITION_EXPRESSION relationships.

#### Call Conditions

There is no standalone condition node or separately identified condition record. Occurrence restrictions are part of the call Expression; target-selection restrictions qualify individual INVOKES relationships. Both restrictions apply together and are not interchangeable. Neither predicts execution.

The scalar condition_predicate is a JSON logical tree. Supported variants are `{ "kind": "expression" }`, `{ "kind": "not", "predicate": ... }`, `{ "kind": "and", "predicates": [...] }`, `{ "kind": "or", "predicates": [...] }`, and `{ "kind": "unknown", "reason": "..." }`. Each expression placeholder has exactly one CONDITION_EXPRESSION relationship at its JSON Pointer path: the empty string for a root expression, `/predicate` under a root not, or `/predicates/0` for the first child of a root and/or. Paths and tree shape MUST agree; multiple leaves may reference the same source Expression through differently positioned relationships. The tree MUST NOT contain expression IDs or duplicate the source expression's operands.

For `if (ready) send();`, the call Expression can have `condition_predicate: "{\"kind\":\"expression\"}"`, `condition_completeness: complete`, and a CONDITION_EXPRESSION edge with `predicate_path: ""` to the actual Expression for `ready`. The else-branch call instead stores a not tree, with its expression edge at `/predicate`. Nested branch restrictions can be combined with and; alternative conditions with or. The connected Expression retains spelling, operands, name uses, and types and is interpreted under the source language's truth-value rules; it need not have a boolean static type.

Target-specific condition_predicate and condition_completeness are properties of the corresponding INVOKES relationship. CONDITION_EXPRESSION starts at the same call Expression and carries context, target_position (the index in portable invokes), and predicate_path. These are local association keys, not separate fact IDs. Reordering targets MUST update condition associations, evidence paths, and positions together. A Neo4j adapter MUST preserve this association explicitly; relationships cannot themselves be endpoints.

The offline portable notation MAY keep `condition: {predicate, completeness}` with expression_id on expression leaves, on the call Expression or an INVOKES relationship. This is equivalent relationship notation, not a JSON node property containing graph IDs. Exporting it requires extracting those IDs into CONDITION_EXPRESSION relationships and encoding the remaining predicate tree as a scalar string.

Occurrence restrictions can arise from if/else, conditional expressions, short-circuit operands, and other supported conditional constructs. Target restrictions can arise when a configuration-dependent assignment chooses a provider before a shared call site. Conditions governing a lambda's creation do not automatically govern calls in its body. Unknown portions MUST NOT be silently omitted from a predicate claimed to be complete. An absent condition means not recorded or unknown, not unconditional. A complete empty and MAY explicitly represent no restrictions within the assessed area; an empty or MUST NOT be used as an unconditional predicate.

Evidence uses the call Expression ID and a precise path, such as `condition` or `invokes[0].condition`. A complete condition concerns captured restrictions, not proof of reachability, path feasibility, termination, or discovery of every runtime target. Target conditions derived through assignments or configuration require supporting semantic evidence; a matching name or lexical proximity is insufficient. Unavailable configuration values or predicates remain explicitly unknown rather than being fabricated. Recording restrictions does not require evaluating configuration or executing the program.

## 8. References, Binding, and Implementations

#### Name Uses and Binding Assessments

There are no standalone Reference, Resolution, or ImplementationSet nodes. A source construct owns its name-use details, contextual binding assessments, and direct targets. Expressions, TypeUse, Declaration, Import, and Annotation can contain name uses. A simple name Expression is already the occurrence; no second occurrence node is required. Multiple name uses in one construct remain distinguishable without creating extra entities.

| Portable Field / Native Property | Contents | Meaning |
| --- | --- | --- |
| `name_uses` / `name_uses_json` | Embedded entries: `key`, `start_offset`, `end_offset`, `role`, `qualification` | Local source-name sites, encoded as a scalar JSON string in Neo4j, with no graph IDs. Coordinates refer to the owner's source version and lie within its range. Keys are unique within the owner, not global entity identities. |
| `binding_results` / `binding_results_json` | Embedded entries: `site_key`, `project_id`, `state`, `candidate_set_completeness`, `reason_codes`, optional `implementation_completeness` | One current assessment per owner/site/scope; project_id is a scalar scope qualifier, not an edge to Project. No ID, target copy, candidate list, or analysis-attempt history. Even zero known targets can retain an unresolved or unsupported result. |

Name-use role is read, write, read_write, address, type, callee, annotation, inheritance, import, export, capture, or label. Qualification is unqualified, qualified, member, global, or language_specific. Spelling comes from source text, not a copied name. `site_key` selects a local name-use key, the reserved `call` for the whole invocation, or the reserved `source` for an Import's source lookup. Local name-use keys MUST NOT use these reserved values. Lookup of a callee name may identify several overloads while the whole call selects one using its arguments; these distinct results share source constructs rather than separate result nodes.

Assessment state is resolved, ambiguous, unresolved, partial, or unsupported. Candidate-set completeness is complete, partial, or unknown. Implementation completeness, when assessed, is complete, partial, or unknown. A complete empty implementation result is not the same as a missing assessment or an incomplete empty result. Job completion and an absent target do not imply successful binding. A resolved assessment requires exactly one selected edge, a complete relevant candidate scope, established target identity, and no unknown potentially applicable competitor. Other states have no selected edge. Import source lookup uses the established/candidate IMPORTS_FROM contract in section 9 for both imports and reexports instead of selected/candidate/rejected name targets. Repeated assessments for an owner/site/context are invalid; updates replace the old result and its associated targets atomically.

#### Direct Binding Relationships

| Relationship | Direction | Cardinality | Meaning / Relationship Properties |
| --- | --- | --- | --- |
| `REFERS_TO` | Expression, TypeUse, Declaration, Import, Annotation -> Symbol | 0..N contextual name targets | Properties: site_key, context association, state, applicability, reason_codes. The local name-use site supplies exact coordinates and role. |
| `INVOKES` | Expression -> Symbol | call/construction: 0..N contextual targets | Targets callable Symbols; site_key is call. Properties: state, applicability, context association, reason_codes, optional dispatch_kind, condition_predicate and condition_completeness. |
| `POSSIBLE_IMPLEMENTATION` | Expression -> Declaration | call/construction: 0..N known definitions | Target must be a callable definition of the selected target or a supported override implementation. Carries context, site_key and target_position associating it with the particular INVOKES edge. Never predicts execution. |
| `BINDS_ARGUMENT` | Expression -> Symbol | 0..N formal-parameter bindings per target | Targets parameter Symbols; target_position, binding_position and argument_positions preserve target association, defaults, named and variadic binding. |
| `USES_DEFAULT` | Expression -> Expression | 0..N recorded defaults per target | target_position and binding_position associate the default Expression with BINDS_ARGUMENT; no copied default source text. |
| `HAS_RECEIVER_BINDING` | Expression -> Expression | 0..1 semantic receiver per target | target_position identifies the INVOKES edge; not a duplicate syntactic base operand. |
| `BINDS_RECEIVER` | Expression -> Symbol | 0..1 known formal receiver per target | Targets a parameter Symbol when the language exposes one; target_position identifies the binding. |
| `SUBSTITUTES_PARAMETER` | Expression -> Symbol | 0..N substituted type parameters per target | Targets type_parameter Symbols; target_position and substitution_position pair with the substituted value edge. |
| `SUBSTITUTES_TYPE` | Expression -> TypeExpression | 0..N substitutions | target_position and substitution_position preserve association with the type parameter. |
| `SUBSTITUTES_VALUE` | Expression -> Expression | 0..N value substitutions | Same association keys for expression-valued generic arguments. |
| `CONVERTS_FROM` | Expression -> TypeExpression | 0..N conversion source types | target_position, binding_key, conversion_position, conversion_kind and conversion_state identify the particular conversion. |
| `CONVERTS_TO` | Expression -> TypeExpression | 0..N conversion target types | Same association keys; preserves identity, numeric_promotion, reference_binding, boxing, user_defined, or language_specific conversion results. |

INVOKES and occurrence REFERS_TO target edges use state selected, candidate, or rejected and applicability applicable, inapplicable, or unknown. Rejected edges are inapplicable and do not produce dependencies. Selected edges are applicable. Supported applicable or unknown candidates remain possible dependencies without arbitrary selection. Unknown candidates require evidence for that target and edge path; matching names alone is insufficient. Selected targets are not repeated as separate candidate edges. An established external/system Symbol is a valid target; a provisional placeholder cannot establish a selected target. Missing external facts, reflection and dynamic dispatch can leave the set partial or unknown.

All target-specific detail relationships start at the call Expression, retain the effective context, and use target_position to select the particular INVOKES relationship (its zero-based portable list position). Position keys do not confer independent relationship identities. An adapter MUST preserve these associations explicitly, including during reordering and updates; it cannot attach edges to other edges. Embedded binding_results_json provides site-qualified assessments and scalar build-scope qualifiers without an edge to Project. This specification defines the logical association, not a running Neo4j importer.

Portable outgoing `invokes`, `refers_to` and `possible_implementation` lists encode direct relationships with target_id endpoints and scalar project_id build-scope qualifiers, never a project relationship or native foreign-key node property. INVOKES entries MAY carry portable argument_bindings (parameter_id, argument_positions, optional default_expression_id, conversions), receiver_binding (expression_id, optional parameter_id, conversions), type_substitutions (parameter IDs to TypeExpression or Expression IDs), and candidate conversions. These are endpoint notation for the detail relationships above, not nested node properties or graph IDs hidden in scalar JSON. Empty argument_positions may denote a default; multiple positions may bind a variadic parameter; unknown expansion is not a fabricated element list. Conversion binding_key identifies candidate, receiver, or argument plus its binding index; conversion_state is established, candidate, or unknown. Scalar-only conversion details with unavailable type endpoints remain explicit without fabricating a type edge.

Embedded evidence belongs to the source construct and uses the exact attribute_path, such as `invokes[0]`, `refers_to[1]`, `binding_results[0]`, or `possible_implementation[0]`. Support for one target, nested semantic property, or project MUST NOT establish another. Statement-wide occurrence-condition evidence may qualify each already supported INVOKES target, but does not establish a new target or support callee name lookup. Derived dependencies preserve the source ID, target, context, path, local evidence references and prerequisite paths, candidate uncertainty, and both occurrence and target conditions without inventing binding-node IDs.

## 9. Imports, Annotations, and Semantic Edges

### Import

An actual import, include, using, or reexport source directive. It owns source lookup and local binding details, not a separate resolution or binding node. Dynamic import syntax MAY share its actual call Expression; that does not make every import an invocation.

| Node Property | Type | Purpose |
| --- | --- | --- |
| `start_offset`, `end_offset` ! | Integer >= 0 | Half-open range of the directive in the source version supplied by incoming file IMPORTS. |
| `form` ! | `import`, `include`, `using`, `extern`, `language_specific` | Syntactic directive family, not target kind, wildcard selection, or execution. |
| `is_reexport` ! | Boolean | Whether this directive also forwards names under language rules. Independent of form and wildcard bindings. |
| `source_form` ! | `qualified_name`, `string`, `angle_header`, `quoted_header`, `expression`, `none`, `language_specific` | Written source form; angle and quoted includes retain distinct search rules. |
| `path_segments` ? | Ordered list of strings | Known syntactic name/path components; not a resolved file path or copied full spelling. Absent for an unavailable or computed path. |
| `relative_level` ? | Integer >= 0 | Relative imports. |
| `bindings_json` ! | Scalar JSON string | Local entries: key, wildcard, optional name_use_key. No graph IDs or copied alias names. |
| `presence_condition` ? | Scalar JSON string | PresenceCondition encoding for source activation, not runtime reachability. |

#### Import Relationships

| Relationship | Source -> target | Cardinality | Meaning |
| --- | --- | --- | --- |
| `IMPORTS` | ProjectFile -> Import | Import: exactly 1 file | Actual containing file and source-version anchor for the directive offsets; not its resolved provider. |
| `CONTAINS_IMPORT` | Declaration -> Import | Import: 0..1 nearest declaration | Absent for file-level directives. |
| `HAS_SOURCE_EXPRESSION` | Import -> Expression | 0..1 | Actual computed source expression; required when source_form is expression. |
| `HAS_IMPORT_EXPRESSION` | Import -> Expression | 0..1 | Actual enclosing import expression, when the language has one; not an invented invocation. |
| `INTRODUCES` | Import -> Symbol | 0..N known local identities | Required binding_key selects a non-wildcard local binding; context association identifies the configured introduction. |

Portable file_id, declaration_id, span, path_expression_id, import_expression_id and introduces encode these relationships. Portable bindings is the decoded bindings_json list; keys are unique within the Import. Each introduces entry has target_id, binding_key, and project_id, not a canonical edge ID. The local Symbol stores the alias name; an imported written name uses name_use_key to select this Import's name_uses and contextual REFERS_TO targets. One local binding can therefore distinguish its introduced Symbol from its external target without an ImportBinding node. A side-effect import may have no bindings. A wildcard is a lookup rule, not an enumerated or complete imported-name set; it MUST NOT fabricate local Symbols. Preserve language-specific namespace/default bindings without inventing a written exported name.

Source lookup uses embedded binding_results with site_key source, encoded as binding_results_json in Neo4j. IMPORTS_FROM targets ProjectFile or an established namespace/module/source-provider Symbol, never Project, and carries site_key source. IMPORTS identifies the containing file; IMPORTS_FROM identifies the resolved provider, which may be a different file. These are source-provider edges, not copies of each imported member's REFERS_TO. A resolved source assessment requires exactly one established provider and complete relevant candidate scope; other assessments have only candidate providers or none. Provisional Symbols cannot establish a provider. Candidate providers require target/path/context evidence. Multiple participating files do not mean multiple competing providers: preserve the provider identity and its separate structural facts. Reexports use the same IMPORTS_FROM with Import.is_reexport true, never a parallel REEXPORTS_FROM relationship or reexports_from list; public exported Symbol mappings remain distinct EXPORTS facts. Source assessment does not establish member binding, wildcard expansion, or transitive export completeness.

Every resolved included or imported file has a ProjectFile node and an IMPORTS_FROM relationship from its directive; it does not require a separate source node or analysis group. Resolving a file does not establish that its contents or symbols were analyzed. Unknown paths, unavailable SDK headers, and unevaluated computed sources retain the directive and explicit unresolved, partial, or unsupported assessments without fabricated paths or targets. Source lookup, local introductions, and member lookups are reconciled together where they depend on each other, with exact source/path/project Evidence. Import expression and source expression retain their ordinary Expression contracts and actual source ranges within the directive.

### Annotation

One written annotation, attribute, or decorator application, not its type, evaluated value, or execution. Preserve each occurrence even if its name or arguments cannot be analyzed. Annotation does not require an AnnotationProfile or a result node.

Annotation is not a Symbol kind: a declared annotation class or decorator function has its ordinary Symbol and Declaration, while each use is a separate application occurrence. One Symbol can therefore be referenced by many Annotation applications; a built-in attribute such as C++ [[nodiscard]] need not resolve to a declared Symbol at all. The annotated Declaration is the application target, not the declaration of the annotation type. Replacing applications with Symbols would lose per-use arguments, order, unresolved names, and file-level targets.

| Node Property | Type | Purpose |
| --- | --- | --- |
| `start_offset`, `end_offset` ! | Integer >= 0 | Half-open application range in the source version supplied by incoming file ANNOTATES. |
| `form` ! | `annotation`, `attribute`, `decorator`, `language_specific` | Source application family; does not determine whether it executes. |
| `presence_condition` ? | Scalar JSON string | PresenceCondition encoding, independent of execution. |

#### Annotation Relationships

| Relationship | Source -> target | Cardinality | Meaning |
| --- | --- | --- | --- |
| `ANNOTATES` | ProjectFile -> Annotation | Annotation: exactly 1 file | File membership and source-version anchor, including file-level applications. Optional file_targets_json preserves same-file application targets as scalar role/position entries without IDs. |
| `CONTAINS_ANNOTATION` | Declaration -> Annotation | Annotation: 0..1 nearest declaration | Lexical association, not a replacement for the application target. |
| `ANNOTATES` | Annotation -> Declaration | 0..N known declaration targets | Required role: declaration, return, or language_specific; required position orders applications for the same target, role, and file. Parameters use their own Declaration. Same-file and assembly targets belong to the incoming file edge, not a reverse relationship. |
| `HAS_ARGUMENT` | Annotation -> Expression | 0..N ordered entries | Required position; optional name for a named argument. Actual source values, not evaluated copies. |
| `HAS_APPLICATION_EXPRESSION` | Annotation -> Expression | 0..1 | The actual written decorator/application expression when it is an expression in the language. |

Portable file_id, declaration_id, span, targets (target_id, role, position), arguments (expression_id, optional name), and application_expression_id encode the relationships, not native node properties. A target whose target_id is the containing file maps to file_targets_json on its single incoming file ANNOTATES edge; declaration targets map to outgoing ANNOTATES edges. The JSON contains only role and position, since the file endpoint already supplies identity. Complete application means at least one known target across both representations. Argument list indices supply position. The optional declaration_id is the nearest associated declaration, not the sole annotation target. File/assembly applications can have no declaration association; assembly role uses the containing ProjectFile as the source anchor, not an invented assembly Declaration. Application positions are unique per target/role/file and preserve source order, not a universal execution order. Multiple explicit targets support languages where one written application affects several declarations. Unresolved or unsupported targets are omitted rather than fabricated; a material recovery problem may be reported by a shared Diagnostic.

The name uses contextual REFERS_TO with role annotation on the construct that owns the actual spelling. TypeUse is present only for actual written type syntax, not required for every annotation name. When an application Expression or TypeUse already owns a name use, do not duplicate that use and its binding on Annotation. Written argument Expressions and any application Expression belong to the same project/file and nearest associated declaration; their ranges lie within the Annotation range. A written argument inside an application Expression reuses the same Expression occurrence and is not cloned as an annotation value. HAS_TYPE_USE remains available for real annotation-local type syntax.

For @factory(x), HAS_APPLICATION_EXPRESSION points to the actual call Expression factory(x), whose own INVOKES assessment describes that call. The implicit later application of its result to a declaration has no invented source-call Expression. @decorator can point to a name Expression without asserting an invocation. Annotation alone, a resolved annotation type, or a matching name does not establish execution. Missing arguments or targets are not proof of absence. Evidence uses the Annotation and precise paths such as targets[0] or arguments[0], or the actual Expression/TypeUse that owns the supported fact.

#### Semantic Edges

A direct typed edge represents a relationship not fully derivable from the base structure: inheritance, override, alias, export, capture, or callback registration. There is no standalone relationship entity or canonical edge ID. Project build dependencies are represented only by direct DEPENDS_ON or EXTERNAL edges.

In object serialization, the source node holds an optional outgoing list named by the table below. Each entry contains `target_id` !, pointing to the permitted target category, and the edge properties below. The source is the enclosing node; the graph label is the uppercase list name, such as INHERITS or IMPORTS_FROM. Entries MUST NOT contain `id`, `source_id`, or a redundant `kind`. Graph serialization represents the same facts as direct edges, not parallel relationship nodes. Missing lists mean not recorded, not proof that no relationship exists.

| Edge Property | Type | Purpose |
| --- | --- | --- |
| `project_id` ! | Scalar project observation key | Build scope in which the relationship applies; a qualifier on this edge, never another relationship to Project. |
| `site_id` ? | `Id` of a source construct | Source evidence without repeating coordinates. |
| `state` ! | `established`, `candidate` | Established or possible relationship. |
| `presence_condition` ? | `PresenceCondition` | Conditional applicability. |
| `details` ? | Typed extension determined by the edge label | Relationship-specific properties, such as capture mode or inheritance visibility. |
| `semantic_properties` ? | Embedded property entries | Optional additional results as defined in section 3; no duplicate of typed edge properties. |

| Outgoing list | Source -> target | Additional Information |
| --- | --- | --- |
| `inherits`, `implements` | `Symbol(type) -> TypeExpression` | Visibility, virtual-base flag, generic substitution. |
| `overrides` | `Symbol(callable) -> Symbol(callable)` | Distinction between an override and a same-name overload. |
| `aliases`, `underlying_type` | `Symbol(type) -> TypeExpression` | Alias target and enum underlying type. |
| `constrains` | `Symbol(type_parameter) -> TypeExpression` | Constraint kind. |
| `accessor_for` | `Symbol(callable) -> Symbol(property)` or `Symbol(field)` | Getter or setter and its associated property. |
| `imports_from` | `Import -> ProjectFile` or `Symbol` | Source provider, not an imported member; site_key source associates the contextual assessment. Import.is_reexport distinguishes reexports without a second relationship kind. |
| `exports` | `ProjectFile` or `Symbol(module) -> Symbol` | File/module export; project public API is derived transitively through file membership, not stored as Project -> Symbol. |
| `captures` | `Symbol(callable) -> Symbol` | Capture mode: value/reference/move/unknown. |
| `registers_callback` | `Expression(call) -> Symbol(callable)` | Argument position and an established API contract. |

Passing a lambda as an argument establishes neither `registers_callback` nor execution of its body. Without an API contract, the argument, callable reference, and captures are preserved, but registration is not fabricated.

For example, a type Symbol MAY contain `"inherits": [{"target_id":"type:base","project_id":"project:example","state":"established"}]`. Candidate targets and contexts remain separate edges. Evidence references the source Symbol with an attribute_path such as `inherits[0]`. Evidence for an edge's embedded property uses a nested path such as `inherits[0].semantic_properties[0]`. Exporters MUST preserve edge, context, and property associations when reordering or aggregating lists. Derived dependencies retain the source node, edge label, target, context, path, evidence, and uncertainty without inventing relationship IDs.

Ownership, declarations, operands, HAS_TYPE edges, references, and the selected invocation target are already represented by base entities and direct edges and are not duplicated as additional semantic edges.

## 10. Structural Dependency Graph

This section defines fidelity requirements for dependency projections from Code Facts, not additional canonical fact entities. The offline views illustrate such projections; section 15 defines the Semantic Code Graph schema. Repository-wide projections consume reconciled fact snapshots as described in section 1.

Structural dependencies are derived from direct INVOKES, REFERS_TO, POSSIBLE_IMPLEMENTATION, import, HAS_TYPE, and semantic relationships. Occurrence-level INVOKES is a Code Fact; callable-to-callable and component-level call links are projections. A selected target establishes a declaration-level relationship; other applicable or unknown candidates remain possible. Rejected targets do not produce dependencies. Known definitions do not claim execution.

A relationship found inside a conditional branch is retained without proving that the branch executes. Presence conditions describe source applicability, not execution paths. Component-level relationships MAY aggregate occurrences and analysis configurations, retaining their supporting records and uncertainty rather than duplicating an edge for every occurrence. Aggregation does not imply that all relationships apply simultaneously in one configuration.

Derived call relationships (`CALLS` or equivalent view labels) MUST retain occurrence and target-selection conditions, their completeness, and supporting source IDs, edge paths, and evidence. Their effective restriction is the conjunction of the occurrence and target predicates; absence remains unknown, not true. Aggregation MUST preserve target/occurrence/context associations instead of combining incompatible predicates or losing alternatives. A call condition does not replace PresenceCondition: an expression-tested runtime setting differs from source activation under a Project.

Project identifies static language and dependency settings, not a runtime state. Neither execution tracing nor branch-sensitive value tracking is required for conformance. Indirect or dynamic references preserve known candidates and explicit limitations; unavailable targets are not fabricated. These code dependency graph edges are derived views, not duplicate canonical semantic edges. Optional semantic_properties do not introduce structural dependencies or establish an edge merely because a value is present.

A project map uses `Repository`, `Project`, `Directory`, `ProjectFile`, and `ExternalLibrary` nodes with direct `CONTAINS`, `EXTERNAL`, and `DEPENDS_ON` edges from the dataset. Project roots in the map are projects without a recorded parent; physical trees use directory parents. These canonical structural relationships are not derived code-call relationships. Code dependencies MAY be projected onto projects transitively through actual ProjectFile membership and declaration/owner paths, qualified by each analyzed result's scalar build scope, retaining their original evidence and uncertainty. Shared-file membership MUST NOT arbitrarily assign a code dependency to one project, nor turn it into a descriptor-declared dependency. A map MUST distinguish discovered build dependencies from such code-derived overlays.

## 11. Evidence and Diagnostics

#### Embedded Evidence

Evidence is metadata attached to the fact it supports, not a standalone node. Any fact owner MAY have an evidence list, including owners of direct relationships and embedded semantic properties. Each entry has a local key, not an id or subject_id. The enclosing node is its owner; attribute_path selects the supported fact, such as invokes[0] or inherits[0].semantic_properties[0]. A relationship cannot itself be an endpoint. Keeping evidence on the owner with a precise path does not introduce a relationship node.

| Embedded Field | Type | Purpose |
| --- | --- | --- |
| `key` ! | Local string | Unique within the owner's evidence list; not a global identity. |
| `attribute_path` ? | AttributePath | Exact supported fact; absent only for a claim about the whole owner, not blanket support for every outgoing edge. |
| `project_id` ? | Scalar project observation key | Required for context-dependent support; preserved in evidence_json as a build-scope qualifier, not a relationship endpoint. |
| `project_independent` ? | Boolean | Must be true when project_id is absent; explicit independence, not an unknown-context wildcard. Mutually exclusive with project_id. |
| `method` ! | `syntax`, `language_rules`, `compiler`, `configuration`, `inference`, `heuristic`, `manual` | Acquisition method. |
| `authority` ! | `observed`, `established`, `inferred`, `heuristic`, `unknown` | Nature of support, not a numeric confidence or replacement for binding state. |
| `source_spans` ! | Portable SourceSpan list | Actual source evidence, mapped to EVIDENCE_SOURCE relationships. Empty without available analyzed text. |
| `supports` ! | Portable entries: subject_id, optional attribute_path | Prerequisite facts, mapped to SUPPORTED_BY. A precise prerequisite edge/property uses its owner and path, never an invented fact ID. |
| `detail` ? | Scalar-encodable structured value | Rule or explanation; no graph IDs and no copied fact value. Shared analyzer/version metadata belongs to the dataset/context, not every evidence entry. |

Native evidence_json is a scalar JSON string containing local keys, supported paths, method, authority, scalar project scope qualifiers, independent-scope flags, and detail. Source files and prerequisite fact endpoints MUST be extracted into relationships, not hidden in that JSON. Project membership is obtained transitively; context qualification does not create an edge to Project. Multiple evidence entries may support one fact. No Evidence category or canonical evidence ID is exported.

| Relationship | Source -> target | Cardinality | Meaning |
| --- | --- | --- | --- |
| `EVIDENCE_SOURCE` | Fact owner -> ProjectFile | 0..N per entry | evidence_key, position, start_offset, end_offset preserve each actual source range. |
| `SUPPORTED_BY` | Fact owner -> Fact owner | 0..N prerequisites per entry | evidence_key selects the supported entry; optional supporting_path selects the prerequisite fact at the target. |

For code owners, SUPPORTED_BY MUST NOT target Project as a shortcut for membership or build context. Evidence about project settings references the actual descriptor/configuration file or an existing supported code fact, retaining its scalar build scope.

Fact owner means an existing node of a permitted category, not another node type. These generic metadata relationships are described without drawing an all-to-all schema graph. Consumers use owner ID plus local evidence key and attribute_path to locate support. Context-dependent evidence applies only in its recorded context; absent context does not mean every context. Whole-owner evidence does not establish an individual candidate, edge, or nested property. Heuristic evidence alone does not establish identity or candidate completeness. Recorded occurrence-condition evidence can qualify an already supported call target as specified in section 7, but cannot establish a different target or name lookup.

For example, this portable fragment attaches support to a particular invocation edge, not to an Evidence node. The owner key and prerequisite paths remain associated during native export and projection; the other required Expression fields are omitted here.

```json
{
	"id": "call:render",
	"invokes": [{"target_id":"symbol:render","project_id":"project:example","site_key":"call","state":"selected","applicability":"applicable","reason_codes":[]}],
	"evidence": [{
		"key": "target-binding",
		"attribute_path": "invokes[0]",
		"project_id": "project:example",
		"method": "compiler",
		"authority": "established",
		"source_spans": [],
		"supports": [{"subject_id":"symbol:render"}]
	}]
}
```

### Diagnostic

An independently addressable issue or informative message, not evidence that a fact is true and not a completeness assessment. Report actionable failures and material limitations, such as missing permissions or SDK headers, unsupported descriptors, and unavailable lockfiles. Prefer one Diagnostic at the shared file, project, or repository scope for a common cause rather than one per affected fact. A legitimate unresolved or unknown result does not automatically require a Diagnostic. Neither missing facts nor the absence of diagnostics proves the analysis was exhaustive.

| Node Property | Type | Purpose |
| --- | --- | --- |
| `severity` ! | `info`, `warning`, `error` | Message importance, not an indicator of factual certainty or analysis completeness. |
| `code` ! | Stable producer-namespaced string | Machine-readable issue class; consumers do not parse message text. |
| `message` ! | String | Human-readable description. |
| `attribute_path` ? | AttributePath | Particular fact at the primary subject, when relevant. |

| Relationship | Source -> target | Cardinality | Meaning |
| --- | --- | --- | --- |
| `ABOUT` | Diagnostic -> Fact owner | 0..1 primary subject | Portable subject_id; optional for dataset-level messages. |
| `REPORTED_IN` | Diagnostic -> Project | 0..1 | Required when the issue depends on configured language analysis; portable project_id. |
| `LOCATED_IN` | Diagnostic -> ProjectFile | 0..1 primary location | start_offset/end_offset on the relationship; portable span. |
| `RELATED_TO` | Diagnostic -> Fact owner | 0..N | Additional facts, e.g. conflicting declarations; optional attribute_path and role. |
| `RELATED_LOCATION` | Diagnostic -> ProjectFile | 0..N ordered locations | position, start_offset/end_offset and optional message; not fabricated declarations. |

Portable related_subjects entries (subject_id, optional attribute_path and role) and related_spans entries (span, optional message) encode these native relationships. No graph IDs are encoded in message or scalar JSON. The primary source range and related ranges reference exact source versions. A Diagnostic with attribute_path requires a primary subject. Conflicting definitions can refer to both declarations without picking one as true. Severity alone does not establish binding failure; an informational dependency cycle is not proof of execution or an analysis error.

#### Current-State Updates

Evidence and Diagnostic have distinct lifecycles but are published consistently with the facts they describe. When source versions, context settings, or reconciled targets change, replace affected facts and their local evidence together, and remove or replace obsolete Diagnostics. Reordering outgoing lists MUST update evidence paths, supporting paths, and Diagnostic paths atomically; local evidence keys are not stable identities for the supported edges. Do not retain old binding results against new inputs or treat a disappeared issue as proof of completeness. Analysis-run history, scheduling and retries remain outside the current Code Facts snapshot; no AnalysisResult or analysis-attempt node is required.

## 12. Model Invariants

1. All references point to existing entities of permitted categories. Unidentified external targets are represented by placeholders or unresolved results, not dangling IDs.
2. Source ranges lie within the bounds of a particular UTF-8 source version. Declaration name and body offset pairs lie within its full offset pair and use the same incoming ProjectFile CONSISTS_OF file. Portable SourceSpan values preserve the same file and byte-range constraints.
3. Declaration parent chains, project parents, and semantic owners are acyclic. Recursive calls, symbol references in types, and project dependencies may contain cycles. Declaration parents and contained expressions/imports agree on their project; TypeUse inherits its containment from its subject.
4. One occurrence is not merged with another because their text matches. Entities of different categories may share the same source span.
5. Parameter, argument, and operand order is preserved. An implicit receiver does not increase explicit argument count.
6. Declaration merging relies on language rules and identity evidence. Conflicting definitions are not selected arbitrarily.
7. A resolved result has one selected target with `identity_state: established` and an established selection within the complete relevant candidate scope. An unknown potentially applicable competitor blocks final selection.
8. A virtual, interface, indirect, or dynamic declaration-level target does not establish a single implementation.
9. Unknown, an empty complete set, an empty incomplete set, and not_applicable are distinguishable.
10. All source coordinates refer to the analyzed input text. Analysis does not modify that text or introduce transformed source versions.
11. Intrinsics, placeholders, lambdas, and implicit declarations have distinguishable origins and categories.
12. New HAS_TYPE edges, resolutions, and implementations do not alter preserved source observations. HAS_TYPE connects only Declaration, Expression, TypeUse, or Symbol to TypeExpression, carries its context, role, and state, and has no separate canonical identity.
13. All semantic decisions are associated with a static Project build configuration; no execution point or runtime state is required. Direct semantic edges have permitted typed endpoints and no separate identity. Optional semantic_properties are embedded on their existing node or edge, preserve their effective context and state, and do not duplicate canonical fields or require separate property records.
14. A Symbol profile is connected through HAS_PROFILE only to its permitted Symbol kind, has its own unique ID, and belongs to exactly one Symbol. At most one matching profile is attached to a Symbol. Call/construction details belong to the Expression, without a separate profile. Unsupported constructs retain an unknown or language-specific form and explicit limitations.
15. At most one current binding assessment exists for an owner/site_key/context tuple. No target is copied into the assessment; direct target edges and their details are replaced consistently when reconciliation updates the result.
16. POSSIBLE_IMPLEMENTATION refers to a callable definition of the selected target or a supported override implementation. Implementation completeness is assessed separately; missing definitions do not imply absence of implementations.
17. Recorded call and target-selection conditions preserve their source expressions, declaration/file containment, context, evidence, and assessed completeness. Unknown or absent conditions do not establish unconditional execution, and a conditional target does not by itself establish a resolved selection. Lambda and local-function body calls belong to their own callable declarations, not the enclosing callable.
18. Project hierarchy and directory parent chains are acyclic. Project dependencies may contain cycles. A project parent belongs to the same repository; project hierarchy, filesystem hierarchy, and dependencies are not interchangeable.
19. Every direct project edge endpoint, descriptor, inventory parent, and external library exists in the dataset. Both endpoints of a project dependency belong to the same repository. Inventory parent URIs denote immediate physical parents; files and directories have distinct normalized locations/categories.
20. Every project is identified by its repository and descriptor within the dataset and contains its descriptor and root directory. Project metadata is the minimum build context; no separate analysis context or file-group node is introduced. Project roots in the dataset have no recorded incoming project PARENT_OF edge. Shared file nodes are not duplicated by project; their memberships and project-qualified facts are explicit. External identities preserve resolved versions and artifact variants, and missing structural results remain unknown rather than established empty sets.

## 13. Construct Mapping

| Construct | Required Representation |
| --- | --- |
| Single-project or multi-project repository | Repository, one Project per discovered descriptor, optional project hierarchy, Diagnostics for material discovery issues. |
| Project files, directories, shared or linked files | Directory, ProjectFile, physical parent references, direct CONTAINS edges for project membership. |
| External project library | ExternalLibrary, direct EXTERNAL edge, observed coordinates, known resolved version, and resolution evidence or limitations. |
| Same-repository project dependency | Direct DEPENDS_ON edge with descriptor-resolution evidence, scope, conditions, and directness when known. |
| Project structure connected to analyzed code | Project CONTAINS ProjectFile; file IMPORTS, ANNOTATES, and CONSISTS_OF anchor code facts and their real coordinates. Symbol traverses declarations/owners; TypeUse retains file membership and syntactic ownership. No direct Project-to-code links. |
| Type and nested type | Symbol, Declaration, TypeProfile, semantic owner, parent declarations and actual project/file associations. |
| Function, method, overload | Separate callable symbol, occurrences, profile, parameters, type bindings. |
| Field, variable, shadowing | Distinct symbols and declarations, declaration containment, source spans, initializer, available reference resolutions and type bindings. |
| Direct or member call | One call Expression with HAS_CALLEE, HAS_ARGUMENT, contextual binding assessments and direct INVOKES targets; member receiver remains a base operand. |
| Conditional call or configuration-dependent target | Optional conditions on the Expression and individual INVOKES edges, CONDITION_EXPRESSION links, evidence and assessed boundaries; no condition node. |
| Call chain | Separate nested expressions and their result types. |
| Constructor, operator, or indirect invocation | Expression with the appropriate call_kind; intrinsics are not disguised as user-defined callables. |
| Named, default, spread, or variadic arguments | Source arguments, ParameterProfile, available argument bindings. |
| Lambda, local function, capture | Callable symbol and declaration, body span when available, capture relations; body expressions belong to that callable declaration. |
| Type reference, generic, alias | TypeUse for written syntax and local name uses, direct REFERS_TO targets, TypeExpression, HAS_TYPE edges and semantic relations. |
| Inheritance, interface implementation, override | Established or candidate direct INHERITS, IMPLEMENTS, or OVERRIDES edges. |
| Import, include, alias, reexport | Import, local symbols, references, resolved import relations. |
| Annotation, attribute, decorator | Annotation, TypeUse or reference, arguments, executable expression when required. |
| Conditional or external source code, or pre-existing generated source files | Project settings, ProjectFile, PresenceCondition, origin. |
| Indirect, polymorphic, or dynamic targets | Direct candidate INVOKES targets, inheritance/override facts, optional POSSIBLE_IMPLEMENTATION edges and explicit completeness assessments. |
| Incomplete, erroneous, or dynamic code | Available syntax, partial or unknown results, and diagnostics without fabricated targets. |

## 14. Conformance Levels

Both levels below describe Code Facts capabilities. A semantic-conformant fact dataset is still the first USG layer, not a Semantic Code Graph dataset. Repository batch completion, fact conformance, assessed semantic completeness, and second-layer publication are separate claims.

**Project structure** is available before code analysis. It MUST contain repository identity, one project per recognized descriptor in scope, discovered file and directory inventory with membership, known external libraries, supported project dependencies, evidence, and diagnostics for material discovery limitations. Project structure alone does not claim syntactic or semantic code conformance. Both code conformance levels require descriptor-based Project boundaries for their project build metadata; projects or descriptors MUST NOT be fabricated for unattached source files. Discovery configuration and its external storage are outside the scope of this model.

**Syntactic dataset** contains repositories and descriptor-based projects with available build metadata, ProjectFile nodes with versioned external content references when source coordinates are present, provisional symbols, declarations, expressions with call syntax and name uses, type uses, imports, annotations, and applicable diagnostics. SourceSpan values are embedded coordinates, not nodes. Missing semantic results remain unknown, not established empty sets. This supports source structure but does not guarantee resolved cross-component dependencies.

**Semantic dataset** additionally contains established identities, contextual binding assessments, direct selected/candidate INVOKES and REFERS_TO targets, types, inheritance, override, capture and import facts, and evidence. Optional POSSIBLE_IMPLEMENTATION edges preserve known source definitions. This is the target capability for a structural component dependency graph; a unique call target is not required to preserve supported possible dependencies.

Neither conformance level requires execution-path analysis, runtime target prediction, or proof that a conditional relationship executes.

Both levels MAY additionally preserve known call-occurrence conditions; semantic datasets MAY preserve supported target-selection conditions. Missing condition analysis does not lower conformance and MUST NOT be interpreted as evidence that calls or targets are unconditional. When conditions are recorded, their integrity and retention in derived dependency views are required as specified above.

Each analysis tool declares its achieved level. The presence of a syntax tree is not evidence of semantic completeness. Sufficiency is determined by model integrity, the required entities, and the authority of specific relationships, not by serialization format.

## 15. Semantic Code Graph

Semantic Code Graph is the user-facing projection of an identified reconciled Code Facts snapshot. It adds exactly four node categories: Module, Namespace, Unit, and Member. Repository, Project, Directory, ProjectFile, and Resource retain the same identities, properties, and structural relationships in both layers. ExternalLibrary, Symbol, declarations, expressions, types, and quality records remain Code Facts; cross-layer provenance connects the projection to its supporting facts.

Every projection-only node has a required stable `id` distinct from source fact IDs, a required `name` (observed name or explicit display fallback), and an optional `qualified_name` when established. Identity MUST be based on the projection category and supporting facts under the applicable language rules, never on display names alone. Reconciled identities across declarations produce one projected node. Provisional identities MUST NOT be merged by spelling. Known external entities MAY be projected without fabricated files or declarations.

#### Projection Context and Provenance

The publication envelope MUST identify `fact_snapshot`, `projection_version`, and `completeness` (`complete`, `partial`, `unknown`). These are dataset metadata, not new graph node categories or properties copied to every shared node. Completeness describes the projection of the available source facts within the declared scope; it does not assert that fact extraction or runtime analysis was exhaustive. The language-aware mapping policy and excluded categories (for example local variables) MUST be declared with the publication. An empty edge set does not prove that the relationship is absent from the source.

Each derived relationship has `state` ! (`established`, `candidate`), `project_id` ? (the existing scalar analysis scope), and `presence_condition` ? when known. Context-sensitive results MUST have an effective project scope; context-independent filesystem relationships MAY omit it. Member dependencies MAY additionally retain call-occurrence conditions separately from target-selection conditions, using the section 10 rules. Unknown conditions MUST NOT become unconditional facts. These qualifiers do not create membership links to Project.

Every projected node and derived relationship MUST retain exact supporting Code Facts, including source identity, relationship/property path where applicable, effective context, and associated evidence. Native `DERIVED_FROM` connects a projection node to its supporting fact nodes. Relationship-level support uses evidence on the source projection node with a precise outgoing edge path, scalar evidence metadata, and native `SUPPORTED_BY` / `EVIDENCE_SOURCE` associations following section 11; relationships are not graph endpoints. Portable `supporting_facts` and `evidence_refs` retain exact paths and local keys, not independent evidence nodes. An association to an entire Symbol alone does not establish all its outgoing dependencies.

Aggregate by source, target, relation kind, effective context, and compatible applicability. Retain the distinct per-occurrence support and certainty within that aggregate; selected and candidate targets MUST NOT be flattened into one unconditional established result. Reject inapplicable or rejected binding targets. A selected call target does not establish every possible implementation. Updating input facts MUST invalidate obsolete projected edges and provenance together, including changes to file classification or ownership.

### Module

A language-defined module, typically an importable code boundary. Module identity, membership, and importability depend on the language, its version, and effective resolution settings. A Module can correspond to one file, span multiple files, or have no inventoried file. It is not automatically a ProjectFile, Namespace, Directory, or build target.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `language` ! | Language identifier | Language whose module rules apply. |
| `language_version` ? | String | Established effective version; retain the project context and supporting language settings. |
| `kind` ! | Language-qualified identifier | For example `java.named_module`, `cpp.named_module`, `cpp.partition`, `cpp.header_unit`, `python.module`, `python.package`, or `javascript.esm`. |

| Language | Mapping rules |
| --- | --- |
| Java 9+ | JPMS named modules follow module descriptors or resolved automatic-module identity; an unnamed module is scoped by its runtime/analyzer context, not repository-wide. `requires` can establish Module IMPORT Module. A Java package is a Namespace; a type import does not by itself establish a JPMS dependency. |
| C++20+ | Use supported named module, partition, and header-unit identities. Multiple module units can contribute to one named module; distinct importable partitions remain distinct. `import` and `export import` can establish IMPORT. A textual `#include` does not by itself establish a module or module import. |
| Python | Resolve modules and packages using the effective interpreter and import paths. A regular module can be backed by one file or an extension; regular packages can have an initializer, and namespace packages can span multiple directories without one. A Python namespace package is a Module here, not a Java/C++-style Namespace. |
| JavaScript / TypeScript | Use resolved module identity and the applicable module format, host, and compiler settings. ES modules and supported CommonJS modules may correspond to files. Specifier aliases and package exports affect resolution, not identity by themselves; an established ambient module can lack an implementation file. A non-module script is not promoted to a Module. |

Project CONTAINS records supported module participation, not ownership. ProjectFile DECLARES records supported source participation, which does not imply a file-to-module bijection. A resolved module boundary may be backed by a Symbol, ProjectFile, or other exact supporting facts. Same-spelled modules in different resolution scopes are not merged without evidence.

### Namespace

A language-defined naming scope, separate from a Module: a C++ namespace (including global and anonymous scopes) or a Java package (including the unnamed package). One Namespace may be linked to many ProjectFiles and one file may contribute to many Namespaces. A directory name is not evidence of namespace identity.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `kind` ! | `cpp_namespace`, `cpp_global`, `cpp_anonymous`, `java_package`, `java_unnamed_package` | Language-specific scope category. |

Named scopes follow reconciled language identity, including package/module boundaries where relevant. Global scopes, anonymous namespaces, and unnamed packages use their actual language-defined identity and effective scope, supported by source or scope facts when there is no explicit namespace declaration. Do not merge unrelated anonymous or unnamed scopes by display name. Namespace nesting uses CONSISTS_OF only when the language establishes it; dotted Java package names do not establish ownership.

### Unit

A structural type or a function or variable declared or defined at namespace, global, or module scope, outside a type or callable. Examples include classes, interfaces, enums, structs, records, unions, traits, annotation types, free functions, and namespace-scope variables. An annotation application remains a Code Facts Annotation, not a Unit.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `kind` ! | `class`, `interface`, `enum`, `struct`, `record`, `union`, `trait`, `annotation_type`, `function`, `variable`, `language_specific`, `unknown` | Entity category mapped from supported Symbols, declarations, and profiles. |

One Unit maps to one reconciled Symbol, not one node per declaration. The semantic owner, not the physical location, determines classification: an out-of-class definition of a method or static field is still a Member of its type. Nested structural types remain Units, connected by Unit CONSISTS_OF Unit. An established Namespace owns its immediate Units; otherwise an established Module may own its immediate Units. If neither applies, ProjectFile DECLARES still records written participation. Generic instances and type aliases do not automatically create new structural Units; resolve through TypeExpression and retain substitutions and alias support.

### Member

A significant callable or data entity nested inside a Unit, directly or through another Member. Methods, constructors, fields, properties, parameters, enum constants, and type parameters are included when supported. Local variables, lambdas, and local functions MAY be included under a declared mapping policy. A Namespace or Module never directly owns a Member. Expressions, argument occurrences, and name-use occurrences do not each become Members.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `kind` ! | `method`, `function`, `constructor`, `destructor`, `operator`, `field`, `property`, `parameter`, `variable`, `enum_value`, `type_parameter`, `lambda`, `language_specific`, `unknown` | Language-aware entity category supported by Symbol, profiles, and declarations. |

One Member maps to one reconciled callable/data Symbol, or an established callable Declaration for an anonymous callable without a Symbol. Overloads remain separate identities. Parameters belong to the callable that declares them, whether a free-function Unit or a callable Member. Uses inside a lambda/local function belong to that callable; if excluded, do not attribute its body dependencies to the enclosing callable. Initializers belong to their actual data Unit or Member, never an invented executing method.

#### Semantic Code Graph Relationships

The following are direct directed Neo4j relationships, without canonical edge IDs or intermediate relationship nodes. All derived rows obey the context and provenance contract above. Identically named relationships in Code Facts and Semantic Code Graph are distinguished by endpoint categories. Shared structural edges retain their original contract.

| Edge | Source -> target | Edge Properties | Meaning |
| --- | --- | --- | --- |
| `HAS_PROJECT` | Repository -> Project | Existing structural contract. | Shared repository membership, not a second copy. |
| `PARENT_OF` | Project -> Project | Existing structural contract. | Shared project discovery hierarchy, not a dependency. |
| `PARENT_OF` | Directory -> Directory | Existing structural contract. | Shared immediate physical directory parent. |
| `CONTAINS` | Project -> Directory | Existing structural contract. | Shared explicit directory membership. |
| `CONTAINS` | Project -> ProjectFile | Existing structural contract. | Shared project inventory. |
| `CONTAINS` | Directory -> ProjectFile | Existing structural contract. | Shared immediate physical placement. |
| `CLASSIFIES` | Resource -> ProjectFile | Existing structural contract. | Shared non-code classification. |
| `DEPENDS_ON` | Project -> Project | Existing structural contract. | Shared build dependency, distinct from Unit DEPENDS. |
| `CONTAINS` | Project -> Module | Common derived properties. | Supported module participation in a project. |
| `IMPORT` | Module -> Module | `form` ?, `is_reexport` ?. | A supported direct language-level module import or equivalent such as JPMS requires. |
| `DECLARES` | ProjectFile -> Module | Common derived properties. | File provides or contributes to the module under language rules. |
| `DECLARES` | ProjectFile -> Namespace | Common derived properties. | File declares, defines, or contributes to the scope, including implicit scopes. |
| `DECLARES` | ProjectFile -> Unit | Common derived properties. | File contains a declaration or definition of the Unit. |
| `DECLARES` | ProjectFile -> Member | Common derived properties. | File contains a declaration or definition of the Member, including out-of-class definitions. |
| `CONTAINS` | Module -> Namespace | Common derived properties. | Supported scope participation, not semantic ownership or a claim that the scope belongs exclusively to this module. |
| `CONSISTS_OF` | Namespace -> Namespace | Common derived properties. | Immediate language-defined namespace nesting. |
| `CONSISTS_OF` | Namespace -> Unit | Common derived properties. | Immediate ownership by a naming scope. |
| `CONSISTS_OF` | Module -> Unit | Common derived properties. | Immediate module ownership when no Namespace owns the Unit. |
| `CONSISTS_OF` | Unit -> Unit | Common derived properties. | Immediate nested-type ownership. |
| `DEPENDS` | Unit -> Unit | `reason` !: `field_type`, `parameter_type`, `return_type`, `type_constraint`, `declaration_type`. | A type, function, or variable Unit has a supported declaration/signature dependency on a structural type Unit, including through composite types. Not inferred from body calls or transitive dependencies. |
| `IMPLEMENTS` | Unit -> Unit | Substitutions and language-specific details when supported. | Source type implements a target interface/trait contract, derived from Code Facts IMPLEMENTS. |
| `INHERITANCE` | Unit -> Unit | Visibility, virtual-base flag, substitutions when supported. | Source subtype derives from target base type, mapped from Code Facts INHERITS; excludes separate IMPLEMENTS classification unless both facts are established. |
| `CONSISTS_OF` | Unit -> Member | Common derived properties. | Immediate member ownership, including method declarations as well as definitions. |
| `DECLARES` | Unit -> Member | Common derived properties. | A required callable contract declared by an interface or abstract type; supplements ownership and does not mean implementation. |
| `CONSISTS_OF` | Member -> Member | `position` ? for ordered parameters. | Callable parameters, supported local callables, and other immediate nested members; no flattened duplicate ownership. |
| `INVOKES` | Unit or Member -> Unit or Member | Call kind and per-occurrence conditions when supported. | A supported call in a callable body or data initializer binds to a callable target; not proof of execution. |
| `ACCESSES` | Unit or Member -> Unit or Member | `access` !: `read`, `write`, `read_write`, `unknown`. | A supported reference to a data target, including a namespace-scope variable Unit or a parameter Member. |
| `USES` | Unit or Member -> Unit or Member | `usage` !: `callable_reference`, `address`, `capture`, `other`. | A non-invoking reference to a callable or data entity. An actual call inside a lambda is INVOKES from that lambda. |
| `OVERRIDE` | Member -> Member | Common derived properties. | Source callable overrides target inherited callable, mapped from Code Facts OVERRIDES. This is overriding, not overloading. |
| `IMPLEMENTS` | Member -> Member | Common derived properties. | Source callable fulfills a target abstract/interface callable contract, only when supported by language semantics and contract evidence. |
| `DERIVED_FROM` | Module -> Symbol, ProjectFile, or ExternalLibrary | Common derived properties. | Cross-layer module identity and source or established external artifact support. |
| `DERIVED_FROM` | Namespace -> Symbol, Declaration, or ProjectFile | Common derived properties. | Cross-layer scope identity and support, including implicit scopes. |
| `DERIVED_FROM` | Unit -> Symbol | Common derived properties. | Cross-layer structural type, callable, or data identity. |
| `DERIVED_FROM` | Member -> Symbol or Declaration | Common derived properties. | Cross-layer entity identity; Declaration is the fallback for supported anonymous callables without a Symbol. |

CONSISTS_OF records immediate semantic ownership and MUST be acyclic. A canonical projected entity has at most one immediate semantic owner per compatible context; every Member has an ownership path to a Unit. DECLARES records file participation without introducing another semantic owner. CONTAINS records membership or placement, not semantic ownership. Shared nodes connect directly to both layers without copying source nodes.

IMPORT requires established or candidate module endpoints supported by the actual import site, resolution, and language rule in its effective context. Use Import IMPORTS_FROM or equivalent evidence such as a resolved JPMS directive. A file target maps to a Module only if that file is a supported module provider. Imports in non-module files, textual includes, build dependencies, and unresolved providers remain available as Code Facts; they do not justify inventing a Module or an IMPORT edge.

ACCESSES and USES require supported REFERS_TO/name-use roles, captures, or equivalent authoritative facts. An unclassified data reference may use `access: unknown`; unsupported roles MUST NOT be guessed. A lambda capturing a field may contribute USES for the capture and ACCESSES for a separate body read when both facts exist. Do not duplicate one ordinary call reference as USES. OVERRIDE and Member IMPLEMENTS MAY coexist when the language proves both; neither follows from equal names, overload signatures, or type-level IMPLEMENTS alone. Code Facts has no mandatory dedicated member-implementation edge: derive it only from an established override/contract mapping with abstract/interface target evidence, otherwise omit it. No OVERLOAD relationship is required: overloads are distinct callable identities in one language-defined overload set.

#### Mapping Example

In Java 9+, `module-info.java` can declare the `demo.app` Module. A resolved `requires demo.lib` yields `demo.app` IMPORT `demo.lib`. `Service.java` and `Helper.java` can both DECLARE the same `demo` Namespace without being Modules. The Namespace CONSISTS_OF its `Service` Unit; `Service` CONSISTS_OF its `run` Member. A Resource CLASSIFIES the inventoried `config.json` ProjectFile, whose project and directory membership is shared.

In C++20, a module interface importing `engine` yields IMPORT to the `engine` Module only when the provider resolves. A header and an ordinary source file may both DECLARE the same C++ Namespace without being Modules. A free function `tick(int step)` and a namespace-scope variable `frame` are Units; `step` is a Member of `tick`. Calling `tick` from a method yields Member INVOKES Unit; reading `frame` inside `tick` yields Unit ACCESSES Unit. All dependencies retain supporting occurrences and context; none proves runtime execution.