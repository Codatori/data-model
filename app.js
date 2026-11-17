(() => {
  'use strict';

  const source = window.CODE_GRAPH_SOURCE;
  if (typeof source !== 'string') {
    document.querySelector('#details').textContent = 'Model content is missing. Run node build-model.mjs to generate model-data.js, then reload the page.';
    return;
  }

  const layers = [
    { id: 'code-facts', name: 'Code Facts', color: 'var(--layer-identity)' },
    { id: 'semantic-graph', name: 'Semantic Graph', color: 'var(--layer-relations)' }
  ];
  const sharedTypes = new Set(['Repository', 'Project', 'ExternalLibrary', 'Directory']);
  const summaries = {
    PresenceCondition: 'Structured conditional activation',
    Repository: 'A Git repository checkout at the processed commit',
    Project: 'The descriptor-based boundary of organization and analysis',
    Directory: 'An inventoried directory and its physical parent',
    ProjectFile: 'A project file with versioned externally stored content',
    ExternalLibrary: 'An external dependency with artifact identity',
    Symbol: 'One logical language entity',
    Declaration: 'A declaration occurrence and its code containment',
    CallableProfile: 'Callable parameters and receiver semantics',
    ParameterProfile: 'Parameter binding and passing modes',
    TypeProfile: 'Declared type category and parameters',
    TypeExpression: 'A structural semantic type value',
    TypeUse: 'A type as written at a source location',
    Expression: 'Preserved syntax and ordered operands',
    Import: 'A source directive with local bindings and contextual source lookup',
    Annotation: 'A written application with explicit targets and arguments',
    Coverage: 'A current assessment of an explicit area and dimension',
    Diagnostic: 'An issue with primary and related facts or source locations',
    Module: 'A code file or logical namespace, package, or module',
    Unit: 'A structural type with reconciled identity',
    Member: 'A significant callable or data entity',
    Resource: 'An inventoried non-code project file'
  };
  const profiles = {};
  const sections = [...source.matchAll(/^## (\d+)\. (.+)$/gm)].map((match, index, all) => ({
    number: Number(match[1]), title: match[2],
    markdown: source.slice(match.index, all[index + 1]?.index ?? source.length)
  }));
  const semanticTable = sections.find(section => section.number === 9).markdown
    .split('| Outgoing list |')[1].split('\n\n')[0];
  const semanticKinds = semanticTable.split('\n').filter(line => /^\| `\w+`/.test(line))
    .flatMap(line => {
      const [names, endpoints, details] = line.split('|').slice(1, -1).map(cell => cell.trim());
      const [from, to] = endpoints.split('->').map(side => [...side.matchAll(/\b(?:Symbol|TypeExpression|Expression|Import|Project|ProjectFile)\b/g)].map(match => match[0]));
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
        layer: layers[section.number === 15 ? 1 : 0], shared: sharedTypes.has(name),
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
  for (const line of source.split('\n').filter(line => line.startsWith('|'))) {
    const cells = line.split('|').slice(1, -1).map(strip);
    if (cells.length !== 4 || !/^[A-Z][A-Z_]+$/.test(cells[0]) || !cells[1].includes('->')) continue;
    const [from, to] = cells[1].split('->');
    for (const origin of from.matchAll(entityPattern)) {
      for (const target of to.matchAll(entityPattern)) addLink(origin[0], target[0], cells[0], `${cells[2]} ${cells[3]}`);
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
  ];
  extraLinks.forEach(link => addLink(...link));
  for (const { kind, endpoints, details, from, to } of semanticKinds) {
    for (const source of from) {
      for (const target of to) addLink(source, target, source === 'Import' ? kind.toUpperCase() : `${kind}[].target_id`, `Direct ${kind.toUpperCase()} edge. ${endpoints}. ${details}`);
      addLink(source, 'PresenceCondition', `${kind}[].presence_condition`, `Optional applicability of each ${kind.toUpperCase()} edge.`, 'embedded');
    }
  }
  for (const entity of entities) {
    for (const line of entity.markdown.split('\n').filter(line => line.startsWith('|'))) {
      const cells = line.split('|').slice(1, -1).map(strip);
      if (cells.length < 3) continue;
      if (cells[1].includes('PresenceCondition')) addLink(entity.name, 'PresenceCondition', 'presence_condition', cells[2], 'embedded');
    }
  }
  const genericReferences = [
    ['Coverage', 'ASSESSES', 'Exactly one area or fact owner; dimension and optional attribute_path bound the assessment.'],
    ['Diagnostic', 'ABOUT / RELATED_TO', 'Optional primary subject and additional related facts; paths identify particular facts.']
  ];
  const graphNodes = [
    ['Repository', 2, 0],
    ['Project', 2, 1], ['Coverage', 5, 1],
    ['Directory', 0, 2], ['ExternalLibrary', 4, 2], ['Diagnostic', 5, 2],
    ['ProjectFile', 0, 3], ['PresenceCondition', 4, 3],
    ['Import', 1, 4], ['Declaration', 2, 4], ['Symbol', 4, 4],
    ['Annotation', 1, 5], ['Expression', 2, 5], ['CallableProfile', 5, 5],
    ['TypeUse', 1, 6], ['TypeExpression', 3, 6],
    ['ParameterProfile', 5, 6], ['TypeProfile', 5, 7],
    ['Module', 2, 2], ['Resource', 1, 2], ['Unit', 3, 3], ['Member', 3, 4]
  ].map(([name, column, row]) => ({ name, column, row, x: 64 + column * 290, y: 40 + row * 190 }));
  const inverseLabels = {};
  const overviewFields = new Set([
    'HAS_PROJECT', 'PARENT_OF', 'CONTAINS', 'EXTERNAL',
    'project_id', 'file_id', 'parent_declaration_id', 'declaration_id', 'symbol_id',
    'owner_symbol_id', 'site_id', 'subject_id',
    'shared identity', 'condition',
    'has_type[].target_id',
    'operands[].expression_id', 'OWNS', 'HAS_DECLARATION', 'HAS_PROFILE', 'HAS_TYPE',
    'CONSISTS_OF', 'CONTAINS_DECLARATION', 'LOCATED_IN', 'HAS_INITIALIZER', 'HAS_TYPE_USE', 'REFERS_TO',
    'HAS_ELEMENT_TYPE', 'APPLIES_GENERIC', 'HAS_TYPE_ARGUMENT', 'HAS_VALUE_ARGUMENT',
    'HAS_TEMPLATE_ARGUMENT', 'HAS_PARAMETER_TYPE', 'RETURNS_TYPE', 'HAS_COMPONENT_TYPE',
    'HAS_BOUND_TYPE', 'HAS_DIMENSION_EXPRESSION', 'DEFINED_BY', 'DEPENDS_ON',
    'CONTAINS_EXPRESSION', 'HAS_OPERAND', 'INTRODUCES', 'HAS_CALLEE', 'HAS_ARGUMENT', 'CONDITION_EXPRESSION',
    'INVOKES', 'POSSIBLE_IMPLEMENTATION', 'BINDS_ARGUMENT', 'USES_DEFAULT',
    'HAS_RECEIVER_BINDING', 'BINDS_RECEIVER', 'SUBSTITUTES_PARAMETER', 'SUBSTITUTES_TYPE',
    'SUBSTITUTES_VALUE', 'CONVERTS_FROM', 'CONVERTS_TO', 'IMPORTS', 'CONTAINS_IMPORT', 'HAS_SOURCE_EXPRESSION',
    'HAS_IMPORT_EXPRESSION', 'IMPORTS_FROM', 'CONTAINS_ANNOTATION', 'ANNOTATES', 'HAS_APPLICATION_EXPRESSION',
    'ASSESSED_IN', 'EXCLUDES_SOURCE', 'REPORTED_IN', 'RELATED_LOCATION',
    'DECLARES', 'DEPENDS', 'IMPLEMENTS', 'INHERITANCE', 'ACCESSES', 'USES', 'OVERRIDE'
  ]);
  const schemaRelations = [];
  for (const link of links) {
    const inverse = inverseLabels[`${link.from}:${link.field}`];
    const directKind = link.field.match(/^(has_type)\[\]\.target_id$/)?.[1];
    const fieldLabels = {
      symbol_id: 'IDENTIFIES SYMBOL', file_id: 'LOCATED_IN',
      'operands[].expression_id': 'OPERAND',
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
    group.overview ||= overviewFields.has(link.field) && (link.field !== 'project_id' || link.from === 'ProjectFile');
  }
  const state = {
    layer: 'all', query: '', selected: 'Project', detailTab: 'attributes', neighbors: false,
    tour: 0, view: 'explorer', zoom: 1, fit: true, expanded: false, relation: null,
    cameraX: 0, cameraY: 0, relationFilter: 'all', showLabels: true,
    exampleView: 'records', exampleScope: 'step', exampleTarget: null, beforeExpand: null,
    dependencyView: 'components', mapMode: 'structure'
  };

  function relationGroups() {
    return schemaRelations.filter(group => group.from === state.selected || group.to === state.selected);
  }
  function relationLabel(group) {
    if (group.label) return group.label;
    if (group.kind === 'extension') return 'extends base';
    if (group.kind === 'embedded') return 'conditionally active';
    const field = group.links[0].field;
    if (/^[A-Z][A-Z_]+$/.test(field)) return field;
    const labels = {
      symbol_id: 'identifies symbol', owner_symbol_id: 'owned by',
      parent_declaration_id: 'nested in declaration',
      project_id: 'analyzed in project', file_id: 'located in file',
      initializer_expression_id: 'initialized by', parameter_ids: 'has parameters',
      type_parameter_ids: 'has type parameters', subject_id: 'describes subject',
      type_id: 'binds to type', callee_expression_id: 'invokes expression',
      introduced_symbol_id: 'introduces callable', site_id: 'observed at',
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
    if (semanticKind) return group.to === 'Project' ? 'edges interpreted in' : semanticKind.kind.toUpperCase();
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
    return new Set(schemaRelations.filter(group => (state.relationFilter === 'all' || group.label === state.relationFilter) && (group.from === name || group.to === name)).flatMap(group => [group.from, group.to]));
  }
  function filteredEntities() {
    const neighbors = related(state.selected);
    const endpoints = new Set(schemaRelations.filter(group => group.label === state.relationFilter).flatMap(group => [group.from, group.to]));
    return entities.filter(entity =>
      (state.layer === 'all' || entity.shared || entity.layer.id === state.layer) &&
      (state.relationFilter === 'all' || endpoints.has(entity.name)) &&
      (!state.query || `${entity.name} ${entity.summary} ${entity.markdown}`.toLowerCase().includes(state.query)) &&
      (!state.neighbors || entity.name === state.selected || neighbors.has(entity.name)));
  }
  function renderGraph() {
    const visible = filteredEntities();
    const matches = new Set(visible.map(entity => entity.name));
    const connected = related(state.selected);
    document.querySelector('#graph-groups').innerHTML = graphNodes.filter(node => matches.has(node.name)).map(node => {
      const entity = byName.get(node.name);
      const type = entity.shared ? 'Code Facts + Semantic Graph' : entity.profile ? 'Shared identity' : ['SourceSpan', 'PresenceCondition'].includes(entity.name) ? 'Embedded value' : entity.layer.name;
      return `<div class="node-wrap schema-node" style="left:${node.x}px;top:${node.y}px;--layer-color:${entity.layer.color}"><button class="node ${entity.name === state.selected ? 'selected' : connected.has(entity.name) ? 'connected' : 'dimmed'}" data-node="${entity.name}" aria-pressed="${entity.name === state.selected}" title="${escape(entity.summary)}"><span class="node-name"><span class="layer-dot" aria-hidden="true"></span>${entity.name}</span><span class="node-desc">${escape(entity.summary)}</span><span class="node-type">${type}</span></button></div>`;
    }).join('');
    document.querySelector('#empty-state').hidden = visible.length > 0;
    document.querySelector('#center-node').disabled = !matches.has(state.selected);
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
    const nodes = [...graph.querySelectorAll('.schema-node')];
    const left = Math.min(...nodes.map(node => node.offsetLeft), 0);
    const top = Math.min(...nodes.map(node => node.offsetTop), 0);
    const width = Math.max(760, ...nodes.map(node => node.offsetLeft + node.offsetWidth + 80));
    const height = Math.max(240, ...nodes.map(node => node.offsetTop + node.offsetHeight + 110));
    graph.style.width = `${width}px`;
    graph.style.height = `${height}px`;
    if (state.fit && nodes.length) {
      const boundsLeft = Math.min(...nodes.map(node => node.offsetLeft)) - 70;
      const boundsTop = Math.min(...nodes.map(node => node.offsetTop)) - 70;
      const boundsWidth = Math.max(...nodes.map(node => node.offsetLeft + node.offsetWidth)) - boundsLeft + 70;
      const boundsHeight = Math.max(...nodes.map(node => node.offsetTop + node.offsetHeight)) - boundsTop + 70;
      state.zoom = Math.max(.1, Math.min(1, (viewport.clientWidth - 32) / boundsWidth, (viewport.clientHeight - 32) / boundsHeight));
      state.cameraX = (viewport.clientWidth - boundsWidth * state.zoom) / 2 - boundsLeft * state.zoom;
      state.cameraY = (viewport.clientHeight - boundsHeight * state.zoom) / 2 - boundsTop * state.zoom;
    }
    graph.dataset.left = left;
    graph.dataset.top = top;
    applyMapCamera();
    document.querySelector('#map-summary').textContent = `${layers.find(layer => layer.id === state.layer)?.name || 'Unified Software Graph'} · possible schema relationships`;
    drawConnections();
  }
  function applyMapCamera() {
    document.querySelector('#graph').style.transform = `translate(${state.cameraX}px, ${state.cameraY}px) scale(${state.zoom})`;
    const viewport = document.querySelector('.graph-scroll');
    viewport.style.backgroundPosition = `${state.cameraX}px ${state.cameraY}px`;
    viewport.style.backgroundSize = `${24 * state.zoom}px ${24 * state.zoom}px`;
    document.querySelector('#zoom-level').textContent = `${Math.round(state.zoom * 100)}%`;
    document.querySelector('#zoom-out').disabled = state.zoom <= .1;
    document.querySelector('#zoom-in').disabled = state.zoom >= 3;
  }
  function zoomMap(zoom, x, y) {
    const next = Math.max(.1, Math.min(3, zoom));
    const ratio = next / state.zoom;
    state.cameraX = x - (x - state.cameraX) * ratio;
    state.cameraY = y - (y - state.cameraY) * ratio;
    state.zoom = next;
    state.fit = false;
    applyMapCamera();
  }
  function fitMap() {
    state.fit = true;
    requestAnimationFrame(layoutMap);
  }
  function resetMapPosition() {
    fitMap();
  }
  function expandMap(expanded) {
    if (expanded === state.expanded) return;
    if (expanded) state.beforeExpand = {
      zoom: state.zoom, fit: state.fit, fitted: document.querySelector('.map-area').classList.contains('fitted'),
      x: state.cameraX, y: state.cameraY
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
    document.querySelector('#expand-map').textContent = expanded ? '↙' : '↗';
    document.querySelector('#expand-map').title = expanded ? 'Restore layout' : 'Expand map';
    document.querySelector('#expand-map').setAttribute('aria-label', expanded ? 'Restore layout' : 'Expand map');
    document.querySelector('#expand-map').setAttribute('aria-pressed', String(expanded));
    if (expanded) {
      fitMap();
      document.querySelector('#expand-map').focus();
    } else {
      const previous = state.beforeExpand;
      state.zoom = previous.zoom; state.fit = previous.fit;
      document.querySelector('.map-area').classList.toggle('fitted', previous.fitted);
      state.cameraX = previous.x; state.cameraY = previous.y;
      requestAnimationFrame(layoutMap);
      state.beforeExpand = null;
    }
  }
  function connectionPath(from, to, self, lane) {
    const centerX = (from.left + from.right) / 2;
    const centerY = from.top + from.height / 2;
    if (self) {
      const bottom = from.top + from.height;
      return `M ${from.right - 45} ${bottom} C ${from.right + 100 + lane} ${bottom + 100 + lane}, ${from.right + 100 + lane} ${from.top + 25}, ${from.right} ${from.top + 25}`;
    }
    const targetX = (to.left + to.right) / 2;
    const targetY = to.top + to.height / 2;
    const deltaX = targetX - centerX;
    const deltaY = targetY - centerY;
    if (!deltaX && !deltaY) return '';
    const boundaryScale = box => Math.min(
      deltaX ? (box.right - box.left) / 2 / Math.abs(deltaX) : Infinity,
      deltaY ? box.height / 2 / Math.abs(deltaY) : Infinity
    );
    const start = boundaryScale(from);
    const end = boundaryScale(to);
    return `M ${centerX + deltaX * start} ${centerY + deltaY * start} L ${targetX - deltaX * end} ${targetY - deltaY * end}`;
  }
  function drawConnections() {
    const graph = document.querySelector('#graph');
    const svg = document.querySelector('#connections');
    const rect = graph.getBoundingClientRect();
    svg.setAttribute('width', graph.offsetWidth);
    svg.setAttribute('height', graph.offsetHeight);
    const paths = [];
    const groups = schemaRelations.filter(group => (state.relationFilter === 'all' || group.label === state.relationFilter) && (state.relationFilter !== 'all' || state.mapMode === 'all' || group.overview || group.from === state.selected || group.to === state.selected || group.index === state.relation) && (!state.neighbors || group.from === state.selected || group.to === state.selected));
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
      const d = connectionPath(a, b, from === to, lane);
      if (!d) continue;
      const selected = group.from === state.selected || group.to === state.selected;
      paths.push(`<path class="schema-edge${selected ? ' incident' : ''}${group.index === state.relation ? ' active' : ''}" data-edge="${group.index}" data-relation="${group.index}" d="${d}" fill="none" stroke="${group.kind === 'extension' ? 'var(--edge-extension)' : 'var(--edge)'}" stroke-width="${group.index === state.relation ? 2.6 : selected ? 1.8 : 1.1}" ${group.kind === 'extension' || group.kind === 'embedded' ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#${group.kind === 'extension' ? 'arrow-extension' : 'arrow'})"><title>${escape(`${group.displayFrom} → ${group.displayTo}: ${group.links.map(link => link.field).join(', ')}`)}</title></path>`);
    }
    svg.innerHTML = `<defs>${[['arrow', '--edge'], ['arrow-extension', '--edge-extension']].map(([id, color]) => `<marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" fill="var(${color})"/></marker>`).join('')}</defs>${paths.join('')}`;
    const occupied = [...graph.querySelectorAll('.node-wrap')].map(node => {
      const box = local(node);
      return { x: box.left - 3, y: box.top - 3, width: box.right - box.left + 6, height: box.height + 6 };
    });
    const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    const sorted = [...groups].sort((first, second) => Number(second.index === state.relation) - Number(first.index === state.relation) || Number(second.from === state.selected || second.to === state.selected) - Number(first.from === state.selected || first.to === state.selected));
    for (const group of sorted) {
      if (!state.showLabels && group.index !== state.relation) continue;
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
          if (box.x < Number(graph.dataset.left) - 70 || box.y < Number(graph.dataset.top) - 70 || box.y + box.height > graph.offsetHeight || box.x + width > graph.offsetWidth - 2 || occupied.some(other => intersects(box, other))) continue;
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
                if (box.x < Number(graph.dataset.left) - 70 || box.y < Number(graph.dataset.top) - 70 || box.x + width > graph.offsetWidth - 2 || box.y + box.height > graph.offsetHeight || occupied.some(other => intersects(box, other))) continue;
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
    const isEmbedded = ['SourceSpan', 'PresenceCondition'].includes(entity.name);
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
      state.layer = 'all'; state.query = ''; state.relationFilter = 'all'; state.fit = true;
      document.querySelector('#search').value = '';
      document.querySelector('#relationship-filter').value = 'all';
    }
    if (state.neighbors) state.fit = true;
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
        meaning: 'An Import record resolves to a source file or symbol, including a source-language module symbol. Its provider project is reached transitively. In the supplied C++ example, main’s using directive targets the Engine namespace symbol.',
        code: 'using namespace Engine;',
        source: 'import:Engine', target: 'symbol:Engine',
        caution: 'The source site assessment records lookup state and completeness separately from member bindings. Reexports use the same IMPORTS_FROM edge with is_reexport on Import. An unavailable SDK header retains the directive without a fabricated target.'
      },
      exports: {
        title: 'Expose a public API symbol', language: 'TypeScript',
        meaning: 'A source file or source-language module symbol exposes a symbol as part of its public API. Project-level API is derived through file membership. The relation can retain an exported name that differs from the symbol’s own name.',
        code: 'export { Renderer as PublicRenderer };',
        source: 'file:rendering', target: 'symbol:Renderer',
        caution: 'The exporting file or language-module symbol is the source and the exported symbol is the target. An export alias does not rename the canonical symbol.'
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
    document.querySelector('#semantic-content').innerHTML = `<div class="eyebrow">${kinds.length} EDGE LABELS · FROM §9 OF THE SPECIFICATION</div><h2>Relationships with explicit meaning.</h2><p>Direct typed edges record semantic facts not fully derivable from the base structure. There are no intermediate relationship nodes or canonical edge IDs. These facts do not predict execution.</p><div class="semantic-rules"><h3>Read every edge the same way</h3><p><strong>Direction:</strong> source node to <code>target_id</code>. The outgoing list determines the uppercase graph label, such as INHERITS. Endpoint categories depend on that label; a type Symbol is not a TypeExpression.</p><p><strong>State:</strong> <code>established</code> records an established relationship; <code>candidate</code> retains a possible relationship. Neither guarantees execution.</p><p><strong>Context:</strong> <code>project_id</code> is required. Optional <code>site_id</code> identifies source syntax, and <code>presence_condition</code> concerns source applicability, not branch execution. Typed <code>details</code> belong to the edge. Additional <code>semantic_properties</code> are optional embedded results that may inherit its context.</p><p><strong>Support:</strong> Evidence identifies the source node and an edge path such as <code>inherits[0]</code>. A nested property has its own path, such as <code>inherits[0].semantic_properties[0]</code>. Coverage retains the same context and assessed path.</p><p><strong>Do not duplicate:</strong> ownership, declarations, operands, HAS_TYPE, references, and selected targets keep their existing representations. Derived component dependencies are not additional canonical edges.</p><button class="text-button" data-section="9">Read semantic edge rules</button> <button class="text-button" data-section="3">Read embedded property rules</button> <button class="text-button" data-section="10">Read derived dependency rules</button></div><p>Except for <code>imports_from</code>, these are independent teaching fragments, not additions to the supplied C++ program. JSON shows source-node excerpts; omitted attributes and hypothetical IDs do not form complete datasets.</p>${kinds.map(({ kind, endpoints, details }, index) => {
      const guide = examples[kind];
      const actual = kind === 'imports_from' ? example?.model.Import.find(record => record.imports_from?.length) : null;
      const edge = actual?.imports_from[0] || { target_id: guide.target, project_id: 'project:guide', state: 'established' };
      const record = { id: actual?.id || guide.source,
        ...(kind === 'imports_from' ? {
          is_reexport: actual?.is_reexport ?? false,
          binding_results: actual?.binding_results.filter(result => result.site_key === 'source') || [{
            site_key: 'source', project_id: edge.project_id, state: 'resolved', candidate_set_completeness: 'complete', reason_codes: []
          }]
        } : {}), [kind]: [edge] };
      return `<details class="semantic-kind" id="semantic-${kind}" ${index === 0 ? 'open' : ''}><summary><code>${escape(kind.toUpperCase())}</code><span>${escape(guide.title)}</span></summary><div class="semantic-kind-body"><p class="semantic-endpoints"><strong>Source -> target:</strong> ${inline(endpoints)}</p><p>${escape(guide.meaning)}</p><p><strong>Edge-specific information:</strong> ${inline(details)}</p><div class="semantic-examples"><div><h3>${escape(guide.language || 'C++')} · ${actual ? 'from your walkthrough' : 'illustrative fragment'}</h3><pre class="example-code"><code>${escape(guide.code)}</code></pre></div><div><h3>${actual ? 'Walkthrough source node excerpt' : 'Illustrative source node excerpt'}</h3><pre class="example-code semantic-json"><code>${escape(JSON.stringify(record, null, 2))}</code></pre></div></div><p class="semantic-caution"><strong>Keep the distinction.</strong> ${escape(guide.caution)}</p>${actual ? `<button class="text-button" data-example-id="${escape(actual.id)}">Inspect the source node in the C++ walkthrough</button>` : ''}</div></details>`;
    }).join('')}<button class="text-button" data-section="9">Read all semantic edge definitions</button>`;
  }

  const tour = [
    { title: 'Preserve the source', heading: 'Start with what was actually written.', chain: ['Project', 'ProjectFile', 'Declaration', 'TypeUse'],
      text: 'Your C++ example includes three standard headers and defines two classes in namespace Engine. A separate hand-authored CMakeLists.txt teaching descriptor establishes its Project; no build is run. ProjectFile links to versioned external content, while declarations and type uses retain their own UTF-8 byte ranges. Project states C++17 and owns build metadata. Import records preserve both the includes and main’s using directive.',
      caution: 'Analysis reads this immutable input without transforming it. Embedded-language spans also refer to their containing input. The SDK header contents are not exported; Coverage is explicitly partial.' },
    { title: 'Separate identity & occurrence', heading: 'One symbol. Potentially many declarations.', chain: ['Symbol', 'Declaration', 'ProjectFile', 'CallableProfile'],
      text: 'RenderContext’s forward declaration and class definition share one established type symbol. SceneManager::dispatch_render_pass also has one callable symbol but two declaration records: the member declaration and its later qualified definition. TypeProfile describes the classes; CallableProfile and ParameterProfile describe methods and constructors.',
      caution: 'The dispatch definition has the Engine declaration as its syntactic parent, but its symbol belongs to SceneManager. Expressions in the body refer directly to the dispatch declaration. Lookup environments stay internal to the analyzer; no block or lexical-area nodes are required.' },
    { title: 'Keep the call syntax', heading: 'One occurrence keeps its call details.', chain: ['Expression', 'Symbol'],
      text: 'make_shared<RenderContext>(42, manager.get()) contains a separate nested get() call as its second argument. active_context_->execute_pipeline() has a member-access callee whose base operand is the active_context_ expression. dispatch_render_pass() is an unqualified member call; its implicit receiver is not an explicit source argument.',
      caution: 'Factory calls remain ordinary calls, not fabricated source constructor invocations. The call Expression owns HAS_CALLEE and HAS_ARGUMENT; its INVOKES target retains semantic receiver conversions without changing source syntax.' },
    { title: 'Associate types in context', heading: 'Spelling is not a semantic type.', chain: ['Declaration', 'TypeUse', 'TypeExpression', 'Expression'],
      text: 'TypeProfile describes a declared type symbol; TypeExpression describes semantic structures such as shared_ptr<RenderContext> and SceneManager*. TypeUse preserves only their actual spellings and nested uses. HAS_TYPE gives declarations, expressions, and written types their contextual results. Symbol types follow declarations; direct symbol typing is reserved for known external or intrinsic entities without declarations. Inferred types do not require a TypeUse. Public C++17 library contracts support this example’s deductions.',
      caution: 'A raw owner_manager_ pointer does not own the SceneManager lifetime. It is also not owner_symbol_id: that field belongs semantically to RenderContext. Reciprocal references and cyclic calls do not imply a shared_ptr ownership cycle.' },
    { title: 'Resolve without guessing', heading: 'A candidate is not a selected target.', chain: ['Expression', 'Symbol', 'Declaration', 'ProjectFile'],
      text: 'The project’s non-virtual members have unique declaration-level targets. Other supported applicable or unknown candidates must remain available as possible dependencies when selection is incomplete. For shared_ptr receivers, the semantic binding records a contract-based conversion. SDK calls remain unsupported even where their public result types are known.',
      caution: 'Only resolved complete binding assessments permit a selected INVOKES or REFERS_TO edge. A matching name alone does not establish a possible dependency: unknown candidates need evidence. Inapplicable candidates never produce dependency edges.' },
    { title: 'Derive component dependencies', heading: 'Connect components, not execution paths.', chain: ['Expression', 'TypeExpression', 'Import', 'Declaration', 'Coverage', 'Diagnostic'],
      text: 'SceneManager depends on RenderContext through a shared_ptr type and member references; RenderContext refers back through SceneManager* and update_scene. Aggregate occurrences while retaining their source IDs, edge paths and contexts. Optional POSSIBLE_IMPLEMENTATION edges identify known source definitions with an explicit completeness boundary.',
      caution: 'The reciprocal relationships form a permitted structural cycle. A call inside if remains a dependency without proving the branch executes. PresenceCondition describes source applicability, not runtime branching. Neither conformance level requires execution order, path feasibility, or runtime target prediction.' }
  ];
  const example = window.CODE_GRAPH_EXAMPLE;
  const dependencies = example ? window.CODE_GRAPH_DEPENDENCIES(example.model, {
    readContent: reference => example.externalContent[reference]
  }) : null;
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
    if (typeof value === 'string' && Object.hasOwn(example.externalContent, value)) {
      return `<code>${escape(value)}</code><details class="record-source"><summary>External UTF-8 source</summary><code>${escape(example.externalContent[value])}</code></details>`;
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
    const relationships = state.exampleScope === 'all' || state.tour === 0 ? example.relationships : [];
    const recordCount = Object.values(projection).reduce((sum, records) => sum + records.length, 0);
    target.innerHTML = `<div class="result-header"><div><span class="eyebrow">SOURCE → MODEL RESULT</span><h3>${state.exampleScope === 'all' ? 'All illustrated C++ records' : `Step ${state.tour + 1} · ${tour[state.tour].title}`}</h3><small>${recordCount} records / profile extensions · IDs connect the records across steps</small></div><div class="result-controls"><div class="result-tabs" aria-label="Example result presentation"><button data-example-view="records" aria-pressed="${state.exampleView === 'records'}" class="${state.exampleView === 'records' ? 'active' : ''}">Record cards</button><button data-example-view="json" aria-pressed="${state.exampleView === 'json'}" class="${state.exampleView === 'json' ? 'active' : ''}">JSON</button></div><label>Show <select id="example-scope"><option value="step" ${state.exampleScope === 'step' ? 'selected' : ''}>This step</option><option value="all" ${state.exampleScope === 'all' ? 'selected' : ''}>Full example</option></select></label></div></div><p class="result-note">${escape(example.notes[state.tour])}</p>${state.exampleView === 'json'
      ? `<pre class="result-json"><code>${escape(JSON.stringify({ ...projection, ...(relationships.length ? { relationships } : {}) }, null, 2))}</code></pre>`
      : `<div class="result-records">${Object.entries(projection).map(([name, records]) => `<section class="example-category"><h4><button class="text-button" data-entity="${name}">${name} ↗</button><span>${records.length}</span></h4>${records.map(record => `<article class="example-record ${record.id === state.exampleTarget ? 'highlighted' : ''}" data-example-record="${record.id}"><div class="example-record-heading"><strong>${escape(record.id)}</strong>${profiles[name] ? '<span class="pill">Shared base ID</span>' : ''}</div><dl>${Object.entries(record).filter(([key]) => key !== 'id').map(([key, value]) => `<div><dt>${escape(key)}</dt><dd>${exampleValue(value)}</dd></div>`).join('')}</dl></article>`).join('')}</section>`).join('')}</div>`}<p class="result-boundary"><strong>Illustrative, hand-authored projection — not output from a C++ analyzer.</strong> The collection-based JSON is a teaching serialization, not a mandated storage format or a conformance-certified export. ${state.exampleScope === 'step' ? 'This step focuses on selected records; references resolve in “Full example”. ' : ''}Public C++17 type contracts and incomplete SDK coverage are stated explicitly in Evidence, Coverage, and Diagnostic. Source ranges refer to versioned external content matching the unchanged teaching input. Execution analysis is outside scope; no C++ code is executed.</p>`;
    if (state.exampleView === 'records' && relationships.length) {
      target.innerHTML += renderStructuralRelationships(relationships);
    }
  }
  function renderStructuralRelationships(relationships) {
    return `<section class="example-category"><h4>Relationships <span>${relationships.length}</span></h4><div class="result-records">${relationships.map(edge => `<article class="example-record"><div class="example-record-heading"><strong>${escape(edge.type)}</strong></div><dl>${Object.entries(edge).filter(([key]) => key !== 'type').map(([key, value]) => `<div><dt>${escape(key)}</dt><dd>${exampleValue(value)}</dd></div>`).join('')}</dl></article>`).join('')}</div></section>`;
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
      return `<details class="dependency-group"><summary><code>${escape(name(group.from))}</code><span class="project-arrow">→</span><code>${escape(name(group.to))}</code><small>${group.occurrences.length} supporting relationships${possible ? ` · ${possible} possible` : ''}${conditional ? ' · includes conditional source sites' : ''}</small></summary><p>Static contexts: ${group.project_ids.map(exampleValue).join(', ')}. Kinds: ${escape([...new Set(group.occurrences.map(edge => edge.kind))].join(', '))}. Certainty is retained per occurrence, not collapsed into a universal runtime claim.</p><ul class="dependency-evidence">${group.occurrences.map(edge => `<li><strong>${escape(edge.kind)} · ${escape(edge.certainty)}</strong>${edge.candidate_set_completeness ? ` · candidate scope: ${escape(edge.candidate_set_completeness)}` : ''}${edge.presence_conditions.length ? ` · source applicability: ${escape(JSON.stringify(edge.presence_conditions))}` : ''}<div>${edge.supporting_ids.map(exampleValue).join(' ')}</div><div>${edge.evidence_refs.map(entry => `${exampleValue(entry.subject_id)} · ${escape(entry.key)} · ${escape(entry.attribute_path)}`).join('<br>')}</div></li>`).join('')}</ul><p>${supporting.length} distinct supporting records retained. Context aggregation does not imply simultaneous applicability.</p></details>`;
    }).join('')}</div>`;
    const unknownCalls = example.model.Expression.filter(record => ['call', 'construction'].includes(record.kind) &&
      !(record.binding_results || []).some(result => result.site_key === 'call' && result.state === 'resolved'));
    return `<section class="project-call-graph"><div class="eyebrow">DERIVED STRUCTURAL DEPENDENCIES</div><h3>Components connected by source evidence.</h3><p>These are derived views, not additional canonical semantic edges or execution steps. Expand a component relationship or click a member reference to inspect its supporting records.</p><div class="result-tabs" aria-label="Dependency presentation"><button data-dependency-view="components" aria-pressed="${state.dependencyView === 'components'}" class="${state.dependencyView === 'components' ? 'active' : ''}">Components</button><button data-dependency-view="members" aria-pressed="${state.dependencyView === 'members'}" class="${state.dependencyView === 'members' ? 'active' : ''}">Member references</button></div>${rows}<div class="cycle-note"><strong>Established ≠ possible ≠ inapplicable.</strong> Selected targets establish declaration-level links. Other supported applicable or unknown candidates remain possible; inapplicable candidates are excluded. Conditional relationships and structural cycles do not establish branch execution, execution order, or runtime state.</div><p><strong>Unresolved SDK boundary:</strong> ${unknownCalls.map(record => exampleValue(record.id)).join(' ')}. No unsupported overload or unnamed runtime target is invented.</p><button class="text-button" data-section="10">Read the exact derivation rules →</button></section>`;
  }
  function renderTour() {
    const step = tour[state.tour];
    document.querySelector('#tour-steps').innerHTML = tour.map((item, index) => `<li><button class="step-button ${index === state.tour ? 'active' : ''}" data-step="${index}" aria-current="${index === state.tour ? 'step' : 'false'}"><span class="step-number">${index + 1}</span>${item.title}</button></li>`).join('');
    document.querySelector('#tour-content').innerHTML = `<div class="eyebrow">STEP ${String(state.tour + 1).padStart(2, '0')} / ${tour.length} · ${step.title}</div><h2>${step.heading}</h2><div class="eyebrow">${escape(example?.filename || 'SOURCE EXAMPLE')} · FOCUSED EXCERPTS FROM YOUR C++ CODE</div>${renderSourceExcerpts()}<p>${step.text}</p><div class="tour-chain">${step.chain.map((name, index) => `${index ? '<span class="tour-arrow" aria-hidden="true">→</span>' : ''}<button class="tour-entity" data-entity="${name}">${name}</button>`).join('')}</div><small class="connection-caveat">Conceptual learning sequence, not literal stored edges. The result below shows the actual record-to-record references.</small><div id="example-result" class="example-result"></div>${renderProjectCalls()}<div class="tour-caution"><strong>Keep this distinction.</strong><br>${step.caution}</div>${state.tour === tour.length - 1 ? '<div class="prose"><h3>Code Facts conformance</h3><p><strong>Syntactic:</strong> preserved source structure with unknown semantic results.<br><strong>Semantic:</strong> established identities, types, direct known and possible targets, relations, and evidence.<br>Both describe Code Facts, not the Semantic Graph projection defined in section 15. Possible implementation edges are optional source-level information; neither level predicts execution.</p><button class="text-button" data-section="14">Read the exact conformance requirements →</button></div>' : ''}<div class="tour-actions"><button class="secondary-button" data-tour-move="-1" ${state.tour === 0 ? 'disabled' : ''}>← Previous</button>${state.tour < tour.length - 1 ? '<button class="primary-button" data-tour-move="1">Next step →</button>' : '<button class="primary-button" data-view="explorer">Explore the model →</button>'}</div>`;
    renderExample();
  }

  document.querySelector('#entity-count').textContent = entities.length;
  document.querySelector('#all-count').textContent = entities.length;
  document.querySelector('#relationship-filter').innerHTML = '<option value="all">All relationship types</option>' + [...new Set(schemaRelations.map(group => group.label))].sort().map(label => `<option value="${escape(label)}">${escape(label)}</option>`).join('');
  document.querySelector('#layer-list').innerHTML = layers.map(layer => `<button class="layer-button" data-layer="${layer.id}" aria-pressed="false"><span class="layer-name"><span class="layer-dot" style="--layer-color:${layer.color}"></span>${layer.name}</span><span class="count">${entities.filter(entity => entity.shared || entity.layer.id === layer.id).length}</span></button>`).join('');
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
    else if (target.dataset.layer) {
      state.layer = target.dataset.layer; state.fit = true; state.relation = null;
      const selected = byName.get(state.selected);
      if (state.layer !== 'all' && !selected.shared && selected.layer.id !== state.layer) state.selected = 'Project';
      renderGraph(); renderDetails();
    }
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
    else if (target.id === 'center-node') {
      const node = graphNodes.find(item => item.name === state.selected);
      if (!document.querySelector(`[data-node="${state.selected}"]`)) return;
      const viewport = document.querySelector('.graph-scroll');
      state.fit = false;
      state.zoom = Math.max(.65, state.zoom);
      state.cameraX = viewport.clientWidth / 2 - (node.x + 105) * state.zoom;
      state.cameraY = viewport.clientHeight / 2 - (node.y + 50) * state.zoom;
      applyMapCamera();
    }
    else if (target.id === 'zoom-in' || target.id === 'zoom-out') {
      const viewport = document.querySelector('.graph-scroll');
      zoomMap(state.zoom * (target.id === 'zoom-in' ? 1.2 : 1 / 1.2), viewport.clientWidth / 2, viewport.clientHeight / 2);
    }
    else if (target.id === 'reset-map' || target.classList.contains('brand')) {
      event.preventDefault(); state.layer = 'all'; state.query = ''; state.neighbors = false; state.zoom = 1; state.fit = false;
      document.querySelector('.map-area').classList.remove('fitted');
      document.querySelector('#search').value = '';
      document.querySelector('#neighbors-only').checked = false;
      state.mapMode = 'structure';
      state.relationFilter = 'all'; state.showLabels = true;
      document.querySelector('#relationship-filter').value = 'all';
      document.querySelector('#edge-labels').checked = true;
      graphNodes.forEach(node => { node.x = 64 + node.column * 290; node.y = 40 + node.row * 190; });
      selectEntity('Project', true, false);
      resetMapPosition();
      if (state.expanded) fitMap();
    }
  });
  document.querySelector('#search').addEventListener('input', event => { state.query = event.target.value.trim().toLowerCase(); state.fit = true; state.relation = null; renderGraph(); });
  document.querySelector('#neighbors-only').addEventListener('change', event => { state.neighbors = event.target.checked; state.fit = true; state.relation = null; renderGraph(); });
  document.querySelector('#relationship-filter').addEventListener('change', event => { state.relationFilter = event.target.value; state.fit = true; state.relation = null; renderGraph(); });
  document.querySelector('#edge-labels').addEventListener('change', event => { state.showLabels = event.target.checked; drawConnections(); });
  const mapViewport = document.querySelector('.graph-scroll');
  const mapPointers = new Map();
  let mapGesture = null;
  let suppressMapClick = false;
  let dragFrame = 0;
  mapViewport.addEventListener('wheel', event => {
    event.preventDefault();
    const bounds = mapViewport.getBoundingClientRect();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? mapViewport.clientHeight : 1);
    zoomMap(state.zoom * Math.exp(-delta * .002), event.clientX - bounds.left, event.clientY - bounds.top);
  }, { passive: false });
  mapViewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('[data-relation]')) return;
    suppressMapClick = false;
    mapPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    (event.target.closest('[data-node]') || mapViewport).setPointerCapture(event.pointerId);
    const node = graphNodes.find(item => item.name === event.target.closest('[data-node]')?.dataset.node);
    mapGesture = { node: mapPointers.size === 1 ? node : null, moved: false };
    mapViewport.style.cursor = 'grabbing';
  });
  mapViewport.addEventListener('pointermove', event => {
    const previous = mapPointers.get(event.pointerId);
    if (!previous || !mapGesture) return;
    const current = { x: event.clientX, y: event.clientY };
    const deltaX = current.x - previous.x, deltaY = current.y - previous.y;
    if (!mapGesture.moved && Math.hypot(deltaX, deltaY) < 3) return;
    mapGesture.moved = true;
    state.fit = false;
    if (mapPointers.size === 2) {
      const other = [...mapPointers.entries()].find(([pointerId]) => pointerId !== event.pointerId)[1];
      const oldDistance = Math.hypot(previous.x - other.x, previous.y - other.y);
      const distance = Math.hypot(current.x - other.x, current.y - other.y);
      const bounds = mapViewport.getBoundingClientRect();
      if (oldDistance > 0) zoomMap(state.zoom * distance / oldDistance, (previous.x + other.x) / 2 - bounds.left, (previous.y + other.y) / 2 - bounds.top);
      state.cameraX += deltaX / 2; state.cameraY += deltaY / 2;
    } else if (mapGesture.node) {
      mapGesture.node.x += deltaX / state.zoom;
      mapGesture.node.y += deltaY / state.zoom;
      const wrapper = document.querySelector(`[data-node="${mapGesture.node.name}"]`)?.closest('.schema-node');
      if (wrapper) { wrapper.style.left = `${mapGesture.node.x}px`; wrapper.style.top = `${mapGesture.node.y}px`; }
      if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; layoutMap(); });
    } else {
      state.cameraX += deltaX; state.cameraY += deltaY;
    }
    mapPointers.set(event.pointerId, current);
    applyMapCamera();
  });
  function endMapGesture(event) {
    if (!mapPointers.has(event.pointerId)) return;
    suppressMapClick ||= Boolean(mapGesture?.moved);
    mapPointers.delete(event.pointerId);
    if (!mapPointers.size) { mapGesture = null; mapViewport.style.cursor = 'grab'; }
    else mapGesture = { node: null, moved: true };
  }
  mapViewport.addEventListener('pointerup', endMapGesture);
  mapViewport.addEventListener('pointercancel', endMapGesture);
  mapViewport.addEventListener('lostpointercapture', endMapGesture);
  mapViewport.addEventListener('click', event => {
    if (suppressMapClick) { event.preventDefault(); event.stopPropagation(); suppressMapClick = false; }
  }, true);
  mapViewport.addEventListener('keydown', event => {
    const node = event.target.closest('[data-node]');
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (direction && (event.target === mapViewport || node)) {
      event.preventDefault(); state.fit = false;
      const distance = event.shiftKey ? 60 : 20;
      if (node) {
        const position = graphNodes.find(item => item.name === node.dataset.node);
        position.x += direction[0] * distance; position.y += direction[1] * distance;
        node.parentElement.style.left = `${position.x}px`; node.parentElement.style.top = `${position.y}px`;
        layoutMap();
      } else {
        state.cameraX -= direction[0] * distance; state.cameraY -= direction[1] * distance;
        applyMapCamera();
      }
    }
    if (event.target === mapViewport && ['+', '=', '-'].includes(event.key)) {
      event.preventDefault();
      zoomMap(state.zoom * (event.key === '-' ? 1 / 1.2 : 1.2), mapViewport.clientWidth / 2, mapViewport.clientHeight / 2);
    }
    if (event.target === mapViewport && event.key === 'Home') { event.preventDefault(); fitMap(); }
  });
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
