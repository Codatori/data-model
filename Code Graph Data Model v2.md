# Canonical Code Graph Data Model

## 1. Purpose and Conventions

This specification defines a source code and project structure model independent of programming language, parser, storage format, and graph database. It specifies entities, attributes, relationships, and constraints for a graph of repositories, descriptor-based projects, directories, files, external libraries, declarations, types, calls, and dependencies.

Analysis reads source text without modifying it or producing transformed source files. Source transformation and mappings between transformed and original text are outside the scope of this model.

The goal is to describe project components and their structural dependencies, including conditional and possible relationships. Execution order, path feasibility, and prediction of concrete runtime behavior are outside the scope of this model.

**MUST** denotes a model requirement; **MAY** denotes a permitted variation. Attributes marked `!` are required; attributes marked `?` may be absent. An absent value means unknown, not `false`, zero, or an empty list. Applicability and completeness are represented explicitly.

Entity names use `PascalCase`; attributes and enumeration values use `snake_case`. References use the `_id` suffix; reference collections use `_ids`. Order is significant only for explicitly ordered lists. Derived reverse references are not required attributes.

## 2. Core Principles

1. `Symbol` represents a logical language entity; `Declaration` represents a particular declaration or definition of that entity. Multiple declarations may refer to one symbol.
2. Source syntax is preserved independently of semantic conclusions. An unresolved reference is not removed from the model.
3. Types, visibility, code activation, and call targets may depend on the analysis configuration.
4. Names are stored in symbols, coordinates in source spans, type structures in type entities, and resolution results in separate records. Other entities reference these data.
5. The same information is not exported simultaneously as a nested object, duplicated attributes, and an independent graph edge.
6. Unknown, ambiguous, and incomplete information is represented as data states, not as grounds for selecting an arbitrary target.

## 3. Common Types and Identity

| Type | Definition | Purpose |
| --- | --- | --- |
| `Id` | A nonempty opaque identifier unique within the dataset | Exact joins without name-based lookup. |
| `Digest` | A content fingerprint computed with a specified algorithm | Source and configuration verification. |
| `SourceSpan` | A range within a particular source file version | Association with source text. |
| `PresenceCondition` | A structured expression of conditional activation | Preprocessing and configuration variants. |
| `AttributePath` | A path to a record attribute | Association of evidence or completeness assessments with a specific property. |

Every standalone entity MUST have an `id`; this common attribute is not repeated in the tables. Embedded structures, such as call arguments, do not require a separate identity. The extensions `CallableProfile`, `ParameterProfile`, `TypeProfile`, and `CallProfile` use the identifier of their base entity and do not introduce a separate identity object.

Occurrence identifiers distinguish identical constructs at different locations. A symbol identifier MUST NOT depend solely on its name: language, owner, category, and distinguishing entity properties are taken into account. Until equivalence is established, declarations MAY reference different provisional symbols.

An identifier MAY be reused across datasets only if its identity is preserved. An identical `id` does not permit silent replacement of a source file, context, or conflicting semantic content. The identifier generation algorithm is not prescribed.

#### Embedded Semantic Properties

Any existing node or edge MAY carry an optional `semantic_properties` list of additional analysis results. Entries are embedded values, not standalone entities: they have neither `id` nor `subject_id`. Producers MAY attach available results in the same operation that creates or updates the owning node or edge; collecting these properties or performing a separate analysis pass is not required for conformance.

| Entry Attribute | Type | Purpose |
| --- | --- | --- |
| `name` ! | Normalized key | For example, `value_category`, `constant_value`, `nullability`, or `storage_duration`. |
| `value` ! | Typed value or explicit `null` | Preserve `false` and zero; use `null` for `unknown` or `not_applicable`. |
| `context_id` ? | `Id -> AnalysisContext` | Required unless inherited from the owning node or edge's explicit `context_id`. |
| `state` ! | `established`, `candidate`, `unknown`, `not_applicable` | State of this property, independent of the owning edge or other properties. |

Different contexts and incompatible candidate values remain separate entries. An explicit property context MUST match the owning node or edge's context when that owner has one. Absence means not recorded, not `false` or proof that a property does not apply. Properties MUST NOT duplicate canonical attributes, type edges, resolution results, or typed semantic edge properties. Language extensions use a language prefix such as `cpp.thread_local`. Shared-identity profiles do not introduce a second copy of their base entity's properties.

For example, an Expression MAY contain `"semantic_properties": [{"name":"constant_value","value":42,"context_id":"context:cpp17","state":"established"}]`. A semantic edge already carrying `context_id` MAY omit that field from its property entries. The effective context is preserved during serialization and projection. Evidence uses the owning node as `subject_id` and a precise `attribute_path`, such as `semantic_properties[0]` or `inherits[0].semantic_properties[0]`; Coverage MAY use the same path and effective context. Neither properties nor edges gain a canonical identity for this purpose. Exporters MUST preserve these associations when reordering lists.

### SourceSpan

| Attribute | Type | Purpose |
| --- | --- | --- |
| `file_id` ! | `Id -> SourceFile` | Source text version. |
| `start_offset` ! | Integer >= 0 | Inclusive start of the range. |
| `end_offset` ! | Integer >= `start_offset` | Exclusive end of the range. |

Offsets are measured in bytes of the stored UTF-8 text. Lines and columns are computed from the text and are not independent canonical coordinates. A zero-length range MAY represent a recovered missing construct and MUST be accompanied by a diagnostic. Synthetic entities without source text are not assigned fabricated coordinates.

### PresenceCondition

Permitted variants: `constant(value)`, `defined(name)`, `comparison(operator, operands)`, `not(condition)`, `and(conditions)`, `or(conditions)`, and `unknown(reason)`. Values depend on `AnalysisContext` settings; an unknown condition is not treated as true or false. An absent condition means unconditional applicability within the known context, not across every possible program configuration.

## 4. Dataset, Sources, and Configuration

### CodeDataset

| Attribute | Type | Purpose |
| --- | --- | --- |
| `schema_version` ! | Model version | Interpretation of the structure. |
| `digest_algorithm` ! | String | Interpretation of fingerprints. |
| `producer` ! | Analysis tool name and version | Reproducible data provenance. |
| `root_project_ids` ! | Set of `Id -> Project` | Projects without a known parent in the represented project hierarchy. |

All entities belong to the dataset. Duplicated lists of every symbol, expression, or reference ID are not required in `CodeDataset`.

### Repository

| Attribute | Type | Purpose |
| --- | --- | --- |
| `uri` ! | Normalized URI | Identity of the repository or local workspace root, not merely its name. |
| `name` ? | String | Human-readable repository name. |
| `vcs_kind` ? | String | Version control system, when known. |
| `revision` ? | String | Observed revision; does not assert that the working tree is clean. |

A local workspace without version control MAY be represented as a repository. Separate checkouts MUST NOT be merged solely because they share a remote URL. Projects are obtained through `Project.repository_id`; duplicated project lists are not stored. Discovery configuration, scan policies, and orchestration are outside this model and MAY be stored externally per repository. The dataset contains the resulting structure, not a discovery-run or configuration entity. Results from incompatible repository observations MUST NOT be silently combined into one current structure.

### Project

The single minimum boundary of code organization and analysis, identified by a project descriptor such as a `.csproj`, `.vcxproj`, `pom.xml`, or `CMakeLists.txt` file. Build configuration determines the analyzed inputs of that project; no separate Module entity or descriptor-free source-group boundary is introduced.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `repository_id` ! | `Id -> Repository` | Repository containing the project descriptor. |
| `descriptor_file_id` ! | `Id -> ProjectFile` | Exact project descriptor; one descriptor identifies one project within the dataset. |
| `root_directory_id` ! | `Id -> Directory` | Project base directory under build-system rules. |
| `name` ? | String | Declared project name, when available. |
| `build_system` ! | String | Recognized descriptor ecosystem, such as `msbuild` or `maven`. |
| `kind` ! | `library`, `executable`, `aggregator`, `language_specific`, `unknown` | Declared project role, not inferred from directory nesting. |
| `coordinates` ? | Structured ecosystem-specific record | Declared identity, for example Maven group/artifact/version or an MSBuild project GUID. |
| `parent_project_id` ? | `Id -> Project` | Discovery hierarchy, not a dependency or language inheritance relationship. |
| `contains` ! | Outgoing `CONTAINS` edges | Project membership of directories and files. |
| `external` ! | Outgoing `EXTERNAL` edges | External library dependencies. |
| `depends_on` ! | Outgoing `DEPENDS_ON` edges | Dependencies on other projects in the same repository. |

Project identity MUST include the repository and descriptor identity; matching names or artifact coordinates alone are insufficient. Two descriptors in one directory identify two projects. A descriptor with multiple targets or profiles remains one project; configuration-specific results use distinct analysis contexts when available or separate datasets. Solution files and other workspace indexes MAY guide discovery but do not replace individual project descriptors. A recognized descriptor whose parameters cannot be fully read still produces a project with unknown parameters, a diagnostic, and partial coverage.

A project MAY have multiple AnalysisContext records, for example for different target frameworks, platforms, or build profiles. An aggregator project MAY have no analyzed source units. Language packages, namespaces, and source-language modules are represented by directories, declarations, and symbols within a project, not by additional project boundaries unless they have their own recognized project descriptors. Code analysis MUST reference an established descriptor-based project; standalone files without such a boundary do not form a conforming analysis dataset under this model. ExternalLibrary nodes and external symbols remain valid dependency targets without requiring their source projects or analysis contexts.

Discovery produces a forest: a single-project repository has one root; a multi-project repository may have several roots. A parent is established from explicit aggregation metadata or a documented nearest enclosing descriptor rule, recorded in evidence; ambiguous parents remain absent with a diagnostic. Maven aggregation, Maven parent-POM inheritance, physical directory nesting, and dependencies are different facts: `parent_project_id` represents only the chosen discovery hierarchy and MUST NOT imply inheritance or a dependency. Projects from other repositories are not same-repository dependencies.

#### Project Edges

Project membership and dependencies are direct graph edges, not standalone entities or intermediate nodes. They have no canonical `id`. A project depends on another project as `Project -DEPENDS_ON-> Project`.

| Edge | Source -> target | Edge Properties |
| --- | --- | --- |
| `CONTAINS` | `Project -> Directory` or `ProjectFile` | `membership` !: `physical`, `declared`, `both`; `item_role` ?: ecosystem-specific build role. |
| `EXTERNAL` | `Project -> ExternalLibrary` | `requested_version` ?, `scope` ?, `directness` !: `direct`, `transitive`, `unknown`. |
| `DEPENDS_ON` | `Project -> Project` | `scope` ?, `reference_kind` ?: ecosystem-specific reference mechanism; `directness` !: `direct`, `transitive`, `unknown`. |

Every edge has `state` ! (`established`, `candidate`) and MAY carry `context_id` (`Id -> AnalysisContext`), `site_file_id` (`Id -> ProjectFile`), and `presence_condition` (`PresenceCondition`). These are edge properties, not another record category. Conditions preserve source/build applicability; unavailable configuration values remain unknown. Evidence uses the source Project as `subject_id` and an `attribute_path` identifying the outgoing edge, such as `depends_on[0]`; no edge ID is required. Coverage assesses the source project and the corresponding structural dimension.

For object serialization, the project's `contains`, `external`, and `depends_on` lists store embedded outgoing edges. Each entry has `target_id` and the applicable edge properties; the source is the enclosing Project, and the label is determined by the list. Neither `id`, `source_id`, nor a redundant `kind` is stored in an entry. Graph serialization stores the same facts as direct edges instead of additionally storing parallel lists or relationship nodes. An empty list establishes absence only with complete corresponding coverage.

```json
{
	"id": "project:app",
	"depends_on": [
		{ "target_id": "project:core", "state": "established", "directness": "direct" }
	]
}
```

This fragment shows only project identity and its outgoing dependency; other required project attributes are omitted for brevity.

Every discovered project MUST have established `CONTAINS` edges to its descriptor and root directory. Every inventoried project file and directory MUST have explicit project membership. `CONTAINS` records membership, while `parent_directory_id` records physical hierarchy; no duplicated children lists are stored. Membership in a directory does not implicitly include all its descendants. Nested-project files do not automatically belong to every enclosing project. Shared or linked files MAY belong to several projects, including files outside their base directories. `physical` membership does not assert build inclusion. For one project, target, and optional context, physical and declared membership are merged as `both` when applicable.

A same-repository project reference MUST use `DEPENDS_ON` once its descriptor target is established, not `EXTERNAL` solely because its syntax uses package coordinates. A matching name is insufficient: use descriptor paths, workspace resolution, or established ecosystem identity evidence. An unresolved path MUST NOT create a dangling endpoint or fabricated project; preserve its requested path in evidence on the source project, emit a diagnostic, and assess project dependencies as partial or unknown. Unknown applicability is retained as a candidate with its conditions, not promoted to an unconditional established dependency. External dependencies follow the same evidence and completeness requirements. Direct and derived transitive dependencies remain distinguishable. Project dependency cycles MAY exist and do not imply execution order. Aggregation, inheritance, co-location, and code references alone do not establish a build dependency.

For example, `repo/pom.xml`, `repo/app/pom.xml`, and `repo/core/pom.xml` identify three projects. Root aggregation MAY establish `parent_project_id` for app and core, but does not itself create dependencies. A resolved app-to-core dependency creates `app -DEPENDS_ON-> core`; app's third-party dependency creates `app -EXTERNAL-> library`. An inventoried `app/src/Main.java` and its directories each have `app -CONTAINS-> entry`, with physical parents represented by `parent_directory_id`.

### Directory

| Attribute | Type | Purpose |
| --- | --- | --- |
| `uri` ! | Normalized URI | Directory location, including linked directories outside the repository when observed. |
| `parent_directory_id` ? | `Id -> Directory` | Immediate physical parent when represented. |

### ProjectFile

A file in the discovered project inventory, whether or not its content is source code.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `uri` ! | Normalized URI | File location; basenames and project-relative paths are derived. |
| `parent_directory_id` ? | `Id -> Directory` | Immediate physical directory when represented. |
| `kind` ! | `source`, `descriptor`, `resource`, `configuration`, `documentation`, `binary`, `generated`, `other`, `unknown` | Inventory classification, not a language-analysis result. |
| `content_digest` ? | `Digest` | Observed bytes, when available; binary files do not require UTF-8 conversion. |

Within one dataset there MUST be at most one file or directory node per normalized location and category. Symlink aliases MUST NOT be silently conflated or recursively followed into cycles. Shared files and directories use the same nodes with membership in multiple projects, rather than copies per project. File content and language parsing are optional for inventory. `ProjectFile` describes an observed filesystem entry; `SourceFile` describes immutable analyzed UTF-8 text. Their identities are not interchangeable, and inventory digests of original bytes need not equal digests of transcoded source text.

### ExternalLibrary

| Attribute | Type | Purpose |
| --- | --- | --- |
| `ecosystem` ! | String | Identity rules, such as Maven, NuGet, or a native binary ecosystem. |
| `name` ! | String | Observed package or library name. |
| `coordinates` ! | Structured ecosystem-specific record | Known identity components: namespace/group, artifact, source registry or URI, classifier, and target variant where applicable. |
| `version` ? | String | Exact resolved version; a requested range is not an exact version. |
| `identity_state` ! | `established`, `provisional` | Confirmed artifact identity or an unresolved external dependency. |

Different versions, registries, or incompatible artifact variants MUST NOT be merged solely by name. An unresolved declaration MAY reference a provisional library preserving the observed coordinates without fabricated values. Requested versions and dependency scopes belong to the relationship; the resolved library version belongs here. Library nodes do not require downloaded source, a `SourceFile`, or symbols. Transitive libraries MAY be included only with supporting dependency-resolution evidence and explicit completeness boundaries.

### SourceFile

| Attribute | Type | Purpose |
| --- | --- | --- |
| `uri` ! | Normalized URI | File identity independent of basename and working directory. |
| `content_digest` ! | `Digest` | Association of positions with specific content. |
| `content` ! | UTF-8 text or a reference to accessible immutable content | Retrieval of snippets and lines, and range validation. |
| `language` ! | Language identifier | Syntax interpretation. |
| `language_version` ? | String | Source dialect, when specified by the file itself. |
| `origin` ! | `source`, `generated`, `external`, `system` | Separation of project and external code. |
| `original_encoding` ? | String | Provenance of transcoded text. |
| `project_file_id` ? | `Id -> ProjectFile` | Inventory entry whose observed content supplied this analyzed text. |

A filesystem path is a particular case of a URI. A text change creates a new `SourceFile` version. Embedded-language constructs use spans in the containing source file. The `generated` origin denotes source files generated before analysis and supplied as inputs, not text generated by the analysis tool.

### AnalysisContext

| Attribute | Type | Purpose |
| --- | --- | --- |
| `project_id` ! | `Id -> Project` | Descriptor-based boundary of organization and analysis. |
| `context_digest` ! | `Digest` | Identity of significant settings. |
| `language_settings` ! | Language, version, and dialect settings | Language rules for the specific configuration. |
| `target` ? | Architecture, platform, ABI | Platform-dependent types and binding. |
| `compiler` ? | Name, version, and significant options | Compiler-based semantics. |
| `defines` ! | Mapping from names to values | Conditional compilation. |
| `search_paths` ! | Ordered records: `uri`, `kind` | Include, import, and module search order. |
| `dependency_context_ids` ! | Set of `Id -> AnalysisContext` | Available analysis configurations of project dependencies. |

`SourceFile.language_version` specifies the file-local dialect; `language_settings` specifies the analysis configuration. A conflict MUST produce a diagnostic. An unknown configuration is permitted only with an appropriate completeness assessment. An empty settings list does not establish their absence when coverage is incomplete.

Project dependency declarations are stored once as direct DEPENDS_ON or EXTERNAL edges, not repeated as other semantic edges. `dependency_context_ids` selects available configurations for analysis; it is not a second list of dependency declarations. A dependency on an ExternalLibrary does not require an AnalysisContext for that library. Context settings and source inputs MUST match the represented project observation; the same source URI alone does not establish a content match.

### AnalysisUnit

| Attribute | Type | Purpose |
| --- | --- | --- |
| `context_id` ! | `Id -> AnalysisContext` | Configuration of the analysis pass. |
| `entry_file_ids` ! | Nonempty list of `Id -> SourceFile` | Inputs of a translation unit or analysis group. |
| `participating_file_ids` ! | Set of `Id -> SourceFile` | Source files and headers actually included. |

A file may participate in multiple units. File-local identity and preprocessor state MUST NOT be merged solely by filename. Unit-dependent declaration and expression occurrences are distinguished through their `unit_id`, not merely their spelling or source span.

## 5. Symbols and Declarations

### Symbol

| Attribute | Type | Purpose |
| --- | --- | --- |
| `name` ? | String | The single canonical simple name; absent for an anonymous entity. |
| `kind` ! | `namespace`, `module`, `type`, `callable`, `field`, `variable`, `parameter`, `type_parameter`, `enum_value`, `property`, `label`, `macro`, `language_specific` | Logical entity category. |
| `owner_symbol_id` ? | `Id -> Symbol` | Semantic ownership. |
| `origin` ! | `source`, `generated`, `external`, `system`, `intrinsic`, `placeholder` | Provenance and authority. |
| `identity_state` ! | `established`, `provisional` | Established or provisional identity. |
| `language_identity` ? | Language- or compiler-specific key | Declaration merging when a reliable key is available. |
| `has_type` ? | Outgoing `HAS_TYPE` edges | Optional contextual type summary or receiver/constraint types; see section 6. |

Qualified names are computed from owners and language rules. A full signature string, display name, or mangled name does not replace structural identity. External identity keys MAY be preserved in evidence.

### Declaration

| Attribute | Type | Purpose |
| --- | --- | --- |
| `symbol_id` ! | `Id -> Symbol` | Association of an occurrence with a language entity. |
| `unit_id` ! | `Id -> AnalysisUnit` | Analysis unit of this declaration occurrence. |
| `parent_declaration_id` ? | `Id -> Declaration` | Nearest syntactically enclosing declaration; absent at unit top level. |
| `form` ! | `declaration`, `definition`, `forward_declaration`, `implicit` | Distinction between declaration and implementation. |
| `span` ? | `SourceSpan` | Full source range. |
| `name_span` ? | `SourceSpan` | Name position without copying its value. |
| `body_span` ? | `SourceSpan` | Source range of the declaration body, when present. |
| `has_type` ? | Outgoing `HAS_TYPE` edges | Declared, inferred, return, receiver, or constraint types in context. |
| `initializer_expression_id` ? | `Id -> Expression` | Variable, field, or enum value initialization, or a parameter default. |
| `visibility` ? | `public`, `protected`, `private`, `internal`, `package`, `local`, `language_specific` | Accessibility. |
| `linkage` ? | `external`, `internal`, `none`, `language_specific` | Linkage boundaries. |
| `modifiers` ! | Set of normalized values | `static`, `abstract`, `virtual`, `override`, `final`, `const`, `async`, and other properties. |
| `presence_condition` ? | `PresenceCondition` | Conditional activation. |

An explicit source declaration MUST have a `span`. It MAY be absent for an implicit or external declaration without accessible text. An empty modifier set establishes the absence of properties only when the corresponding attribute has complete coverage.

Declaration nesting replaces a separate lexical-area entity in the canonical graph. Namespaces, types, callables, parameters, and local variables retain their own declaration occurrences and available parent links. A method defined outside its class body has a syntactic parent at its written definition site, while `Symbol.owner_symbol_id` preserves class membership. Reopened namespaces may have several declarations of one symbol. Parent declarations belong to the same analysis unit; their source files need not be identical when language inclusion rules permit this.

Blocks, branches, comprehensions, and other lexical regions do not require fabricated declarations. Their name-lookup environments are internal analyzer data, not canonical nodes. Resolved and possible reference targets, distinct local symbol identities, source spans, evidence, and coverage preserve the available semantic results; the graph is not required to reconstruct lexical lookup from declaration nesting. Incomplete name resolution remains explicit. Conditional call restrictions are represented by CallCondition rather than block declarations.

### CallableProfile

An extension of `Symbol(kind: callable)`.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `callable_kind` ! | `function`, `method`, `constructor`, `destructor`, `lambda`, `operator`, `accessor`, `local_function` | Callable semantics. |
| `parameter_ids` ! | Ordered list of `Id -> Symbol(parameter)` | Explicit formal parameters. |
| `type_parameter_ids` ! | Ordered list of `Id -> Symbol(type_parameter)` | Generic or template parameters. |
| `receiver_mode` ? | `none`, `instance`, `extension`, `explicit_object`, `language_specific` | Receiver semantics without adding implicit `this` to explicit parameters. |
| `variadic_style` ? | `none`, `ellipsis`, `parameter_pack`, `rest`, `keyword_rest` | Variable argument count. |
| `calling_convention` ? | String | ABI and function compatibility. |
| `receiver_qualifiers` ! | Set of values | Member const/volatile and lvalue/rvalue ref qualifiers. |

Parameter count is computed from the list; there is no separate `arity`. The signature consists of parameters, type bindings, return type, receiver qualifiers, and language-specific generic rules. Repeated parameter declarations refer to one parameter symbol only when their correspondence is established; occurrence-local spelling is obtained from the `name_span` of the corresponding declaration.

### ParameterProfile

An extension of `Symbol(kind: parameter)`.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `binding_kind` ! | `positional`, `positional_only`, `keyword_only`, `rest`, `keyword_rest`, `pack` | Argument binding. |
| `passing_mode` ? | `value`, `reference`, `in`, `out`, `inout`, `language_specific` | Value passing and write effects. |

A default is stored on the particular parameter `Declaration` through `initializer_expression_id`: defaults in different declarations may have different values and visibility. The index is determined by the position in `CallableProfile.parameter_ids`.

### TypeProfile

An extension of `Symbol(kind: type)`.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `type_kind` ! | `class`, `struct`, `interface`, `trait`, `enum`, `union`, `alias`, `record`, `annotation`, `language_specific` | Type declaration semantics. |
| `type_parameter_ids` ! | Ordered list of `Id -> Symbol(type_parameter)` | Generic parameters. |

Fields, methods, enum values, and nested types are linked through `owner_symbol_id`; a duplicated member list is not required. Inheritance, alias targets, and enum underlying types are represented by semantic relations.

TypeProfile describes the declared type symbol, not every structure that uses it. One type symbol can participate in many pointer, reference, array, qualified, or generic TypeExpression structures. Built-in and composite TypeExpression values do not require a separate TypeProfile.

## 6. Type Expressions and Type Uses

### TypeExpression

A semantic type structure, not a source declaration or a particular spelling. A nominal type references a type symbol; an array, pointer, or generic application is a separate structure. Several declarations and expressions MAY refer to the same structure. TypeExpression is not necessarily a standalone source-language expression.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `kind` ! | `builtin`, `nominal`, `type_parameter`, `pointer`, `reference`, `array`, `function`, `generic_application`, `tuple`, `union`, `intersection`, `nullable`, `wildcard`, `dependent`, `unknown` | Type form. |
| `qualifiers` ! | Set of values | Qualifiers of this particular layer. |
| `completeness` ! | `complete`, `partial`, `unknown` | Completeness of structure and identity. |

Additional attributes depend on the variant:

| `kind` | Attributes | Purpose |
| --- | --- | --- |
| `builtin` | `builtin_name` !, `language` ! | Canonical built-in type under language rules. |
| `nominal` | `symbol_id` ?; if absent, `unresolved_name` ! | Distinction between identity and unconfirmed spelling. |
| `type_parameter` | `symbol_id` ! | Type parameter. |
| `pointer`, `reference`, `nullable` | `element_type_id` !; for references, `reference_kind` ! | Wrappers and reference kinds. |
| `array` | `element_type_id` !, `dimensions` ! | Ordered dimensions: a constant, expression ID, or unknown value. |
| `function` | `parameter_type_ids` !, `return_type_id` !, `variadic_style` ?, `calling_convention` ? | Function or callback type independent of a particular callable symbol. |
| `generic_application` | `generic_type_id` !, `arguments` ! | Ordered arguments: type ID, expression ID, or template symbol ID, with their category specified. |
| `tuple`, `union`, `intersection` | `component_type_ids` ! | Composite types; tuple order is significant. |
| `wildcard` | `bound_kind` !: `unbounded`, `upper`, `lower`; `bound_type_id` ? | Wildcard bound. |
| `dependent` | `expression_id` or `symbol_id` ?, `dependency_ids` ! | A type depending on parameters or expressions not yet evaluated. |
| `unknown` | `reason` ! | Unavailable or unsupported structure. |

Nullable, pointer, and qualifier layers are not removed during normalization. An alias is not expanded in a way that loses the original symbol. A nominal type without an established symbol cannot be `complete`.

All type-valued references, including `element_type_id`, `return_type_id`, `generic_type_id`, type arguments, substitutions, and conversion endpoints, refer to TypeExpression entities. TypeProfile remains a shared-identity extension of Symbol, not an extension of TypeExpression.

### TypeUse

A particular syntactic use of a type.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `span` ! | `SourceSpan` | Original spelling without a text copy. |
| `form` ! | `named`, `qualified`, `pointer`, `reference`, `array`, `function`, `generic`, `tuple`, `union`, `intersection`, `nullable`, `wildcard`, `dependent`, `language_specific`, `unknown` | Syntactic form of the use. |
| `subject_id` ! | `Id -> Declaration`, `Expression`, `Annotation`, or parent `TypeUse` | Construct using this syntactic type. |
| `role` ! | `declared`, `return`, `base`, `constraint`, `cast`, `argument`, `annotation`, `language_specific` | Purpose of the type use. |
| `position` ? | Integer >= 0 | Order of uses sharing the same subject and role. |
| `has_type` ? | Outgoing `HAS_TYPE` edges | Semantic structures established or considered for this written type. |

`position` is required for nested types and ordered type arguments. Child uses are derived from `subject_id` and sorted by `position`; a reverse children list is not stored. Association with a declaration or call is not duplicated as a parallel list of the same TypeUse IDs.

The containing declaration and analysis unit are obtained through `subject_id`, recursively through parent TypeUse or Annotation records when necessary. Type lookup results remain in Reference, Resolution, and HAS_TYPE edges, not in an exported lexical environment. TypeUse represents actual written syntax only: inferred types MUST NOT create fabricated type spellings. For example, `auto` MAY have a language-specific TypeUse, but a deduced pointer type has no invented source range. A HAS_TYPE edge on a declaration or expression does not require a TypeUse.

#### HAS_TYPE Edges

`Declaration`, `Expression`, `TypeUse`, and `Symbol` MAY have direct `HAS_TYPE` edges to `TypeExpression`. The edge means that its source has the target semantic type under a specified analysis context. It has no separate canonical ID or intermediate node. A parallel `type` or `inferred_type` field is not added to each entity, and HAS_TYPE is not duplicated as other semantic edges.

| Edge Property | Type | Purpose |
| --- | --- | --- |
| `context_id` ! | `Id -> AnalysisContext` | Configuration of the value. |
| `role` ! | `declared`, `inferred`, `return`, `receiver`, `constraint` | Distinction between source types, inference, and other purposes. |
| `state` ! | `established`, `candidate`, `unknown` | Binding resolution state. |

For object serialization, the source entity's `has_type` list contains embedded edges with `target_id` ! (`Id -> TypeExpression`) and the three required properties above. The source is the enclosing entity, and the label is HAS_TYPE; neither `id`, `source_id`, nor a redundant `kind` is stored. Graph serialization stores the same facts as direct edges, not additional parallel lists or relationship nodes. Missing or empty `has_type` does not establish that the source has no type. Unknown results MAY use an edge with `state: unknown` to a TypeExpression of kind `unknown` with an explicit reason.

```json
{
	"id": "decl:copy",
	"has_type": [
		{ "target_id": "type:scene-pointer", "context_id": "context:cpp20", "role": "inferred", "state": "established" }
	]
}
```

This fragment omits the other declaration attributes. Its inferred type does not imply that `Scene*` was written in the source.

The type of a particular declaration is associated with Declaration, the result type of an expression with Expression, and the resolved structure of a spelling with TypeUse. A return edge starts at a callable declaration; a receiver edge starts at a callable symbol or its corresponding declaration. A symbol edge MAY represent a contextual summary of consistent declarations, but is not required as a copy of all declaration edges. TypeUse.role describes syntactic purpose, while HAS_TYPE.role describes the semantic typing result; these are distinct attributes.

Incompatible candidate types and results from different contexts remain separate edges. They MUST NOT be collapsed into one established type. TypeExpression.completeness describes the target structure, not the certainty of an edge. TypeUse contains the source form; HAS_TYPE associates a subject with a semantic structure. Evidence uses the source entity as `subject_id` and an `attribute_path` identifying the edge, such as `has_type[0]`; Coverage uses the same subject, context, and path or the broader `types` dimension. Exporters MUST retain the edge association when serializing, aggregating, or reordering records. Derived dependencies preserve the source subject, target type structure, context, edge path, evidence, and uncertainty rather than inventing a binding-node ID.

## 7. Expressions and Calls

### Expression

| Attribute | Type | Purpose |
| --- | --- | --- |
| `unit_id` ! | `Id -> AnalysisUnit` | Analysis unit of this expression occurrence. |
| `declaration_id` ? | `Id -> Declaration` | Nearest declaration containing the expression; absent for unit-level expressions. |
| `has_type` ? | Outgoing `HAS_TYPE` edges | Available result types in their analysis contexts. |
| `span` ! | `SourceSpan` | Text and occurrence. |
| `kind` ! | `name`, `literal`, `member_access`, `call`, `construction`, `operator`, `assignment`, `cast`, `index`, `lambda`, `conditional`, `collection`, `await`, `language_specific`, `unknown` | Significant syntactic form. |
| `operands` ! | Ordered records: `role`, `expression_id` | Components and their roles. |
| `operator` ? | Normalized operator | Operation kind, including direct or indirect member access. |
| `literal` ? | Category and decoded value | A constant whose original spelling is preserved through its span. |
| `introduced_symbol_id` ? | `Id -> Symbol(callable)` | Callable symbol introduced by a lambda or function expression. |

An expression type is represented by HAS_TYPE edges; name lookup is represented by Reference. Available value category, constant value, and nullability results MAY be attached directly to the expression in its optional semantic_properties list; see section 3.

The structure of nested calls, member-access base expressions, assignments, and lambdas MUST be preserved. A full concrete syntax tree is not required; punctuation is available through source text. Synthetic implicit expressions MAY be represented by a separate language-specific extension without a fabricated source span.

### CallProfile

An extension of `Expression(kind: call | construction)`.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `call_kind` ! | `ordinary`, `constructor`, `operator`, `indirect`, `delegated_constructor`, `language_specific` | Invocation semantics. |
| `callee_expression_id` ! | `Id -> Expression` | Called name, member access, function pointer, or callable object. |
| `arguments` ! | Ordered list of `Argument` | Complete syntactic argument collection. |
| `condition` ? | `CallCondition` | Known branch restrictions on reaching this call occurrence. |

`Argument` contains `expression_id` !, `name` ?, `expansion` ! (`none`, `sequence`, `mapping`, `pack`), and `passing_mode` ?. Its order matches source order. `name` denotes a named argument label, not a copy of an already resolved parameter name.

Explicit generic or template arguments are represented by `TypeUse(subject_id: call_id, role: argument, position: index)`. Non-type template arguments are represented by expressions and a language-specific extension specifying their positions in the combined type, value, and template argument list; the argument category is preserved.

For call or construction expressions, `operands` does not duplicate the callee and arguments: these references are stored only in `CallProfile`. The receiver is stored as the base operand of the callee member-access expression; an independent receiver copy in the call is not required. Semantic receiver conversions are stored in the receiver binding without changing the source expression.

There are no separate method name, signature string, caller name, or argument count fields. The containing callable is determined from Expression.declaration_id and its parent declarations, selecting the nearest declaration whose symbol is callable. The declaration and expression belong to the same analysis unit. Expressions in local initializers may refer to the variable declaration, whose parent chain identifies the containing callable. Nested expressions keep their actual containing declaration; an outer call does not become a declaration container.

A lambda or local function has its own callable symbol and declaration. Expressions in its body belong to that declaration, not to the outer callable. The lambda expression itself belongs to its enclosing declaration and refers to its introduced symbol through `introduced_symbol_id`; creating the lambda does not establish a call to its body. A call without an enclosing callable retains its actual declaration, if any, and its analysis unit/project rather than a fabricated function. Calls in branches stay attached to their containing declaration, with restrictions recorded only through available CallCondition values.

### CallCondition

An optional embedded structure describing source-level restrictions on reaching a call or selecting one of its possible targets. It has no separate identity and is not a prediction that the call executes.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `predicate` ! | Structured expression | Variants: `expression(expression_id)`, `not(predicate)`, `and(predicates)`, `or(predicates)`, `unknown(reason)`. |
| `completeness` ! | `complete`, `partial`, `unknown` | Whether all restrictions within the explicitly assessed area are represented. |

Each predicate has a `kind` discriminator. Its other required attributes are `expression_id` for `expression`, `predicate` for `not`, `predicates` (a list) for `and` or `or`, and `reason` for `unknown`. A `CallCondition` is embedded in its owning record, not exported as a standalone entity.

`expression_id` references an existing `Expression` whose truth value is tested under the source language rules. Its spelling, operands, references, and available type bindings remain in the base model. `not` represents the opposite branch; `and` combines nested restrictions; `or` preserves alternative conditions. Unknown portions MUST NOT be silently omitted from a predicate claimed to be complete. An absent condition means not recorded or unknown, not unconditional. A complete empty `and` MAY explicitly represent no restrictions within the assessed area.

On `CallProfile`, the condition describes branch restrictions on reaching that occurrence, including `if`/`else`, conditional expressions, short-circuit operands, and other supported conditional constructs. On a `ResolutionCandidate`, it describes restrictions on selecting that target, for example when a configuration-dependent assignment chooses a provider before a shared call site. Both conditions apply together; they are not interchangeable. Conditions governing a lambda's creation do not automatically govern calls in its body.

Evidence for a condition uses the enclosing call or Resolution as `subject_id` and the corresponding `attribute_path`, including the candidate position when applicable. Coverage uses the same subject and an AttributePath dimension to state the assessed area, unsupported constructs, and missing information. `complete` concerns the captured restrictions within that area, not proof of reachability, path feasibility, termination, or discovery of every runtime target. Target conditions derived through assignments or configuration require supporting semantic evidence; a matching name or lexical proximity is insufficient. Unavailable configuration values or predicates remain explicitly unknown rather than being fabricated.

For `if (config.useCloud) cloud.send(); else local.send();`, the two call profiles MAY carry `expression(test_id)` and `not(expression(test_id))`. For `provider = config.useCloud ? cloud : local; provider.send();`, supported target candidates MAY carry those respective predicates while the call occurrence itself has no such branch restriction. Propagating the latter conditions requires additional analysis and is not required for conformance. Recording either form does not require evaluating the configuration or executing the program.

## 8. References, Binding, and Implementations

### Reference

| Attribute | Type | Purpose |
| --- | --- | --- |
| `site_id` ! | `Id -> Expression`, `TypeUse`, `Declaration`, or `Import` | Construct containing the reference. |
| `span` ! | `SourceSpan` | Exact position of the name or path. |
| `role` ! | `read`, `write`, `read_write`, `address`, `type`, `callee`, `annotation`, `inheritance`, `import`, `export`, `capture`, `label` | Usage semantics. |
| `qualification` ! | `unqualified`, `qualified`, `member`, `global`, `language_specific` | Lookup form. |

Spelling is obtained from the span, and declaration/unit containment from `site_id`. Multiple names in one construct produce multiple references. Name lookup may yield an overload set, while call binding selects a particular overload; these are distinct results. Lookup environments need not be exported to preserve those results.

### Resolution

| Attribute | Type | Purpose |
| --- | --- | --- |
| `subject_id` ! | `Id -> Reference` or a call/construction `Expression` | Reference or invocation being resolved. |
| `context_id` ! | `Id -> AnalysisContext` | Configuration of the decision. |
| `state` ! | `resolved`, `ambiguous`, `unresolved`, `partial`, `unsupported` | Result without implicit target selection. |
| `selected_target_id` ? | `Id -> Symbol` | Single declaration-level target. |
| `candidates` ! | List of `ResolutionCandidate` | Considered targets, including rejected and unknown candidates. |
| `candidate_set_completeness` ! | `complete`, `partial`, `unknown` | Distinction between the only applicable target and the only target found. |
| `dispatch_kind` ? | `direct`, `virtual`, `interface`, `indirect`, `dynamic`, `intrinsic`, `unknown` | Invocation semantics. |
| `argument_bindings` ! | List of `ArgumentBinding` | Associations between actual arguments and formal parameters. |
| `receiver_binding` ? | Expression ID, parameter ID when available, conversions | Extension methods, implicit receivers, and other semantic bindings. |
| `type_substitutions` ! | Mapping from type parameter IDs to type IDs or expression IDs | Generic inference or template substitution. |
| `reason_codes` ! | Set of strings | Reasons for ambiguity, incompleteness, or failure. |

`ResolutionCandidate`: `target_symbol_id` !, `applicability` ! (`applicable`, `inapplicable`, `unknown`), `reason_codes` !, `conversions` !, and `condition` ? (`CallCondition`). The condition optionally describes target selection for a call or construction; it is not applicable to reference lookup. Ranking is preserved through language-specific evidence; a universal numeric scale is not required.

A target condition does not establish applicability, candidate completeness, or a unique selection. Supported conditional alternatives remain candidates even when the configuration value is unknown. A predicate alone MUST NOT be used to promote an ambiguous or partial result to `resolved`; the existing selection requirements still apply. If the selected target has a recorded candidate condition, derived selected-target relationships retain it.

Resolution MUST preserve all targets identified as applicable or potentially applicable from the available source and semantic evidence, even when no single target can be selected. Unknown candidates require supporting evidence; a matching name alone does not establish a possible dependency. This does not guarantee discovery of every runtime target: missing types, dependencies, reflection, and dynamic dispatch may leave the candidate set partial or unknown.

`ArgumentBinding`: `parameter_id` !, `argument_positions` ! (zero-based indices into the original `arguments`), `default_expression_id` ?, and `conversions` !. An empty position list MAY represent a default; multiple positions MAY bind to a variadic parameter. An unknown spread expansion is not replaced with a known element list.

`Conversion`: `kind` !, `source_type_id` ?, `target_type_id` ?, and `state` ! (`established`, `candidate`, `unknown`). Example kinds include `identity`, `numeric_promotion`, `reference_binding`, `boxing`, `user_defined`, and `language_specific`. Applicability under language rules MUST have supporting evidence.

For reference resolution, dispatch, argument, receiver, and type substitution fields are not applicable and are not populated with substantive values. `selected_target_id` is permitted only for `resolved`. This state MUST require a complete relevant candidate scope and an established selection. An external target MAY be an established external or system symbol; a placeholder does not establish a signature.

### ImplementationSet

An optional source-level result identifying known definitions of the selected callable target and possible implementations established through inheritance and override relations. It does not predict which implementation executes.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `resolution_id` ! | `Id -> Resolution` | Declaration-level decision. |
| `definition_ids` ! | Set of `Id -> Declaration(definition)` | Known implementations, including virtual dispatch targets. |
| `completeness` ! | `complete`, `partial`, `unknown` | Completeness within the assessed source and type hierarchy. |

A resolved declaration does not guarantee an available definition. An empty incomplete set does not establish the absence of implementations. Source-level completeness does not imply completeness of runtime targets or require linker analysis.

## 9. Imports, Annotations, and Semantic Edges

### Import

| Attribute | Type | Purpose |
| --- | --- | --- |
| `unit_id` ! | `Id -> AnalysisUnit` | Analysis unit containing the import. |
| `declaration_id` ? | `Id -> Declaration` | Nearest containing declaration; absent for a unit-level directive. |
| `span` ! | `SourceSpan` | Source directive. |
| `kind` ! | `module`, `symbol`, `wildcard`, `include`, `using`, `reexport`, `dynamic` | Lookup and dependency rules. |
| `path_segments` ! | Ordered list of strings | Structured source name. |
| `relative_level` ? | Integer >= 0 | Relative imports. |
| `bindings` ! | Records: `imported_name` ?, `local_symbol_id` ?, `wildcard` ! | Aliases and introduced names. |
| `path_expression_id` ? | `Id -> Expression` | Dynamically computed path. |
| `presence_condition` ? | `PresenceCondition` | Conditional activation. |

An alias name is stored in the local `Symbol`; `imported_name` denotes the original exported name. A wildcard is a lookup rule, not an established complete name set. Unknown path segments are not fabricated.

### Annotation

| Attribute | Type | Purpose |
| --- | --- | --- |
| `declaration_id` ! | `Id -> Declaration` | Annotated declaration. |
| `span` ! | `SourceSpan` | Source application of an annotation, attribute, or decorator. |
| `arguments` ! | Ordered list of `Argument` | Values and labels of named annotation arguments. |

An annotation's type or name is represented by its associated `TypeUse` and reference. An executable decorator is additionally represented by an expression or call when required by language semantics; an annotation alone does not establish an invocation.

#### Semantic Edges

A direct typed edge represents a relationship not fully derivable from the base structure: inheritance, override, alias, export, capture, or callback registration. There is no standalone relationship entity or canonical edge ID. Project build dependencies are represented only by direct DEPENDS_ON or EXTERNAL edges.

In object serialization, the source node holds an optional outgoing list named by the table below. Each entry contains `target_id` !, pointing to the permitted target category, and the edge properties below. The source is the enclosing node; the graph label is the uppercase list name, such as INHERITS or IMPORTS_FROM. Entries MUST NOT contain `id`, `source_id`, or a redundant `kind`. Graph serialization represents the same facts as direct edges, not parallel relationship nodes. Missing lists mean not recorded, not proof that no relationship exists.

| Edge Property | Type | Purpose |
| --- | --- | --- |
| `context_id` ! | `Id -> AnalysisContext` | Configuration in which the relationship applies. |
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
| `imports_from`, `reexports_from` | `Import -> Project`, `SourceFile`, or `Symbol` | Resolved project, file, namespace, or source-language module target. |
| `exports` | `Project`, `SourceFile`, or `Symbol(module) -> Symbol` | Project public API or language-level file/module export; exported name, if different. |
| `captures` | `Symbol(callable) -> Symbol` | Capture mode: value/reference/move/unknown. |
| `registers_callback` | `Expression(call) -> Symbol(callable)` | Argument position and an established API contract. |

Passing a lambda as an argument establishes neither `registers_callback` nor execution of its body. Without an API contract, the argument, callable reference, and captures are preserved, but registration is not fabricated.

For example, a type Symbol MAY contain `"inherits": [{"target_id":"type:base","context_id":"context:cpp17","state":"established"}]`. Candidate targets and contexts remain separate edges. Evidence references the source Symbol with an attribute_path such as `inherits[0]`; Coverage MAY use the same path and context. Evidence for an edge's embedded property uses a nested path such as `inherits[0].semantic_properties[0]`. Exporters MUST preserve edge, context, and property associations when reordering or aggregating lists. Derived dependencies retain the source node, edge label, target, context, path, evidence, and uncertainty without inventing relationship IDs.

Ownership, declarations, operands, HAS_TYPE edges, references, and the selected invocation target are already represented by base entities and direct edges and are not duplicated as additional semantic edges.

## 10. Structural Dependency Graph

Structural dependencies are derived from references, resolutions, imports, HAS_TYPE edges, and semantic relations. A selected target establishes a declaration-level relationship; other applicable or unknown candidates are retained as possible relationships. Inapplicable candidates do not produce dependency edges. Known implementation definitions MAY contribute possible implementation relationships without claiming execution.

A relationship found inside a conditional branch is retained without proving that the branch executes. Presence conditions describe source applicability, not execution paths. Component-level relationships MAY aggregate occurrences and analysis configurations, retaining their supporting records and uncertainty rather than duplicating an edge for every occurrence. Aggregation does not imply that all relationships apply simultaneously in one configuration.

Derived call relationships (`CALLS`, `INVOKES`, or equivalent view labels) MUST retain any recorded call-occurrence and target-selection conditions, their completeness, and supporting records. The effective restriction for one occurrence and target is the conjunction of its call and candidate predicates; an absent condition remains unknown rather than becoming true. Aggregation MUST preserve the association between each target, occurrence, context, and its conditions instead of combining predicates from different contexts or losing conditional alternatives. `CallCondition` does not replace `PresenceCondition`: a runtime application setting tested by an expression differs from source activation under an AnalysisContext.

AnalysisContext identifies static language and dependency settings, not a runtime state. Neither execution tracing nor branch-sensitive value tracking is required for conformance. Indirect or dynamic references preserve known candidates and explicit limitations; unavailable targets are not fabricated. These code dependency graph edges are derived views, not duplicate canonical semantic edges. Optional semantic_properties do not introduce structural dependencies or establish an edge merely because a value is present.

A project map uses `Repository`, `Project`, `Directory`, `ProjectFile`, and `ExternalLibrary` nodes with direct `CONTAINS`, `EXTERNAL`, and `DEPENDS_ON` edges from the dataset. Project roots are projects without a known parent, subject to structural coverage; physical trees use directory parents. These canonical structural relationships are not derived code-call relationships. Code dependencies MAY be projected onto projects through AnalysisContext.project_id and, where available, SourceFile.project_file_id and project memberships, retaining their original evidence and uncertainty. Shared-file membership MUST NOT arbitrarily assign a code dependency to one project, nor turn it into a descriptor-declared dependency. A map MUST distinguish discovered build dependencies from such code-derived overlays.

## 11. Evidence, Properties, and Completeness

### Evidence

| Attribute | Type | Purpose |
| --- | --- | --- |
| `subject_id` ! | `Id` | Record being supported. |
| `attribute_path` ? | `AttributePath` | Specific property; absence denotes the entire record. |
| `method` ! | `syntax`, `language_rules`, `compiler`, `configuration`, `inference`, `heuristic`, `manual` | Acquisition method. |
| `source_spans` ! | List of `SourceSpan` | Source evidence. |
| `supporting_ids` ! | Set of `Id` | Dependencies of a conclusion on other facts. |
| `authority` ! | `observed`, `established`, `inferred`, `heuristic`, `unknown` | Authority independent of resolution state. |
| `detail` ? | Structured description | Rule, compiler diagnostic, or limitation. |

Evidence does not copy the attribute value. For context-dependent information, the subject references Resolution or the owning node of an embedded semantic property, HAS_TYPE edge, or semantic edge, with the corresponding attribute_path. Project structure evidence references Repository, Project, or ExternalLibrary and their supporting descriptor/inventory records. Evidence for a direct project edge uses its source Project and the corresponding attribute_path; source spans are empty when no analyzed UTF-8 text is available. Heuristic evidence alone does not establish identity or candidate completeness.

### Coverage

| Attribute | Type | Purpose |
| --- | --- | --- |
| `subject_id` ! | `Id` of an area or individual entity | Scope of the completeness claim. |
| `context_id` ? | `Id -> AnalysisContext` | Required for language-analysis assessments; optional for project structure independent of code analysis. |
| `dimension` ! | `syntax`, `declarations`, `references`, `calls`, `types`, `imports`, `configuration`, `candidate_scope`, `implementations`, `projects`, `files`, `project_dependencies`, `external_libraries`, or AttributePath | Aspect being assessed. |
| `state` ! | `complete`, `partial`, `unknown`, `not_applicable` | Completeness. |
| `excluded_spans` ! | List of `SourceSpan` | Omitted or damaged ranges. |
| `excluded_uris` ? | List of normalized URIs | Explicit structural assessment exclusions without requiring parsed source text. |
| `reason_codes` ! | Set of strings | Missing SDK, parse error, or unsupported construct. |

Coverage applies only to the specified configuration and area. A complete syntactic call collection does not imply a complete runtime target set. An absent assessment is treated as unknown, not complete.

For project structure, `subject_id` references a Repository or Project and `dimension` identifies projects, files, project dependencies, or external libraries. No AnalysisContext or parsed source is required for these assessments; `excluded_spans` MAY be empty. Coverage records results and assessment boundaries, not discovery configuration. Complete file coverage includes code, non-code files, descriptors, and directories within the assessed area, not a claim that every file is compiled. Missing permissions, unsupported descriptors, unevaluated build expressions, unavailable lockfiles, or unresolved profiles MUST be reflected in coverage and diagnostics rather than interpreted as empty results.

### Diagnostic

Required attributes: `severity` (`info`, `warning`, `error`), `code`, and `message`. Optional attributes: `subject_id`, `context_id`, and `span`. Syntax recovery errors, conflicting declarations, missing sources, and unsupported forms MUST be reflected in diagnostics and coverage.

## 12. Model Invariants

1. All references point to existing entities of permitted categories. Unidentified external targets are represented by placeholders or unresolved results, not dangling IDs.
2. Spans lie within the bounds of a particular UTF-8 source version. `name_span` lies within `Declaration.span` when both are known.
3. Declaration parent chains, project parents, and semantic owners are acyclic. Recursive calls, symbol references in types, and project dependencies may contain cycles. Declaration parents and contained expressions/imports agree on their analysis unit; TypeUse inherits its containment from its subject.
4. One occurrence is not merged with another because their text matches. Entities of different categories may share the same source span.
5. Parameter, argument, and operand order is preserved. An implicit receiver does not increase explicit argument count.
6. Declaration merging relies on language rules and identity evidence. Conflicting definitions are not selected arbitrarily.
7. A resolved result has one selected target with `identity_state: established` and an established selection within the complete relevant candidate scope. An unknown potentially applicable competitor blocks final selection.
8. A virtual, interface, indirect, or dynamic declaration-level target does not establish a single implementation.
9. Unknown, an empty complete set, an empty incomplete set, and not_applicable are distinguishable.
10. All source coordinates refer to the analyzed input text. Analysis does not modify that text or introduce transformed source versions.
11. Intrinsics, placeholders, lambdas, and implicit declarations have distinguishable origins and categories.
12. New HAS_TYPE edges, resolutions, and implementations do not alter preserved source observations. HAS_TYPE connects only Declaration, Expression, TypeUse, or Symbol to TypeExpression, carries its context, role, and state, and has no separate canonical identity.
13. All semantic decisions are associated with a static analysis context; no execution point or runtime state is required. Direct semantic edges have permitted typed endpoints and no separate identity. Optional semantic_properties are embedded on their existing node or edge, preserve their effective context and state, and do not duplicate canonical fields or require separate property records.
14. Variant profile attributes occur only on permitted base categories. An unsupported construct receives an unknown or language-specific form and a diagnostic.
15. At most one current Resolution exists for a `(subject_id, context_id)` pair. Historical or alternative decisions are not presented as simultaneously active.
16. ImplementationSet refers to a resolved callable target; definitions belong to that target or to established dispatch implementations. Set completeness requires separate evidence.
17. Recorded call and target-selection conditions preserve their source expressions, declaration/unit containment, context, evidence, and assessed completeness. Unknown or absent conditions do not establish unconditional execution, and a conditional target does not by itself establish a resolved selection. Lambda and local-function body calls belong to their own callable declarations, not the enclosing callable.
18. Project hierarchy and directory parent chains are acyclic. Project dependencies may contain cycles. A project parent belongs to the same repository; project hierarchy, filesystem hierarchy, and dependencies are not interchangeable.
19. Every direct project edge endpoint, descriptor, inventory parent, and external library exists in the dataset. Both endpoints of a project dependency belong to the same repository. Inventory parent URIs denote immediate physical parents; files and directories have distinct normalized locations/categories.
20. Every project is identified by its repository and descriptor within the dataset and contains its descriptor and root directory. Every AnalysisContext refers to a Project; no independent descriptor-free organizational boundary is introduced. CodeDataset.root_project_ids contains exactly the projects without a known parent, subject to hierarchy coverage. Shared inventory nodes are not duplicated by project; their memberships are explicit. External identities preserve resolved versions and artifact variants, and missing structural results remain unknown rather than established empty sets.

## 13. Construct Coverage

| Construct | Required Representation |
| --- | --- |
| Single-project or multi-project repository | Repository, one Project per discovered descriptor, optional project hierarchy, structural Coverage and Diagnostic records. |
| Project files, directories, shared or linked files | Directory, ProjectFile, physical parent references, direct CONTAINS edges for project membership. |
| External project library | ExternalLibrary, direct EXTERNAL edge, observed coordinates, known resolved version, and resolution evidence or limitations. |
| Same-repository project dependency | Direct DEPENDS_ON edge with descriptor-resolution evidence, scope, conditions, and directness when known. |
| Project structure connected to analyzed code | AnalysisContext.project_id, AnalysisUnit.context_id, SourceFile.project_file_id when established. |
| Type and nested type | Symbol, Declaration, TypeProfile, semantic owner, parent declarations and analysis units. |
| Function, method, overload | Separate callable symbol, occurrences, profile, parameters, type bindings. |
| Field, variable, shadowing | Distinct symbols and declarations, declaration containment, source spans, initializer, available reference resolutions and type bindings. |
| Direct or member call | Call expression, callee reference, base expression when present, arguments, Resolution. |
| Conditional call or configuration-dependent target | Base call records and supported candidates; optional CallCondition on the call occurrence and on individual resolution candidates, with evidence and explicit assessment boundaries when recorded. |
| Call chain | Separate nested expressions and their result types. |
| Constructor, operator, or indirect invocation | CallProfile of the corresponding category; intrinsics are not disguised as user-defined callables. |
| Named, default, spread, or variadic arguments | Source arguments, ParameterProfile, available argument bindings. |
| Lambda, local function, capture | Callable symbol and declaration, body span when available, capture relations; body expressions belong to that callable declaration. |
| Type reference, generic, alias | TypeUse for written syntax, Reference, TypeExpression, direct HAS_TYPE edges, semantic relations. |
| Inheritance, interface implementation, override | Established or candidate direct INHERITS, IMPLEMENTS, or OVERRIDES edges. |
| Import, include, alias, reexport | Import, local symbols, references, resolved import relations. |
| Annotation, attribute, decorator | Annotation, TypeUse or reference, arguments, executable expression when required. |
| Conditional or external source code, or pre-existing generated source files | Context, PresenceCondition, origin, Coverage. |
| Indirect, polymorphic, or dynamic targets | Available Resolution candidates, inheritance and override relations, optional ImplementationSet, and explicit completeness assessments. |
| Incomplete, erroneous, or dynamic code | Available syntax, partial or unknown results, and diagnostics without fabricated targets. |

## 14. Conformance Levels

**Project structure** is available before code analysis. It MUST contain repository identity, one project per recognized descriptor in the assessed area, file and directory inventory with membership, known external libraries, supported project dependencies, evidence, coverage, and diagnostics for incomplete areas. A complete claim requires complete coverage for projects, files, project dependencies, and external libraries within the stated boundaries. Project structure alone does not claim syntactic or semantic code conformance. Both code conformance levels require descriptor-based Project boundaries for their analysis contexts; projects or descriptors MUST NOT be fabricated for unattached source files. Discovery configuration and its external storage are outside the scope of this model.

**Syntactic dataset** contains repositories and descriptor-based projects for its analysis boundaries, sources, contexts with explicitly stated completeness, units, provisional symbols, declarations with their containment, expressions, call profiles, type uses, references, imports, annotations, diagnostics, and coverage. Missing semantic results are represented as unknown, not as established empty sets. This level is sufficient for a graph of source structure but does not guarantee resolved cross-component dependencies.

**Semantic dataset** additionally contains established identities, available type bindings, resolutions with known and possible targets, inheritance, override, capture, and import relations, and evidence. ImplementationSet MAY record available source definitions and possible overrides. Incomplete areas are permitted only with explicit coverage boundaries. This is the target level for a structural component dependency graph; a unique call target is not required to preserve possible dependencies.

Neither conformance level requires execution-path analysis, runtime target prediction, or proof that a conditional relationship executes.

Both levels MAY additionally preserve known call-occurrence conditions; semantic datasets MAY preserve supported target-selection conditions. Missing condition analysis does not lower conformance and MUST NOT be interpreted as evidence that calls or targets are unconditional. When conditions are recorded, their integrity and retention in derived dependency views are required as specified above.

Each analysis tool declares its achieved level and coverage of individual areas. The presence of a syntax tree is not evidence of semantic completeness. Sufficiency is determined by model integrity, completeness of the required entities, and the authority of specific relationships, not by serialization format.