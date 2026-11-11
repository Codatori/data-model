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
      if (['Symbol', 'Module', 'SourceFile'].includes(record.category)) return id;
      if (record.category === 'Declaration') return record.symbol_id;
      if (record.category === 'Reference') return owner(record.site_id);
      if (record.category === 'TypeUse') return owner(record.subject_id);
      if (!record.scope_id) throw new Error(`No structural owner for ${id}`);
      let scope = get(record.scope_id);
      while (scope) {
        if (scope.owner_declaration_id) return get(scope.owner_declaration_id).symbol_id;
        if (!scope.parent_scope_id) return get(get(scope.unit_id).context_id).module_id;
        scope = get(scope.parent_scope_id);
      }
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
    function sourceConditions(id) {
      if (!id) return [];
      const record = get(id);
      const conditions = record.presence_condition === undefined ? [] : [record.presence_condition];
      if (record.category === 'Reference') return [...conditions, ...sourceConditions(record.site_id)];
      if (record.category === 'TypeUse') return [...conditions, ...sourceConditions(record.subject_id)];
      if (record.category === 'Expression') {
        for (let scope = get(record.scope_id); scope; scope = scope.parent_scope_id ? get(scope.parent_scope_id) : null) {
          if (scope.owner_declaration_id) return [...conditions, ...sourceConditions(scope.owner_declaration_id)];
        }
      }
      return conditions;
    }
    const edges = [];
    function add(from, to, kind, certainty, record, siteId = record.subject_id) {
      get(from); get(to);
      const evidence = evidenceFor(record.id);
      const coverage = (model.Coverage || []).filter(item => [record.id, siteId].includes(item.subject_id));
      edges.push({
        from, to, kind, certainty, context_id: record.context_id,
        candidate_set_completeness: record.candidate_set_completeness,
        supporting_ids: [...new Set([record.id, siteId, ...evidence.map(item => item.id), ...coverage.map(item => item.id)].filter(Boolean))],
        presence_conditions: [record.presence_condition, ...sourceConditions(siteId)].filter(value => value !== undefined)
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
      if (selected) add(from, selected, kind, 'selected', resolution);
      for (const [index, candidate] of resolution.candidates.entries()) {
        if (candidate.target_symbol_id === selected || candidate.applicability === 'inapplicable') continue;
        if (!['applicable', 'unknown'].includes(candidate.applicability)) throw new Error('Unsupported candidate applicability');
        if (candidate.applicability === 'unknown' && !evidenceFor(resolution.id).some(evidence =>
          evidence.supporting_ids.includes(candidate.target_symbol_id) ||
          evidence.attribute_path === `candidates[${index}]`)) {
          throw new Error(`Possible unknown target needs evidence: ${resolution.id}`);
        }
        add(from, candidate.target_symbol_id, kind, 'possible', resolution);
      }
    }
    for (const binding of model.TypeBinding || []) {
      if (!['established', 'candidate'].includes(binding.state)) continue;
      for (const target of typeTargets(binding.type_id)) {
        add(owner(binding.subject_id), target, 'type', binding.state === 'established' ? 'established' : 'possible', binding);
      }
    }
    for (const relation of model.SemanticRelation || []) {
      const target = get(relation.target_id);
      const targets = target.category === 'Type' ? typeTargets(target.id) : [target.id];
      for (const id of targets) {
        add(owner(relation.source_id), id, relation.kind, relation.state === 'established' ? 'established' : 'possible', relation, relation.site_id || relation.source_id);
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
