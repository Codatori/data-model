(() => {
  'use strict';

  // Semantic Code Graph projection (specification section 15) of a reconciled Code Facts example.
  // Pure data: no DOM access. Shared structural nodes and edges are reused, never copied.
  const SHARED = ['Repository', 'Project', 'Directory', 'ProjectFile', 'Resource'];
  const PROJECTED_ORIGINS = new Set(['source', 'generated']);
  const UNIT_TYPE_KINDS = { class: 'class', struct: 'struct', interface: 'interface', enum: 'enum', union: 'union',
    trait: 'trait', record: 'record', annotation: 'annotation_type', language_specific: 'language_specific' };
  const MEMBER_CALLABLE_KINDS = { method: 'method', function: 'function', constructor: 'constructor', destructor: 'destructor',
    operator: 'operator', accessor: 'language_specific' };
  const CONTRACT_TYPE_KINDS = new Set(['interface', 'trait']);
  const DATA_KINDS = new Set(['field', 'parameter', 'variable', 'property', 'enum_value']);
  const ACCESS_ROLES = new Set(['read', 'write', 'read_write']);
  const USAGE_ROLES = { address: 'address', capture: 'capture' };
  const DEPENDS_REASONS = { field: 'field_type', parameter: 'parameter_type', variable: 'declaration_type', property: 'field_type' };

  const MAPPING_POLICY = {
    language: 'cpp',
    rules: [
      'Named C++ namespaces map to Namespace(cpp_namespace); the unnamed root scope maps to Namespace(cpp_global); unnamed nested scopes map to Namespace(cpp_anonymous).',
      'Declared types map to Unit by TypeProfile.type_kind; free functions and namespace-scope variables map to Unit(function | variable).',
      'Fields, methods, constructors, destructors, operators, properties, enum values, explicit parameters, and source type parameters nested in a Unit map to Member.',
      'Source-language module Symbols map to Module; textual #include directives never create a Module or IMPORT.',
      'One projected node per reconciled Symbol; overloads remain separate identities. Only source and generated origins are projected.',
      'Rejected or inapplicable binding targets are dropped; selected targets are established and applicable candidates remain candidate edges.'
    ]
  };
  const EXCLUDED_CATEGORIES = [
    'local variables and local types owned by a callable',
    'lambdas and local functions',
    'type aliases (resolved through TypeExpression instead)',
    'external, system, intrinsic (other than the global scope), and placeholder Symbols, including the C++ standard library'
  ];

  window.CODE_GRAPH_SEMANTIC_PROJECTION = example => {
    const model = example.model;
    const deps = window.CODE_GRAPH_DEPENDENCIES(model, { readContent: reference => example.externalContent?.[reference] });
    const records = new Map(Object.entries(model).flatMap(([category, list]) => list.map(record => [record.id, { category, record }])));
    const record = id => records.get(id)?.record;
    const symbols = new Map((model.Symbol || []).map(symbol => [symbol.id, symbol]));
    const profileOf = new Map(['TypeProfile', 'CallableProfile', 'ParameterProfile']
      .flatMap(category => (model[category] || []).map(profile => [profile.symbol_id, profile])));
    const declarationsOf = new Map();
    for (const declaration of model.Declaration || []) {
      declarationsOf.set(declaration.symbol_id, [...(declarationsOf.get(declaration.symbol_id) || []), declaration]);
    }
    const parentOf = symbol => symbols.get(symbol?.owner_symbol_id);
    const isGlobal = symbol => symbol?.kind === 'namespace' && !symbol.name && !symbol.owner_symbol_id;

    // Evidence entries on an owner that support a precise path, or the whole owner when path is undefined.
    function evidenceRefs(ownerId, path, projectId) {
      return (record(ownerId)?.evidence || [])
        .filter(entry => path === undefined ? entry.attribute_path === undefined
          : entry.attribute_path === path || entry.attribute_path?.startsWith(`${path}.`))
        .filter(entry => !projectId || entry.project_independent || entry.project_id === projectId)
        .map(entry => ({ subject_id: ownerId, key: entry.key, ...(entry.attribute_path ? { attribute_path: entry.attribute_path } : {}),
          ...(entry.project_id ? { project_id: entry.project_id } : { project_independent: true }) }));
    }

    // Node classification.
    function classify(symbol) {
      if (symbol.kind === 'namespace') {
        if (isGlobal(symbol)) return ['Namespace', 'cpp_global'];
        if (!PROJECTED_ORIGINS.has(symbol.origin)) return null;
        return ['Namespace', symbol.name ? 'cpp_namespace' : 'cpp_anonymous'];
      }
      if (!PROJECTED_ORIGINS.has(symbol.origin)) return null;
      const owner = parentOf(symbol);
      const scoped = !owner || ['namespace', 'module'].includes(owner.kind);
      const profile = profileOf.get(symbol.id);
      switch (symbol.kind) {
        case 'module': return ['Module', `${moduleLanguage(symbol)}.named_module`];
        case 'type':
          if (profile?.type_kind === 'alias' || owner?.kind === 'callable') return null;
          return ['Unit', UNIT_TYPE_KINDS[profile?.type_kind] ?? 'unknown'];
        case 'callable':
          if (scoped) return ['Unit', 'function'];
          if (owner.kind !== 'type' || ['lambda', 'local_function'].includes(profile?.callable_kind)) return null;
          return ['Member', MEMBER_CALLABLE_KINDS[profile?.callable_kind] ?? 'unknown'];
        case 'variable': return scoped ? ['Unit', 'variable'] : null;
        case 'field': case 'property': case 'enum_value': return owner?.kind === 'type' ? ['Member', symbol.kind] : null;
        case 'parameter': case 'type_parameter': return owner && ['callable', 'type'].includes(owner.kind) ? ['Member', symbol.kind] : null;
        default: return null;
      }
    }
    function moduleLanguage(symbol) {
      const file = record((declarationsOf.get(symbol.id) || [])[0]?.file_id);
      return file?.language || model.Project?.[0]?.language || 'unknown';
    }
    const qualifiedName = symbol => {
      const parts = [];
      for (let current = symbol; current; current = parentOf(current)) if (current.name) parts.unshift(current.name);
      return parts.join(symbol.kind === 'module' ? '.' : '::');
    };

    const nodes = { Module: [], Namespace: [], Unit: [], Member: [] };
    const projected = new Map();
    for (const symbol of model.Symbol || []) {
      const mapped = classify(symbol);
      if (!mapped) continue;
      const [category, kind] = mapped;
      const id = `${category.toLowerCase()}:${symbol.id.replace(/^symbol:/, '')}`;
      const qualified = qualifiedName(symbol);
      const node = { id, name: symbol.name || (isGlobal(symbol) ? '(global namespace)' : '(anonymous namespace)'),
        ...(qualified && qualified !== symbol.name ? { qualified_name: qualified } : {}), kind,
        ...(category === 'Module' ? { language: kind.split('.')[0] } : {}) };
      nodes[category].push(node);
      projected.set(symbol.id, { category, node, symbol });
    }
    // Members require an ownership path to a Unit; parameters of excluded callables are dropped with them.
    for (let changed = true; changed;) {
      changed = false;
      for (const [symbolId, entry] of projected) {
        if (entry.category !== 'Member') continue;
        const owner = projected.get(entry.symbol.owner_symbol_id);
        if (!owner || !['Unit', 'Member'].includes(owner.category)) {
          projected.delete(symbolId);
          nodes.Member.splice(nodes.Member.indexOf(entry.node), 1);
          changed = true;
        }
      }
    }
    const nodeOf = symbolId => projected.get(symbolId);
    // Nearest projected Unit or Member that semantically owns a fact (callers, accessors, dependents).
    const lift = symbolId => {
      for (let symbol = symbols.get(symbolId); symbol; symbol = parentOf(symbol)) {
        const entry = projected.get(symbol.id);
        if (entry && ['Unit', 'Member'].includes(entry.category)) return entry;
      }
      return null;
    };
    const unitOf = entry => {
      for (let symbol = entry?.symbol; symbol; symbol = parentOf(symbol)) {
        const owner = projected.get(symbol.id);
        if (owner?.category === 'Unit') return owner;
      }
      return null;
    };
    const isStructuralUnit = entry => entry?.category === 'Unit' && !['function', 'variable'].includes(entry.node.kind);
    const isContract = symbol => {
      const owner = parentOf(symbol);
      return CONTRACT_TYPE_KINDS.has(profileOf.get(owner?.id)?.type_kind) ||
        (declarationsOf.get(symbol.id) || []).some(declaration => (declaration.modifiers || []).includes('abstract'));
    };

    // Relationships: shared structural edges first, unchanged.
    const sharedIds = new Set(SHARED.flatMap(category => (model[category] || []).map(item => item.id)));
    const relationships = (example.relationships || []).filter(edge => sharedIds.has(edge.source_id) && sharedIds.has(edge.target_id))
      .map(edge => ({ ...edge }));
    const aggregates = new Map();
    // Aggregate by source, target, label, effective context, state, and the single typed value of that label.
    function derive(source, type, target, { state = 'established', project_id, value, fact, evidence = [], properties = {}, occurrence } = {}) {
      if (!source || !target || source === target) return;
      const valueKey = { DEPENDS: 'reason', ACCESSES: 'access', USES: 'usage' }[type];
      const key = JSON.stringify([source, type, target, project_id ?? null, state, value ?? null]);
      let edge = aggregates.get(key);
      if (!edge) {
        edge = { source_id: source, type, target_id: target, state, ...(project_id ? { project_id } : {}),
          ...(valueKey ? { [valueKey]: value } : {}), ...properties, supporting_facts: [], evidence_refs: [] };
        if (occurrence) edge.occurrences = [];
        aggregates.set(key, edge);
        relationships.push(edge);
      }
      const facts = Array.isArray(fact) ? fact : [fact];
      for (const item of facts.filter(Boolean)) {
        if (!edge.supporting_facts.some(existing => JSON.stringify(existing) === JSON.stringify(item))) edge.supporting_facts.push(item);
      }
      for (const item of evidence) {
        if (!edge.evidence_refs.some(existing => existing.subject_id === item.subject_id && existing.key === item.key)) edge.evidence_refs.push(item);
      }
      if (occurrence) edge.occurrences.push(occurrence);
    }

    // DERIVED_FROM: cross-layer identity.
    for (const { node, symbol } of projected.values()) {
      derive(node.id, 'DERIVED_FROM', symbol.id, { fact: { subject_id: symbol.id }, evidence: evidenceRefs(symbol.id) });
    }

    // CONSISTS_OF: immediate semantic ownership from OWNS between projected endpoints.
    const OWNERSHIP = new Set(['Namespace>Namespace', 'Namespace>Unit', 'Module>Unit', 'Unit>Unit', 'Unit>Member', 'Member>Member']);
    for (const entry of projected.values()) {
      const owner = projected.get(entry.symbol.owner_symbol_id);
      if (!owner || !OWNERSHIP.has(`${owner.category}>${entry.category}`)) continue;
      const profile = profileOf.get(owner.symbol.id);
      const list = entry.symbol.kind === 'parameter' ? 'parameter_ids' : entry.symbol.kind === 'type_parameter' ? 'type_parameter_ids' : null;
      const position = list ? (profile?.[list] || []).indexOf(entry.symbol.id) : -1;
      derive(owner.node.id, 'CONSISTS_OF', entry.node.id, {
        properties: position >= 0 ? { position } : {},
        fact: [{ subject_id: owner.symbol.id, relationship: 'OWNS', target_id: entry.symbol.id },
          ...(position >= 0 ? [{ subject_id: profile.id, attribute_path: `${list}[${position}]` }] : [])]
      });
    }

    // DECLARES: written participation of a file; Unit DECLARES Member for abstract or interface contracts.
    for (const entry of projected.values()) {
      for (const declaration of declarationsOf.get(entry.symbol.id) || []) {
        derive(declaration.file_id, 'DECLARES', entry.node.id, { fact: { subject_id: declaration.id } });
      }
      if (entry.category === 'Member' && entry.symbol.kind === 'callable' && isContract(entry.symbol)) {
        const owner = projected.get(entry.symbol.owner_symbol_id);
        if (owner?.category === 'Unit') derive(owner.node.id, 'DECLARES', entry.node.id, { fact: { subject_id: entry.symbol.id } });
      }
    }
    // An implicit global scope has no declaration of its own; each top-level declaration supports its file's participation.
    for (const entry of projected.values()) {
      if (entry.node.kind !== 'cpp_global') continue;
      for (const declaration of model.Declaration || []) {
        if (declaration.parent_declaration_id || symbols.get(declaration.symbol_id)?.owner_symbol_id !== entry.symbol.id) continue;
        derive(declaration.file_id, 'DECLARES', entry.node.id, { fact: { subject_id: declaration.id } });
      }
    }

    // Project CONTAINS Module: supported participation through the module's declaring files.
    for (const entry of projected.values()) {
      if (entry.category !== 'Module') continue;
      for (const declaration of declarationsOf.get(entry.symbol.id) || []) {
        for (const edge of example.relationships || []) {
          if (edge.type !== 'CONTAINS' || edge.target_id !== declaration.file_id || records.get(edge.source_id)?.category !== 'Project') continue;
          derive(edge.source_id, 'CONTAINS', entry.node.id, { project_id: edge.source_id, fact: { subject_id: declaration.id } });
        }
      }
    }

    // Code-level dependencies: each derived occurrence keeps its source construct, path, context, and evidence.
    const stateOf = certainty => ['selected', 'established'].includes(certainty) ? 'established' : 'candidate';
    for (const dep of deps.edges) {
      const fact = { subject_id: dep.site_id, attribute_path: dep.attribute_path, ...(dep.project_id ? { project_id: dep.project_id } : {}) };
      const base = { state: stateOf(dep.certainty), project_id: dep.project_id, fact, evidence: dep.evidence_refs || [] };
      if (dep.kind === 'call') {
        const site = record(dep.site_id);
        derive(lift(dep.from)?.node.id, 'INVOKES', lift(dep.to)?.node.id, { ...base, occurrence: {
          site_id: dep.site_id, attribute_path: dep.attribute_path, call_kind: site?.call_kind ?? 'ordinary',
          ...(dep.call_condition ? { call_condition: dep.call_condition } : {}),
          ...(dep.target_condition ? { target_condition: dep.target_condition } : {})
        } });
      } else if (dep.kind === 'type') {
        // Declaration and signature types only: expression result types and spellings are not Unit dependencies.
        if (records.get(dep.type_subject_id)?.category !== 'Declaration') continue;
        const source = symbols.get(dep.from), subject = projected.get(dep.from), target = projected.get(dep.to);
        if (!source || !subject || !isStructuralUnit(target)) continue;
        const reason = dep.type_role === 'constraint' ? 'type_constraint' : dep.type_role === 'receiver' ? null
          : source.kind === 'callable' ? (dep.type_role === 'return' ? 'return_type' : null) : DEPENDS_REASONS[source.kind];
        if (!reason) continue;
        derive(unitOf(subject)?.node.id, 'DEPENDS', target.node.id, { ...base, value: reason,
          fact: [fact, { subject_id: dep.type_expression_id }] });
      } else if (dep.kind === 'reference') {
        const site = record(dep.site_id);
        const role = (site?.name_uses || []).find(use => use.key === dep.binding_site_key)?.role;
        const target = symbols.get(dep.to), targetNode = projected.get(dep.to);
        if (!targetNode || !['Unit', 'Member'].includes(targetNode.category)) continue;
        const from = lift(dep.from)?.node.id;
        if (DATA_KINDS.has(target.kind) && ACCESS_ROLES.has(role)) derive(from, 'ACCESSES', targetNode.node.id, { ...base, value: role });
        else if (USAGE_ROLES[role]) derive(from, 'USES', targetNode.node.id, { ...base, value: USAGE_ROLES[role] });
        else if (target.kind === 'callable' && role === 'read') derive(from, 'USES', targetNode.node.id, { ...base, value: 'callable_reference' });
      }
    }

    // Direct semantic edges (section 9) map onto Unit and Member relationships.
    const headSymbol = typeId => {
      const type = record(typeId);
      if (!type) return null;
      if (['nominal', 'type_parameter'].includes(type.kind)) return type.symbol_id;
      if (type.kind === 'generic_application') return headSymbol(type.generic_type_id);
      return null;
    };
    for (const symbol of model.Symbol || []) {
      const source = projected.get(symbol.id);
      const semantic = (list, index, edge) => ({ state: edge.state, project_id: edge.project_id,
        fact: { subject_id: symbol.id, attribute_path: `${list}[${index}]`, project_id: edge.project_id },
        evidence: evidenceRefs(symbol.id, `${list}[${index}]`, edge.project_id),
        properties: edge.details ? { details: edge.details } : {} });
      for (const [list, type] of [['inherits', 'INHERITANCE'], ['implements', 'IMPLEMENTS']]) {
        (symbol[list] || []).forEach((edge, index) => {
          const target = projected.get(headSymbol(edge.target_id));
          if (source?.category === 'Unit' && isStructuralUnit(target)) derive(source.node.id, type, target.node.id, semantic(list, index, edge));
        });
      }
      (symbol.overrides || []).forEach((edge, index) => {
        const target = projected.get(edge.target_id);
        if (source?.category !== 'Member' || target?.category !== 'Member') return;
        derive(source.node.id, 'OVERRIDE', target.node.id, semantic('overrides', index, edge));
        // Contract fulfilment needs an established override of an abstract or interface callable.
        if (edge.state === 'established' && isContract(target.symbol)) derive(source.node.id, 'IMPLEMENTS', target.node.id, semantic('overrides', index, edge));
      });
      (symbol.captures || []).forEach((edge, index) => {
        const target = projected.get(edge.target_id);
        if (target && ['Unit', 'Member'].includes(target.category)) {
          derive(lift(symbol.id)?.node.id, 'USES', target.node.id, { ...semantic('captures', index, edge), value: 'capture' });
        }
      });
    }

    // Module IMPORT: only an import site whose provider is a projected module Symbol, from the module its file provides.
    for (const directive of model.Import || []) {
      (directive.imports_from || []).forEach((edge, index) => {
        const target = projected.get(edge.target_id);
        if (target?.category !== 'Module') return;
        const providers = [...projected.values()].filter(entry => entry.category === 'Module' &&
          (declarationsOf.get(entry.symbol.id) || []).some(declaration => declaration.file_id === directive.file_id));
        if (providers.length !== 1) return;
        derive(providers[0].node.id, 'IMPORT', target.node.id, { state: edge.state, project_id: edge.project_id,
          properties: { form: directive.form, is_reexport: directive.is_reexport },
          fact: { subject_id: directive.id, attribute_path: `imports_from[${index}]`, project_id: edge.project_id },
          evidence: evidenceRefs(directive.id, `imports_from[${index}]`, edge.project_id) });
      });
    }

    const repository = (model.Repository || [])[0];
    return {
      envelope: {
        fact_snapshot: repository ? `${repository.uri}@${repository.revision}` : 'unknown',
        projection_version: 'codatori-semantic-projection/1',
        completeness: 'partial',
        mapping_policy: MAPPING_POLICY,
        excluded_categories: EXCLUDED_CATEGORIES
      },
      nodes,
      relationships
    };
  };
})();
