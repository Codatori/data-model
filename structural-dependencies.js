(() => {
  'use strict';

  window.CODE_GRAPH_DEPENDENCIES = model => {
    const profiles = new Set(['TypeProfile', 'CallableProfile', 'ParameterProfile', 'CallProfile']);
    const byId = new Map(Object.entries(model).filter(([category]) => !profiles.has(category))
      .flatMap(([category, records]) => records.map(record => [record.id, { ...record, category }])));
    const get = id => {
      const record = byId.get(id);
      if (!record) throw new Error(`Dependency view references a missing record: ${id}`);
      return record;
    };
    function owner(id) {
      const record = get(id);
      if (['Symbol', 'Project', 'SourceFile'].includes(record.category)) return id;
      if (record.category === 'Declaration') return record.symbol_id;
      if (record.category === 'Reference') return owner(record.site_id);
      if (record.category === 'TypeUse') return owner(record.subject_id);
      if (record.category === 'Annotation') return owner(record.declaration_id);
      let declaration = record.declaration_id ? get(record.declaration_id) : null;
      const nearestDeclaration = declaration;
      while (declaration) {
        if (get(declaration.symbol_id).kind === 'callable') return declaration.symbol_id;
        declaration = declaration.parent_declaration_id ? get(declaration.parent_declaration_id) : null;
      }
      if (nearestDeclaration) return nearestDeclaration.symbol_id;
      if (!record.unit_id) throw new Error(`No structural owner for ${id}`);
      return get(get(record.unit_id).context_id).project_id;
    }
    function component(id) {
      let record = get(id), callable, root = id;
      while (record) {
        root = record.id;
        if (record.category !== 'Symbol' || record.kind === 'type') return record.id;
        if (record.kind === 'callable') callable = record.id;
        record = record.owner_symbol_id ? get(record.owner_symbol_id) : null;
      }
      return callable || root;
    }
    function name(id) {
      const parts = [];
      for (let record = get(id); record; record = record.owner_symbol_id ? get(record.owner_symbol_id) : null) {
        parts.unshift(record.name || record.id);
      }
      if (parts[0] === 'Engine' && parts.length > 1) parts.shift();
      return parts.join('::');
    }
    function typeTargets(id, visited = new Set()) {
      if (visited.has(id)) return [];
      visited.add(id);
      const type = get(id);
      const targets = type.symbol_id ? [type.symbol_id] : [];
      for (const dependency of type.dependency_ids || []) {
        if (get(dependency).category === 'Symbol') targets.push(dependency);
      }
      const children = [
        type.element_type_id, type.generic_type_id, type.bound_type_id, type.return_type_id,
        ...(type.parameter_type_ids || []), ...(type.component_type_ids || []),
        ...(type.arguments || []).map(argument => argument.type_id)
      ].filter(Boolean);
      for (const argument of type.arguments || []) {
        if (argument.symbol_id || argument.template_symbol_id) targets.push(argument.symbol_id || argument.template_symbol_id);
      }
      return [...new Set([...targets, ...children.flatMap(child => typeTargets(child, visited))])];
    }
    const evidenceFor = id => (model.Evidence || []).filter(record => record.subject_id === id);
    const callProfiles = new Map((model.CallProfile || []).map(record => [record.id, record]));
    function sourceConditions(id) {
      if (!id) return [];
      const record = get(id);
      const conditions = record.presence_condition === undefined ? [] : [record.presence_condition];
      if (record.category === 'Reference') return [...conditions, ...sourceConditions(record.site_id)];
      if (record.category === 'TypeUse') return [...conditions, ...sourceConditions(record.subject_id)];
      if (record.declaration_id) return [...conditions, ...sourceConditions(record.declaration_id)];
      if (record.category === 'Declaration' && record.parent_declaration_id) {
        return [...conditions, ...sourceConditions(record.parent_declaration_id)];
      }
      return conditions;
    }
    const edges = [];
    function add(from, to, kind, certainty, record, siteId = record.subject_id, candidate, embeddedEdge) {
      get(from); get(to);
      const matchesEdge = path => path === embeddedEdge.attribute_path ||
        path.startsWith(`${embeddedEdge.attribute_path}.`) && !path.startsWith(`${embeddedEdge.attribute_path}.semantic_properties`);
      const evidence = [...evidenceFor(record.id), ...evidenceFor(siteId)].filter(item => !embeddedEdge ||
        !item.attribute_path || matchesEdge(item.attribute_path));
      const coverage = (model.Coverage || []).filter(item => [record.id, siteId].includes(item.subject_id) &&
        (!embeddedEdge || item.context_id === record.context_id &&
          (item.dimension === 'types' && embeddedEdge.type_expression_id || matchesEdge(item.dimension))));
      edges.push({
        from, to, kind, certainty, context_id: record.context_id,
        ...embeddedEdge,
        ...(embeddedEdge ? { details: record.details, semantic_properties: record.semantic_properties } : {}),
        candidate_set_completeness: record.candidate_set_completeness,
        ...(kind === 'call' ? {
          call_condition: callProfiles.get(siteId)?.condition,
          target_condition: candidate?.condition
        } : {}),
        supporting_ids: [...new Set([record.id, siteId, embeddedEdge?.type_expression_id, embeddedEdge?.semantic_target_id,
          ...evidence.map(item => item.id), ...coverage.map(item => item.id)].filter(Boolean))],
        presence_conditions: [record.presence_condition, ...sourceConditions(siteId),
          ...(embeddedEdge && record.site_id && record.site_id !== siteId ? sourceConditions(record.site_id) : [])].filter(value => value !== undefined)
      });
    }
    for (const resolution of model.Resolution || []) {
      const subject = get(resolution.subject_id);
      const from = owner(subject.id);
      const kind = subject.category === 'Expression' ? 'call' : 'reference';
      const selected = resolution.state === 'resolved' ? resolution.selected_target_id : null;
      if (selected && (resolution.candidate_set_completeness !== 'complete' ||
        get(selected).identity_state !== 'established' ||
        resolution.candidates.some(candidate => candidate.applicability === 'unknown'))) {
        throw new Error(`Selected target lacks an established complete candidate scope: ${resolution.id}`);
      }
      if (selected) add(from, selected, kind, 'selected', resolution, subject.id,
        resolution.candidates.find(candidate => candidate.target_symbol_id === selected));
      for (const [index, candidate] of resolution.candidates.entries()) {
        if (candidate.target_symbol_id === selected || candidate.applicability === 'inapplicable') continue;
        if (!['applicable', 'unknown'].includes(candidate.applicability)) throw new Error('Unsupported candidate applicability');
        if (candidate.applicability === 'unknown' && !evidenceFor(resolution.id).some(evidence =>
          evidence.supporting_ids.includes(candidate.target_symbol_id) ||
          evidence.attribute_path === `candidates[${index}]`)) {
          throw new Error(`Possible unknown target needs evidence: ${resolution.id}`);
        }
        add(from, candidate.target_symbol_id, kind, 'possible', resolution, subject.id, candidate);
      }
    }
    for (const source of byId.values()) {
      for (const [index, edge] of (source.has_type || []).entries()) {
        if (!['Declaration', 'Expression', 'TypeUse', 'Symbol'].includes(source.category) ||
          get(edge.target_id).category !== 'TypeExpression' || get(edge.context_id).category !== 'AnalysisContext' ||
          !['declared', 'inferred', 'return', 'receiver', 'constraint'].includes(edge.role) ||
          !['established', 'candidate', 'unknown'].includes(edge.state) || 'id' in edge || 'source_id' in edge || 'kind' in edge) {
          throw new Error(`Invalid HAS_TYPE edge on ${source.id}`);
        }
        if (edge.state === 'unknown') continue;
        for (const target of typeTargets(edge.target_id)) {
          add(owner(source.id), target, 'type', edge.state === 'established' ? 'established' : 'possible', edge, source.id, undefined, {
            type_subject_id: source.id, type_expression_id: edge.target_id, attribute_path: `has_type[${index}]`,
            type_role: edge.role, type_state: edge.state
          });
        }
      }
    }
    const semanticEndpoints = {
      inherits: ['Symbol', 'TypeExpression'], implements: ['Symbol', 'TypeExpression'],
      overrides: ['Symbol', 'Symbol'], aliases: ['Symbol', 'TypeExpression'],
      underlying_type: ['Symbol', 'TypeExpression'], constrains: ['Symbol', 'TypeExpression'],
      accessor_for: ['Symbol', 'Symbol'], imports_from: ['Import', 'Project SourceFile Symbol'],
      reexports_from: ['Import', 'Project SourceFile Symbol'], exports: ['Project SourceFile Symbol', 'Symbol'],
      captures: ['Symbol', 'Symbol'], registers_callback: ['Expression', 'Symbol']
    };
    for (const source of byId.values()) {
      for (const [kind, [sources, targets]] of Object.entries(semanticEndpoints)) {
        for (const [index, edge] of (source[kind] || []).entries()) {
          const target = get(edge.target_id);
          if (!sources.split(' ').includes(source.category) || !targets.split(' ').includes(target.category) ||
            get(edge.context_id).category !== 'AnalysisContext' || !['established', 'candidate'].includes(edge.state) ||
            'id' in edge || 'source_id' in edge || 'kind' in edge ||
            (['inherits', 'implements', 'aliases', 'underlying_type'].includes(kind) && source.kind !== 'type') ||
            (kind === 'constrains' && source.kind !== 'type_parameter') ||
            (['overrides', 'accessor_for', 'captures'].includes(kind) && source.kind !== 'callable') ||
            (['overrides', 'registers_callback'].includes(kind) && target.kind !== 'callable') ||
            (kind === 'accessor_for' && !['property', 'field'].includes(target.kind)) ||
            (kind === 'registers_callback' && source.kind !== 'call') ||
            (kind === 'exports' && source.category === 'Symbol' && source.kind !== 'module')) {
            throw new Error(`Invalid ${kind.toUpperCase()} edge on ${source.id}`);
          }
          const targetIds = target.category === 'TypeExpression' ? typeTargets(target.id) : [target.id];
          for (const targetId of targetIds) {
            add(owner(source.id), targetId, kind, edge.state === 'established' ? 'established' : 'possible', edge, source.id, undefined, {
              semantic_source_id: source.id, semantic_target_id: target.id, attribute_path: `${kind}[${index}]`,
              semantic_state: edge.state, semantic_site_id: edge.site_id
            });
          }
        }
      }
    }
    for (const implementation of model.ImplementationSet || []) {
      const resolution = get(implementation.resolution_id);
      if (resolution.state !== 'resolved') throw new Error('ImplementationSet needs a resolved target');
      for (const definition of implementation.definition_ids) {
        add(owner(resolution.subject_id), get(definition).symbol_id, 'implementation', 'possible',
          { ...implementation, context_id: resolution.context_id }, resolution.subject_id);
      }
    }
    const groups = new Map();
    for (const edge of edges) {
      const from = component(edge.from), to = component(edge.to);
      if (from === to) continue;
      const key = JSON.stringify([from, to]);
      if (!groups.has(key)) groups.set(key, { from, to, occurrences: [], context_ids: [] });
      const group = groups.get(key);
      group.occurrences.push(edge);
      if (edge.context_id && !group.context_ids.includes(edge.context_id)) group.context_ids.push(edge.context_id);
    }
    return { byId, name, edges, components: [...groups.values()] };
  };
})();
