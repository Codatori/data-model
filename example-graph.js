(() => {
  'use strict';

  // Relations that start hidden and stay out of the layout: bookkeeping, not code structure.
  const BOOKKEEPING = new Set(['EVIDENCE_SOURCE', 'SUPPORTED_BY', 'ABOUT', 'REPORTED_IN', 'LOCATED_IN', 'RELATED_TO', 'RELATED_LOCATION']);
  const FILE_ANCHORED = new Set(['CONSISTS_OF', 'IMPORTS', 'ANNOTATES']);
  // Specification section 9: outgoing semantic-edge lists, labelled by their uppercase list name.
  const SEMANTIC_LISTS = ['inherits', 'implements', 'overrides', 'aliases', 'underlying_type', 'constrains',
    'accessor_for', 'imports_from', 'exports', 'captures', 'registers_callback'];
  const TYPE_RELATIONS = {
    symbol_id: 'REFERS_TO', element_type_id: 'HAS_ELEMENT_TYPE', generic_type_id: 'APPLIES_GENERIC',
    bound_type_id: 'HAS_BOUND_TYPE', return_type_id: 'RETURNS_TYPE', defining_expression_id: 'DEFINED_BY'
  };
  const TYPE_LIST_RELATIONS = {
    parameter_type_ids: 'HAS_PARAMETER_TYPE', component_type_ids: 'HAS_COMPONENT_TYPE',
    dimension_expression_ids: 'HAS_DIMENSION_EXPRESSION', dependency_ids: 'DEPENDS_ON'
  };
  // Only parameter, tuple-component and dimension entries carry a semantic position.
  const POSITIONED = new Set(['HAS_PARAMETER_TYPE', 'HAS_DIMENSION_EXPRESSION']);
  // Cross-layer provenance starts hidden, like evidence in the Code Facts view.
  const SEMANTIC_HIDDEN = new Set(['DERIVED_FROM']);
  // Node size follows structural rank: Repository > Project > Directory > File/Resource > Declaration > Symbol > other facts.
  const NODE_RADIUS = {
    Repository: 20, Project: 16, ExternalLibrary: 13, Directory: 13, ProjectFile: 10.5, Resource: 10.5,
    Module: 9, Namespace: 9, Declaration: 8, Unit: 8, Symbol: 6.5, Member: 6.5, default: 4.5
  };
  const without = (value, ...keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
  const SPAN_LABELED = new Set(['Expression', 'Declaration', 'TypeUse', 'Import', 'Annotation']);
  const view = document.querySelector('#example-view');
  if (!view) return;
  const esc = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

  const canvas = view.querySelector('#eg-canvas');
  const panel = view.querySelector('#eg-panel');
  const legend = view.querySelector('#eg-legend');
  const tip = view.querySelector('#eg-tip');
  const relations = view.querySelector('#eg-relations');
  const source = view.querySelector('#eg-source');
  const search = view.querySelector('#eg-search');
  const searchCount = view.querySelector('#eg-search-count');
  let graph = null, builtFor = null, selection = null, mode = 'code';
  let svg, root, nodeSel, edgeSel, zoom, simulation;
  const hiddenCategories = new Set(), hiddenTypes = new Set(), hiddenNodes = new Set(), collapsed = new Set();

  function buildGraph(example, mode) {
    let envelope = null;
    const decoder = new TextDecoder();
    const files = new Map(example.model.ProjectFile.map(file => [file.id, new TextEncoder().encode(example.externalContent[file.content_ref] ?? '')]));
    const snippet = span => decoder.decode((files.get(span.file_id) || new Uint8Array()).slice(span.start_offset, span.end_offset)).replace(/\s+/g, ' ').trim();
    const nodes = new Map();
    for (const [category, records] of Object.entries(example.model)) {
      for (const record of records) nodes.set(record.id, { id: record.id, category, record, profiles: [] });
    }
    for (const node of nodes.values()) {
      const record = node.record;
      let label = record.name || record.builtin_name;
      if (!label && node.category.endsWith('Profile') && nodes.has(record.symbol_id)) {
        label = `${nodes.get(record.symbol_id).record.name} · ${node.category.replace('Profile', '').toLowerCase()}`;
      }
      if (!label && SPAN_LABELED.has(node.category)) {
        const span = record.name_span || record.span;
        if (span) label = snippet(span);
      }
      if (!label) label = node.id.slice(node.id.indexOf(':') + 1);
      node.label = label.length > 26 ? `${label.slice(0, 25)}…` : label;
    }
    const edges = [];
    const seen = new Set();
    function addEdge(from, to, type, container, hub, state, discriminator = '') {
      if (!from || from.id === to || !nodes.has(to)) return;
      const key = `${from.id}|${to}|${type}|${discriminator}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ id: edges.length, from, to: nodes.get(to), type, detail: container, hub, state });
    }
    if (mode === 'semantic') {
      // Semantic Code Graph (spec section 15): shared structure plus projected nodes; DERIVED_FROM reaches the supporting Symbols.
      const projection = window.CODE_GRAPH_SEMANTIC_PROJECTION(example);
      const keep = new Set(['Repository', 'Project', 'Directory', 'ProjectFile', 'Resource']);
      for (const [id, node] of nodes) if (!keep.has(node.category) && node.category !== 'Symbol') nodes.delete(id);
      const symbolNodes = [...nodes.values()].filter(node => node.category === 'Symbol');
      symbolNodes.forEach(node => nodes.delete(node.id));
      for (const [category, records] of Object.entries(projection.nodes)) {
        for (const record of records) {
          const name = record.qualified_name || record.name;
          nodes.set(record.id, { id: record.id, category, record, profiles: [], label: name.length > 40 ? `${name.slice(0, 39)}…` : name });
        }
      }
      const supporting = new Set(projection.relationships.filter(edge => edge.type === 'DERIVED_FROM').map(edge => edge.target_id));
      symbolNodes.filter(node => supporting.has(node.id)).forEach(node => nodes.set(node.id, node));
      for (const edge of projection.relationships) {
        const detail = Object.fromEntries(Object.entries(edge).filter(([key]) => !['source_id', 'type', 'target_id'].includes(key)));
        addEdge(nodes.get(edge.source_id), edge.target_id, edge.type, detail, SEMANTIC_HIDDEN.has(edge.type), edge.state, JSON.stringify(detail));
      }
      envelope = projection.envelope;
    } else {
      // Code Facts: every edge is a named relationship from the specification, not a raw field name.
      const stateOf = value => value === 'candidate' || value === 'rejected' ? 'candidate' : 'established';
      // Distinct occurrences of one relationship (positions, predicate paths, evidence keys) stay separate edges.
      const link = (from, to, type, detail) => {
        if (typeof from === 'string') from = nodes.get(from);
        if (!from || !to) return;
        addEdge(from, to, type, detail ?? null, BOOKKEEPING.has(type) || FILE_ANCHORED.has(type) && from.category === 'ProjectFile',
          stateOf(detail?.state), detail ? JSON.stringify(detail) : '');
      };
      // A condition tree keeps its shape as a scalar predicate; each expression leaf becomes CONDITION_EXPRESSION at its JSON Pointer.
      const predicateOf = predicate => !predicate || typeof predicate !== 'object' ? predicate : Array.isArray(predicate)
        ? predicate.map(predicateOf) : Object.fromEntries(Object.entries(without(predicate, 'expression_id')).map(([key, child]) => [key, predicateOf(child)]));
      const conditionOf = condition => condition
        ? { condition_predicate: JSON.stringify(predicateOf(condition.predicate)), condition_completeness: condition.completeness } : {};
      const conditionLinks = (node, condition, extra = {}) => {
        const walk = (predicate, path) => {
          if (!predicate) return;
          if (predicate.kind === 'expression') link(node, predicate.expression_id, 'CONDITION_EXPRESSION', { ...extra, predicate_path: path });
          walk(predicate.predicate, `${path}/predicate`);
          (predicate.predicates || []).forEach((child, index) => walk(child, `${path}/predicates/${index}`));
        };
        walk(condition?.predicate, '');
      };
      const conversions = (node, list, keys) => (list || []).forEach((conversion, conversion_position) => {
        const detail = { ...keys, conversion_position, conversion_kind: conversion.conversion_kind ?? conversion.kind,
          conversion_state: conversion.conversion_state ?? conversion.state };
        link(node, conversion.source_type_id, 'CONVERTS_FROM', detail);
        link(node, conversion.target_type_id, 'CONVERTS_TO', detail);
      });
      // Portable type_substitutions: a list of {parameter_id, type_id | expression_id} or a parameter-to-value map.
      const substitutions = value => Array.isArray(value) ? value
        : Object.entries(value || {}).map(([parameter_id, target]) => ({ parameter_id, [nodes.get(target)?.category === 'Expression' ? 'expression_id' : 'type_id']: target }));
      const invocation = (node, entry, target_position) => {
        const context = { target_position, ...(entry.project_id ? { project_id: entry.project_id } : {}) };
        link(node, entry.target_id, 'INVOKES', { ...without(entry, 'target_id', 'receiver_binding', 'argument_bindings',
          'type_substitutions', 'conversions', 'condition'), ...conditionOf(entry.condition), target_position });
        conditionLinks(node, entry.condition, context);
        const receiver = entry.receiver_binding;
        if (receiver) {
          link(node, receiver.expression_id, 'HAS_RECEIVER_BINDING', context);
          link(node, receiver.parameter_id, 'BINDS_RECEIVER', context);
          conversions(node, receiver.conversions, { ...context, binding_key: 'receiver' });
        }
        (entry.argument_bindings || []).forEach((binding, binding_position) => {
          link(node, binding.parameter_id, 'BINDS_ARGUMENT', { ...context, binding_position, argument_positions: binding.argument_positions });
          link(node, binding.default_expression_id, 'USES_DEFAULT', { ...context, binding_position });
          conversions(node, binding.conversions, { ...context, binding_key: `argument:${binding_position}` });
        });
        substitutions(entry.type_substitutions).forEach((substitution, substitution_position) => {
          const detail = { ...context, substitution_position };
          link(node, substitution.parameter_id, 'SUBSTITUTES_PARAMETER', detail);
          link(node, substitution.type_id, 'SUBSTITUTES_TYPE', detail);
          link(node, substitution.expression_id, 'SUBSTITUTES_VALUE', detail);
        });
        conversions(node, entry.conversions, { ...context, binding_key: 'candidate' });
      };
      for (const node of nodes.values()) {
        const record = node.record, category = node.category;
        for (const entry of record.has_type || []) link(node, entry.target_id, 'HAS_TYPE', without(entry, 'target_id'));
        for (const entry of record.refers_to || []) link(node, entry.target_id, 'REFERS_TO', without(entry, 'target_id'));
        for (const list of SEMANTIC_LISTS) for (const entry of record[list] || []) link(node, entry.target_id, list.toUpperCase(), without(entry, 'target_id'));
        (record.invokes || []).forEach((entry, position) => invocation(node, entry, position));
        for (const entry of record.possible_implementation || []) link(node, entry.target_id, 'POSSIBLE_IMPLEMENTATION', without(entry, 'target_id'));
        for (const entry of record.evidence || []) {
          entry.source_spans.forEach((span, position) => link(node, span.file_id, 'EVIDENCE_SOURCE', { evidence_key: entry.key, position, span }));
          for (const support of entry.supports) link(node, support.subject_id, 'SUPPORTED_BY',
            { evidence_key: entry.key, ...(support.attribute_path ? { supporting_path: support.attribute_path } : {}) });
        }
        if (category.endsWith('Profile')) link(record.symbol_id, node.id, 'HAS_PROFILE');
        (record.parameter_ids || []).forEach((id, position) => link(node, id, 'HAS_PARAMETER', { position }));
        (record.type_parameter_ids || []).forEach((id, position) => link(node, id, 'HAS_TYPE_PARAMETER', { position }));
        if (category === 'Symbol') link(record.owner_symbol_id, node.id, 'OWNS');
        if (category === 'Declaration') {
          link(record.symbol_id, node.id, 'HAS_DECLARATION');
          link(record.file_id, node.id, 'CONSISTS_OF');
          link(record.parent_declaration_id, node.id, 'CONTAINS_DECLARATION');
          link(node, record.initializer_expression_id, 'HAS_INITIALIZER');
        }
        if (category === 'TypeExpression') {
          for (const [field, type] of Object.entries(TYPE_RELATIONS)) link(node, record[field], type);
          for (const [field, type] of Object.entries(TYPE_LIST_RELATIONS)) (record[field] || []).forEach((id, position) =>
            link(node, id, type, POSITIONED.has(type) || type === 'HAS_COMPONENT_TYPE' && record.kind === 'tuple' ? { position } : null));
          // Type, value and template arguments share one position sequence per generic application.
          (record.arguments || []).forEach((argument, position) => {
            link(node, argument.type_id, 'HAS_TYPE_ARGUMENT', { position });
            link(node, argument.expression_id, 'HAS_VALUE_ARGUMENT', { position });
            link(node, argument.symbol_id || argument.template_symbol_id, 'HAS_TEMPLATE_ARGUMENT', { position });
          });
        }
        if (category === 'TypeUse') {
          const owner = nodes.get(record.subject_id);
          link(owner, node.id, owner?.category === 'Declaration' ? 'CONSISTS_OF' : 'HAS_TYPE_USE',
            { role: record.role, ...(record.position !== undefined ? { position: record.position } : {}) });
          link(record.span.file_id, node.id, 'CONSISTS_OF');
        }
        if (category === 'Expression') {
          link(record.file_id, node.id, 'CONSISTS_OF');
          link(record.declaration_id, node.id, 'CONTAINS_EXPRESSION');
          (record.operands || []).forEach((operand, position) => link(node, operand.expression_id, 'HAS_OPERAND', { role: operand.role, position }));
          link(node, record.callee_expression_id, 'HAS_CALLEE');
          (record.arguments || []).forEach((argument, position) =>
            link(node, argument.expression_id, 'HAS_ARGUMENT', { position, ...without(argument, 'expression_id') }));
          conditionLinks(node, record.condition);
          link(node, record.introduced_symbol_id, 'INTRODUCES');
        }
        if (category === 'Import') {
          link(record.file_id, node.id, 'IMPORTS');
          link(record.declaration_id, node.id, 'CONTAINS_IMPORT');
          link(node, record.path_expression_id, 'HAS_SOURCE_EXPRESSION');
          link(node, record.import_expression_id, 'HAS_IMPORT_EXPRESSION');
          for (const entry of record.introduces || []) link(node, entry.target_id, 'INTRODUCES', without(entry, 'target_id'));
        }
        if (category === 'Annotation') {
          // A same-file target is file_targets on the incoming file edge; declaration targets are outgoing ANNOTATES edges.
          const targets = record.targets || [];
          const fileTargets = targets.filter(target => target.target_id === record.file_id).map(target => without(target, 'target_id'));
          link(record.file_id, node.id, 'ANNOTATES', fileTargets.length ? { file_targets: fileTargets } : null);
          link(record.declaration_id, node.id, 'CONTAINS_ANNOTATION');
          for (const target of targets) if (target.target_id !== record.file_id) link(node, target.target_id, 'ANNOTATES', without(target, 'target_id'));
          (record.arguments || []).forEach((argument, position) =>
            link(node, argument.expression_id, 'HAS_ARGUMENT', { position, ...without(argument, 'expression_id') }));
          link(node, record.application_expression_id, 'HAS_APPLICATION_EXPRESSION');
        }
        if (category === 'Diagnostic') {
          link(node, record.subject_id, 'ABOUT', record.attribute_path ? { attribute_path: record.attribute_path } : null);
          link(node, record.project_id, 'REPORTED_IN');
          if (record.span) link(node, record.span.file_id, 'LOCATED_IN', { span: record.span });
          for (const related of record.related_subjects || []) link(node, related.subject_id, 'RELATED_TO', without(related, 'subject_id'));
          (record.related_spans || []).forEach((related, position) => link(node, related.span.file_id, 'RELATED_LOCATION', { position, ...related }));
        }
      }
      for (const rel of example.relationships) link(rel.source_id, rel.target_id, rel.type, without(rel, 'source_id', 'type', 'target_id'));
    }
    const pairs = new Map();
    for (const edge of edges) {
      const key = [edge.from.id, edge.to.id].sort().join('|');
      pairs.set(key, [...(pairs.get(key) || []), edge]);
    }
    for (const group of pairs.values()) {
      group.forEach((edge, index) => { edge.offset = (index - (group.length - 1) / 2) * 22 * (edge.from.id < edge.to.id ? 1 : -1); });
    }
    for (const node of nodes.values()) node.r = NODE_RADIUS[node.category] ?? NODE_RADIUS.default;
    const categories = [...new Set([...nodes.values()].map(node => node.category))];
    const color = d3.scaleOrdinal().domain(categories).range(categories.map((_, index) => d3.hcl(index * 360 / categories.length, 48, 62).formatHex()));
    for (const node of nodes.values()) node.color = color(node.category);
    const types = [...d3.rollup(edges, group => group.length, edge => edge.type).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { mode, envelope, example, nodes, edges, categories, types: types.map(([type]) => type), typeCounts: new Map(types), snippet };
  }

  // A static layout is computed up front so the picture does not jitter on open.
  function layout() {
    const list = [...graph.nodes.values()];
    const centers = new Map(graph.categories.map((category, index) => {
      const angle = index / graph.categories.length * 2 * Math.PI;
      return [category, { x: Math.cos(angle) * 520, y: Math.sin(angle) * 520 }];
    }));
    simulation?.stop();
    simulation = d3.forceSimulation(list)
      .force('link', d3.forceLink(graph.edges.filter(edge => !edge.hub).map(edge => ({ source: edge.from, target: edge.to })))
        .id(node => node.id).distance(90).strength(.3))
      .force('charge', d3.forceManyBody().strength(-300).distanceMax(500))
      .force('collide', d3.forceCollide(node => node.r + 12))
      .force('x', d3.forceX(node => centers.get(node.category).x).strength(.03))
      .force('y', d3.forceY(node => centers.get(node.category).y).strength(.03))
      .stop();
    simulation.tick(360);
  }

  function edgePath(edge) {
    const a = edge.from, b = edge.to;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const cx = (a.x + b.x) / 2 - dy / d * edge.offset, cy = (a.y + b.y) / 2 + dx / d * edge.offset;
    const unit = (x, y) => { const length = Math.hypot(x, y) || 1; return [x / length, y / length]; };
    const [sx, sy] = unit(cx - a.x, cy - a.y), [tx, ty] = unit(b.x - cx, b.y - cy);
    return `M${(a.x + sx * a.r).toFixed(1)} ${(a.y + sy * a.r).toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${(b.x - tx * (b.r + 3)).toFixed(1)} ${(b.y - ty * (b.r + 3)).toFixed(1)}`;
  }
  const placeNodes = () => nodeSel.attr('transform', node => `translate(${node.x.toFixed(1)} ${node.y.toFixed(1)})`);
  const placeEdges = () => {
    edgeSel.selectAll('path').attr('d', edgePath);
    edgeSel.select('.eg-edge-label').attr('x', edge => edgeMid(edge)[0]).attr('y', edge => edgeMid(edge)[1]);
  };
  function edgeMid(edge) {
    const a = edge.from, b = edge.to;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const cx = (a.x + b.x) / 2 - dy / d * edge.offset, cy = (a.y + b.y) / 2 + dx / d * edge.offset;
    return [(a.x + 2 * cx + b.x) / 4, (a.y + 2 * cy + b.y) / 4];
  }

  function draw() {
    d3.select(canvas).select('svg').remove();
    svg = d3.select(canvas).insert('svg', ':first-child').attr('class', 'eg-svg').attr('role', 'group')
      .attr('aria-label', 'Graph of every record and reference in the example');
    const defs = svg.append('defs');
    for (const [id, cls] of [['eg-arrow', 'eg-arrow'], ['eg-arrow-on', 'eg-arrow-on']]) {
      defs.append('marker').attr('id', id).attr('viewBox', '0 0 8 8').attr('refX', 7).attr('refY', 4)
        .attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto')
        .append('path').attr('d', 'M0 0 L8 4 L0 8 z').attr('class', cls);
    }
    root = svg.append('g');
    zoom = d3.zoom().scaleExtent([.08, 8]).on('zoom', event => { root.attr('transform', event.transform); tip.hidden = true; });
    svg.call(zoom).on('dblclick.zoom', null).on('click', () => select(null));

    edgeSel = root.append('g').selectAll('g').data(graph.edges).join('g').attr('class', 'eg-edge')
      .on('click', (event, edge) => { event.stopPropagation(); select({ type: 'edge', id: edge.id }); })
      .on('mousemove', (event, edge) => showTip(event, edge))
      .on('mouseleave', () => { tip.hidden = true; });
    edgeSel.append('path').attr('class', 'eg-line').attr('marker-end', 'url(#eg-arrow)');
    edgeSel.append('path').attr('class', 'eg-hit');
    if (graph.mode === 'semantic') {
      edgeSel.classed('possible', edge => edge.state && edge.state !== 'established');
      edgeSel.append('text').attr('class', 'eg-edge-label').attr('text-anchor', 'middle').text(edge => edge.type);
    }

    nodeSel = root.append('g').selectAll('g').data([...graph.nodes.values()]).join('g').attr('class', 'eg-node')
      .attr('tabindex', 0).attr('role', 'button').attr('aria-label', node => `${node.category} ${node.label}`)
      .on('click', (event, node) => { event.stopPropagation(); select({ type: 'node', id: node.id }); })
      .on('dblclick', (event, node) => { event.stopPropagation(); toggleRelated(node); })
      .on('keydown', (event, node) => {
        if (['Enter', ' '].includes(event.key)) { event.preventDefault(); select({ type: 'node', id: node.id }); }
      })
      .call(d3.drag()
        .on('start', event => { if (!event.active) simulation.alphaTarget(.2).restart(); event.subject.fx = event.subject.x; event.subject.fy = event.subject.y; })
        .on('drag', event => { event.subject.fx = event.x; event.subject.fy = event.y; })
        .on('end', event => { if (!event.active) simulation.alphaTarget(0); event.subject.fx = null; event.subject.fy = null; }));
    nodeSel.append('circle').attr('r', node => node.r).attr('fill', node => node.color);
    nodeSel.append('text').attr('y', node => node.r + 10).attr('text-anchor', 'middle').text(node => node.label);

    simulation.on('tick', () => { placeNodes(); placeEdges(); });
    simulation.alpha(0).stop();
    placeNodes(); placeEdges();
    fit();
    applyFilters();
    applySelection();
    applySearch();
  }

  function showTip(event, edge) {
    const box = canvas.getBoundingClientRect();
    tip.innerHTML = `<strong>${esc(edge.type)}</strong><span>${esc(edge.from.label)} → ${esc(edge.to.label)}</span>`;
    tip.hidden = false;
    tip.style.left = `${Math.min(event.clientX - box.left + 14, box.width - 230)}px`;
    tip.style.top = `${event.clientY - box.top + 14}px`;
  }

  function fit() {
    const nodes = [...graph.nodes.values()];
    const [minX, maxX] = d3.extent(nodes, node => node.x), [minY, maxY] = d3.extent(nodes, node => node.y);
    const width = canvas.clientWidth || 900, height = canvas.clientHeight || 600, pad = 50;
    const k = Math.min((width - pad * 2) / (maxX - minX || 1), (height - pad * 2) / (maxY - minY || 1), 1.6);
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2 - (minX + maxX) / 2 * k, height / 2 - (minY + maxY) / 2 * k).scale(k));
  }

  const edgeEnabled = edge => !hiddenCategories.has(edge.from.category) && !hiddenCategories.has(edge.to.category) && !hiddenTypes.has(edge.type);
  const edgeVisible = edge => edgeEnabled(edge) && !hiddenNodes.has(edge.from.id) && !hiddenNodes.has(edge.to.id);

  // Subsequence match, case-insensitive, against label and id.
  const fuzzy = (query, text) => {
    let at = 0;
    for (const char of text.toLowerCase()) if (char === query[at] && ++at === query.length) return true;
    return !query.length;
  };
  function applySearch() {
    const query = search.value.trim().toLowerCase();
    svg.classed('has-search', Boolean(query));
    const hits = new Set();
    if (query) for (const node of graph.nodes.values()) if (fuzzy(query, node.label) || fuzzy(query, node.id)) hits.add(node.id);
    nodeSel.classed('hit', node => hits.has(node.id));
    edgeSel.classed('hit', edge => hits.has(edge.from.id) && hits.has(edge.to.id));
    searchCount.textContent = query ? `${hits.size} of ${graph.nodes.size}` : '';
  }

  function renderSource() {
    const example = graph.example;
    const record = selection?.type === 'node' ? graph.nodes.get(selection.id).record
      : selection?.type === 'edge' ? graph.edges[selection.id].from.record : null;
    const span = record?.name_span || record?.span;
    const fileId = span?.file_id || record?.file_id || (record?.content_ref ? record.id : null);
    const files = example.model.ProjectFile.filter(file => !fileId || file.id === fileId);
    source.innerHTML = files.map(file => {
      const content = example.externalContent[file.content_ref] ?? '';
      const name = esc(file.uri.replace('memory:///', ''));
      if (!span || span.file_id !== file.id) return `<h4>${name}</h4><pre><code>${esc(content)}</code></pre>`;
      const bytes = new TextEncoder().encode(content), decoder = new TextDecoder();
      const part = (from, to) => esc(decoder.decode(bytes.slice(from, to)));
      return `<h4>${name}</h4><pre><code>${part(0, span.start_offset)}<mark id="eg-mark">${part(span.start_offset, span.end_offset)}</mark>${part(span.end_offset)}</code></pre>`;
    }).join('');
    source.querySelector('#eg-mark')?.scrollIntoView({ block: 'center' });
  }

  // Double click closes every directly related node, or opens them again.
  function toggleRelated(node) {
    const related = new Set();
    for (const edge of graph.edges) {
      if (!edgeEnabled(edge)) continue;
      if (edge.from === node) related.add(edge.to);
      if (edge.to === node) related.add(edge.from);
    }
    if (!related.size) return;
    if (collapsed.has(node.id)) {
      related.forEach(other => hiddenNodes.delete(other.id));
      collapsed.delete(node.id);
    } else {
      related.forEach(other => hiddenNodes.add(other.id));
      collapsed.add(node.id);
    }
    if (selection?.type === 'node' && hiddenNodes.has(selection.id)) select(null);
    else { applyFilters(); applySelection(); }
  }
  function applyFilters() {
    nodeSel.style('display', node => hiddenCategories.has(node.category) || hiddenNodes.has(node.id) ? 'none' : null)
      .classed('collapsed', node => collapsed.has(node.id));
    edgeSel.style('display', edge => edgeVisible(edge) ? null : 'none');
    legend.querySelectorAll('input[data-category]').forEach(input => { input.checked = !hiddenCategories.has(input.dataset.category); });
    relations.querySelectorAll('input[data-type]').forEach(input => { input.checked = !hiddenTypes.has(input.dataset.type); });
  }
  function applySelection() {
    svg.classed('has-selection', Boolean(selection));
    const nodesOn = new Set(), edgesOn = new Set();
    if (selection?.type === 'node') {
      nodesOn.add(selection.id);
      for (const edge of graph.edges) {
        if (!edgeVisible(edge) || (edge.from.id !== selection.id && edge.to.id !== selection.id)) continue;
        edgesOn.add(edge.id); nodesOn.add(edge.from.id); nodesOn.add(edge.to.id);
      }
    } else if (selection?.type === 'edge') {
      const edge = graph.edges[selection.id];
      edgesOn.add(edge.id); nodesOn.add(edge.from.id); nodesOn.add(edge.to.id);
    }
    nodeSel.classed('on', node => nodesOn.has(node.id))
      .classed('selected', node => selection?.type === 'node' && selection.id === node.id);
    edgeSel.classed('on', edge => edgesOn.has(edge.id))
      .classed('selected', edge => selection?.type === 'edge' && selection.id === edge.id);
    edgeSel.select('.eg-line').attr('marker-end', edge => edgesOn.has(edge.id) ? 'url(#eg-arrow-on)' : 'url(#eg-arrow)');
    edgeSel.filter(edge => edgesOn.has(edge.id)).raise();
  }

  function fmt(value) {
    if (typeof value === 'string' && graph.nodes.has(value)) {
      return `<button class="eg-ref" data-eg-node="${esc(value)}">${esc(graph.nodes.get(value).label)}<small>${esc(value)}</small></button>`;
    }
    if (Array.isArray(value)) return value.length ? `[${value.map(fmt).join(', ')}]` : '[]';
    if (value && typeof value === 'object') {
      if ('start_offset' in value) return `<code>[${value.start_offset}, ${value.end_offset})</code> <span class="eg-snippet">${esc(JSON.stringify(graph.snippet(value).slice(0, 80)))}</span>`;
      const entries = Object.entries(value);
      return entries.length ? `{${entries.map(([key, child]) => `<span class="eg-key">${esc(key)}</span>: ${fmt(child)}`).join(', ')}}` : '{}';
    }
    return `<code>${esc(JSON.stringify(value))}</code>`;
  }
  const attributes = record => Object.entries(record).filter(([key]) => key !== 'id')
    .map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${fmt(value)}</dd></div>`).join('');

  function renderPanel() {
    if (!selection) {
      const scope = graph.mode === 'semantic' ? 'Semantic Code Graph relationships (dashed arrows are candidates, not established)' : 'references';
      const publication = graph.envelope ? `<h4>Publication</h4><dl class="eg-attrs">${attributes(graph.envelope)}</dl>` : '';
      panel.innerHTML = `<div class="eyebrow">DETAILS</div><h3>Select a node or an arrow</h3><p>${graph.nodes.size} records and ${graph.edges.length} ${scope} from the C++ example. A selection keeps its direct relations visible and fades everything else. Hover an arrow to read its relation type.</p><p class="eg-hint">Drag the background to pan, drag a node to move it, double-click a node to close or reopen all its related nodes, scroll to zoom, press Escape to clear.</p>${publication}`;
      return;
    }
    if (selection.type === 'edge') {
      const edge = graph.edges[selection.id];
      panel.innerHTML = `<div class="eyebrow">RELATION</div><h3>${esc(edge.type)}</h3><p class="eg-flow"><button class="eg-ref" data-eg-node="${esc(edge.from.id)}">${esc(edge.from.label)}<small>${esc(edge.from.id)}</small></button><span aria-hidden="true">→</span><button class="eg-ref" data-eg-node="${esc(edge.to.id)}">${esc(edge.to.label)}<small>${esc(edge.to.id)}</small></button></p><dl class="eg-attrs"><div><dt>defined on</dt><dd><code>${graph.mode === 'semantic' ? `Semantic Code Graph ${esc(edge.type)}` : `${esc(edge.type)}`}</code></dd></div><div><dt>source category</dt><dd><code>${esc(edge.from.category)}</code></dd></div><div><dt>target category</dt><dd><code>${esc(edge.to.category)}</code></dd></div>${edge.hub ? '<div><dt>kind</dt><dd>File anchor or bookkeeping relation, hidden by default</dd></div>' : ''}${edge.detail ? `<div><dt>${graph.mode === 'semantic' ? 'derived properties' : 'embedded record'}</dt><dd>${fmt(edge.detail)}</dd></div>` : ''}</dl>`;
      return;
    }
    const node = graph.nodes.get(selection.id);
    const outgoing = graph.edges.filter(edge => edge.from === node), incoming = graph.edges.filter(edge => edge.to === node);
    const list = (edges, other, arrow) => edges.map(edge => `<li><button class="eg-rel" data-eg-edge="${edge.id}"><code>${esc(edge.type)}</code></button><span aria-hidden="true">${arrow}</span><button class="eg-ref" data-eg-node="${esc(edge[other].id)}">${esc(edge[other].label)}<small>${esc(edge[other].id)}</small></button></li>`).join('');
    panel.innerHTML = `<div class="eyebrow"><span class="eg-dot" style="background:${node.color}"></span>${esc(node.category)}${node.profiles.length ? ` + ${esc(node.profiles.map(profile => profile.name).join(', '))}` : ''}</div><h3>${esc(node.label)}</h3><code class="eg-id">${esc(node.id)}</code><h4>Attributes</h4><dl class="eg-attrs">${attributes(node.record)}</dl>${node.profiles.map(profile => `<h4>${esc(profile.name)}</h4><dl class="eg-attrs">${attributes(profile.record)}</dl>`).join('')}<h4>Outgoing relations (${outgoing.length})</h4><ul class="eg-rels">${list(outgoing, 'to', '→') || '<li class="eg-none">None</li>'}</ul><h4>Incoming relations (${incoming.length})</h4><ul class="eg-rels">${list(incoming, 'from', '←') || '<li class="eg-none">None</li>'}</ul>`;
    panel.scrollTop = 0;
  }

  function select(next) {
    selection = next;
    if (next?.type === 'node') {
      hiddenCategories.delete(graph.nodes.get(next.id).category);
      hiddenNodes.delete(next.id);
    }
    if (next?.type === 'edge') {
      const edge = graph.edges[next.id];
      hiddenCategories.delete(edge.from.category); hiddenCategories.delete(edge.to.category);
      hiddenNodes.delete(edge.from.id); hiddenNodes.delete(edge.to.id);
      hiddenTypes.delete(edge.type);
    }
    applyFilters();
    applySelection();
    renderPanel();
    renderSource();
  }

  function renderLegend() {
    const counts = d3.rollup([...graph.nodes.values()], nodes => nodes.length, node => node.category);
    legend.innerHTML = graph.categories.map(category => {
      const color = [...graph.nodes.values()].find(node => node.category === category).color;
      return `<label><input type="checkbox" data-category="${esc(category)}" checked><span class="eg-dot" style="background:${color}"></span>${esc(category)} <small>${counts.get(category)}</small></label>`;
    }).join('');
  }

  function renderRelations() {
    relations.innerHTML = graph.types.map(type => `<label><input type="checkbox" data-type="${esc(type)}" checked><code>${esc(type)}</code> <small>${graph.typeCounts.get(type)}</small></label>`).join('');
  }

  // Diagnostic records are messages about facts; their relations start hidden, so the nodes would float.
  const hideQuality = () => hiddenCategories.add(mode === 'code' ? 'Diagnostic' : 'Symbol');

  function render() {
    const example = window.CODE_GRAPH_EXAMPLE;
    if (!example) { panel.textContent = 'Example data is missing.'; return; }
    if (builtFor === mode) return;
    builtFor = mode;
    graph = buildGraph(example, mode);
    selection = null;
    hiddenCategories.clear(); hiddenNodes.clear(); collapsed.clear(); hideQuality();
    view.querySelector('#eg-title').textContent = `C++ ${mode === 'semantic' ? 'semantic graph' : 'example graph'}`;
    view.querySelector('#eg-eyebrow').textContent = mode === 'semantic' ? 'SEMANTIC CODE GRAPH PROJECTION' : 'EVERY RECORD AND REFERENCE';
    view.querySelectorAll('[data-eg-graph]').forEach(button => {
      button.classList.toggle('active', button.dataset.egGraph === mode);
      button.setAttribute('aria-pressed', String(button.dataset.egGraph === mode));
    });
    view.querySelector('.eg-filter-head small').textContent = mode === 'semantic'
      ? 'DERIVED_FROM links to supporting Symbols start hidden' : 'File anchors, evidence, and diagnostic links start hidden';
    layout();
    hiddenTypes.clear();
    graph.edges.filter(edge => edge.hub).forEach(edge => hiddenTypes.add(edge.type));
    renderLegend();
    renderRelations();
    draw();
    renderPanel();
    renderSource();
  }

  panel.addEventListener('click', event => {
    const nodeButton = event.target.closest('[data-eg-node]'), edgeButton = event.target.closest('[data-eg-edge]');
    if (nodeButton) select({ type: 'node', id: nodeButton.dataset.egNode });
    else if (edgeButton) select({ type: 'edge', id: Number(edgeButton.dataset.egEdge) });
  });
  legend.addEventListener('change', event => {
    const category = event.target.dataset.category;
    if (!category) return;
    if (event.target.checked) hiddenCategories.delete(category); else hiddenCategories.add(category);
    applyFilters(); applySelection();
  });
  relations.addEventListener('change', event => {
    const type = event.target.dataset.type;
    if (type === undefined) return;
    if (event.target.checked) hiddenTypes.delete(type); else hiddenTypes.add(type);
    applyFilters(); applySelection();
  });
  view.querySelector('.eg-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-eg-set]');
    if (!button) return;
    const [hidden, values] = button.dataset.egSet === 'categories' ? [hiddenCategories, graph.categories] : [hiddenTypes, graph.types];
    hidden.clear();
    if (button.dataset.egMode === 'none') values.forEach(value => hidden.add(value));
    applyFilters(); applySelection();
  });
  search.addEventListener('input', applySearch);
  view.querySelector('.eg-switch').addEventListener('click', event => {
    const button = event.target.closest('[data-eg-graph]');
    if (!button || button.dataset.egGraph === mode) return;
    mode = button.dataset.egGraph;
    render();
  });
  view.querySelector('.eg-tabs').addEventListener('click', event => {
    const tab = event.target.closest('[data-eg-tab]');
    if (!tab) return;
    const showSource = tab.dataset.egTab === 'source';
    panel.hidden = showSource; source.hidden = !showSource;
    view.querySelectorAll('.eg-tab').forEach(button => {
      button.classList.toggle('active', button === tab);
      button.setAttribute('aria-selected', String(button === tab));
    });
  });
  view.querySelector('#eg-reset').addEventListener('click', () => {
    search.value = '';
    hiddenCategories.clear(); hiddenTypes.clear(); hiddenNodes.clear(); collapsed.clear(); hideQuality();
    graph.edges.filter(edge => edge.hub).forEach(edge => hiddenTypes.add(edge.type));
    select(null); fit(); applySearch();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !view.hidden && selection) select(null);
  });
  new MutationObserver(() => { if (!view.hidden) requestAnimationFrame(render); }).observe(view, { attributes: true, attributeFilter: ['hidden'] });
  if (!view.hidden) requestAnimationFrame(render);
})();
