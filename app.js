(() => {
  'use strict';

  const source = window.CODE_GRAPH_SOURCE;
  if (typeof source !== 'string') {
    document.querySelector('#details').textContent = 'Model content is missing. Run node build-model.mjs to generate model-data.js, then reload the page.';
    return;
  }

  const layers = [
    { id: 'foundation', name: 'Projects, sources & context', color: 'var(--layer-foundation)', sections: [3, 4] },
    { id: 'identity', name: 'Identity & structure', color: 'var(--layer-identity)', sections: [5] },
    { id: 'types', name: 'Types & type uses', color: 'var(--layer-types)', sections: [6] },
    { id: 'syntax', name: 'Expressions & calls', color: 'var(--layer-syntax)', sections: [7] },
    { id: 'resolution', name: 'Binding & targets', color: 'var(--layer-resolution)', sections: [8] },
    { id: 'relations', name: 'Imports & relations', color: 'var(--layer-relations)', sections: [9] },
    { id: 'quality', name: 'Evidence & coverage', color: 'var(--layer-quality)', sections: [11] }
  ];
  const summaries = {
    SourceSpan: 'Byte coordinates in immutable source text',
    PresenceCondition: 'Structured conditional activation',
    CodeDataset: 'Dataset identity, provenance, and roots',
    Repository: 'A repository or local workspace root',
    Project: 'The descriptor-based boundary of organization and analysis',
    Directory: 'An inventoried directory and its physical parent',
    ProjectFile: 'A project file, independent of source parsing',
    ExternalLibrary: 'An external dependency with artifact identity',
    SourceFile: 'A specific version of source text',
    AnalysisContext: 'Static settings that give semantics meaning',
    AnalysisUnit: 'Inputs of one configured analysis pass',
    Symbol: 'One logical language entity',
    Declaration: 'A declaration occurrence and its code containment',
    CallableProfile: 'Callable parameters and receiver semantics',
    ParameterProfile: 'Parameter binding and passing modes',
    TypeProfile: 'Declared type category and parameters',
    TypeExpression: 'A structural semantic type value',
    TypeUse: 'A type as written at a source location',
    Expression: 'Preserved syntax and ordered operands',
    CallProfile: 'Callee and source-ordered arguments',
    CallCondition: 'Optional branch or target-selection restrictions',
    Reference: 'A name use, before target selection',
    Resolution: 'Contextual lookup or invocation decision',
    ImplementationSet: 'Optional source definitions and possible overrides',
    Import: 'Import syntax, aliases, and lookup rules',
    Annotation: 'An attribute or decorator application',
    Evidence: 'How a fact is supported, not its value',
    Coverage: 'What is complete, partial, or unknown',
    Diagnostic: 'Explicit errors, warnings, and limitations'
  };
  const profiles = {
    CallableProfile: 'Symbol', ParameterProfile: 'Symbol',
    TypeProfile: 'Symbol', CallProfile: 'Expression'
  };
  const sections = [...source.matchAll(/^## (\d+)\. (.+)$/gm)].map((match, index, all) => ({
    number: Number(match[1]), title: match[2],
    markdown: source.slice(match.index, all[index + 1]?.index ?? source.length)
  }));
  const semanticTable = sections.find(section => section.number === 9).markdown
    .split('| Outgoing list |')[1].split('\n\n')[0];
  const semanticKinds = semanticTable.split('\n').filter(line => /^\| `\w+`/.test(line))
    .flatMap(line => {
      const [names, endpoints, details] = line.split('|').slice(1, -1).map(cell => cell.trim());
      const [from, to] = endpoints.split('->').map(side => [...side.matchAll(/\b(?:Symbol|TypeExpression|Expression|Import|Project|SourceFile)\b/g)].map(match => match[0]));
      return [...names.matchAll(/`(\w+)`/g)].map(([, kind]) => ({ kind, endpoints, details, from, to }));
    });
  const entities = [];
  for (const section of sections) {
    const headings = [...section.markdown.matchAll(/^### (\w+)$/gm)];
    headings.forEach((heading, index) => {
      const name = heading[1];
      const markdown = section.markdown.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? section.markdown.length)
        .split(/^#### Semantic Edges$/m)[0].trim();
      entities.push({
        name, markdown, section: section.number,
        layer: layers.find(layer => layer.sections.includes(section.number)),
        summary: summaries[name], profile: profiles[name]
      });
    });
  }
  const byName = new Map(entities.map(entity => [entity.name, entity]));
  const entityPattern = new RegExp(`\\b(${entities.map(entity => entity.name).sort((a, b) => b.length - a.length).join('|')})\\b`, 'g');
  const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const strip = text => text.replace(/[`*]/g, '').trim();
  const links = [];
  function addLink(from, to, field, description, kind = 'reference') {
    if (!byName.has(to)) return;
    if (!links.some(link => link.from === from && link.to === to && link.field === field && link.kind === kind)) {
      links.push({ from, to, field, description, kind });
    }
  }
  for (const entity of entities) {
    if (entity.profile) addLink(entity.name, entity.profile, 'shared identity', 'Extension of the permitted base category; no separate identity object.', 'extension');
    for (const line of entity.markdown.split(/^#### HAS_TYPE Edges$/m)[0].split('\n')) {
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').slice(1, -1).map(strip);
      if (cells.length < 3 || !cells[1].includes('Id ->')) continue;
      const fields = [...cells[0].matchAll(/\b\w+_ids?\b/g)].map(match => match[0]);
      const targets = [...cells[1].matchAll(entityPattern)].map(match => match[0]);
      for (const field of fields) for (const target of targets) addLink(entity.name, target, field, cells[2]);
    }
  }
  // Variant and embedded references are not all expressed as "Id ->" table cells.
  const extraLinks = [
    ['Project', 'Directory', 'contains[].target_id', 'Direct CONTAINS edges to project directories; no intermediate node or edge ID.'],
    ['Project', 'ProjectFile', 'contains[].target_id', 'Direct CONTAINS edges to project files; no intermediate node or edge ID.'],
    ['Project', 'ExternalLibrary', 'external[].target_id', 'Direct EXTERNAL dependencies, preserving known versions, scope, and conditions.'],
    ['Project', 'Project', 'depends_on[].target_id', 'Direct DEPENDS_ON edges between projects in the same repository; no intermediate node or edge ID.'],
    ['Project', 'AnalysisContext', 'contains[].context_id / external[].context_id / depends_on[].context_id', 'Optional configuration on a direct project edge.'],
    ['Project', 'ProjectFile', 'contains[].site_file_id / external[].site_file_id / depends_on[].site_file_id', 'Optional descriptor or lockfile supporting a direct project edge.'],
    ['Project', 'PresenceCondition', 'contains[].presence_condition / external[].presence_condition / depends_on[].presence_condition', 'Optional applicability condition on a direct project edge.', 'embedded'],
    ...['Declaration', 'Expression', 'TypeUse', 'Symbol'].flatMap(source => [
      [source, 'TypeExpression', 'has_type[].target_id', 'Direct HAS_TYPE edges associate semantic types with this subject; no intermediate node or edge ID.'],
      [source, 'AnalysisContext', 'has_type[].context_id', 'Required analysis context for each HAS_TYPE edge; role and state belong to the edge.']
    ]),
    ['TypeExpression', 'Symbol', 'symbol_id / arguments', 'Nominal identity, type parameters, dependent symbols, or template arguments; variant-dependent.'],
    ['TypeExpression', 'TypeExpression', 'element_type_id / component_type_ids / generic_type_id / bound_type_id / parameter_type_ids / return_type_id / arguments', 'Structural type composition; the permitted fields depend on kind.'],
    ['TypeExpression', 'Expression', 'expression_id / dimensions / arguments / dependency_ids', 'Dependent types, expression-valued dimensions, or generic arguments; variant-dependent.'],
    ['TypeExpression', 'Symbol', 'dependency_ids', 'Symbols on which a dependent type relies.'],
    ['Expression', 'Expression', 'operands[].expression_id', 'Ordered component expressions and their roles. Call and construction expressions store callee and arguments only in CallProfile, not as duplicated operands.'],
    ['CallProfile', 'Expression', 'arguments[].expression_id', 'Source argument expressions in source order.'],
    ['CallCondition', 'Expression', 'predicate.expression_id', 'Source expression tested under language truth-value rules; predicates may nest.'],
    ['Resolution', 'CallCondition', 'candidates[].condition', 'Optional target-selection restriction, not a proof of applicability or unique selection.', 'embedded'],
    ['Annotation', 'Expression', 'arguments[].expression_id', 'Annotation argument expressions in source order.'],
    ['Import', 'Symbol', 'bindings[].local_symbol_id', 'An optional local symbol introduced by an import binding, including an alias.'],
    ['Resolution', 'Symbol', 'candidates[].target_symbol_id / argument_bindings[].parameter_id / receiver_binding / type_substitutions', 'Candidate symbols, formal parameters, receivers, and generic parameter keys. Invocation-only binding fields are not substantive for reference resolution.'],
    ['Resolution', 'Expression', 'argument_bindings[].default_expression_id / receiver_binding / type_substitutions', 'Default values, receiver expressions, and expression-valued substitutions; invocation-only.'],
    ['Resolution', 'TypeExpression', 'conversions / type_substitutions', 'Source and target types of conversions and type-valued generic substitutions.'],
    ['Diagnostic', 'AnalysisContext', 'context_id', 'Optional configuration associated with the diagnostic.'],
    ['Diagnostic', 'SourceSpan', 'span', 'Optional source location associated with the diagnostic.']
  ];
  extraLinks.forEach(link => addLink(...link));
  for (const { kind, endpoints, details, from, to } of semanticKinds) {
    for (const source of from) {
      for (const target of to) addLink(source, target, `${kind}[].target_id`, `Direct ${kind.toUpperCase()} edge. ${endpoints}. ${details}`);
      addLink(source, 'AnalysisContext', `${kind}[].context_id`, `Required context of each ${kind.toUpperCase()} edge.`);
      addLink(source, 'PresenceCondition', `${kind}[].presence_condition`, `Optional applicability of each ${kind.toUpperCase()} edge.`, 'embedded');
    }
  }
  for (const entity of entities) {
    for (const line of entity.markdown.split('\n').filter(line => line.startsWith('|'))) {
      const cells = line.split('|').slice(1, -1).map(strip);
      if (cells.length < 3) continue;
      if (cells[1].includes('SourceSpan')) {
        const field = cells[0].replace(/\s*[!?]/g, '');
        addLink(entity.name, 'SourceSpan', field, cells[2], 'embedded');
      }
      if (cells[1].includes('PresenceCondition')) addLink(entity.name, 'PresenceCondition', 'presence_condition', cells[2], 'embedded');
      if (cells[1].includes('CallCondition')) addLink(entity.name, 'CallCondition', 'condition', cells[2], 'embedded');
    }
  }
  const genericReferences = [
    ['Evidence', 'subject_id / supporting_ids', 'Record being supported, or facts supporting the conclusion.'],
    ['Coverage', 'subject_id', 'An area or individual entity whose completeness is assessed.'],
    ['Diagnostic', 'subject_id', 'Optional record associated with the diagnostic.']
  ];
  const graphNodes = [
    ['Repository', 2, 0], ['CodeDataset', 0, 0], ['Evidence', 5, 0],
    ['Project', 2, 1], ['Coverage', 5, 1],
    ['Directory', 0, 2], ['AnalysisContext', 3, 2], ['ExternalLibrary', 4, 2], ['Diagnostic', 5, 2],
    ['ProjectFile', 0, 3], ['AnalysisUnit', 2, 3], ['PresenceCondition', 4, 3],
    ['SourceFile', 0, 4], ['Import', 1, 4], ['Declaration', 2, 4], ['Symbol', 4, 4],
    ['Annotation', 1, 5], ['Expression', 2, 5], ['Reference', 3, 5], ['CallableProfile', 5, 5],
    ['SourceSpan', 0, 6], ['TypeUse', 1, 6], ['CallProfile', 2, 6], ['TypeExpression', 3, 6], ['Resolution', 4, 6],
    ['CallCondition', 2, 7], ['ImplementationSet', 4, 7], ['ParameterProfile', 5, 6], ['TypeProfile', 5, 7]
  ].map(([name, column, row]) => ({ name, column, row }));
  const inverseLabels = {
    'Project:repository_id': 'HAS PROJECT', 'AnalysisContext:project_id': 'HAS CONTEXT',
    'AnalysisUnit:context_id': 'HAS UNIT', 'Declaration:unit_id': 'HAS DECLARATION',
    'Expression:unit_id': 'HAS EXPRESSION', 'Expression:declaration_id': 'CONTAINS EXPRESSION',
    'Import:unit_id': 'HAS IMPORT', 'Import:declaration_id': 'CONTAINS IMPORT',
    'Annotation:declaration_id': 'HAS ANNOTATION', 'SourceFile:project_file_id': 'HAS SOURCE VERSION',
    'ProjectFile:parent_directory_id': 'PARENT OF', 'Directory:parent_directory_id': 'PARENT OF',
    'Declaration:parent_declaration_id': 'PARENT OF', 'Project:parent_project_id': 'PARENT OF',
    'Symbol:owner_symbol_id': 'OWNS SYMBOL', 'Reference:site_id': 'HAS REFERENCE',
    'TypeUse:subject_id': 'HAS TYPE USE', 'Resolution:subject_id': 'HAS RESOLUTION',
    'ImplementationSet:resolution_id': 'HAS IMPLEMENTATIONS'
  };
  const overviewFields = new Set([
    'repository_id', 'root_project_ids', 'descriptor_file_id', 'project_file_id', 'parent_directory_id',
    'parent_project_id', 'project_id', 'unit_id', 'parent_declaration_id', 'declaration_id', 'symbol_id',
    'owner_symbol_id', 'context_id', 'entry_file_ids', 'participating_file_ids', 'file_id', 'site_id', 'subject_id',
    'selected_target_id', 'resolution_id', 'definition_ids', 'shared identity', 'condition',
    'contains[].target_id', 'external[].target_id', 'depends_on[].target_id', 'has_type[].target_id',
    'operands[].expression_id'
  ]);
  const schemaRelations = [];
  for (const link of links) {
    const inverse = inverseLabels[`${link.from}:${link.field}`];
    const directKind = link.field.match(/^(contains|external|depends_on|has_type)\[\]\.target_id$/)?.[1];
    const fieldLabels = {
      root_project_ids: 'ROOT PROJECTS', descriptor_file_id: 'DESCRIBED BY', root_directory_id: 'ROOT DIRECTORY',
      symbol_id: 'IDENTIFIES SYMBOL', file_id: 'SOURCE TEXT', entry_file_ids: 'STARTS FROM',
      participating_file_ids: 'INCLUDES SOURCE', selected_target_id: 'SELECTED TARGET',
      definition_ids: 'SOURCE DEFINITIONS', 'operands[].expression_id': 'OPERAND',
      callee_expression_id: 'CALLEE', 'arguments[].expression_id': 'ARGUMENTS'
    };
    const label = inverse || (link.kind === 'extension' ? 'SHARED IDENTITY'
      : directKind ? directKind.toUpperCase()
      : fieldLabels[link.field] || relationLabel({ from: link.from, to: link.to, kind: link.kind, links: [link] }));
    let group = schemaRelations.find(item => item.from === link.from && item.to === link.to && item.kind === link.kind && item.label === label);
    if (!group) {
      group = {
        from: link.from, to: link.to, kind: link.kind, label,
        displayFrom: inverse ? link.to : link.from, displayTo: inverse ? link.from : link.to,
        inverse: Boolean(inverse), links: [], index: schemaRelations.length, overview: false
      };
      schemaRelations.push(group);
    }
    group.links.push(link);
    group.overview ||= overviewFields.has(link.field) && (link.field !== 'context_id' || link.from === 'AnalysisUnit');
  }
  const state = {
    layer: 'all', query: '', selected: 'Project', detailTab: 'attributes', neighbors: false,
    tour: 0, view: 'explorer', zoom: 1, fit: false, expanded: false, relation: null,
    exampleView: 'records', exampleScope: 'step', exampleTarget: null, beforeExpand: null,
    dependencyView: 'components', mapMode: 'structure'
  };

  function relationGroups() {
    return schemaRelations.filter(group => group.from === state.selected || group.to === state.selected);
  }
  function relationLabel(group) {
    if (group.label) return group.label;
    if (group.kind === 'extension') return 'extends base';
    if (group.kind === 'embedded') return group.to === 'SourceSpan' ? 'locates in source' : group.to === 'CallCondition' ? 'restricted by predicate' : 'conditionally active';
    const field = group.links[0].field;
    const labels = {
      symbol_id: 'identifies symbol', owner_symbol_id: 'owned by',
      parent_declaration_id: 'nested in declaration',
      context_id: 'interpreted in', unit_id: 'analyzed in', project_id: 'analyzes project',
      parent_project_id: 'part of project hierarchy', root_project_ids: 'has project roots',
      dependency_context_ids: 'uses dependency context', entry_file_ids: 'starts from files',
      participating_file_ids: 'includes files', file_id: 'locates source version',
      initializer_expression_id: 'initialized by', parameter_ids: 'has parameters',
      type_parameter_ids: 'has type parameters', subject_id: 'describes subject',
      type_id: 'binds to type', callee_expression_id: 'invokes expression',
      introduced_symbol_id: 'introduces callable', selected_target_id: 'selects target',
      site_id: 'observed at', resolution_id: 'implements resolution', definition_ids: 'possible definitions',
      declaration_id: group.from === 'Annotation' ? 'annotates declaration' : 'contained in declaration', source_id: 'starts at', target_id: 'ends at'
    };
    if (labels[field]) return labels[field];
    if (field.startsWith('operands')) return 'contains operands';
    if (field.startsWith('arguments')) return 'has argument values';
    if (field.startsWith('bindings')) return 'introduces local name';
    if (field.startsWith('candidates')) return 'considers / binds';
    if (field.startsWith('conversions')) return 'converts / substitutes';
    if (field.startsWith('argument_bindings')) return 'binds actual values';
    if (field.startsWith('has_type')) return group.to === 'TypeExpression' ? 'HAS_TYPE' : 'types interpreted in';
    const semanticKind = semanticKinds.find(({ kind }) => field.startsWith(`${kind}[]`));
    if (semanticKind) return group.to === 'AnalysisContext' ? 'edges interpreted in' : semanticKind.kind.toUpperCase();
    if (group.from === 'TypeExpression') return group.to === 'TypeExpression' ? 'composes type layers' : 'refers to identity';
    return field.split(' / ')[0];
  }
  function renderRelationInfo() {
    const groups = relationGroups();
    const group = schemaRelations.find(item => item.index === state.relation);
    document.querySelector('#relation-info').innerHTML = group
      ? `<div class="relation-info-heading"><div><span class="eyebrow">${group.kind === 'extension' ? 'SHARED-IDENTITY EXTENSION' : group.kind === 'embedded' ? 'EMBEDDED VALUE' : 'SCHEMA CONNECTION'}</span><h3>${group.displayFrom} → ${group.displayTo} <span>· ${escape(relationLabel(group))}</span></h3></div><button id="close-relation" class="text-button">Close explanation ×</button></div><ul>${group.links.map(link => `<li><code>${escape(link.field)}</code><span>${escape(link.description)}</span></li>`).join('')}</ul><p>${group.inverse ? 'Shown as an inverse relationship. ' : ''}The <strong>${group.from}</strong> record stores ${group.kind === 'extension' ? 'a shared-identity extension of its base, not a separate entity ID' : group.kind === 'embedded' ? `an embedded ${group.to} value` : `the reference to ${group.to}`}. Optional and kind-specific constraints remain in the attribute tables.</p><button id="view-attributes" class="text-button">View ${state.selected} attributes →</button>`
      : `<div class="relation-summary"><span><strong>${state.selected}</strong> · ${groups.length} possible typed connections</span><button id="view-attributes" class="text-button">View attributes →</button></div>`;
  }

  function inline(text) {
    const tokens = [];
    let result = escape(text).replace(/`([^`]+)`/g, (_, code) => {
      const html = code.replace(entityPattern, name => `<button class="entity-link" data-entity="${name}">${name}</button>`);
      tokens.push(`<code>${html}</code>`);
      return `\u0000${tokens.length - 1}\u0000`;
    });
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
    result = result.replace(entityPattern, name => `<button class="entity-link" data-entity="${name}">${name}</button>`);
    return result.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)]);
  }
  function markdown(text) {
    const lines = text.trim().split('\n');
    const result = [];
    for (let index = 0; index < lines.length;) {
      const line = lines[index];
      if (!line.trim()) { index++; continue; }
      const heading = line.match(/^(#{1,4}) (.+)$/);
      if (heading) {
        const level = heading[1].length;
        const number = heading[2].match(/^(\d+)\./)?.[1];
        result.push(`<h${level}${number ? ` id="section-${number}"` : ''}>${inline(heading[2])}</h${level}>`);
        index++; continue;
      }
      if (line.startsWith('|')) {
        const rows = [];
        while (index < lines.length && lines[index].startsWith('|')) rows.push(lines[index++].split('|').slice(1, -1).map(cell => cell.trim()));
        const headers = rows.shift();
        if (rows[0]?.every(cell => /^:?-+:?$/.test(cell))) rows.shift();
        result.push(`<div class="table-wrap"><table><thead><tr>${headers.map(cell => `<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      const list = line.match(/^(\d+\.|-)\s+(.+)$/);
      if (list) {
        const ordered = list[1] !== '-';
        const items = [];
        while (index < lines.length) {
          const item = lines[index].match(ordered ? /^\d+\.\s+(.+)$/ : /^-\s+(.+)$/);
          if (!item) break;
          items.push(`<li>${inline(item[1])}</li>`); index++;
        }
        const tag = ordered ? 'ol' : 'ul';
        result.push(`<${tag}>${items.join('')}</${tag}>`); continue;
      }
      const paragraph = [];
      while (index < lines.length && lines[index].trim() && !/^(#{1,4} |\||\d+\.\s|-\s)/.test(lines[index])) paragraph.push(lines[index++]);
      result.push(`<p>${inline(paragraph.join(' '))}</p>`);
    }
    return result.join('');
  }

  function related(name) {
    return new Set(links.filter(link => link.from === name || link.to === name).flatMap(link => [link.from, link.to]));
  }
  function filteredEntities() {
    const neighbors = related(state.selected);
    return entities.filter(entity =>
      (state.layer === 'all' || entity.layer.id === state.layer) &&
      (!state.query || `${entity.name} ${entity.summary} ${entity.markdown}`.toLowerCase().includes(state.query)) &&
      (!state.neighbors || entity.name === state.selected || neighbors.has(entity.name)));
  }
  function renderGraph() {
    const visible = filteredEntities();
    const matches = new Set(visible.map(entity => entity.name));
    const connected = related(state.selected);
    document.querySelector('#graph-groups').innerHTML = graphNodes.filter(node => matches.has(node.name)).map(node => {
      const entity = byName.get(node.name);
      const type = entity.profile ? 'Shared identity' : ['SourceSpan', 'PresenceCondition', 'CallCondition'].includes(entity.name) ? 'Embedded value' : entity.layer.name;
      return `<div class="node-wrap schema-node" style="left:${64 + node.column * 290}px;top:${40 + node.row * 190}px;--layer-color:${entity.layer.color}"><button class="node ${entity.name === state.selected ? 'selected' : connected.has(entity.name) ? 'connected' : 'dimmed'}" data-node="${entity.name}" aria-pressed="${entity.name === state.selected}" title="${escape(entity.summary)}"><span class="node-name"><span class="layer-dot" aria-hidden="true"></span>${entity.name}</span><span class="node-desc">${escape(entity.summary)}</span><span class="node-type">${type}</span></button></div>`;
    }).join('');
    document.querySelector('#empty-state').hidden = visible.length > 0;
    document.querySelector('#visible-count').textContent = `${visible.length} / ${entities.length} types`;
    document.querySelectorAll('[data-map-mode]').forEach(button => {
      button.classList.toggle('active', button.dataset.mapMode === state.mapMode);
      button.setAttribute('aria-pressed', String(button.dataset.mapMode === state.mapMode));
    });
    document.querySelectorAll('.layer-button').forEach(button => {
      button.classList.toggle('active', button.dataset.layer === state.layer);
      button.setAttribute('aria-pressed', String(button.dataset.layer === state.layer));
    });
    renderRelationInfo();
    requestAnimationFrame(layoutMap);
  }
  function layoutMap() {
    if (state.view !== 'explorer') return;
    const viewport = document.querySelector('.graph-scroll');
    const graph = document.querySelector('#graph');
    const stage = document.querySelector('#graph-stage');
    const nodes = [...graph.querySelectorAll('.schema-node')];
    const width = Math.max(760, ...nodes.map(node => node.offsetLeft + node.offsetWidth + 80));
    const height = Math.max(240, ...nodes.map(node => node.offsetTop + node.offsetHeight + 110));
    graph.style.width = `${width}px`;
    graph.style.height = `${height}px`;
    if (state.fit && height) state.zoom = Math.max(.15, Math.min(1, (viewport.clientWidth - 24) / width, (viewport.clientHeight - 24) / height));
    graph.style.transform = `scale(${state.zoom})`;
    stage.style.width = `${width * state.zoom}px`;
    stage.style.height = `${height * state.zoom}px`;
    document.querySelector('#map-summary').textContent = 'Repository → Project · possible schema relationships';
    document.querySelector('#zoom-level').textContent = `${Math.round(state.zoom * 100)}%`;
    document.querySelector('#zoom-out').disabled = state.zoom <= .15;
    document.querySelector('#zoom-in').disabled = state.zoom >= 2;
    drawConnections();
  }
  function fitMap() {
    state.fit = true;
    document.querySelector('.map-area').classList.add('fitted');
    requestAnimationFrame(() => { layoutMap(); document.querySelector('.graph-scroll').scrollTo(0, 0); });
  }
  function resetMapPosition() {
    requestAnimationFrame(() => {
      if (state.view !== 'explorer') return;
      const viewport = document.querySelector('.graph-scroll');
      const project = document.querySelector('[data-node="Project"]')?.closest('.schema-node');
      if (project) viewport.scrollTo(Math.max(0, (project.offsetLeft + project.offsetWidth / 2) * state.zoom - viewport.clientWidth / 2), 0);
    });
  }
  function expandMap(expanded) {
    if (expanded === state.expanded) return;
    const viewport = document.querySelector('.graph-scroll');
    if (expanded) state.beforeExpand = {
      zoom: state.zoom, fit: state.fit, fitted: document.querySelector('.map-area').classList.contains('fitted'),
      x: viewport.scrollLeft, y: viewport.scrollTop
    };
    state.expanded = expanded;
    const workspace = document.querySelector('.workspace');
    workspace.classList.toggle('expanded', expanded);
    if (expanded) {
      workspace.setAttribute('role', 'dialog');
      workspace.setAttribute('aria-modal', 'true');
      workspace.setAttribute('aria-label', 'Expanded structure map');
    } else {
      workspace.removeAttribute('role');
      workspace.removeAttribute('aria-modal');
      workspace.removeAttribute('aria-label');
    }
    document.querySelectorAll('.header,.intro,.dependency-overview,.principle-strip,.footer').forEach(element => { element.inert = expanded; });
    document.body.classList.toggle('map-expanded', expanded);
    document.querySelector('#expand-map').textContent = expanded ? 'Restore layout ↙' : 'Expand map ↗';
    document.querySelector('#expand-map').setAttribute('aria-pressed', String(expanded));
    if (expanded) {
      fitMap();
      document.querySelector('#expand-map').focus();
    } else {
      const previous = state.beforeExpand;
      state.zoom = previous.zoom; state.fit = previous.fit;
      document.querySelector('.map-area').classList.toggle('fitted', previous.fitted);
      requestAnimationFrame(() => { layoutMap(); viewport.scrollTo(previous.x, previous.y); });
      state.beforeExpand = null;
    }
  }
  function drawConnections() {
    const graph = document.querySelector('#graph');
    const svg = document.querySelector('#connections');
    const rect = graph.getBoundingClientRect();
    svg.setAttribute('width', graph.offsetWidth);
    svg.setAttribute('height', graph.offsetHeight);
    const paths = [];
    const groups = schemaRelations.filter(group => (state.mapMode === 'all' || group.overview || group.from === state.selected || group.to === state.selected || group.index === state.relation) && (!state.neighbors || group.from === state.selected || group.to === state.selected));
    const local = node => {
      const bounds = node.getBoundingClientRect();
      return { left: (bounds.left - rect.left) / state.zoom, right: (bounds.right - rect.left) / state.zoom, top: (bounds.top - rect.top) / state.zoom, height: bounds.height / state.zoom };
    };
    for (const group of groups) {
      const from = graph.querySelector(`[data-node="${group.displayFrom}"]`);
      const to = graph.querySelector(`[data-node="${group.displayTo}"]`);
      if (!from || !to || !from.getClientRects().length || !to.getClientRects().length) continue;
      const a = local(from), b = local(to);
      const lane = group.index % 5 * 9;
      const centerA = (a.left + a.right) / 2;
      const centerB = (b.left + b.right) / 2;
      const bottomA = a.top + a.height, bottomB = b.top + b.height;
      let points;
      if (from === to) {
        points = [[a.right - 45, bottomA], [a.right - 45, bottomA + 30 + lane], [a.right + 42, bottomA + 30 + lane], [a.right + 42, a.top + 25], [a.right, a.top + 25]];
      } else if (Math.abs(a.top - b.top) < 15) {
        const band = Math.max(bottomA, bottomB) + 32 + lane;
        points = [[centerA, bottomA], [centerA, band], [centerB, band], [centerB, bottomB]];
      } else if (Math.abs(a.left - b.left) < 15 && Math.abs(a.top - b.top) < 210) {
        const down = a.top < b.top;
        points = [[centerA, down ? bottomA : a.top], [centerB, down ? b.top : bottomB]];
      } else {
        const down = a.top < b.top;
        const startY = down ? bottomA : a.top, endY = down ? b.top : bottomB;
        const startBand = startY + (down ? 26 + lane : -26 - lane);
        const endBand = endY + (down ? -26 - lane : 26 + lane);
        const channel = a.right + 25 + lane;
        points = [[centerA, startY], [centerA, startBand], [channel, startBand], [channel, endBand], [centerB, endBand], [centerB, endY]];
      }
      const d = points.map(([pointX, pointY], index) => `${index ? 'L' : 'M'} ${pointX} ${pointY}`).join(' ');
      const selected = group.from === state.selected || group.to === state.selected;
      paths.push(`<path class="schema-edge${selected ? ' incident' : ''}${group.index === state.relation ? ' active' : ''}" data-edge="${group.index}" d="${d}" fill="none" stroke="${group.kind === 'extension' ? 'var(--edge-extension)' : 'var(--edge)'}" stroke-width="${group.index === state.relation ? 2.6 : selected ? 1.8 : 1.1}" ${group.kind === 'extension' || group.kind === 'embedded' ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#${group.kind === 'extension' ? 'arrow-extension' : 'arrow'})"><title>${escape(`${group.displayFrom} → ${group.displayTo}: ${group.links.map(link => link.field).join(', ')}`)}</title></path>`);
    }
    svg.innerHTML = `<defs>${[['arrow', '--edge'], ['arrow-extension', '--edge-extension']].map(([id, color]) => `<marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" fill="var(${color})"/></marker>`).join('')}</defs>${paths.join('')}`;
    const occupied = [...graph.querySelectorAll('.node-wrap')].map(node => {
      const box = local(node);
      return { x: box.left - 3, y: box.top - 3, width: box.right - box.left + 6, height: box.height + 6 };
    });
    const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    const sorted = [...groups].sort((first, second) => Number(second.index === state.relation) - Number(first.index === state.relation) || Number(second.from === state.selected || second.to === state.selected) - Number(first.from === state.selected || first.to === state.selected));
    for (const group of sorted) {
      const path = svg.querySelector(`[data-edge="${group.index}"]`);
      if (!path) continue;
      const length = path.getTotalLength();
      let placement;
      const label = relationLabel(group);
      const width = label.length * 5.8 + 18;
      for (const offset of [0, -16, 16, -30, 30]) {
        for (const fraction of [.5, .35, .65, .2, .8, .1, .9, .05, .95, .25, .75, .4, .6]) {
          const point = path.getPointAtLength(length * fraction);
          const box = { x: point.x - width / 2, y: point.y - 11 + offset, width, height: 22, anchorX: point.x, anchorY: point.y };
          if (box.x < 2 || box.y < 2 || box.y + box.height > graph.offsetHeight || box.x + width > graph.offsetWidth - 2 || occupied.some(other => intersects(box, other))) continue;
          placement = box;
          break;
        }
        if (placement) break;
      }
      if (!placement) {
        for (const distance of [48, 80, 112]) {
          for (const horizontal of [-distance, distance]) {
            for (const vertical of [0, -24, 24, -48, 48]) {
              for (const fraction of [.5, .25, .75, .1, .9]) {
                const point = path.getPointAtLength(length * fraction);
                const box = { x: point.x - width / 2 + horizontal, y: point.y - 11 + vertical, width, height: 22, anchorX: point.x, anchorY: point.y };
                if (box.x < 2 || box.y < 2 || box.x + width > graph.offsetWidth - 2 || box.y + box.height > graph.offsetHeight || occupied.some(other => intersects(box, other))) continue;
                placement = box;
                break;
              }
              if (placement) break;
            }
            if (placement) break;
          }
          if (placement) break;
        }
      }
      if (!placement) continue;
      occupied.push(placement);
      const description = `${group.displayFrom} → ${group.displayTo}: ${relationLabel(group)}. ${group.links.map(link => `${link.field}: ${link.description}`).join(' ')}`;
      const labelX = placement.x + placement.width / 2;
      const labelY = placement.y + 11;
      const leader = Math.hypot(labelX - placement.anchorX, labelY - placement.anchorY) > 12
        ? `<path class="edge-leader" d="M ${placement.anchorX} ${placement.anchorY} L ${labelX} ${labelY}"/>` : '';
      svg.insertAdjacentHTML('beforeend', `<g class="edge-label${group.index === state.relation ? ' active' : ''}" data-relation="${group.index}" role="button" tabindex="0" aria-label="${escape(description)}"><title>${escape(description)}</title>${leader}<rect x="${placement.x}" y="${placement.y}" width="${placement.width}" height="22" rx="4"></rect><text x="${labelX}" y="${placement.y + 14}" text-anchor="middle">${escape(label)}</text></g>`);
    }
    document.querySelector('#visible-count').textContent = `${graph.querySelectorAll('[data-node]').length} / ${entities.length} types · ${paths.length} links`;
  }
  function connectionList(name, direction) {
    const matching = links.filter(link => link[direction === 'out' ? 'from' : 'to'] === name);
    const grouped = new Map();
    for (const link of matching) {
      const target = direction === 'out' ? link.to : link.from;
      if (!grouped.has(target)) grouped.set(target, []);
      grouped.get(target).push(link);
    }
    return [...grouped].map(([target, refs]) => `<button class="connection-item" data-entity="${target}"><strong>${direction === 'out' ? '→' : '←'} ${target}</strong>${refs.map(link => `<span><code>${escape(link.field)}</code> · ${link.kind === 'extension' ? 'shared-identity extension' : link.kind === 'embedded' ? 'embedded value' : escape(link.description)}</span>`).join('')}</button>`).join('') || '<p class="connection-caveat">No specifically typed references in this direction.</p>';
  }
  function renderDetails() {
    const entity = byName.get(state.selected);
    const isEmbedded = ['SourceSpan', 'PresenceCondition', 'CallCondition'].includes(entity.name);
    const table = entity.markdown.indexOf('|');
    const firstTableEnd = table >= 0 ? entity.markdown.indexOf('\n\n', table) : -1;
    const descriptionEnd = table >= 0 ? table : entity.markdown.length;
    const preface = entity.markdown.slice(0, descriptionEnd).trim();
    const contextNotes = sections.find(section => section.number === entity.section).markdown.split(/^### /m)[0].replace(/^## .+\n/, '').trim();
    let body;
    if (state.detailTab === 'attributes') {
      body = `<div class="identity-note">${isEmbedded ? 'Embedded common structure. No standalone identity is required.' : entity.profile ? `Uses the <code>id</code> of its base ${escape(entity.profile)}. Profile attributes apply only to the permitted base kind.` : 'Every standalone entity has a required <code>id</code>, unique within the dataset. This common field is not repeated in the source tables.'}<br><strong>!</strong> required · <strong>?</strong> optional · absent means unknown.</div><div class="prose">${markdown(entity.markdown)}</div>`;
    } else if (state.detailTab === 'connections') {
      const generic = genericReferences.find(reference => reference[0] === entity.name);
      const genericIncoming = genericReferences.filter(reference => reference[0] !== entity.name);
      body = `<div class="eyebrow">FOLLOW THE REFERENCES</div><div class="relation-heading">Outgoing · this record references</div>${connectionList(entity.name, 'out')}<div class="relation-heading">Incoming · referenced by</div>${connectionList(entity.name, 'in')}${generic ? `<div class="identity-note"><strong>Generic reference:</strong> <code>${generic[1]}</code> may refer to permitted records or areas, not only one entity category. ${generic[2]}</div>` : ''}<div class="connection-caveat"><strong>Cross-cutting records:</strong> ${genericIncoming.map(reference => `<button class="text-button" data-entity="${reference[0]}">${reference[0]}</button>`).join(', ')} also use generic subject, site, or supporting IDs. These are not drawn as all-to-all edges.<br><br>This map is a schema guide, not a graph of program instances. Embedded values and shared-identity extensions are distinguished from standalone records. Read the attribute and kind tables for exact applicability, ordering, and constraints.</div>`;
    } else {
      const remaining = firstTableEnd >= 0 ? entity.markdown.slice(firstTableEnd).trim() : entity.markdown;
      body = `<div class="eyebrow">MEANING & CONSTRAINTS</div><div class="prose">${preface && table >= 0 ? markdown(preface) : ''}${markdown(remaining)}${contextNotes ? `<h3>Layer context</h3>${markdown(contextNotes)}` : ''}</div><button class="text-button" data-section="${entity.section}">Read the full source section →</button><div class="identity-note" style="margin-top:20px">The 20 model invariants apply across all structures.<br><button class="text-button" data-section="12">View integrity invariants →</button></div>`;
    }
    if (!isEmbedded && !entity.profile) {
      body += '<div class="identity-note"><code>semantic_properties</code> is an optional list of contextual analysis results embedded on this node or its edges, without separate IDs.<br><button class="text-button" data-section="3">Read shared property rules</button></div>';
      if (semanticKinds.some(({ from }) => from.includes(entity.name))) {
        body += '<button class="text-button semantic-guide-link" data-view="semantics">Explore direct semantic edges</button>';
      }
    }
    document.querySelector('#details').innerHTML = `<div class="detail-header"><div class="eyebrow"><span class="layer-dot" style="--layer-color:${entity.layer.color}"></span>${entity.layer.name} · §${entity.section}</div><h2>${entity.name}</h2><p>${entity.summary}.</p><span class="pill">${entity.profile ? 'Extension' : isEmbedded ? 'Embedded structure' : 'Standalone entity'}</span><span class="pill">${entity.profile ? `Base: ${entity.profile}` : isEmbedded ? 'No separate ID' : 'Required id'}</span></div><div class="detail-tabs" aria-label="Structure detail views">${[['attributes', 'Attributes'], ['connections', 'Connections'], ['explanation', 'Explanation']].map(([id, label]) => `<button class="detail-tab ${state.detailTab === id ? 'active' : ''}" data-detail="${id}" aria-pressed="${state.detailTab === id}">${label}</button>`).join('')}</div><div class="detail-body">${body}</div>`;
  }
  function selectEntity(name, reveal = false, showDetails = true) {
    if (!byName.has(name)) return;
    state.selected = name;
    state.relation = null;
    if (reveal) {
      state.layer = 'all'; state.query = '';
      document.querySelector('#search').value = '';
    }
    state.detailTab = 'attributes';
    setView('explorer');
    renderGraph(); renderDetails();
    document.querySelector('#details').scrollTop = 0;
    requestAnimationFrame(() => {
      if (showDetails) {
        if (state.expanded) expandMap(false);
        document.querySelector('#details').scrollIntoView({ block: 'start' });
      }
    });
  }
  function setView(view) {
    state.view = view;
    document.querySelectorAll('.view').forEach(section => { section.hidden = section.id !== `${view}-view`; });
    document.querySelectorAll('[data-view]').forEach(button => {
      button.classList.toggle('active', button.dataset.view === view);
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    });
    if (view !== 'explorer' && state.expanded) expandMap(false);
    if (view === 'explorer') requestAnimationFrame(layoutMap);
  }
  function showSection(number) {
    setView('specification');
    requestAnimationFrame(() => document.querySelector(`#section-${number}`)?.scrollIntoView({ block: 'start' }));
  }

  function renderSemanticGuide() {
    const examples = {
      inherits: {
        title: 'Derive from a base type',
        meaning: 'A derived type has a language-defined base type. The source is the derived type symbol; the target is the semantic base TypeExpression, including generic arguments when applicable.',
        code: 'class SceneManager : public ManagerBase {};',
        source: 'symbol:SceneManager', target: 'type:ManagerBase',
        caution: 'Do not infer inheritance from a field type or a same-name method. Visibility and virtual-base information belong to the kind-specific details.'
      },
      implements: {
        title: 'Implement an interface contract', language: 'TypeScript',
        meaning: 'A type implements an interface or equivalent contract under the language rules. This differs from simply storing or using a value of that interface type.',
        code: 'class Renderer implements Renderable {\n  render(): void {}\n}',
        source: 'symbol:Renderer', target: 'type:Renderable',
        caution: 'Use the language-defined distinction between inheritance and implementation. C++ base-class syntax alone does not establish a separate implements relation.'
      },
      overrides: {
        title: 'Override a callable',
        meaning: 'The source callable overrides the target callable under the language rules. Both endpoints are callable symbols, not declarations or function types.',
        code: 'struct Base { virtual void render(); };\nstruct Derived : Base { void render() override; };',
        source: 'symbol:Derived.render', target: 'symbol:Base.render',
        caution: 'A same-name overload or hidden method is not automatically an override. This relationship does not say which method executes.'
      },
      aliases: {
        title: 'Give a type another name',
        meaning: 'A type-alias symbol denotes the target semantic TypeExpression. The written spelling remains in TypeUse and its associated reference.',
        code: 'using FrameId = unsigned int;',
        source: 'symbol:FrameId', target: 'type:unsigned-int',
        caution: 'Use the alias symbol as the source, not a particular variable that happens to use the alias.'
      },
      underlying_type: {
        title: 'Describe an enum representation',
        meaning: 'An enum type symbol has the target TypeExpression as its underlying representation. This is not inheritance or a general expression-to-type binding.',
        code: 'enum class RenderState : unsigned int { ready, done };',
        source: 'symbol:RenderState', target: 'type:unsigned-int',
        caution: 'The enum remains its own symbol and type; the underlying type does not replace that identity.'
      },
      constrains: {
        title: 'Constrain a type parameter', language: 'TypeScript',
        meaning: 'A type parameter is restricted by a target semantic TypeExpression. The source is the type-parameter symbol, not the generic class or an argument supplied at a use site.',
        code: 'function draw<T extends Renderable>(item: T): void {}',
        source: 'symbol:draw.T', target: 'type:Renderable',
        caution: 'Constraint interpretation is language-specific. A constraint is not the selected concrete substitution for the parameter.'
      },
      accessor_for: {
        title: 'Connect an accessor to its property', language: 'TypeScript',
        meaning: 'A getter or setter callable implements access to a property or field symbol. The relation preserves that semantic association separately from callable ownership.',
        code: 'class Frame {\n  get id(): number { return 42; }\n}',
        source: 'symbol:Frame.get-id', target: 'symbol:Frame.id',
        caution: 'A method called get_id is not an accessor merely because of its name. Getter/setter role belongs to kind-specific details.'
      },
      imports_from: {
        title: 'Resolve an import or include',
        meaning: 'An Import record resolves to a project, source file, or symbol, including a source-language module symbol. In the supplied C++ example, main’s using directive targets the Engine namespace symbol.',
        code: 'using namespace Engine;',
        source: 'import:Engine', target: 'symbol:Engine',
        caution: 'Keep import spelling and lookup behavior in Import. An unavailable SDK header does not justify fabricating a resolved SourceFile or project target.'
      },
      reexports_from: {
        title: 'Forward an imported API', language: 'TypeScript',
        meaning: 'An import-like source construct reexports from a resolved project, source file, or symbol. The source endpoint is an Import record, not the exporting project or file.',
        code: 'export { Renderer } from "./rendering";',
        source: 'import:rendering-reexport', target: 'file:rendering',
        caution: 'Use exports for a project, file, or language-module symbol public API link. Reexport resolution and the exported symbol are different facts.'
      },
      exports: {
        title: 'Expose a public API symbol', language: 'TypeScript',
        meaning: 'A project, source file, or source-language module symbol exposes a symbol as part of its public API. The relation can retain an exported name that differs from the symbol’s own name.',
        code: 'export { Renderer as PublicRenderer };',
        source: 'file:rendering', target: 'symbol:Renderer',
        caution: 'The exporting project, file, or language-module symbol is the source and the exported symbol is the target. An export alias does not rename the canonical symbol.'
      },
      captures: {
        title: 'Capture an enclosing symbol',
        meaning: 'A lambda or other callable captures a symbol from its surrounding environment. The capture mode can be value, reference, move, or unknown.',
        code: 'auto render = [&manager]() {\n  manager.update_scene();\n};',
        source: 'symbol:render-lambda', target: 'symbol:manager',
        caution: 'Use the lambda’s introduced callable symbol, not its variable or expression, as the source. Capturing a value does not establish invocation.'
      },
      registers_callback: {
        title: 'Register a callable through a known API',
        meaning: 'A call registers a callable according to an established API contract. The source is the call Expression and the target is the callback’s callable Symbol.',
        code: 'on_frame(render_frame);',
        source: 'expression:on-frame-call', target: 'symbol:render_frame',
        caution: 'This example assumes a known on_frame registration contract. Passing a function or lambda alone is insufficient; preserve the argument and reference without inventing registration or callback execution.'
      }
    };
    const kinds = semanticKinds;
    document.querySelector('#semantic-toc').innerHTML = kinds.map(({ kind }) =>
      `<a href="#semantic-${kind}" data-semantic-kind="${kind}">${escape(kind)}</a>`).join('');
    document.querySelector('#semantic-content').innerHTML = `<div class="eyebrow">${kinds.length} EDGE LABELS · FROM §9 OF THE SPECIFICATION</div><h2>Relationships with explicit meaning.</h2><p>Direct typed edges record semantic facts not fully derivable from the base structure. There are no intermediate relationship nodes or canonical edge IDs. These facts do not predict execution.</p><div class="semantic-rules"><h3>Read every edge the same way</h3><p><strong>Direction:</strong> source node to <code>target_id</code>. The outgoing list determines the uppercase graph label, such as INHERITS. Endpoint categories depend on that label; a type Symbol is not a TypeExpression.</p><p><strong>State:</strong> <code>established</code> records an established relationship; <code>candidate</code> retains a possible relationship. Neither guarantees execution.</p><p><strong>Context:</strong> <code>context_id</code> is required. Optional <code>site_id</code> identifies source syntax, and <code>presence_condition</code> concerns source applicability, not branch execution. Typed <code>details</code> belong to the edge. Additional <code>semantic_properties</code> are optional embedded results that may inherit its context.</p><p><strong>Support:</strong> Evidence identifies the source node and an edge path such as <code>inherits[0]</code>. A nested property has its own path, such as <code>inherits[0].semantic_properties[0]</code>. Coverage retains the same context and assessed path.</p><p><strong>Do not duplicate:</strong> ownership, declarations, operands, HAS_TYPE, references, and selected targets keep their existing representations. Derived component dependencies are not additional canonical edges.</p><button class="text-button" data-section="9">Read semantic edge rules</button> <button class="text-button" data-section="3">Read embedded property rules</button> <button class="text-button" data-section="10">Read derived dependency rules</button></div><p>Except for <code>imports_from</code>, these are independent teaching fragments, not additions to the supplied C++ program. JSON shows source-node excerpts; omitted attributes and hypothetical IDs do not form complete datasets.</p>${kinds.map(({ kind, endpoints, details }, index) => {
      const guide = examples[kind];
      const actual = kind === 'imports_from' ? example?.model.Import.find(record => record.imports_from?.length) : null;
      const edge = actual?.imports_from[0] || { target_id: guide.target, context_id: 'context:guide', state: 'established' };
      const record = { id: actual?.id || guide.source, [kind]: [edge] };
      return `<details class="semantic-kind" id="semantic-${kind}" ${index === 0 ? 'open' : ''}><summary><code>${escape(kind.toUpperCase())}</code><span>${escape(guide.title)}</span></summary><div class="semantic-kind-body"><p class="semantic-endpoints"><strong>Source -> target:</strong> ${inline(endpoints)}</p><p>${escape(guide.meaning)}</p><p><strong>Edge-specific information:</strong> ${inline(details)}</p><div class="semantic-examples"><div><h3>${escape(guide.language || 'C++')} · ${actual ? 'from your walkthrough' : 'illustrative fragment'}</h3><pre class="example-code"><code>${escape(guide.code)}</code></pre></div><div><h3>${actual ? 'Walkthrough source node excerpt' : 'Illustrative source node excerpt'}</h3><pre class="example-code semantic-json"><code>${escape(JSON.stringify(record, null, 2))}</code></pre></div></div><p class="semantic-caution"><strong>Keep the distinction.</strong> ${escape(guide.caution)}</p>${actual ? `<button class="text-button" data-example-id="${escape(actual.id)}">Inspect the source node in the C++ walkthrough</button>` : ''}</div></details>`;
    }).join('')}<button class="text-button" data-section="9">Read all semantic edge definitions</button>`;
  }

  const tour = [
    { title: 'Preserve the source', heading: 'Start with what was actually written.', chain: ['Project', 'SourceFile', 'SourceSpan', 'AnalysisContext', 'AnalysisUnit'],
      text: 'Your C++ example includes three standard headers and defines two classes in namespace Engine. A separate hand-authored CMakeLists.txt teaching descriptor establishes its Project; no build is run. One SourceFile preserves the entire displayed C++ source; SourceSpan points to its UTF-8 byte ranges. AnalysisContext belongs to that project and states C++17. Import records preserve both the includes and main’s using directive.',
      caution: 'Analysis reads this immutable input without transforming it. Embedded-language spans also refer to their containing input. The SDK header contents are not exported; Coverage is explicitly partial.' },
    { title: 'Separate identity & occurrence', heading: 'One symbol. Potentially many declarations.', chain: ['Symbol', 'Declaration', 'AnalysisUnit', 'CallableProfile'],
      text: 'RenderContext’s forward declaration and class definition share one established type symbol. SceneManager::dispatch_render_pass also has one callable symbol but two declaration records: the member declaration and its later qualified definition. TypeProfile describes the classes; CallableProfile and ParameterProfile describe methods and constructors.',
      caution: 'The dispatch definition has the Engine declaration as its syntactic parent, but its symbol belongs to SceneManager. Expressions in the body refer directly to the dispatch declaration. Lookup environments stay internal to the analyzer; no block or lexical-area nodes are required.' },
    { title: 'Keep the call syntax', heading: 'Record the call before resolving it.', chain: ['Expression', 'CallProfile', 'Reference'],
      text: 'make_shared<RenderContext>(42, manager.get()) contains a separate nested get() call as its second argument. active_context_->execute_pipeline() has a member-access callee whose base operand is the active_context_ expression. dispatch_render_pass() is an unqualified member call; its implicit receiver is not an explicit source argument.',
      caution: 'Factory calls remain ordinary calls, not fabricated source constructor invocations. Callee and arguments live only in CallProfile. Semantic receiver conversions belong in binding records, without changing the source expression.' },
    { title: 'Associate types in context', heading: 'Spelling is not a semantic type.', chain: ['Declaration', 'TypeUse', 'TypeExpression', 'Expression'],
      text: 'TypeProfile describes a declared type symbol; TypeExpression describes semantic structures such as shared_ptr<RenderContext> and SceneManager*. TypeUse preserves only their actual spellings and nested uses. Direct HAS_TYPE edges give declarations, expressions, written type uses, and optional symbol summaries contextual types, with no intermediate record. Inferred types do not require a TypeUse. Public C++17 library contracts support this example’s deductions.',
      caution: 'A raw owner_manager_ pointer does not own the SceneManager lifetime. It is also not owner_symbol_id: that field belongs semantically to RenderContext. Reciprocal references and cyclic calls do not imply a shared_ptr ownership cycle.' },
    { title: 'Resolve without guessing', heading: 'A candidate is not a selected target.', chain: ['Reference', 'Resolution', 'Symbol'],
      text: 'The project’s non-virtual members have unique declaration-level targets. Other supported applicable or unknown candidates must remain available as possible dependencies when selection is incomplete. For shared_ptr receivers, the semantic binding records a contract-based conversion. SDK calls remain unsupported even where their public result types are known.',
      caution: 'Only resolved records have selected_target_id. A matching name alone does not establish a possible dependency: unknown candidates need evidence. Inapplicable candidates never produce dependency edges.' },
    { title: 'Derive component dependencies', heading: 'Connect components, not execution paths.', chain: ['Reference', 'Resolution', 'TypeExpression', 'Import', 'ImplementationSet', 'Evidence', 'Coverage'],
      text: 'SceneManager depends on RenderContext through a shared_ptr type and member references; RenderContext refers back through SceneManager* and update_scene. Aggregate these occurrences into component relationships while retaining their supporting records and static contexts. ImplementationSet optionally adds known source definitions, with its own completeness boundary.',
      caution: 'The reciprocal relationships form a permitted structural cycle. A call inside if remains a dependency without proving the branch executes. PresenceCondition describes source applicability, not runtime branching. Neither conformance level requires execution order, path feasibility, or runtime target prediction.' }
  ];
  const example = window.CODE_GRAPH_EXAMPLE;
  const dependencies = example ? window.CODE_GRAPH_DEPENDENCIES(example.model) : null;
  const exampleIds = new Set(example ? Object.values(example.model).flatMap(records => records.map(record => record.id)) : []);
  function embeddedExampleValue(value) {
    if (typeof value === 'string' && exampleIds.has(value)) {
      return `<button class="example-ref" data-example-id="${escape(value)}">${escape(JSON.stringify(value))}</button>`;
    }
    if (Array.isArray(value)) return `[${value.map(embeddedExampleValue).join(', ')}]`;
    if (value && typeof value === 'object') return `{${Object.entries(value).map(([key, child]) => `${escape(JSON.stringify(key))}: ${embeddedExampleValue(child)}`).join(', ')}}`;
    return escape(JSON.stringify(value));
  }
  function exampleValue(value) {
    if (typeof value === 'string' && value === example.code) {
      return `<details class="record-source"><summary>Stored UTF-8 source · ${new TextEncoder().encode(value).length} bytes</summary><code>${escape(value)}</code></details>`;
    }
    if (typeof value === 'string' && exampleIds.has(value)) {
      return `<button class="example-ref" data-example-id="${escape(value)}">${escape(value)}</button>`;
    }
    if (value && typeof value === 'object' && 'file_id' in value && 'start_offset' in value) {
      const snippet = new TextDecoder().decode(new TextEncoder().encode(example.code).slice(value.start_offset, value.end_offset));
      if (snippet.length > 180 || snippet.includes('\n')) {
        return `<code>[${value.start_offset}, ${value.end_offset})</code><details class="record-source"><summary>Source excerpt · ${snippet.trimEnd().split('\n').length} lines</summary><code>${escape(snippet)}</code></details>`;
      }
      return `<code>[${value.start_offset}, ${value.end_offset})</code><span class="source-snippet">${escape(JSON.stringify(snippet))}</span>`;
    }
    return `<code>${embeddedExampleValue(value)}</code>`;
  }
  function renderExample() {
    const target = document.querySelector('#example-result');
    if (!example) {
      target.textContent = 'Example data is missing. Restore example-model.js and reload the page.';
      return;
    }
    const categories = state.exampleScope === 'all' ? Object.keys(example.model) : example.steps[state.tour];
    const ids = state.exampleScope === 'step' ? example.stepRecordIds?.[state.tour] : null;
    const projection = Object.fromEntries(categories.map(name => [name, ids
      ? example.model[name].filter(record => ids.includes(record.id))
      : example.model[name]]));
    const recordCount = Object.values(projection).reduce((sum, records) => sum + records.length, 0);
    target.innerHTML = `<div class="result-header"><div><span class="eyebrow">SOURCE → MODEL RESULT</span><h3>${state.exampleScope === 'all' ? 'All illustrated C++ records' : `Step ${state.tour + 1} · ${tour[state.tour].title}`}</h3><small>${recordCount} records / profile extensions · IDs connect the records across steps</small></div><div class="result-controls"><div class="result-tabs" aria-label="Example result presentation"><button data-example-view="records" aria-pressed="${state.exampleView === 'records'}" class="${state.exampleView === 'records' ? 'active' : ''}">Record cards</button><button data-example-view="json" aria-pressed="${state.exampleView === 'json'}" class="${state.exampleView === 'json' ? 'active' : ''}">JSON</button></div><label>Show <select id="example-scope"><option value="step" ${state.exampleScope === 'step' ? 'selected' : ''}>This step</option><option value="all" ${state.exampleScope === 'all' ? 'selected' : ''}>Full example</option></select></label></div></div><p class="result-note">${escape(example.notes[state.tour])}</p>${state.exampleView === 'json'
      ? `<pre class="result-json"><code>${escape(JSON.stringify(projection, null, 2))}</code></pre>`
      : `<div class="result-records">${Object.entries(projection).map(([name, records]) => `<section class="example-category"><h4><button class="text-button" data-entity="${name}">${name} ↗</button><span>${records.length}</span></h4>${records.map(record => `<article class="example-record ${record.id === state.exampleTarget ? 'highlighted' : ''}" data-example-record="${record.id}"><div class="example-record-heading"><strong>${escape(record.id)}</strong>${profiles[name] ? '<span class="pill">Shared base ID</span>' : ''}</div><dl>${Object.entries(record).filter(([key]) => key !== 'id').map(([key, value]) => `<div><dt>${escape(key)}</dt><dd>${exampleValue(value)}</dd></div>`).join('')}</dl></article>`).join('')}</section>`).join('')}</div>`}<p class="result-boundary"><strong>Illustrative, hand-authored projection — not output from a C++ analyzer.</strong> The collection-based JSON is a teaching serialization, not a mandated storage format or a conformance-certified export. ${state.exampleScope === 'step' ? 'This step focuses on selected records; references resolve in “Full example”. ' : ''}Public C++17 type contracts and incomplete SDK coverage are stated explicitly in Evidence, Coverage, and Diagnostic. Source ranges and fingerprints refer to the unchanged teaching input. Execution analysis is outside scope; no C++ code is executed.</p>`;
  }
  function sourceText(span) {
    return new TextDecoder().decode(new TextEncoder().encode(example.code).slice(span.start_offset, span.end_offset));
  }
  function renderSourceExcerpts() {
    if (!example) return '';
    return `<div class="source-excerpts">${(example.excerpts?.[state.tour] || []).map(excerpt => {
      const prefix = new TextDecoder().decode(new TextEncoder().encode(example.code).slice(0, excerpt.span.start_offset));
      const text = sourceText(excerpt.span);
      const line = prefix.split('\n').length;
      const endLine = line + text.replace(/\n$/, '').split('\n').length - 1;
      return `<div><div class="source-caption"><span>${escape(excerpt.caption)}</span><small>Lines ${line}${endLine !== line ? `–${endLine}` : ''}</small></div><pre class="example-code"><code>${escape(text)}</code></pre></div>`;
    }).join('')}</div><details class="full-source"><summary>Full ${escape(example.filename)} source · ${example.code.trimEnd().split('\n').length} lines</summary><pre class="example-code" id="tour-source"><code>${escape(example.code)}</code></pre><p>${escape(example.sourceNote)}</p></details>`;
  }
  function renderProjectCalls() {
    if (!dependencies || state.tour < 2) return '';
    const { name, byId } = dependencies;
    const memberEdges = dependencies.edges.filter(edge => edge.kind === 'call' && byId.get(edge.to).origin === 'source')
      .sort((a, b) => `${name(a.from)}:${name(a.to)}`.localeCompare(`${name(b.from)}:${name(b.to)}`));
    const rows = state.dependencyView === 'members' ? `<ul class="dependency-list">${memberEdges.map(edge => {
      const site = edge.supporting_ids.find(id => byId.get(id)?.category === 'Expression');
      const conditional = example.conditionalCalls.find(record => record.call_id === site);
      return `<li><button class="project-call ${edge.certainty === 'possible' ? 'possible-dependency' : ''}" data-example-id="${escape(site)}"><span class="dependency-mark" aria-hidden="true">↗</span><span><code>${escape(name(edge.from))}()</code><span class="project-arrow">→</span><code>${escape(name(edge.to))}()</code><small>${edge.certainty === 'selected' ? 'Selected declaration-level target' : 'Supported possible target'} · candidate scope: ${escape(edge.candidate_set_completeness)}${conditional ? ` · inside source if (${escape(sourceText(byId.get(conditional.condition_expression_id).span))}); execution not assessed` : ''}</small></span></button></li>`;
    }).join('')}</ul>` : `<div class="component-dependencies">${dependencies.components.map(group => {
      const supporting = [...new Set(group.occurrences.flatMap(edge => edge.supporting_ids))];
      const possible = group.occurrences.filter(edge => edge.certainty === 'possible').length;
      const conditional = group.occurrences.some(edge => example.conditionalCalls.some(record => edge.supporting_ids.includes(record.call_id)));
      return `<details class="dependency-group"><summary><code>${escape(name(group.from))}</code><span class="project-arrow">→</span><code>${escape(name(group.to))}</code><small>${group.occurrences.length} supporting relationships${possible ? ` · ${possible} possible` : ''}${conditional ? ' · includes conditional source sites' : ''}</small></summary><p>Static contexts: ${group.context_ids.map(exampleValue).join(', ')}. Kinds: ${escape([...new Set(group.occurrences.map(edge => edge.kind))].join(', '))}. Certainty is retained per occurrence, not collapsed into a universal runtime claim.</p><ul class="dependency-evidence">${group.occurrences.map(edge => `<li><strong>${escape(edge.kind)} · ${escape(edge.certainty)}</strong>${edge.candidate_set_completeness ? ` · candidate scope: ${escape(edge.candidate_set_completeness)}` : ''}${edge.presence_conditions.length ? ` · source applicability: ${escape(JSON.stringify(edge.presence_conditions))}` : ''}<div>${edge.supporting_ids.map(exampleValue).join(' ')}</div></li>`).join('')}</ul><p>${supporting.length} distinct supporting records retained. Context aggregation does not imply simultaneous applicability.</p></details>`;
    }).join('')}</div>`;
    const unknownCalls = example.model.Resolution.filter(record => byId.get(record.subject_id).category === 'Expression' && record.state !== 'resolved');
    return `<section class="project-call-graph"><div class="eyebrow">DERIVED STRUCTURAL DEPENDENCIES</div><h3>Components connected by source evidence.</h3><p>These are derived views, not additional canonical semantic edges or execution steps. Expand a component relationship or click a member reference to inspect its supporting records.</p><div class="result-tabs" aria-label="Dependency presentation"><button data-dependency-view="components" aria-pressed="${state.dependencyView === 'components'}" class="${state.dependencyView === 'components' ? 'active' : ''}">Components</button><button data-dependency-view="members" aria-pressed="${state.dependencyView === 'members'}" class="${state.dependencyView === 'members' ? 'active' : ''}">Member references</button></div>${rows}<div class="cycle-note"><strong>Established ≠ possible ≠ inapplicable.</strong> Selected targets establish declaration-level links. Other supported applicable or unknown candidates remain possible; inapplicable candidates are excluded. Conditional relationships and structural cycles do not establish branch execution, execution order, or runtime state.</div><p><strong>Unresolved SDK boundary:</strong> ${unknownCalls.map(record => exampleValue(record.id)).join(' ')}. No unsupported overload or unnamed runtime target is invented.</p><button class="text-button" data-section="10">Read the exact derivation rules →</button></section>`;
  }
  function renderTour() {
    const step = tour[state.tour];
    document.querySelector('#tour-steps').innerHTML = tour.map((item, index) => `<li><button class="step-button ${index === state.tour ? 'active' : ''}" data-step="${index}" aria-current="${index === state.tour ? 'step' : 'false'}"><span class="step-number">${index + 1}</span>${item.title}</button></li>`).join('');
    document.querySelector('#tour-content').innerHTML = `<div class="eyebrow">STEP ${String(state.tour + 1).padStart(2, '0')} / ${tour.length} · ${step.title}</div><h2>${step.heading}</h2><div class="eyebrow">${escape(example?.filename || 'SOURCE EXAMPLE')} · FOCUSED EXCERPTS FROM YOUR C++ CODE</div>${renderSourceExcerpts()}<p>${step.text}</p><div class="tour-chain">${step.chain.map((name, index) => `${index ? '<span class="tour-arrow" aria-hidden="true">→</span>' : ''}<button class="tour-entity" data-entity="${name}">${name}</button>`).join('')}</div><small class="connection-caveat">Conceptual learning sequence, not literal stored edges. The result below shows the actual record-to-record references.</small><div id="example-result" class="example-result"></div>${renderProjectCalls()}<div class="tour-caution"><strong>Keep this distinction.</strong><br>${step.caution}</div>${state.tour === tour.length - 1 ? '<div class="prose"><h3>Two levels, explicit boundaries</h3><p><strong>Syntactic:</strong> preserved source structure with unknown semantic results.<br><strong>Semantic:</strong> established identities, types, known and possible targets, relations, and evidence — the target level for component dependencies.<br>Neither level requires execution-path analysis or runtime target prediction. ImplementationSet is optional source-level information.</p><button class="text-button" data-section="14">Read the exact conformance requirements →</button></div>' : ''}<div class="tour-actions"><button class="secondary-button" data-tour-move="-1" ${state.tour === 0 ? 'disabled' : ''}>← Previous</button>${state.tour < tour.length - 1 ? '<button class="primary-button" data-tour-move="1">Next step →</button>' : '<button class="primary-button" data-view="explorer">Explore the model →</button>'}</div>`;
    renderExample();
  }

  document.querySelector('#entity-count').textContent = entities.length;
  document.querySelector('#all-count').textContent = entities.length;
  document.querySelector('#layer-list').innerHTML = layers.map(layer => `<button class="layer-button" data-layer="${layer.id}" aria-pressed="false"><span class="layer-name"><span class="layer-dot" style="--layer-color:${layer.color}"></span>${layer.name}</span><span class="count">${entities.filter(entity => entity.layer.id === layer.id).length}</span></button>`).join('');
  document.querySelector('#spec-toc').innerHTML = sections.map(section => `<a href="#section-${section.number}" data-section="${section.number}">${String(section.number).padStart(2, '0')} · ${escape(section.title)}</a>`).join('');
  document.querySelector('#spec-content').innerHTML = markdown(source);
  renderSemanticGuide();
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-relation],button,a');
    if (!target) return;
    if (target.dataset.relation !== undefined) {
      state.relation = Number(target.dataset.relation);
      renderRelationInfo();
      document.querySelectorAll('.relation-badge').forEach(badge => badge.classList.toggle('active', Number(badge.dataset.relation) === state.relation));
      requestAnimationFrame(() => { layoutMap(); document.querySelector('#relation-info').scrollIntoView({ block: 'nearest' }); });
    }
    else if (target.dataset.dependencyView) {
      state.dependencyView = target.dataset.dependencyView;
      document.querySelector('.project-call-graph').outerHTML = renderProjectCalls();
    }
    else if (target.dataset.exampleView) { state.exampleView = target.dataset.exampleView; renderExample(); }
    else if (target.dataset.exampleId) {
      state.exampleScope = 'all'; state.exampleView = 'records'; state.exampleTarget = target.dataset.exampleId;
      setView('walkthrough');
      renderExample();
      document.querySelector(`[data-example-record="${state.exampleTarget}"]`)?.scrollIntoView({ block: 'nearest' });
    }
    else if (target.dataset.semanticKind) {
      event.preventDefault();
      const card = document.querySelector(`#semantic-${target.dataset.semanticKind}`);
      card.open = true;
      card.scrollIntoView({ block: 'start' });
      card.querySelector('summary').focus();
    }
    else if (target.dataset.entity) { event.preventDefault(); selectEntity(target.dataset.entity, true); }
    else if (target.dataset.node) selectEntity(target.dataset.node, false, false);
    else if (target.dataset.view) setView(target.dataset.view);
    else if (target.dataset.layer) { state.layer = target.dataset.layer; renderGraph(); }
    else if (target.dataset.mapMode) { state.mapMode = target.dataset.mapMode; renderGraph(); }
    else if (target.dataset.detail) { state.detailTab = target.dataset.detail; renderDetails(); }
    else if (target.dataset.section) { event.preventDefault(); showSection(Number(target.dataset.section)); }
    else if (target.dataset.step) { state.tour = Number(target.dataset.step); renderTour(); }
    else if (target.dataset.tourMove) { state.tour = Math.max(0, Math.min(tour.length - 1, state.tour + Number(target.dataset.tourMove))); renderTour(); }
    else if (target.id === 'start-tour') { setView('walkthrough'); renderTour(); }
    else if (target.id === 'show-dependencies') { state.tour = 5; setView('walkthrough'); renderTour(); }
    else if (target.id === 'read-principles') showSection(2);
    else if (target.id === 'close-relation') {
      state.relation = null; renderRelationInfo();
      document.querySelectorAll('.relation-badge').forEach(badge => badge.classList.remove('active'));
      requestAnimationFrame(layoutMap);
    }
    else if (target.id === 'view-attributes') {
      if (state.expanded) expandMap(false);
      requestAnimationFrame(() => document.querySelector('#details').scrollIntoView({ block: 'start' }));
    }
    else if (target.id === 'fit-map') {
      fitMap();
      if (!state.expanded) document.querySelector('.map-area').scrollIntoView({ block: 'start' });
    }
    else if (target.id === 'expand-map') expandMap(!state.expanded);
    else if (target.id === 'zoom-in' || target.id === 'zoom-out') {
      state.fit = false;
      const viewport = document.querySelector('.graph-scroll');
      const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / state.zoom;
      const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / state.zoom;
      state.zoom = Math.max(.15, Math.min(2, state.zoom * (target.id === 'zoom-in' ? 1.2 : 1 / 1.2)));
      document.querySelector('.map-area').classList.add('fitted');
      requestAnimationFrame(() => { layoutMap(); viewport.scrollTo(centerX * state.zoom - viewport.clientWidth / 2, centerY * state.zoom - viewport.clientHeight / 2); });
    }
    else if (target.id === 'reset-map' || target.classList.contains('brand')) {
      event.preventDefault(); state.layer = 'all'; state.query = ''; state.neighbors = false; state.zoom = 1; state.fit = false;
      document.querySelector('.map-area').classList.remove('fitted');
      document.querySelector('#search').value = '';
      document.querySelector('#neighbors-only').checked = false;
      state.mapMode = 'structure';
      selectEntity('Project', true, false);
      resetMapPosition();
      if (state.expanded) fitMap();
    }
  });
  document.querySelector('#search').addEventListener('input', event => { state.query = event.target.value.trim().toLowerCase(); renderGraph(); });
  document.querySelector('#neighbors-only').addEventListener('change', event => { state.neighbors = event.target.checked; renderGraph(); });
  document.addEventListener('change', event => {
    if (event.target.id === 'example-scope') { state.exampleScope = event.target.value; renderExample(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.expanded) {
      expandMap(false); document.querySelector('#expand-map').focus(); return;
    }
    if (event.key === 'Tab' && state.expanded) {
      const controls = [...document.querySelector('.workspace').querySelectorAll('button,input,a,select,[tabindex="0"]')].filter(element => element.getClientRects().length && !element.disabled);
      const index = controls.indexOf(document.activeElement);
      if (index === -1 || (event.shiftKey && index === 0) || (!event.shiftKey && index === controls.length - 1)) {
        event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
      }
    }
    if (['Enter', ' '].includes(event.key) && event.target.matches('g[data-relation]')) {
      event.preventDefault(); event.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); return;
    }
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      event.preventDefault(); setView('explorer'); document.querySelector('#search').focus();
    }
    if (event.key === 'Escape' && document.activeElement === document.querySelector('#search')) {
      state.query = ''; document.querySelector('#search').value = ''; renderGraph();
    }
  });
  const mapObserver = new ResizeObserver(() => requestAnimationFrame(layoutMap));
  mapObserver.observe(document.querySelector('#graph-groups'));
  mapObserver.observe(document.querySelector('.graph-scroll'));
  renderGraph(); renderDetails(); renderTour();
  resetMapPosition();
  const initialSection = location.hash.match(/^#section-(\d+)$/);
  if (initialSection) showSection(Number(initialSection[1]));
  if (location.hash === '#semantics') setView('semantics');
})();
