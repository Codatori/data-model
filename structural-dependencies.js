(() => {
  'use strict';

  window.CODE_GRAPH_DEPENDENCIES = (model, { readContent } = {}) => {
    if ('Evidence' in model) throw new Error('Evidence must be embedded on fact owners');
    for (const category of ['SourceSpan', 'SourceFile', 'AnalysisContext', 'AnalysisUnit']) {
      if (category in model) throw new Error(`Unsupported graph category: ${category}`);
    }
    for (const file of model.ProjectFile || []) {
      if (['content', 'content_digest', 'language_version', 'original_encoding', 'project_file_id'].some(field => field in file) ||
        file.content_ref !== undefined && (typeof file.content_ref !== 'string' || !file.content_ref)) {
        throw new Error(`Invalid ProjectFile storage contract: ${file.id}`);
      }
    }
    const byId = new Map(Object.entries(model)
      .flatMap(([category, records]) => records.map(record => [record.id, { ...record, category }])));
    const get = id => {
      const record = byId.get(id);
      if (!record) throw new Error(`Dependency view references a missing record: ${id}`);
      return record;
    };
    function owner(id) {
      const record = get(id);
      if (['Symbol', 'Project', 'ProjectFile'].includes(record.category)) return id;
      if (record.category === 'Declaration') return record.symbol_id;
      if (record.category === 'TypeUse') return owner(record.subject_id);
      if (record.category === 'Annotation' && record.declaration_id) return owner(record.declaration_id);
      let declaration = record.declaration_id ? get(record.declaration_id) : null;
      const nearestDeclaration = declaration;
      while (declaration) {
        if (get(declaration.symbol_id).kind === 'callable') return declaration.symbol_id;
        declaration = declaration.parent_declaration_id ? get(declaration.parent_declaration_id) : null;
      }
      if (nearestDeclaration) return nearestDeclaration.symbol_id;
      const fileId = record.file_id || record.span?.file_id;
      if (!fileId || get(fileId).category !== 'ProjectFile') throw new Error(`No structural owner for ${id}`);
      return fileId;
    }
    // The unnamed global namespace owns top-level entities but is neither a component nor a qualified-name part.
    function semanticParent(record) {
      const parent = record.owner_symbol_id ? get(record.owner_symbol_id) : null;
      return parent && !(parent.kind === 'namespace' && !parent.name && !parent.owner_symbol_id) ? parent : null;
    }
    function component(id) {
      let record = get(id), callable, root = id;
      while (record) {
        root = record.id;
        if (record.category !== 'Symbol' || record.kind === 'type') return record.id;
        if (record.kind === 'callable') callable = record.id;
        record = semanticParent(record);
      }
      return callable || root;
    }
    function name(id) {
      const parts = [];
      for (let record = get(id); record; record = semanticParent(record)) {
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
    const evidenceFor = id => (get(id).evidence || []).map(entry => ({ ...entry, owner_id: id }));
    const evidenceInProject = (entry, projectId) => entry.project_id === projectId || entry.project_independent === true;
    function validateSpan(span) {
      const file = get(span.file_id);
      const content = readContent?.(file.content_ref);
      if (file.category !== 'ProjectFile' || !Number.isInteger(span.start_offset) || !Number.isInteger(span.end_offset) ||
        span.start_offset < 0 || span.end_offset < span.start_offset || typeof file.content_ref !== 'string' || !file.content_ref ||
        typeof content === 'string' && span.end_offset > new TextEncoder().encode(content).length) {
        throw new Error('Invalid quality source range');
      }
    }
    for (const source of byId.values()) {
      const keys = new Set();
      for (const entry of source.evidence || []) {
        if (typeof entry.key !== 'string' || !entry.key || keys.has(entry.key) || 'id' in entry || 'subject_id' in entry ||
          'supporting_ids' in entry || !Array.isArray(entry.supports) || !Array.isArray(entry.source_spans) ||
          !['syntax', 'language_rules', 'compiler', 'configuration', 'inference', 'heuristic', 'manual'].includes(entry.method) ||
          !['observed', 'established', 'inferred', 'heuristic', 'unknown'].includes(entry.authority) ||
          (entry.project_id ? get(entry.project_id).category !== 'Project' || 'project_independent' in entry : entry.project_independent !== true) ||
          entry.attribute_path !== undefined && (typeof entry.attribute_path !== 'string' || !entry.attribute_path)) {
          throw new Error(`Invalid embedded evidence on ${source.id}`);
        }
        keys.add(entry.key);
        for (const support of entry.supports) {
          const target = get(support.subject_id);
          if (target.category === 'Project' && ['Import', 'Annotation', 'Declaration', 'TypeUse', 'Expression', 'Symbol'].includes(source.category)) {
            throw new Error(`Code evidence must reach Project transitively: ${source.id}`);
          }
          if ('id' in support || support.attribute_path !== undefined && (typeof support.attribute_path !== 'string' || !support.attribute_path)) {
            throw new Error(`Invalid evidence prerequisite on ${source.id}`);
          }
        }
        entry.source_spans.forEach(validateSpan);
      }
    }
    for (const record of model.Diagnostic || []) {
      if (!['info', 'warning', 'error'].includes(record.severity) || typeof record.message !== 'string' ||
        !/^[A-Za-z][\w-]*[.:][\w.:-]+$/.test(record.code) || record.attribute_path !== undefined && !record.subject_id ||
        record.project_id && get(record.project_id).category !== 'Project') {
        throw new Error(`Invalid Diagnostic: ${record.id}`);
      }
      if (record.subject_id) get(record.subject_id);
      if (record.span) validateSpan(record.span);
      for (const subject of record.related_subjects || []) get(subject.subject_id);
      for (const location of record.related_spans || []) validateSpan(location.span);
    }
    function sourceConditions(id) {
      if (!id) return [];
      const record = get(id);
      const conditions = record.presence_condition === undefined ? [] : [record.presence_condition];
      if (record.category === 'TypeUse') return [...conditions, ...sourceConditions(record.subject_id)];
      if (record.declaration_id) return [...conditions, ...sourceConditions(record.declaration_id)];
      if (record.category === 'Declaration' && record.parent_declaration_id) {
        return [...conditions, ...sourceConditions(record.parent_declaration_id)];
      }
      return conditions;
    }
    const annotationPositions = new Set();
    function containedExpression(source, expressionId) {
      const expression = get(expressionId);
      if (expression.category !== 'Expression' || expression.file_id !== source.file_id ||
        expression.declaration_id !== source.declaration_id || expression.span.file_id !== source.span.file_id ||
        expression.span.start_offset < source.span.start_offset || expression.span.end_offset > source.span.end_offset) {
        throw new Error(`Invalid source expression on ${source.id}`);
      }
    }
    for (const source of byId.values()) {
      if (!['Import', 'Annotation'].includes(source.category)) continue;
      if (get(source.file_id).category !== 'ProjectFile' ||
        source.file_id !== source.span.file_id || get(source.span.file_id).category !== 'ProjectFile' ||
        !Number.isInteger(source.span.start_offset) || !Number.isInteger(source.span.end_offset) ||
        source.span.start_offset < 0 || source.span.end_offset <= source.span.start_offset ||
        source.declaration_id && (get(source.declaration_id).category !== 'Declaration' || get(source.declaration_id).file_id !== source.file_id)) {
        throw new Error(`Invalid source containment on ${source.id}`);
      }
      if (source.category === 'Import') {
        if (!['import', 'include', 'using', 'extern', 'language_specific'].includes(source.form) ||
          typeof source.is_reexport !== 'boolean' || !Array.isArray(source.bindings) ||
          !['qualified_name', 'string', 'angle_header', 'quoted_header', 'expression', 'none', 'language_specific'].includes(source.source_form) ||
          (source.source_form === 'expression') !== Boolean(source.path_expression_id)) {
          throw new Error(`Invalid Import syntax on ${source.id}`);
        }
        const keys = new Set();
        for (const binding of source.bindings) {
          if (typeof binding.key !== 'string' || !binding.key || keys.has(binding.key) || typeof binding.wildcard !== 'boolean' ||
            'id' in binding || 'local_symbol_id' in binding || 'imported_name' in binding ||
            binding.name_use_key !== undefined && !(source.name_uses || []).some(use => use.key === binding.name_use_key)) {
            throw new Error(`Invalid Import binding on ${source.id}`);
          }
          keys.add(binding.key);
        }
        const introductions = new Set();
        for (const edge of source.introduces || []) {
          const binding = source.bindings.find(item => item.key === edge.binding_key);
          const key = JSON.stringify([edge.binding_key, edge.project_id]);
          if (!binding || binding.wildcard || introductions.has(key) || get(edge.target_id).category !== 'Symbol' ||
            get(edge.project_id).category !== 'Project' || 'id' in edge || 'source_id' in edge || 'kind' in edge) {
            throw new Error(`Invalid Import introduction on ${source.id}`);
          }
          introductions.add(key);
        }
        if (source.path_expression_id) containedExpression(source, source.path_expression_id);
        if (source.import_expression_id) containedExpression(source, source.import_expression_id);
      } else {
        if (!['annotation', 'attribute', 'decorator', 'language_specific'].includes(source.form) ||
          !Array.isArray(source.targets) || !Array.isArray(source.arguments)) throw new Error(`Invalid Annotation syntax on ${source.id}`);
        for (const target of source.targets) {
          const endpoint = get(target.target_id);
          const key = JSON.stringify([source.file_id, target.target_id, target.role, target.position]);
          if (!['Declaration', 'ProjectFile'].includes(endpoint.category) ||
            !['declaration', 'return', 'file', 'assembly', 'language_specific'].includes(target.role) ||
            !Number.isInteger(target.position) || target.position < 0 || annotationPositions.has(key) ||
            ['declaration', 'return'].includes(target.role) && endpoint.category !== 'Declaration' ||
            ['file', 'assembly'].includes(target.role) && endpoint.category !== 'ProjectFile' ||
            endpoint.category === 'ProjectFile' && endpoint.id !== source.span.file_id ||
            endpoint.category === 'Declaration' && endpoint.file_id !== source.file_id || 'id' in target) {
            throw new Error(`Invalid Annotation target on ${source.id}`);
          }
          annotationPositions.add(key);
        }
        for (const argument of source.arguments) containedExpression(source, argument.expression_id);
        if (source.application_expression_id) containedExpression(source, source.application_expression_id);
      }
    }
    const edges = [];
    function add(from, to, kind, certainty, record, siteId = record.subject_id, candidate, embeddedEdge) {
      get(from); get(to);
      const matchesEdge = path => path === embeddedEdge.attribute_path ||
        path.startsWith(`${embeddedEdge.attribute_path}.`) && !path.startsWith(`${embeddedEdge.attribute_path}.semantic_properties`);
      const supportingSubjects = [...new Set([record.id, siteId].filter(Boolean))];
      const conditionSupport = path => kind === 'call' && (path === 'condition' || path?.startsWith('condition.'));
      const evidence = supportingSubjects.flatMap(evidenceFor).filter(item => !embeddedEdge ||
        evidenceInProject(item, record.project_id) && item.attribute_path &&
        (matchesEdge(item.attribute_path) || conditionSupport(item.attribute_path)));
      edges.push({
        from, to, kind, certainty, project_id: record.project_id, site_id: siteId,
        ...embeddedEdge,
        ...(embeddedEdge ? { details: record.details, semantic_properties: record.semantic_properties } : {}),
        candidate_set_completeness: record.candidate_set_completeness,
        ...(kind === 'call' ? {
          call_condition: get(siteId).condition,
          target_condition: candidate?.condition
        } : {}),
        evidence_refs: evidence.map(item => ({ subject_id: item.owner_id, key: item.key, attribute_path: item.attribute_path,
          ...(item.project_id ? { project_id: item.project_id } : { project_independent: true }) })),
        supporting_facts: evidence.flatMap(item => item.supports),
        supporting_ids: [...new Set([record.id, siteId, embeddedEdge?.type_expression_id, embeddedEdge?.semantic_target_id,
          ...evidence.flatMap(item => item.supports.map(support => support.subject_id))].filter(Boolean))],
        presence_conditions: [record.presence_condition, ...sourceConditions(siteId),
          ...(embeddedEdge && record.site_id && record.site_id !== siteId ? sourceConditions(record.site_id) : [])].filter(value => value !== undefined)
      });
    }
    for (const source of byId.values()) {
      const assessments = new Set();
      for (const result of source.binding_results || []) {
        const key = JSON.stringify([result.site_key, result.project_id]);
        const isCall = result.site_key === 'call';
        const isSource = result.site_key === 'source';
        if (assessments.has(key) || get(result.project_id).category !== 'Project' ||
          !['resolved', 'ambiguous', 'unresolved', 'partial', 'unsupported'].includes(result.state) ||
          !['complete', 'partial', 'unknown'].includes(result.candidate_set_completeness) ||
          (isCall ? source.category !== 'Expression' || !['call', 'construction'].includes(source.kind)
            : isSource ? source.category !== 'Import'
            : !(source.name_uses || []).some(use => use.key === result.site_key))) {
          throw new Error(`Invalid binding assessment on ${source.id}`);
        }
        assessments.add(key);
        const targets = (isSource ? source.imports_from || []
          : source[isCall ? 'invokes' : 'refers_to'] || []).filter(edge =>
          edge.site_key === result.site_key && edge.project_id === result.project_id);
        if (result.state === 'resolved' && targets.filter(edge => edge.state === (isSource ? 'established' : 'selected')).length !== 1) {
          throw new Error(`Resolved assessment needs one selected target: ${source.id}`);
        }
      }
      for (const [field, kind] of [['invokes', 'call'], ['refers_to', 'reference']]) {
        for (const [index, edge] of (source[field] || []).entries()) {
          const path = `${field}[${index}]`;
          const target = get(edge.target_id);
          const assessment = (source.binding_results || []).find(result =>
            result.site_key === edge.site_key && result.project_id === edge.project_id);
          if (!assessment || !['Expression', 'TypeUse', 'Declaration', 'Import', 'Annotation'].includes(source.category) ||
            get(edge.project_id).category !== 'Project' || target.category !== 'Symbol' ||
            (kind === 'call' && (source.category !== 'Expression' || !['call', 'construction'].includes(source.kind) || target.kind !== 'callable')) ||
            !['selected', 'candidate', 'rejected'].includes(edge.state) ||
            !['applicable', 'inapplicable', 'unknown'].includes(edge.applicability) ||
            (kind === 'call' && edge.site_key !== 'call') || (kind === 'reference' && !(source.name_uses || []).some(use => use.key === edge.site_key)) ||
            (edge.state === 'rejected') !== (edge.applicability === 'inapplicable') ||
            'id' in edge || 'source_id' in edge || 'kind' in edge) {
            throw new Error(`Invalid ${field.toUpperCase()} edge on ${source.id}`);
          }
          const peers = (source[field] || []).filter(record => record.site_key === edge.site_key && record.project_id === edge.project_id);
          if (edge.state === 'selected' && (assessment.state !== 'resolved' ||
            assessment.candidate_set_completeness !== 'complete' || target.identity_state !== 'established' ||
            edge.applicability !== 'applicable' || peers.some(record => record.state === 'candidate' && record.applicability === 'unknown') ||
            peers.filter(record => record.state === 'selected').length !== 1)) {
            throw new Error(`Selected target lacks an established complete candidate scope: ${source.id}`);
          }
          if (edge.state === 'rejected' || edge.applicability === 'inapplicable') continue;
          if (edge.applicability === 'unknown' && !evidenceFor(source.id).some(record =>
            evidenceInProject(record, edge.project_id) && record.attribute_path === path &&
            record.supports.some(support => support.subject_id === target.id && !support.attribute_path))) {
            throw new Error(`Possible unknown target needs evidence: ${source.id} ${path}`);
          }
          add(owner(source.id), target.id, kind, edge.state === 'selected' ? 'selected' : 'possible',
            { ...edge, candidate_set_completeness: assessment.candidate_set_completeness }, source.id, edge, {
              attribute_path: path, binding_site_key: edge.site_key, assessment_path: `binding_results[${source.binding_results.indexOf(assessment)}]`,
              ...(kind === 'call' ? { call_condition: source.condition, target_condition: edge.condition } : {})
            });
        }
      }
    }
    for (const source of byId.values()) {
      for (const [index, edge] of (source.has_type || []).entries()) {
        if (source.category === 'Symbol' && (!['external', 'system', 'intrinsic'].includes(source.origin) ||
          source.identity_state !== 'established' || ['namespace', 'module'].includes(source.kind) ||
          (model.Declaration || []).some(record => record.symbol_id === source.id))) {
          throw new Error(`Symbol HAS_TYPE cannot duplicate declaration types: ${source.id}`);
        }
        if (!['Declaration', 'Expression', 'TypeUse', 'Symbol'].includes(source.category) ||
          get(edge.target_id).category !== 'TypeExpression' || get(edge.project_id).category !== 'Project' ||
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
      accessor_for: ['Symbol', 'Symbol'], imports_from: ['Import', 'ProjectFile Symbol'],
      exports: ['ProjectFile Symbol', 'Symbol'],
      captures: ['Symbol', 'Symbol'], registers_callback: ['Expression', 'Symbol']
    };
    for (const source of byId.values()) {
      if ('reexports_from' in source) throw new Error(`Use imports_from with is_reexport on ${source.id}`);
      for (const [kind, [sources, targets]] of Object.entries(semanticEndpoints)) {
        for (const [index, edge] of (source[kind] || []).entries()) {
          const target = get(edge.target_id);
          const isImport = kind === 'imports_from';
          const assessment = isImport && (source.binding_results || []).find(result =>
            result.site_key === 'source' && result.project_id === edge.project_id);
          if (isImport && (!assessment || edge.site_key !== 'source' ||
            target.category === 'Symbol' && !['namespace', 'module', 'language_specific'].includes(target.kind) ||
            edge.state === 'established' && (assessment.state !== 'resolved' || assessment.candidate_set_completeness !== 'complete' ||
              target.category === 'Symbol' && target.identity_state !== 'established') ||
            edge.state === 'candidate' && assessment.state === 'resolved')) {
            throw new Error(`Invalid Import source assessment on ${source.id}`);
          }
          if (isImport && edge.state === 'candidate' && !evidenceFor(source.id).some(record =>
            evidenceInProject(record, edge.project_id) && record.attribute_path === `${kind}[${index}]` &&
            record.supports.some(support => support.subject_id === target.id && !support.attribute_path))) throw new Error(`Import candidate needs evidence: ${source.id}`);
          if (!sources.split(' ').includes(source.category) || !targets.split(' ').includes(target.category) ||
            get(edge.project_id).category !== 'Project' || !['established', 'candidate'].includes(edge.state) ||
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
            add(owner(source.id), targetId, kind, edge.state === 'established' ? 'established' : 'possible',
              { ...edge, ...(isImport ? { candidate_set_completeness: assessment.candidate_set_completeness } : {}) }, source.id, undefined, {
              semantic_source_id: source.id, semantic_target_id: target.id, attribute_path: `${kind}[${index}]`,
              ...(isImport ? { assessment_path: `binding_results[${source.binding_results.indexOf(assessment)}]`, is_reexport: source.is_reexport } : {}),
              semantic_state: edge.state, semantic_site_id: edge.site_id
            });
          }
        }
      }
    }
    for (const source of byId.values()) {
      for (const [index, edge] of (source.possible_implementation || []).entries()) {
        const target = get(edge.target_id);
        const invocation = (source.invokes || [])[edge.target_position];
        if (source.category !== 'Expression' || !['call', 'construction'].includes(source.kind) ||
          target.category !== 'Declaration' || target.form !== 'definition' || !invocation ||
          invocation.project_id !== edge.project_id || invocation.site_key !== edge.site_key ||
          invocation.state !== 'selected' || get(target.symbol_id).kind !== 'callable') {
          throw new Error(`Invalid POSSIBLE_IMPLEMENTATION on ${source.id}`);
        }
        const overrides = (get(target.symbol_id).overrides || []).some(relation =>
          relation.target_id === invocation.target_id && relation.project_id === edge.project_id && relation.state === 'established');
        if (target.symbol_id !== invocation.target_id && !overrides) throw new Error(`Implementation has no supported target: ${source.id}`);
        add(owner(source.id), target.symbol_id, 'implementation', 'possible', edge, source.id, undefined,
          { attribute_path: `possible_implementation[${index}]`, implementation_definition_id: target.id });
      }
    }
    const groups = new Map();
    for (const edge of edges) {
      const from = component(edge.from), to = component(edge.to);
      if (from === to) continue;
      const key = JSON.stringify([from, to]);
      if (!groups.has(key)) groups.set(key, { from, to, occurrences: [], project_ids: [] });
      const group = groups.get(key);
      group.occurrences.push(edge);
      if (edge.project_id && !group.project_ids.includes(edge.project_id)) group.project_ids.push(edge.project_id);
    }
    return { byId, name, edges, components: [...groups.values()] };
  };
})();
