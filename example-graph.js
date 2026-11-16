(() => {
  'use strict';

  const PROFILES = new Set(['TypeProfile', 'CallableProfile', 'ParameterProfile', 'CallProfile']);
  const EMBEDDED = new Set(['span', 'name_span', 'source_spans', 'excluded_spans']);
  const HUB_KEYS = new Set(['context_id', 'unit_id', 'file_id', 'module_id', 'entry_file_ids', 'participating_file_ids',
    'root_module_ids', 'dependency_context_ids']);
  const SPAN_LABELED = new Set(['Expression', 'Reference', 'Declaration', 'TypeUse', 'Import']);
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
  const picker = document.querySelector('#language-picker');
  let graph = null, builtFor = null, selection = null, mode = 'code';
  let svg, root, nodeSel, edgeSel, zoom, simulation;
  const hiddenCategories = new Set(), hiddenTypes = new Set(), hiddenNodes = new Set(), collapsed = new Set();

  function buildGraph(example, mode) {
    const files = new Map((example.files || [{ id: 'file:example', code: example.code }]).map(file => [file.id, new TextEncoder().encode(file.code)]));
    const decoder = new TextDecoder();
    const snippet = span => decoder.decode((files.get(span.file_id) || files.values().next().value).slice(span.start_offset, span.end_offset)).replace(/\s+/g, ' ').trim();
    const nodes = new Map();
    for (const [category, records] of Object.entries(example.model)) {
      if (!PROFILES.has(category)) for (const record of records) nodes.set(record.id, { id: record.id, category, record, profiles: [] });
    }
    for (const [name, records] of Object.entries(example.model)) {
      if (PROFILES.has(name)) for (const record of records) nodes.get(record.id)?.profiles.push({ name, record });
    }
    for (const node of nodes.values()) {
      const record = node.record;
      let label = record.name || record.builtin_name;
      if (!label && SPAN_LABELED.has(node.category)) {
        const span = record.name_span || record.span;
        if (span) label = snippet(span);
      }
      if (!label) label = node.id.slice(node.id.indexOf(':') + 1);
      node.label = label.length > 26 ? `${label.slice(0, 25)}…` : label;
    }
    const edges = [];
    const seen = new Set();
    function addEdge(from, to, type, container, hub, state) {
      if (!from || from.id === to || !nodes.has(to)) return;
      const key = `${from.id}|${to}|${type}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ id: edges.length, from, to: nodes.get(to), type, detail: container, hub, state });
    }
    function walk(from, value, path, container) {
      if (Array.isArray(value)) return value.forEach(item => walk(from, item, path, container));
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (EMBEDDED.has(key)) continue;
        const type = [...path, key].join('.');
        const owner = path.length ? value : null;
        if (typeof child === 'string' && /_id$/.test(key)) addEdge(from, child, type, owner, HUB_KEYS.has(key));
        else if (Array.isArray(child) && /_ids$/.test(key)) child.forEach(id => typeof id === 'string' && addEdge(from, id, type, owner, HUB_KEYS.has(key)));
        else if (child && typeof child === 'object') walk(from, child, [...path, key], value);
      }
    }
    if (mode === 'semantic') {
      // Callable-level dependencies derived per the model, merged per (from, to, kind).
      const deps = window.CODE_GRAPH_DEPENDENCIES(example.model);
      const merged = new Map();
      for (const dep of deps.edges) {
        const key = `${dep.from}|${dep.to}|${dep.kind}`;
        if (!merged.has(key)) merged.set(key, { dep, occurrences: 0, certain: false, context_ids: new Set(), supporting_ids: new Set() });
        const entry = merged.get(key);
        entry.occurrences++;
        entry.certain ||= dep.certainty !== 'possible';
        if (dep.context_id) entry.context_ids.add(dep.context_id);
        dep.supporting_ids.forEach(id => entry.supporting_ids.add(id));
      }
      for (const { dep, occurrences, certain, context_ids, supporting_ids } of merged.values()) {
        addEdge(nodes.get(dep.from), dep.to, dep.kind, { occurrences, certainty: certain ? 'established' : 'possible',
          context_ids: [...context_ids], supporting_ids: [...supporting_ids] }, false, certain ? 'established' : 'possible');
      }
      const used = new Set(edges.flatMap(edge => [edge.from.id, edge.to.id]));
      const queue = [...used];
      while (queue.length) {
        const node = nodes.get(queue.pop());
        const ownerId = node.record.owner_symbol_id;
        if (!ownerId || !nodes.has(ownerId)) continue;
        addEdge(nodes.get(ownerId), node.id, 'owns', null, false, 'established');
        if (!used.has(ownerId)) { used.add(ownerId); queue.push(ownerId); }
      }
      for (const id of [...nodes.keys()]) if (!used.has(id)) nodes.delete(id);
      for (const node of nodes.values()) {
        const name = deps.name(node.id);
        node.label = name.length > 40 ? `${name.slice(0, 39)}…` : name;
        if (node.category === 'Symbol') node.category = `Symbol · ${node.record.kind}`;
      }
    } else {
      for (const node of nodes.values()) {
        walk(node, node.record, [], null);
        for (const profile of node.profiles) walk(node, profile.record, [], null);
      }
    }
    const pairs = new Map();
    for (const edge of edges) {
      const key = [edge.from.id, edge.to.id].sort().join('|');
      pairs.set(key, [...(pairs.get(key) || []), edge]);
    }
    for (const group of pairs.values()) {
      group.forEach((edge, index) => { edge.offset = (index - (group.length - 1) / 2) * 22 * (edge.from.id < edge.to.id ? 1 : -1); });
    }
    const degree = new Map();
    for (const edge of edges) for (const node of [edge.from, edge.to]) degree.set(node.id, (degree.get(node.id) || 0) + 1);
    for (const node of nodes.values()) node.r = Math.min(16, 4.5 + Math.sqrt(degree.get(node.id) || 0) * 1.7);
    const categories = [...new Set([...nodes.values()].map(node => node.category))];
    const color = d3.scaleOrdinal().domain(categories).range(categories.map((_, index) => d3.hcl(index * 360 / categories.length, 48, 62).formatHex()));
    for (const node of nodes.values()) node.color = color(node.category);
    const types = [...d3.rollup(edges, group => group.length, edge => edge.type).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { mode, example, nodes, edges, categories, types: types.map(([type]) => type), typeCounts: new Map(types), snippet };
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
    const files = graph.example.files || [{ filename: graph.example.filename || 'example', code: graph.example.code }];
    source.innerHTML = files.map(file => `<h4>${esc(file.filename)}</h4><pre><code>${esc(file.code)}</code></pre>`).join('');
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
      const scope = graph.mode === 'semantic' ? 'semantic dependencies: calls, references, types, relations, implementations and ownership (dashed arrows are possible, not established)' : 'references';
      panel.innerHTML = `<div class="eyebrow">DETAILS</div><h3>Select a node or an arrow</h3><p>${graph.nodes.size} records and ${graph.edges.length} ${scope} from the ${esc(graph.example.label)} example. A selection keeps its direct relations visible and fades everything else. Hover an arrow to read its relation type.</p><p class="eg-hint">Drag the background to pan, drag a node to move it, double-click a node to close or reopen all its related nodes, scroll to zoom, press Escape to clear.</p>`;
      return;
    }
    if (selection.type === 'edge') {
      const edge = graph.edges[selection.id];
      panel.innerHTML = `<div class="eyebrow">RELATION</div><h3>${esc(edge.type)}</h3><p class="eg-flow"><button class="eg-ref" data-eg-node="${esc(edge.from.id)}">${esc(edge.from.label)}<small>${esc(edge.from.id)}</small></button><span aria-hidden="true">→</span><button class="eg-ref" data-eg-node="${esc(edge.to.id)}">${esc(edge.to.label)}<small>${esc(edge.to.id)}</small></button></p><dl class="eg-attrs"><div><dt>defined on</dt><dd><code>${graph.mode === 'semantic' ? `Derived ${esc(edge.type)} dependency` : `${esc(edge.from.category)}.${esc(edge.type)}`}</code></dd></div><div><dt>source category</dt><dd><code>${esc(edge.from.category)}</code></dd></div><div><dt>target category</dt><dd><code>${esc(edge.to.category)}</code></dd></div>${edge.hub ? '<div><dt>kind</dt><dd>Shared context or unit link, hidden by default</dd></div>' : ''}${edge.detail ? `<div><dt>${graph.mode === 'semantic' ? 'derived dependency' : 'embedded record'}</dt><dd>${fmt(edge.detail)}</dd></div>` : ''}</dl>`;
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

  function render() {
    const examples = window.CODE_GRAPH_EXAMPLES || {};
    const example = examples[picker?.value] || Object.values(examples)[0];
    if (!example) { panel.textContent = 'Example data is missing.'; return; }
    if (builtFor === `${example.id}:${mode}`) return;
    builtFor = `${example.id}:${mode}`;
    graph = buildGraph(example, mode);
    selection = null;
    hiddenCategories.clear(); hiddenNodes.clear(); collapsed.clear();
    view.querySelector('#eg-title').textContent = `${example.label} ${mode === 'semantic' ? 'semantic graph' : 'example graph'}`;
    view.querySelector('#eg-eyebrow').textContent = mode === 'semantic' ? 'SYMBOL-LEVEL SEMANTIC DEPENDENCIES' : 'EVERY RECORD AND REFERENCE';
    view.querySelectorAll('[data-eg-graph]').forEach(button => {
      button.classList.toggle('active', button.dataset.egGraph === mode);
      button.setAttribute('aria-pressed', String(button.dataset.egGraph === mode));
    });
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
    hiddenCategories.clear(); hiddenTypes.clear(); hiddenNodes.clear(); collapsed.clear();
    graph.edges.filter(edge => edge.hub).forEach(edge => hiddenTypes.add(edge.type));
    select(null); fit(); applySearch();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !view.hidden && selection) select(null);
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'language-picker' && !view.hidden) requestAnimationFrame(render);
  });
  new MutationObserver(() => { if (!view.hidden) requestAnimationFrame(render); }).observe(view, { attributes: true, attributeFilter: ['hidden'] });
  if (!view.hidden) requestAnimationFrame(render);
})();
