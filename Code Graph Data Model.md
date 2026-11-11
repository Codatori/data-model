# Canonical Code Graph Data Model

## 1. Purpose and Conventions

This specification defines a source code model independent of programming language, parser, storage format, and graph database. It specifies entities, attributes, relationships, and constraints for a graph of declarations, types, calls, and dependencies.

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
| `root_module_ids` ! | Set of `Id -> Module` | Roots of the analyzed program. |

All entities belong to the dataset. Duplicated lists of every symbol, expression, or reference ID are not required in `CodeDataset`.

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

A filesystem path is a particular case of a URI. A text change creates a new `SourceFile` version. An embedded language MAY have its own source with a mapping to the containing file.

### SourceMapping

| Attribute | Type | Purpose |
| --- | --- | --- |
| `generated_span` ! | `SourceSpan` | A fragment of transformed text. |
| `original_spans` ! | Nonempty list of `SourceSpan` | Original provenance, including multiple macro fragments. |
| `mapping_kind` ! | `exact`, `expansion`, `approximate` | Mapping accuracy. |

Generated text positions are not relabeled as original positions. A fragment that cannot be mapped is preserved without a fabricated mapping.

### Module

| Attribute | Type | Purpose |
| --- | --- | --- |
| `name` ! | String | Name of a build unit, package, or analysis unit. |
| `kind` ! | `package`, `library`, `executable`, `source_group`, `external_library` | Module boundary semantics. |
| `parent_module_id` ? | `Id -> Module` | Module hierarchy. |

### AnalysisContext

| Attribute | Type | Purpose |
| --- | --- | --- |
| `module_id` ! | `Id -> Module` | Analysis scope. |
| `context_digest` ! | `Digest` | Identity of significant settings. |
| `language_settings` ! | Language, version, and dialect settings | Language rules for the specific configuration. |
| `target` ? | Architecture, platform, ABI | Platform-dependent types and binding. |
| `compiler` ? | Name, version, and significant options | Compiler-based semantics. |
| `defines` ! | Mapping from names to values | Conditional compilation. |
| `search_paths` ! | Ordered records: `uri`, `kind` | Include, import, and module search order. |
| `dependency_context_ids` ! | Set of `Id -> AnalysisContext` | Available configurations of dependent modules. |

`SourceFile.language_version` specifies the file-local dialect; `language_settings` specifies the analysis configuration. A conflict MUST produce a diagnostic. An unknown configuration is permitted only with an appropriate completeness assessment. An empty settings list does not establish their absence when coverage is incomplete.

### AnalysisUnit

| Attribute | Type | Purpose |
| --- | --- | --- |
| `context_id` ! | `Id -> AnalysisContext` | Configuration of the analysis pass. |
| `entry_file_ids` ! | Nonempty list of `Id -> SourceFile` | Inputs of a translation unit or analysis group. |
| `participating_file_ids` ! | Set of `Id -> SourceFile` | Source files and headers actually included. |

A file may participate in multiple units. File-local identity and preprocessor state MUST NOT be merged solely by filename. Unit-dependent occurrences are distinguished through lexical scope and `AnalysisUnit`.

## 5. Scopes, Symbols, and Declarations

### Scope

| Attribute | Type | Purpose |
| --- | --- | --- |
| `unit_id` ! | `Id -> AnalysisUnit` | Context of the specific syntactic or semantic scope. |
| `kind` ! | `module`, `namespace`, `type`, `callable`, `block`, `comprehension`, `pattern`, `language_specific` | Name lookup and shadowing rules. |
| `parent_scope_id` ? | `Id -> Scope` | Lexical lookup chain. |
| `owner_declaration_id` ? | `Id -> Declaration` | Construct introducing the scope. |
| `span` ? | `SourceSpan` | Scope boundaries in the source. |

A lexical scope does not replace a semantic owner: a method may be defined outside its class body, and a namespace may be opened multiple times. Multiple scopes may belong to declarations of one symbol.

### Symbol

| Attribute | Type | Purpose |
| --- | --- | --- |
| `name` ? | String | The single canonical simple name; absent for an anonymous entity. |
| `kind` ! | `namespace`, `module`, `type`, `callable`, `field`, `variable`, `parameter`, `type_parameter`, `enum_value`, `property`, `label`, `macro`, `language_specific` | Logical entity category. |
| `owner_symbol_id` ? | `Id -> Symbol` | Semantic ownership. |
| `origin` ! | `source`, `generated`, `external`, `system`, `intrinsic`, `placeholder` | Provenance and authority. |
| `identity_state` ! | `established`, `provisional` | Established or provisional identity. |
| `language_identity` ? | Language- or compiler-specific key | Declaration merging when a reliable key is available. |

Qualified names are computed from owners and language rules. A full signature string, display name, or mangled name does not replace structural identity. External identity keys MAY be preserved in evidence.

### Declaration

| Attribute | Type | Purpose |
| --- | --- | --- |
| `symbol_id` ! | `Id -> Symbol` | Association of an occurrence with a language entity. |
| `scope_id` ! | `Id -> Scope` | Declaration location and lookup at that point. |
| `form` ! | `declaration`, `definition`, `forward_declaration`, `implicit` | Distinction between declaration and implementation. |
| `span` ? | `SourceSpan` | Full source range. |
| `name_span` ? | `SourceSpan` | Name position without copying its value. |
| `body_scope_id` ? | `Id -> Scope` | Body scope. |
| `initializer_expression_id` ? | `Id -> Expression` | Variable, field, or enum value initialization, or a parameter default. |
| `visibility` ? | `public`, `protected`, `private`, `internal`, `package`, `local`, `language_specific` | Accessibility. |
| `linkage` ? | `external`, `internal`, `none`, `language_specific` | Linkage boundaries. |
| `modifiers` ! | Set of normalized values | `static`, `abstract`, `virtual`, `override`, `final`, `const`, `async`, and other properties. |
| `presence_condition` ? | `PresenceCondition` | Conditional activation. |

An explicit source declaration MUST have a `span`. It MAY be absent for an implicit or external declaration without accessible text. An empty modifier set establishes the absence of properties only when the corresponding attribute has complete coverage.

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

## 6. Types and Type Uses

### Type

A type value, not a source declaration. A nominal type references a type symbol; an array, pointer, or generic application is a separate structure.

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

### TypeUse

A particular syntactic use of a type.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `scope_id` ! | `Id -> Scope` | Type name lookup. |
| `span` ! | `SourceSpan` | Original spelling without a text copy. |
| `form` ! | `named`, `qualified`, `pointer`, `reference`, `array`, `function`, `generic`, `tuple`, `union`, `intersection`, `nullable`, `wildcard`, `dependent`, `language_specific`, `unknown` | Syntactic form of the use. |
| `subject_id` ! | `Id -> Declaration`, `Expression`, `Annotation`, or parent `TypeUse` | Construct using this syntactic type. |
| `role` ! | `declared`, `return`, `base`, `constraint`, `cast`, `argument`, `annotation`, `language_specific` | Purpose of the type use. |
| `position` ? | Integer >= 0 | Order of uses sharing the same subject and role. |

`position` is required for nested types and ordered type arguments. Child uses are derived from `subject_id` and sorted by `position`; a reverse children list is not stored. Association with a declaration or call is not duplicated as a parallel list of the same TypeUse IDs.

### TypeBinding

The single location for storing the association of a subject with a type value. A parallel `type` or `inferred_type` field is not added to each entity.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `subject_id` ! | `Id -> Declaration`, `Expression`, `TypeUse`, or `Symbol` | Subject being typed. |
| `context_id` ! | `Id -> AnalysisContext` | Configuration of the value. |
| `role` ! | `declared`, `inferred`, `return`, `receiver`, `constraint` | Distinction between source types, inference, and other purposes. |
| `type_id` ! | `Id -> Type` | Canonical structure. |
| `state` ! | `established`, `candidate`, `unknown` | Binding resolution state. |

The type of a particular declaration is associated with `Declaration`, the result type of an expression with `Expression`, and the resolved structure of a spelling with `TypeUse`. A return binding refers to a callable declaration; a receiver binding refers to a callable symbol or its corresponding declaration. A symbol binding MAY represent a contextual summary of consistent declarations, but is not required as a copy of all declaration bindings.

Incompatible candidate bindings are preserved separately. They MUST NOT be collapsed into one established type. TypeUse contains the source form; TypeBinding contains the semantic value. These are distinct pieces of information.

## 7. Expressions and Calls

### Expression

| Attribute | Type | Purpose |
| --- | --- | --- |
| `scope_id` ! | `Id -> Scope` | Lexical environment. |
| `span` ! | `SourceSpan` | Text and occurrence. |
| `kind` ! | `name`, `literal`, `member_access`, `call`, `construction`, `operator`, `assignment`, `cast`, `index`, `lambda`, `conditional`, `collection`, `await`, `language_specific`, `unknown` | Significant syntactic form. |
| `operands` ! | Ordered records: `role`, `expression_id` | Components and their roles. |
| `operator` ? | Normalized operator | Operation kind, including direct or indirect member access. |
| `literal` ? | Category and decoded value | A constant whose original spelling is preserved through its span. |
| `introduced_symbol_id` ? | `Id -> Symbol(callable)` | Callable symbol introduced by a lambda or function expression. |

An expression type is represented by `TypeBinding`; name lookup is represented by `Reference`. Value category, constant value, and nullability obtained through analysis are represented by `SemanticProperty`.

The structure of nested calls, member-access base expressions, assignments, and lambdas MUST be preserved. A full concrete syntax tree is not required; punctuation is available through source text. Synthetic implicit expressions MAY be represented by a separate language-specific extension without a fabricated source span.

### CallProfile

An extension of `Expression(kind: call | construction)`.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `call_kind` ! | `ordinary`, `constructor`, `operator`, `indirect`, `delegated_constructor`, `language_specific` | Invocation semantics. |
| `callee_expression_id` ! | `Id -> Expression` | Called name, member access, function pointer, or callable object. |
| `arguments` ! | Ordered list of `Argument` | Complete syntactic argument collection. |

`Argument` contains `expression_id` !, `name` ?, `expansion` ! (`none`, `sequence`, `mapping`, `pack`), and `passing_mode` ?. Its order matches source order. `name` denotes a named argument label, not a copy of an already resolved parameter name.

Explicit generic or template arguments are represented by `TypeUse(subject_id: call_id, role: argument, position: index)`. Non-type template arguments are represented by expressions and a language-specific extension specifying their positions in the combined type, value, and template argument list; the argument category is preserved.

For call or construction expressions, `operands` does not duplicate the callee and arguments: these references are stored only in `CallProfile`. The receiver is stored as the base operand of the callee member-access expression; an independent receiver copy in the call is not required. A transformed receiver is stored in the semantic binding.

There are no separate method name, signature string, caller name, or argument count fields. Callable ownership is determined by the nearest callable scope. A lambda's lexical parent does not become the caller of its body. A call at module or global initialization level retains its module scope rather than a fabricated function.

## 8. References, Binding, and Implementations

### Reference

| Attribute | Type | Purpose |
| --- | --- | --- |
| `site_id` ! | `Id -> Expression`, `TypeUse`, `Declaration`, or `Import` | Construct containing the reference. |
| `span` ! | `SourceSpan` | Exact position of the name or path. |
| `role` ! | `read`, `write`, `read_write`, `address`, `type`, `callee`, `annotation`, `inheritance`, `import`, `export`, `capture`, `label` | Usage semantics. |
| `qualification` ! | `unqualified`, `qualified`, `member`, `global`, `language_specific` | Lookup form. |

Spelling is obtained from the span, and scope from `site_id`. Multiple names in one construct produce multiple references. Name lookup may yield an overload set, while call binding selects a particular overload; these are distinct results.

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

`ResolutionCandidate`: `target_symbol_id` !, `applicability` ! (`applicable`, `inapplicable`, `unknown`), `reason_codes` !, and `conversions` !. Ranking is preserved through language-specific evidence; a universal numeric scale is not required.

`ArgumentBinding`: `parameter_id` !, `argument_positions` ! (zero-based indices into the original `arguments`), `default_expression_id` ?, and `conversions` !. An empty position list MAY represent a default; multiple positions MAY bind to a variadic parameter. An unknown spread expansion is not replaced with a known element list.

`Conversion`: `kind` !, `source_type_id` ?, `target_type_id` ?, and `state` ! (`established`, `candidate`, `unknown`). Example kinds include `identity`, `numeric_promotion`, `reference_binding`, `boxing`, `user_defined`, and `language_specific`. Applicability under language rules MUST have supporting evidence.

For reference resolution, dispatch, argument, receiver, and type substitution fields are not applicable and are not populated with substantive values. `selected_target_id` is permitted only for `resolved`. This state MUST require a complete relevant candidate scope and an established selection. An external target MAY be an established external or system symbol; a placeholder does not establish a signature.

### ImplementationSet

A separate result identifying possible implementations of the selected callable target.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `resolution_id` ! | `Id -> Resolution` | Declaration-level decision. |
| `definition_ids` ! | Set of `Id -> Declaration(definition)` | Known implementations, including virtual dispatch targets. |
| `completeness` ! | `complete`, `partial`, `unknown` | Completeness of linker or runtime knowledge. |

A resolved declaration does not guarantee a linked implementation. An empty incomplete set does not establish the absence of implementations.

## 9. Imports, Annotations, and Semantic Relations

### Import

| Attribute | Type | Purpose |
| --- | --- | --- |
| `scope_id` ! | `Id -> Scope` | Scope in which the import applies. |
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

### SemanticRelation

A relationship not fully derivable from the base structure: inheritance, override, alias, export, capture, or build dependency.

| Attribute | Type | Purpose |
| --- | --- | --- |
| `source_id` !, `target_id` ! | Typed `Id` values | Relationship endpoints. |
| `kind` ! | Category from the table below | Relationship semantics. |
| `context_id` ! | `Id -> AnalysisContext` | Configuration in which the relationship applies. |
| `site_id` ? | `Id` of a source construct | Source evidence without repeating coordinates. |
| `state` ! | `established`, `candidate` | Established or possible relationship. |
| `presence_condition` ? | `PresenceCondition` | Conditional applicability. |
| `details` ? | Typed extension determined by `kind` | Relationship-specific properties. |

| `kind` | Source -> target | Additional Information |
| --- | --- | --- |
| `inherits`, `implements` | `Symbol(type) -> Type` | Visibility, virtual-base flag, generic substitution. |
| `overrides` | `Symbol(callable) -> Symbol(callable)` | Distinction between an override and a same-name overload. |
| `aliases`, `underlying_type` | `Symbol(type) -> Type` | Alias target and enum underlying type. |
| `constrains` | `Symbol(type_parameter) -> Type` | Constraint kind. |
| `accessor_for` | `Symbol(callable) -> Symbol(property)` or `Symbol(field)` | Getter or setter and its associated property. |
| `imports_from`, `reexports_from` | `Import -> Module`, `SourceFile`, or `Symbol` | Resolved import or include target. |
| `exports` | `Module -> Symbol` | Exported name, if different. |
| `captures` | `Symbol(callable) -> Symbol` | Capture mode: value/reference/move/unknown. |
| `depends_on` | `Module -> Module` | Public/private/interface/runtime dependency scope. |
| `registers_callback` | `Expression(call) -> Symbol(callable)` | Argument position and an established API contract. |

Passing a lambda as an argument establishes neither `registers_callback` nor execution of its body. Without an API contract, the argument, callable reference, and captures are preserved, but registration is not fabricated.

Ownership, declarations, operands, type bindings, references, and the selected invocation target are already represented by base entities and are not duplicated in `SemanticRelation`.

## 10. Control Flow and Data Flow

These entities are required when flow-sensitive types, alias analysis, or indirect call targets are needed. When such analysis is absent, its coverage MUST remain incomplete; a call through a variable does not establish that variable's runtime value.

### FlowNode

| Attribute | Type | Purpose |
| --- | --- | --- |
| `scope_id` ! | `Id -> Scope` | Analyzed body and unit. |
| `kind` ! | `entry`, `exit`, `evaluation`, `branch`, `merge`, `return`, `throw`, `handler` | Semantically significant execution point. |
| `site_id` ? | `Id -> Expression` or `Declaration` | Reference to a source construct without a text copy. |
| `span` ? | `SourceSpan` | Statement not represented by an expression or declaration. |

When `site_id` is known, coordinates are obtained from it. Entry, exit, and other synthetic points are not assigned fabricated ranges.

### FlowEdge

| Attribute | Type | Purpose |
| --- | --- | --- |
| `source_id` !, `target_id` ! | `Id -> FlowNode` | Control flow direction. |
| `kind` ! | `next`, `true`, `false`, `case`, `back`, `exception`, `finally`, `resume` | Transition condition. |
| `condition_expression_id` ? | `Id -> Expression` | Branch condition. |
| `context_id` ! | `Id -> AnalysisContext` | Graph configuration. |

### DataFlowRelation

| Attribute | Type | Purpose |
| --- | --- | --- |
| `source_id` !, `target_id` ! | `Id -> Expression`, `Declaration`, or `Symbol` | Source and consumer of a value or reference. |
| `kind` ! | `value_flow`, `reaching_definition`, `points_to`, `may_alias`, `must_alias` | Flow and aliasing semantics. |
| `flow_node_id` ? | `Id -> FlowNode` | Point where the flow-sensitive fact applies. |
| `context_id` ! | `Id -> AnalysisContext` | Analysis configuration. |
| `state` ! | `established`, `candidate` | Relationship certainty. |

A may-alias relationship is not converted into must-alias. The completeness of a points-to target set is assessed separately. Assignment history, branches, and captures are not replaced with a single assumed variable type.

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

Evidence does not copy the attribute value. For context-dependent information, the subject references TypeBinding, Resolution, SemanticRelation, DataFlowRelation, or SemanticProperty. Heuristic evidence alone does not establish identity, candidate completeness, or runtime dispatch.

### SemanticProperty

| Attribute | Type | Purpose |
| --- | --- | --- |
| `subject_id` ! | `Id` | Property subject. |
| `context_id` ! | `Id -> AnalysisContext` | Configuration of the value. |
| `name` ! | Normalized key | `value_category`, `constant_value`, `nullability`, `storage_duration`, and other properties. |
| `value` ! | Typed value or an explicit empty value | A value that distinguishes unknown from `false`. |
| `state` ! | `established`, `candidate`, `unknown`, `not_applicable` | Applicability and resolution state. |

An explicit empty value is used for unknown or not_applicable states. Properties do not duplicate attributes defined above. Language extensions use a language prefix, such as `cpp.thread_local`.

### Coverage

| Attribute | Type | Purpose |
| --- | --- | --- |
| `subject_id` ! | `Id` of an area or individual entity | Scope of the completeness claim. |
| `context_id` ! | `Id -> AnalysisContext` | Assessment configuration. |
| `dimension` ! | `syntax`, `declarations`, `references`, `calls`, `types`, `imports`, `configuration`, `candidate_scope`, `implementations`, `control_flow`, `data_flow`, or AttributePath | Aspect being assessed. |
| `state` ! | `complete`, `partial`, `unknown`, `not_applicable` | Completeness. |
| `excluded_spans` ! | List of `SourceSpan` | Omitted or damaged ranges. |
| `reason_codes` ! | Set of strings | Missing SDK, parse error, or unsupported construct. |

Coverage applies only to the specified configuration and area. A complete syntactic call collection does not imply a complete runtime target set. An absent assessment is treated as unknown, not complete.

### Diagnostic

Required attributes: `severity` (`info`, `warning`, `error`), `code`, and `message`. Optional attributes: `subject_id`, `context_id`, and `span`. Syntax recovery errors, conflicting declarations, missing sources, and unsupported forms MUST be reflected in diagnostics and coverage.

## 12. Model Invariants

1. All references point to existing entities of permitted categories. Unidentified external targets are represented by placeholders or unresolved results, not dangling IDs.
2. Spans lie within the bounds of a particular UTF-8 source version. `name_span` lies within `Declaration.span` when both are known.
3. Lexical scopes, module parents, and semantic owners are acyclic. Recursive calls, symbol references in types, and module dependencies may contain cycles.
4. One occurrence is not merged with another because their text matches. Entities of different categories may share the same source span.
5. Parameter, argument, and operand order is preserved. An implicit receiver does not increase explicit argument count.
6. Declaration merging relies on language rules and identity evidence. Conflicting definitions are not selected arbitrarily.
7. A resolved result has one selected target with `identity_state: established` and an established selection within the complete relevant candidate scope. An unknown potentially applicable competitor blocks final selection.
8. A virtual, interface, indirect, or dynamic declaration-level target does not establish a single implementation.
9. Unknown, an empty complete set, an empty incomplete set, and not_applicable are distinguishable.
10. Source mappings are not recovered through guessing. Transformed coordinates do not replace original coordinates.
11. Intrinsics, placeholders, lambdas, and implicit declarations have distinguishable origins and categories.
12. New type bindings, resolutions, and implementations do not alter preserved source observations.
13. All semantic decisions are associated with a context; flow-sensitive decisions also account for the unit and execution point.
14. Variant profile attributes occur only on permitted base categories. An unsupported construct receives an unknown or language-specific form and a diagnostic.
15. At most one current Resolution exists for a `(subject_id, context_id)` pair. Historical or alternative decisions are not presented as simultaneously active.
16. ImplementationSet refers to a resolved callable target; definitions belong to that target or to established dispatch implementations. Set completeness requires separate evidence.

## 13. Construct Coverage

| Construct | Required Representation |
| --- | --- |
| Type and nested type | Symbol, Declaration, TypeProfile, semantic owner, lexical scopes. |
| Function, method, overload | Separate callable symbol, occurrences, profile, parameters, type bindings. |
| Field, variable, shadowing | Symbol, Declaration, scope, initializer, available type bindings. |
| Direct or member call | Call expression, callee reference, base expression when present, arguments, Resolution. |
| Call chain | Separate nested expressions and their result types. |
| Constructor, operator, or indirect invocation | CallProfile of the corresponding category; intrinsics are not disguised as user-defined callables. |
| Named, default, spread, or variadic arguments | Source arguments, ParameterProfile, available argument bindings. |
| Lambda, local function, capture | Callable, declaration, body scope, capture relations; calls belong to the callable whose body contains them. |
| Type reference, generic, alias | TypeUse, Reference, Type, TypeBinding, semantic relations. |
| Inheritance, interface implementation, override | Established or candidate SemanticRelation. |
| Import, include, alias, reexport | Import, local symbols, references, resolved import relations. |
| Annotation, attribute, decorator | Annotation, TypeUse or reference, arguments, executable expression when required. |
| Conditional, generated, or external code | Context, PresenceCondition, origin, SourceMapping, Coverage. |
| Flow-sensitive or indirect targets | Control and data flow entities, with explicit target completeness assessments. |
| Incomplete, erroneous, or dynamic code | Available syntax, partial or unknown results, and diagnostics without fabricated targets. |

## 14. Conformance Levels

**Syntactic dataset** contains sources, contexts with explicitly stated completeness, units, scopes, provisional symbols, declarations, expressions, call profiles, type uses, references, imports, annotations, diagnostics, and coverage. Missing semantic results are represented as unknown, not as established empty sets. This level is sufficient for a structural graph but does not guarantee a resolved call graph.

**Semantic dataset** additionally contains established identities, available type bindings, resolutions, inheritance, override, capture, and import relations, and evidence. Incomplete areas are permitted only with explicit coverage boundaries.

**Flow and implementation analysis dataset** additionally contains control and data flow, build, linkage, and runtime evidence, and ImplementationSet with a completeness assessment. This information is required for claims about flow-sensitive indirect targets and possible runtime implementations, but not for a basic structural graph.

Each analysis tool declares its achieved level and coverage of individual areas. The presence of a syntax tree is not evidence of semantic completeness. Sufficiency is determined by model integrity, completeness of the required entities, and the authority of specific relationships, not by serialization format.