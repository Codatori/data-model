import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const context = { window: {}, TextEncoder, TextDecoder };
runInNewContext(readFileSync(new URL('example-model.js', import.meta.url), 'utf8'), context);
runInNewContext(readFileSync(new URL('structural-dependencies.js', import.meta.url), 'utf8'), context);
runInNewContext(readFileSync(new URL('model-data.js', import.meta.url), 'utf8'), context);
const example = context.window.CODE_GRAPH_EXAMPLE;
const { model, code } = example;
const externalContent = { ...example.externalContent };
const deriveDependencies = context.window.CODE_GRAPH_DEPENDENCIES;
context.window.CODE_GRAPH_DEPENDENCIES = records => deriveDependencies(records, {
  readContent: reference => externalContent[reference]
});
const profiles = {};
const entities = new Map(Object.entries(model).filter(([category]) => !profiles[category])
  .flatMap(([category, records]) => records.map(record => [record.id, { category, ...record }])));
const sourceBytes = new TextEncoder().encode(code);
const text = span => new TextDecoder().decode(sourceBytes.slice(span.start_offset, span.end_offset));

function directiveFixture(content) {
  const fixture = Object.fromEntries([...new Set([...Object.keys(model), 'Annotation'])].map(category => [category, []]));
  fixture.Project.push({ id: 'project:fragment' });
  const contentRef = `teaching://fragment/${encodeURIComponent(content)}`;
  externalContent[contentRef] = content;
  fixture.ProjectFile.push({ id: 'file:fragment', uri: 'memory:///fragment', content_ref: contentRef });
  return { fixture, span: { file_id: 'file:fragment', start_offset: 0, end_offset: new TextEncoder().encode(content).length },
    file_id: 'file:fragment', project_id: 'project:fragment' };
}

test('relationship graph has one node per specification type and uses source-backed labeled edges', () => {
  const app = readFileSync(new URL('app.js', import.meta.url), 'utf8');
  const setup = app.slice(0, app.indexOf('  const state ='));
  const labeling = app.slice(app.indexOf('  function relationLabel('), app.indexOf('  function renderRelationInfo('));
  const browser = { window: { CODE_GRAPH_SOURCE: context.window.CODE_GRAPH_SOURCE } };
  runInNewContext(`${setup}\n${labeling}\nwindow.schema = { graphNodes, schemaRelations, links };\n})();`, browser);
  const { graphNodes, schemaRelations, links } = browser.window.schema;
  const names = graphNodes.map(node => node.name);
  const specificationNames = [...context.window.CODE_GRAPH_SOURCE.matchAll(/^### (\w+)$/gm)].map(match => match[1]);
  assert.equal(new Set(names).size, names.length, 'Duplicate graph type');
  assert.deepEqual([...names].sort(), specificationNames.sort());
  assert.equal(new Set(graphNodes.map(node => `${node.column}:${node.row}`)).size, names.length);
  for (const group of schemaRelations) {
    assert(names.includes(group.displayFrom) && names.includes(group.displayTo));
    assert(group.label, 'Missing edge name');
    assert(group.links.every(link => links.includes(link)), 'Invented schema connection');
    assert.equal(group.displayFrom, group.inverse ? group.to : group.from);
    assert.equal(group.displayTo, group.inverse ? group.from : group.to);
  }
  for (const [from, to, label] of [
    ['Repository', 'Project', 'HAS_PROJECT'],
    ['Project', 'Directory', 'CONTAINS'], ['Directory', 'Directory', 'PARENT_OF'],
    ['Directory', 'ProjectFile', 'CONTAINS'], ['Project', 'Project', 'PARENT_OF'],
    ['ProjectFile', 'Declaration', 'CONSISTS_OF'],
    ['Declaration', 'Expression', 'CONTAINS_EXPRESSION'], ['Project', 'ProjectFile', 'CONTAINS'],
    ['Project', 'ExternalLibrary', 'EXTERNAL'], ['Expression', 'TypeExpression', 'HAS_TYPE'],
    ['Symbol', 'Symbol', 'OWNS'], ['Symbol', 'Declaration', 'HAS_DECLARATION'],
    ['Symbol', 'CallableProfile', 'HAS_PROFILE'], ['Symbol', 'ParameterProfile', 'HAS_PROFILE'],
    ['Symbol', 'TypeProfile', 'HAS_PROFILE'], ['Symbol', 'TypeExpression', 'HAS_TYPE'],
    ['Declaration', 'Declaration', 'CONTAINS_DECLARATION'],
    ['Declaration', 'Expression', 'HAS_INITIALIZER'], ['Declaration', 'TypeExpression', 'HAS_TYPE'],
    ['Declaration', 'TypeUse', 'CONSISTS_OF'], ['Expression', 'TypeUse', 'HAS_TYPE_USE'],
    ['Annotation', 'TypeUse', 'HAS_TYPE_USE'], ['TypeUse', 'TypeUse', 'HAS_TYPE_USE'],
    ['ProjectFile', 'TypeUse', 'CONSISTS_OF'], ['TypeUse', 'TypeExpression', 'HAS_TYPE'],
    ['TypeExpression', 'Symbol', 'REFERS_TO'], ['TypeExpression', 'TypeExpression', 'HAS_ELEMENT_TYPE'],
    ['TypeExpression', 'TypeExpression', 'APPLIES_GENERIC'], ['TypeExpression', 'TypeExpression', 'HAS_TYPE_ARGUMENT'],
    ['TypeExpression', 'Expression', 'HAS_VALUE_ARGUMENT'], ['TypeExpression', 'Symbol', 'HAS_TEMPLATE_ARGUMENT'],
    ['TypeExpression', 'TypeExpression', 'HAS_PARAMETER_TYPE'], ['TypeExpression', 'TypeExpression', 'RETURNS_TYPE'],
    ['TypeExpression', 'TypeExpression', 'HAS_COMPONENT_TYPE'], ['TypeExpression', 'TypeExpression', 'HAS_BOUND_TYPE'],
    ['TypeExpression', 'Expression', 'HAS_DIMENSION_EXPRESSION'], ['TypeExpression', 'Expression', 'DEFINED_BY'],
    ['TypeExpression', 'Symbol', 'DEPENDS_ON'], ['TypeExpression', 'Expression', 'DEPENDS_ON'],
    ['ProjectFile', 'Expression', 'CONSISTS_OF'],
    ['Expression', 'Expression', 'HAS_OPERAND'], ['Expression', 'Symbol', 'INTRODUCES'],
    ['Expression', 'Expression', 'HAS_CALLEE'], ['Expression', 'Expression', 'HAS_ARGUMENT'],
    ['Expression', 'Expression', 'CONDITION_EXPRESSION'], ['Expression', 'Symbol', 'INVOKES'],
    ['Expression', 'Symbol', 'REFERS_TO'], ['TypeUse', 'Symbol', 'REFERS_TO'],
    ['Expression', 'Declaration', 'POSSIBLE_IMPLEMENTATION'],
    ['Expression', 'Symbol', 'BINDS_ARGUMENT'], ['Expression', 'TypeExpression', 'CONVERTS_TO'],
    ['ProjectFile', 'Import', 'IMPORTS'], ['Declaration', 'Import', 'CONTAINS_IMPORT'],
    ['Import', 'Expression', 'HAS_SOURCE_EXPRESSION'],
    ['Import', 'Expression', 'HAS_IMPORT_EXPRESSION'], ['Import', 'Symbol', 'INTRODUCES'],
    ['Import', 'ProjectFile', 'IMPORTS_FROM'], ['Import', 'Symbol', 'IMPORTS_FROM'],
    ['ProjectFile', 'Annotation', 'ANNOTATES'], ['Declaration', 'Annotation', 'CONTAINS_ANNOTATION'],
    ['Annotation', 'Declaration', 'ANNOTATES'], ['Annotation', 'Expression', 'HAS_ARGUMENT'],
    ['Annotation', 'Expression', 'HAS_APPLICATION_EXPRESSION'],
    ['Coverage', 'Project', 'ASSESSED_IN'], ['Coverage', 'ProjectFile', 'EXCLUDES_SOURCE'],
    ['Diagnostic', 'Project', 'REPORTED_IN'], ['Diagnostic', 'ProjectFile', 'LOCATED_IN'],
    ['Diagnostic', 'ProjectFile', 'RELATED_LOCATION'],
    ['Project', 'Module', 'CONTAINS'], ['Directory', 'Module', 'CONTAINS'],
    ['Project', 'Resource', 'CONTAINS'], ['Directory', 'Resource', 'CONTAINS'],
    ['Module', 'Module', 'IMPORTS'], ['Module', 'ExternalLibrary', 'IMPORTS'],
    ['Module', 'Module', 'CONSISTS_OF'], ['Module', 'Unit', 'CONSISTS_OF'],
    ['Module', 'Member', 'CONSISTS_OF'], ['Module', 'Module', 'DECLARES'],
    ['Module', 'Unit', 'DECLARES'], ['Module', 'Member', 'DECLARES'],
    ['Unit', 'Unit', 'CONSISTS_OF'], ['Unit', 'Unit', 'DEPENDS'],
    ['Unit', 'Unit', 'IMPLEMENTS'], ['Unit', 'Unit', 'INHERITANCE'],
    ['Unit', 'Member', 'CONSISTS_OF'], ['Unit', 'Member', 'DECLARES'],
    ['Member', 'Member', 'CONSISTS_OF'], ['Member', 'Member', 'INVOKES'],
    ['Member', 'Member', 'ACCESSES'], ['Member', 'Member', 'USES'],
    ['Member', 'Member', 'OVERRIDE'], ['Member', 'Member', 'IMPLEMENTS']
  ]) assert(schemaRelations.some(group => group.displayFrom === from && group.displayTo === to && group.label === label && group.overview), `${from} -> ${to}`);
  for (const [from, to] of [
    ['Module', 'ProjectFile'], ['Module', 'Symbol'], ['Unit', 'Symbol'],
    ['Member', 'Symbol'], ['Member', 'Declaration'], ['Resource', 'ProjectFile']
  ]) assert(schemaRelations.some(group => group.from === from && group.to === to && group.label === 'DERIVED_FROM'));
  assert(schemaRelations.some(group => group.from === 'Project' && group.to === 'Project' && group.label === 'DEPENDS_ON'));
  const codeTypes = ['Import', 'Annotation', 'Declaration', 'TypeUse', 'Expression', 'Symbol'];
  assert(!schemaRelations.some(group => group.from === 'Project' && codeTypes.includes(group.to)
    || group.to === 'Project' && codeTypes.includes(group.from)), 'Project reaches code only through files and owners');
  for (const [from, to] of [['ProjectFile', 'Declaration'], ['ProjectFile', 'TypeUse'], ['ProjectFile', 'Expression'], ['Declaration', 'TypeUse']]) {
    const connections = schemaRelations.filter(group => group.from === from && group.to === to || group.from === to && group.to === from);
    assert.equal(connections.length, 1, `${from}/${to} has one composition relationship, without an inverse copy`);
    assert.equal(connections[0].from, from);
    assert.equal(connections[0].label, 'CONSISTS_OF');
  }
  const fileAnnotations = schemaRelations.filter(group => group.from === 'ProjectFile' && group.to === 'Annotation' || group.from === 'Annotation' && group.to === 'ProjectFile');
  assert.equal(fileAnnotations.length, 1);
  assert.equal(fileAnnotations[0].from, 'ProjectFile');
  assert.equal(fileAnnotations[0].label, 'ANNOTATES');
  const fileImports = schemaRelations.filter(group => group.from === 'ProjectFile' && group.to === 'Import' || group.from === 'Import' && group.to === 'ProjectFile');
  assert.deepEqual([...fileImports].map(group => group.label).sort(), ['IMPORTS', 'IMPORTS_FROM']);
  assert(!schemaRelations.some(group => group.label === 'REEXPORTS_FROM'));
  for (const target of ['Directory', 'ProjectFile']) {
    const connections = schemaRelations.filter(group => group.from === 'Project' && group.to === target);
    assert.equal(connections.length, 1);
    assert.equal(connections[0].label, 'CONTAINS');
  }
  assert(!links.some(link => ['Repository', 'Project', 'Directory', 'ProjectFile'].includes(link.from)
    && /repository_id|descriptor_file_id|root_directory_id|parent_project_id|parent_directory_id|^(contains|external|depends_on)\[\]/.test(link.field)));
  assert(schemaRelations.filter(group => group.to === 'TypeExpression' && group.label === 'HAS_TYPE').length >= 4);
  assert(!schemaRelations.some(group => ['CallableProfile', 'ParameterProfile', 'TypeProfile'].includes(group.from) && group.kind === 'extension'));
  assert(!links.some(link => link.from === 'Declaration' && /_id|has_type\[\]/.test(link.field)), 'Declaration uses native relationship names, not endpoint properties');
  assert(!links.some(link => ['TypeUse', 'TypeExpression'].includes(link.from) && /_id|has_type\[\]/.test(link.field)), 'Type nodes expose native relationships instead of endpoint properties');
  assert(!links.some(link => ['Import', 'Annotation'].includes(link.from) && /_id/.test(link.field)), 'Import and Annotation expose native relationships');
  assert(!links.some(link => link.from === 'TypeUse' && link.to === 'TypeProfile'), 'Name binding does not replace semantic type structure');
  assert(!names.includes('CallCondition'));
  assert(!names.includes('Evidence'));
  assert(!links.some(link => ['Coverage', 'Diagnostic'].includes(link.from) && /_id/.test(link.field)));
  assert(!links.some(link => link.from === 'Expression' &&
    ['file_id', 'declaration_id', 'introduced_symbol_id', 'callee_expression_id', 'operands[].expression_id', 'arguments[].expression_id', 'has_type[].target_id'].includes(link.field)),
  'Expression and call syntax links use native relationship names');
  for (const name of ['CallProfile', 'Reference', 'Resolution', 'ImplementationSet', 'SourceSpan', 'SourceFile', 'AnalysisContext', 'AnalysisUnit']) assert(!names.includes(name));
  assert.equal(links.filter(link => link.from === 'Symbol' && link.to === 'Declaration' && link.field === 'HAS_DECLARATION').length, 1);
});

test('all code categories reach projects transitively and shared files retain every membership', () => {
  const records = new Map(entities);
  records.set('annotation:membership', { category: 'Annotation', file_id: 'inventory:example' });
  records.set('project:shared', { id: 'project:shared', category: 'Project' });
  const relationships = [...example.relationships];
  function projectsOf(id, visited = new Set()) {
    const record = records.get(id);
    if (!record || visited.has(id)) return [];
    visited.add(id);
    if (record.category === 'Project') return [id];
    const next = record.category === 'ProjectFile'
      ? relationships.filter(edge => edge.type === 'CONTAINS' && edge.target_id === id && records.get(edge.source_id)?.category === 'Project').map(edge => edge.source_id)
      : record.category === 'Symbol'
        ? [...records.values()].filter(item => item.category === 'Declaration' && item.symbol_id === id).map(item => item.id).concat(record.owner_symbol_id || [])
        : [record.file_id, record.span?.file_id, record.subject_id, record.declaration_id].filter(Boolean);
    return [...new Set(next.flatMap(target => projectsOf(target, visited)))].sort();
  }
  const ids = ['import:Engine', 'annotation:membership', 'decl:dispatch', 'typeuse:active-context', 'call:dispatch-execute', 'symbol:RenderContext'];
  for (const id of ids) {
    assert(!('project_id' in records.get(id)));
    assert.deepEqual(projectsOf(id), ['project:example']);
  }
  relationships.push({ source_id: 'project:shared', type: 'CONTAINS', target_id: 'inventory:example', state: 'established', membership: 'declared' });
  for (const id of ids) assert.deepEqual(projectsOf(id), ['project:example', 'project:shared']);
  assert.deepEqual(projectsOf('symbol:std-string'), [], 'Unavailable external source does not establish a project');
});

test('project import/export endpoints and code-to-project evidence shortcuts are rejected', () => {
  const imported = JSON.parse(JSON.stringify(model));
  imported.Import.find(record => record.id === 'import:Engine').imports_from[0].target_id = 'project:example';
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(imported), /Invalid IMPORTS_FROM edge/);
  const exported = JSON.parse(JSON.stringify(model));
  exported.Project[0].exports = [{ target_id: 'symbol:RenderContext', project_id: 'project:example', state: 'established' }];
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(exported), /Invalid EXPORTS edge/);
  const supported = JSON.parse(JSON.stringify(model));
  supported.Expression.find(record => record.id === 'call:dispatch-execute').evidence[0].supports.push({ subject_id: 'project:example' });
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(supported), /reach Project transitively/);
});

test('Symbol typing is a declaration-less external fallback, never a copied declaration summary', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const declaration = copy.Declaration.find(record => record.has_type?.length);
  const symbol = copy.Symbol.find(record => record.id === declaration.symbol_id);
  symbol.has_type = JSON.parse(JSON.stringify(declaration.has_type));
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /cannot duplicate declaration types/);
  delete symbol.has_type;
  copy.Symbol.push({ id: 'symbol:external-typed', kind: 'variable', name: 'external_value', origin: 'external',
    identity_state: 'established', has_type: JSON.parse(JSON.stringify(declaration.has_type)) });
  assert.doesNotThrow(() => context.window.CODE_GRAPH_DEPENDENCIES(copy));
  copy.Symbol.at(-1).identity_state = 'provisional';
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /cannot duplicate declaration types/);
});

test('interactive graph filters relationship endpoints without discarding moved coordinates', () => {
  const app = readFileSync(new URL('app.js', import.meta.url), 'utf8');
  const setup = app.slice(0, app.indexOf('  function relationGroups('));
  const labeling = app.slice(app.indexOf('  function relationLabel('), app.indexOf('  function renderRelationInfo('));
  const filtering = app.slice(app.indexOf('  function related('), app.indexOf('  function renderGraph('));
  const browser = { window: { CODE_GRAPH_SOURCE: context.window.CODE_GRAPH_SOURCE } };
  runInNewContext(`${setup}\n${labeling}\n${filtering}\nwindow.graph = { state, graphNodes, filteredEntities, related };\n})();`, browser);
  const { state, graphNodes, filteredEntities, related } = browser.window.graph;
  assert(graphNodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
  assert.equal(filteredEntities().length, 22);
  state.layer = 'semantic-graph';
  assert.deepEqual(Array.from(filteredEntities(), entity => entity.name).sort(),
    ['Directory', 'ExternalLibrary', 'Member', 'Module', 'Project', 'Repository', 'Resource', 'Unit']);
  state.layer = 'code-facts';
  assert.equal(filteredEntities().length, 18);
  assert(!filteredEntities().some(entity => ['Module', 'Unit', 'Member', 'Resource'].includes(entity.name)));
  state.layer = 'all';
  const expression = graphNodes.find(node => node.name === 'Expression');
  expression.x = -150; expression.y = 420;
  state.relationFilter = 'INVOKES';
  assert.deepEqual(Array.from(filteredEntities(), entity => entity.name).sort(), ['Expression', 'Member', 'Symbol']);
  state.selected = 'Expression'; state.neighbors = true;
  assert.deepEqual(Array.from(related('Expression')).sort(), ['Expression', 'Symbol']);
  state.layer = 'semantic-graph'; state.neighbors = false;
  assert.deepEqual(Array.from(filteredEntities(), entity => entity.name), ['Member']);
  state.layer = 'code-facts';
  assert.deepEqual(Array.from(filteredEntities(), entity => entity.name).sort(), ['Expression', 'Symbol']);
  state.query = 'no-matching-structure';
  assert.equal(filteredEntities().length, 0);
  state.query = ''; state.layer = 'all'; state.neighbors = false; state.relationFilter = 'all';
  assert.equal(filteredEntities().length, 22);
  assert.equal(expression.x, -150);
  assert.equal(expression.y, 420);
});

test('graph connections are straight boundary-to-boundary segments except self loops', () => {
  const app = readFileSync(new URL('app.js', import.meta.url), 'utf8');
  const routing = app.slice(app.indexOf('  function connectionPath('), app.indexOf('  function drawConnections('));
  const browser = {};
  runInNewContext(`${routing}\nthis.route = connectionPath;`, browser);
  const origin = { left: 0, right: 200, top: 0, height: 100 };
  assert.equal(browser.route(origin, { left: 400, right: 600, top: 0, height: 100 }, false, 0), 'M 200 50 L 400 50');
  assert.equal(browser.route(origin, { left: 0, right: 200, top: 300, height: 100 }, false, 0), 'M 100 100 L 100 300');
  assert.equal(browser.route(origin, { left: 400, right: 600, top: 200, height: 100 }, false, 0), 'M 200 100 L 400 200');
  assert.equal(browser.route(origin, { left: -400, right: -200, top: -200, height: 100 }, false, 0), 'M 0 0 L -200 -100');
  assert.equal(browser.route(origin, { left: 400, right: 500, top: 25, height: 50 }, false, 0), 'M 200 50 L 400 50');
  assert.match(browser.route(origin, origin, true, 9), /^M .+ C /);
  assert.equal(browser.route(origin, origin, false, 0), '');
});

test('graph zoom preserves the world point under the cursor and clamps its scale', () => {
  const app = readFileSync(new URL('app.js', import.meta.url), 'utf8');
  const zooming = app.slice(app.indexOf('  function zoomMap('), app.indexOf('  function fitMap('));
  const browser = { state: { zoom: 1, cameraX: 80, cameraY: -30, fit: true }, applyMapCamera() {} };
  runInNewContext(`${zooming}\nzoomMap(2, 200, 150);`, browser);
  assert.equal(browser.state.zoom, 2);
  assert.equal(browser.state.fit, false);
  assert.equal((200 - browser.state.cameraX) / browser.state.zoom, 120);
  assert.equal((150 - browser.state.cameraY) / browser.state.zoom, 180);
  runInNewContext('zoomMap(100, 200, 150);', browser);
  assert.equal(browser.state.zoom, 3);
  runInNewContext('zoomMap(0, 200, 150);', browser);
  assert.equal(browser.state.zoom, .1);
  assert(Math.abs((200 - browser.state.cameraX) / browser.state.zoom - 120) < 1e-9);
  assert(Math.abs((150 - browser.state.cameraY) / browser.state.zoom - 180) < 1e-9);
});

test('USG separates reconciled Code Facts from the user-facing Semantic Graph', () => {
  const specification = context.window.CODE_GRAPH_SOURCE;
  const architecture = specification.split('#### USG Layer Boundaries')[1].split('Analysis reads source text')[0];
  assert(architecture.includes('The boundary is between analysis facts and a user-facing semantic projection, not between syntax and semantics'));
  assert(architecture.includes('Direct binding results belong to Code Facts'));
  assert(architecture.includes('Analyze projects asynchronously and in parallel'));
  assert(architecture.includes('This is completion of the first layer'));
  assert(architecture.includes('every inventoried project\'s analysis job has reached a terminal state'));
  assert(architecture.includes('completion of jobs does not imply semantic completeness'));
  assert(architecture.includes('already supported cross-project facts need not wait for all projects'));
  assert(architecture.includes('replacing a previous result MUST NOT leave stale selected targets'));
  assert(architecture.includes('These projection categories do not change the Code Facts schema'));
  assert(architecture.includes('not the two-layer architecture'));
  const names = [...specification.matchAll(/^### (\w+)$/gm)].map(match => match[1]);
  assert.equal(names.length, 22);
  for (const name of ['Reference', 'Resolution', 'ImplementationSet', 'CallProfile']) assert(!names.includes(name));
  for (const name of ['Module', 'Unit', 'Member', 'Resource']) {
    assert(names.includes(name));
    assert(!(name in model), 'Projection categories do not become Code Facts fixture categories');
  }
});

test('quality contracts embed evidence and separate coverage scope from diagnostic messages', () => {
  const specification = context.window.CODE_GRAPH_SOURCE;
  assert(!/^### Evidence$/m.test(specification));
  assert(specification.includes('#### Embedded Evidence'));
  assert(specification.includes('No Evidence category or canonical evidence ID'));
  const coverage = specification.split('### Coverage\n')[1].split('### Diagnostic\n')[0];
  assert(coverage.includes('never an AttributePath'));
  assert(coverage.includes('`attribute_path` ?'));
  assert(coverage.includes('At most one current Coverage'));
  assert(specification.includes('### Diagnostic'));
  assert(specification.includes('`RELATED_TO`'));
  assert(specification.includes('#### Current-State Updates'));
});

test('embedded evidence preserves prerequisite paths and requires explicit context independence', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const call = copy.Expression.find(record => record.id === 'call:dispatch-execute');
  const entry = call.evidence.find(record => record.attribute_path === 'invokes[0]');
  call.evidence = [entry];
  entry.supports.push({ subject_id: 'symbol:dispatch', attribute_path: 'name' });
  const alternate = 'context:evidence-alternate';
  copy.Project.push({ ...copy.Project[0], id: alternate });
  call.binding_results.push({ ...call.binding_results.find(record => record.site_key === 'call'), project_id: alternate });
  call.invokes.push({ ...call.invokes[0], project_id: alternate });
  const callEdges = () => context.window.CODE_GRAPH_DEPENDENCIES(copy).edges.filter(edge => edge.kind === 'call' && edge.supporting_ids.includes(call.id));
  let edges = callEdges();
  assert.equal(edges.find(edge => edge.project_id === entry.project_id).evidence_refs.length, 1);
  assert.equal(edges.find(edge => edge.project_id === alternate).evidence_refs.length, 0);
  assert(edges[0].supporting_facts.some(fact => fact.subject_id === 'symbol:dispatch' && fact.attribute_path === 'name'));
  delete entry.project_id;
  assert.throws(callEdges, /Invalid embedded evidence/);
  entry.project_independent = true;
  entry.attribute_path = 'condition';
  edges = callEdges();
  assert(edges.every(edge => edge.evidence_refs.length === 1));
  delete entry.attribute_path;
  assert(callEdges().every(edge => edge.evidence_refs.length === 0), 'Whole-owner support is not support for each outgoing edge');
});

test('quality validation rejects global evidence identities, duplicate local keys and dangling support', () => {
  const mutations = [
    (copy, call) => { copy.Evidence = []; },
    (copy, call) => { call.evidence[0].id = 'forbidden:global-evidence'; },
    (copy, call) => { call.evidence.push({ ...call.evidence[0] }); },
    (copy, call) => { call.evidence[0].project_independent = true; },
    (copy, call) => { call.evidence[0].supports.push({ subject_id: 'missing:prerequisite' }); },
    (copy, call) => { call.evidence[0].source_spans = [{ ...call.span, end_offset: sourceBytes.length + 1 }]; }
  ];
  for (const mutate of mutations) {
    const copy = JSON.parse(JSON.stringify(model));
    mutate(copy, copy.Expression.find(record => record.id === 'call:dispatch-execute'));
    assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy));
  }
  assert(!('Evidence' in model));
  for (const source of entities.values()) for (const entry of source.evidence || []) {
    assert(!('id' in entry || 'subject_id' in entry || 'supporting_ids' in entry));
    for (const support of entry.supports) assert(entities.has(support.subject_id));
  }
});

test('Coverage has unique current scopes and dimensions do not act as fact paths', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const record = copy.Coverage.find(item => item.subject_id === 'call:dispatch-execute' && item.attribute_path?.startsWith('binding_results'));
  copy.Coverage.push({ ...record, id: 'coverage:duplicate' });
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /current Coverage scope/);
  copy.Coverage.pop();
  const originalDimension = record.dimension;
  record.dimension = record.attribute_path;
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /current Coverage scope/);
  record.dimension = originalDimension;
  const originalContext = record.project_id;
  delete record.project_id;
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /current Coverage scope/);
  record.project_id = originalContext;
  record.dimension = 'imports';
  const edges = context.window.CODE_GRAPH_DEPENDENCIES(copy).edges;
  assert(!edges.some(edge => edge.kind === 'call' && edge.supporting_ids.includes(record.id)), 'A matching path in an unrelated dimension is not call coverage');
  assert.equal(copy.Coverage.find(item => item.id === 'coverage:external-libraries').state, 'unknown', 'No emitted dependencies does not mean complete inventory');
});

test('Diagnostic retains related facts and locations without changing truth or completeness', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const diagnostic = copy.Diagnostic.find(record => record.id === 'diagnostic:dependency-cycle');
  assert.equal(diagnostic.related_subjects.length, 2);
  assert.equal(diagnostic.related_spans.length, 1);
  const baseline = JSON.stringify(context.window.CODE_GRAPH_DEPENDENCIES(copy).edges);
  const coverage = JSON.stringify(copy.Coverage);
  diagnostic.severity = 'error';
  diagnostic.message = 'Changed wording cannot change graph facts.';
  assert.equal(JSON.stringify(context.window.CODE_GRAPH_DEPENDENCIES(copy).edges), baseline);
  assert.equal(JSON.stringify(copy.Coverage), coverage);
  diagnostic.related_subjects[0].subject_id = 'missing:declaration';
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /missing record/);
  diagnostic.related_subjects[0].subject_id = 'decl:finalize';
  diagnostic.related_spans[0].span.end_offset = sourceBytes.length + 1;
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /quality source range/);
});

test('Import and Annotation expose source properties and native relationships without extra fact nodes', () => {
  const specification = context.window.CODE_GRAPH_SOURCE;
  const imports = specification.split('### Import\n')[1].split('### Annotation\n')[0];
  const annotations = specification.split('### Annotation\n')[1].split('#### Semantic Edges')[0];
  const propertyNames = section => section.split('#### ')[0].split('\n').filter(line => /^\| `/.test(line))
    .flatMap(line => [...line.split('|')[1].matchAll(/`(\w+)`/g)].map(match => match[1]));
  assert.deepEqual(propertyNames(imports), ['start_offset', 'end_offset', 'form', 'is_reexport', 'source_form',
    'path_segments', 'relative_level', 'bindings_json', 'presence_condition']);
  assert.deepEqual(propertyNames(annotations), ['start_offset', 'end_offset', 'form', 'presence_condition']);
  assert(imports.includes('no canonical') || imports.includes('not a canonical edge ID'));
  assert(imports.includes('site_key source'));
  assert(annotations.includes('not required for every annotation name'));
  assert(annotations.includes('no invented source-call Expression'));
  assert(annotations.includes('reuses the same Expression occurrence'));
  for (const record of model.Import) {
    assert(!('kind' in record));
    assert(record.binding_results.some(result => result.site_key === 'source'));
    if (record.form === 'include') {
      assert.equal(record.source_form, 'angle_header');
      assert.equal(record.binding_results[0].state, 'unsupported');
      assert(!record.imports_from && !record.refers_to, 'A header path is not a fabricated Symbol reference');
    }
  }
});

test('Import source assessments retain unresolved directives, candidates, contexts and exact support', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const source = copy.Import.find(record => record.id === 'import:Engine');
  const assessment = source.binding_results.find(result => result.site_key === 'source');
  const established = context.window.CODE_GRAPH_DEPENDENCIES(copy).edges.find(edge => edge.kind === 'imports_from');
  assert.equal(established.candidate_set_completeness, 'complete');
  assert(established.supporting_ids.includes('coverage:using-Engine-source'));
  assert(!context.window.CODE_GRAPH_DEPENDENCIES(copy).edges.some(edge => edge.supporting_ids.includes('import:memory')));
  assessment.state = 'partial';
  assessment.candidate_set_completeness = 'partial';
  source.imports_from[0].state = 'candidate';
  const possible = context.window.CODE_GRAPH_DEPENDENCIES(copy).edges.find(edge => edge.kind === 'imports_from');
  assert.equal(possible.certainty, 'possible');
  assert.equal(possible.candidate_set_completeness, 'partial');
  const support = source.evidence.find(record => record.key === 'using-Engine');
  copy.Project.push({ ...copy.Project[0], id: 'context:other' });
  support.project_id = 'context:other';
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /candidate needs evidence/);
  support.project_id = assessment.project_id;
  support.attribute_path = 'refers_to[0]';
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /candidate needs evidence/);
  source.imports_from = [];
  assessment.state = 'unresolved';
  assert(!context.window.CODE_GRAPH_DEPENDENCIES(copy).edges.some(edge => edge.kind === 'imports_from'));
  assessment.state = 'resolved';
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /one selected target/);
});

test('Import distinguishes source providers, aliased member targets and introduced local Symbols', () => {
  const { fixture, span, file_id, project_id } = directiveFixture('export { Renderer as View } from "./rendering";');
  fixture.ProjectFile.push({ id: 'file:provider' });
  fixture.Symbol.push(
    { id: 'symbol:Renderer', kind: 'type', name: 'Renderer', identity_state: 'established' },
    { id: 'symbol:View', kind: 'type', name: 'View', identity_state: 'established' });
  const source = { id: 'import:fragment', file_id, project_id, span, form: 'import', is_reexport: true, source_form: 'string',
    path_segments: ['./rendering'], bindings: [{ key: 'renderer', wildcard: false, name_use_key: 'name:renderer' }],
    name_uses: [{ key: 'name:renderer', start_offset: 9, end_offset: 17, role: 'export', qualification: 'unqualified' }],
    binding_results: ['source', 'name:renderer'].map(site_key => ({ site_key, project_id,
      state: 'resolved', candidate_set_completeness: 'complete', reason_codes: [] })),
    imports_from: [{ target_id: 'file:provider', project_id, site_key: 'source', state: 'established' }],
    refers_to: [{ target_id: 'symbol:Renderer', project_id, site_key: 'name:renderer', state: 'selected', applicability: 'applicable' }] };
  fixture.Import.push(source);
  let edges = context.window.CODE_GRAPH_DEPENDENCIES(fixture).edges;
  assert.equal(edges.filter(edge => edge.kind === 'imports_from').length, 1);
  assert(edges.find(edge => edge.kind === 'imports_from').is_reexport);
  assert(edges.some(edge => edge.to === 'symbol:Renderer' && edge.kind === 'reference'));
  assert(!edges.some(edge => edge.to === 'symbol:View'), 'An exported alias is not automatically a local binding');
  source.is_reexport = false;
  source.introduces = [{ target_id: 'symbol:View', binding_key: 'renderer', project_id }];
  edges = context.window.CODE_GRAPH_DEPENDENCIES(fixture).edges;
  assert(edges.some(edge => edge.kind === 'imports_from'));
  assert.equal(edges.find(edge => edge.kind === 'imports_from').is_reexport, false);
  assert(!edges.some(edge => edge.to === 'symbol:View'), 'Introduction alone is not an external dependency');
  source.bindings[0].wildcard = true;
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(fixture), /Import introduction/);
  source.bindings[0].wildcard = false;
  source.bindings.push({ ...source.bindings[0] });
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(fixture), /Import binding/);
});

test('Import rejects unassessed providers, false resolution, provisional identities and duplicated reexports', () => {
  const mutations = [
    source => { source.binding_results = source.binding_results.filter(result => result.site_key !== 'source'); },
    source => { source.binding_results[0].candidate_set_completeness = 'partial'; },
    source => { source.binding_results[0].state = 'unresolved'; },
    source => { source.imports_from[0].target_id = 'symbol:SceneManager'; },
    source => { source.imports_from[0].site_key = 'name:0'; },
    source => { source.is_reexport = true; source.reexports_from = source.imports_from; },
    (source, copy) => { copy.Symbol.find(record => record.id === 'symbol:Engine').identity_state = 'provisional'; }
  ];
  for (const mutate of mutations) {
    const copy = JSON.parse(JSON.stringify(model));
    mutate(copy.Import.find(record => record.id === 'import:Engine'), copy);
    assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy));
  }
});

test('Annotation preserves file and return targets, source order and shared written application expressions', () => {
  const { fixture, span, file_id, project_id } = directiveFixture('@factory(1)\ndef render(): pass');
  fixture.Symbol.push({ id: 'symbol:render', kind: 'callable', name: 'render' });
  fixture.Declaration.push({ id: 'decl:render', symbol_id: 'symbol:render', file_id, project_id, span });
  fixture.Expression.push(
    { id: 'expression:factory', file_id, project_id, declaration_id: 'decl:render', kind: 'call', call_kind: 'ordinary',
      span: { ...span, start_offset: 1, end_offset: 11 }, callee_expression_id: 'expression:factory-name',
      arguments: [{ expression_id: 'expression:one' }] },
    { id: 'expression:factory-name', file_id, project_id, declaration_id: 'decl:render', kind: 'name', span: { ...span, start_offset: 1, end_offset: 8 } },
    { id: 'expression:one', file_id, project_id, declaration_id: 'decl:render', kind: 'literal', span: { ...span, start_offset: 9, end_offset: 10 } });
  const annotation = { id: 'annotation:factory', file_id, project_id, declaration_id: 'decl:render', form: 'decorator',
    span: { ...span, end_offset: 11 }, targets: [{ target_id: 'decl:render', role: 'declaration', position: 0 }],
    application_expression_id: 'expression:factory', arguments: [{ expression_id: 'expression:one' }] };
  fixture.Annotation.push(annotation);
  const before = JSON.stringify(fixture);
  assert.equal(context.window.CODE_GRAPH_DEPENDENCIES(fixture).edges.length, 0, 'An application alone does not establish invocation');
  assert.equal(JSON.stringify(fixture), before, 'Projection must not clone arguments or synthesize calls');
  annotation.targets[0].role = 'return';
  context.window.CODE_GRAPH_DEPENDENCIES(fixture);
  delete annotation.declaration_id;
  delete annotation.application_expression_id;
  annotation.arguments = [];
  annotation.form = 'attribute';
  annotation.targets = [{ target_id: 'file:fragment', role: 'file', position: 0 }];
  context.window.CODE_GRAPH_DEPENDENCIES(fixture);
  fixture.Annotation.push({ ...annotation, id: 'annotation:second', targets: [{ ...annotation.targets[0], position: 1 }] });
  context.window.CODE_GRAPH_DEPENDENCIES(fixture);
  fixture.Annotation[1].targets[0].position = 0;
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(fixture), /Annotation target/);
  fixture.Annotation.pop();
  annotation.targets[0].role = 'return';
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(fixture), /Annotation target/);
  annotation.targets = [];
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(fixture), /target assessment/);
  fixture.Coverage.push({ id: 'coverage:annotation', subject_id: annotation.id, project_id: 'project:fragment', dimension: 'annotations', attribute_path: 'targets', state: 'partial' });
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(fixture), /target assessment/);
  fixture.Diagnostic.push({ id: 'diagnostic:annotation', subject_id: annotation.id, severity: 'warning',
    code: 'test.unsupported_target', message: 'Target syntax is unavailable in this test fragment.' });
  context.window.CODE_GRAPH_DEPENDENCIES(fixture);
});

test('computed Import paths reuse actual Expressions and reject foreign ownership or source ranges', () => {
  const { fixture, span, file_id, project_id } = directiveFixture('import(path)');
  fixture.Expression.push({ id: 'expression:path', file_id, project_id, kind: 'name', span: { ...span, start_offset: 7, end_offset: 11 } });
  const source = { id: 'import:computed', file_id, project_id, span, form: 'import', source_form: 'expression',
    is_reexport: false, bindings: [], path_expression_id: 'expression:path', binding_results: [] };
  fixture.Import.push(source);
  assert.equal(context.window.CODE_GRAPH_DEPENDENCIES(fixture).edges.length, 0);
  fixture.Expression[0].span.end_offset = span.end_offset + 1;
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(fixture), /source expression/);
  fixture.Expression[0].span.end_offset = 11;
  source.source_form = 'string';
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(fixture), /Import syntax/);
});

test('direct invocation facts retain occurrence, context, candidates and selected-target safety', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const call = copy.Expression.find(record => record.id === 'call:dispatch-execute');
  const decision = call.binding_results.find(record => record.site_key === 'call');
  const view = context.window.CODE_GRAPH_DEPENDENCIES(copy);
  const edge = view.edges.find(record => record.attribute_path === 'invokes[0]' && record.supporting_ids.includes(call.id));
  assert.equal(edge.from, 'symbol:dispatch');
  assert.equal(edge.to, 'symbol:execute');
  assert.equal(edge.certainty, 'selected');
  assert.equal(edge.project_id, decision.project_id);
  call.binding_results[0].candidate_set_completeness = 'partial';
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /complete candidate scope/);
});

test('Code Facts separates Symbol properties from Neo4j relationships and describes all kinds and origins', () => {
  const specification = context.window.CODE_GRAPH_SOURCE;
  assert(specification.startsWith('# Unified Software Graph:'));
  assert(specification.includes('native directed Neo4j relationships'));
  const symbol = specification.split('### Symbol\n')[1].split('### Declaration\n')[0];
  const properties = symbol.split('#### Symbol Kinds')[0];
  const names = [...properties.matchAll(/^\| `(\w+)` [!?] \|/gm)].map(match => match[1]);
  assert.deepEqual(names, ['name', 'kind', 'origin', 'identity_state']);
  const kinds = symbol.split('#### Symbol Kinds')[1].split('#### Symbol Origins')[0];
  const origins = symbol.split('#### Symbol Origins')[1].split('#### Symbol Relationships')[0];
  const describedKinds = [...kinds.matchAll(/^\| `(\w+)` \| (.+) \| (.+) \|$/gm)].map(match => match[1]).filter(name => name !== 'kind');
  const describedOrigins = [...origins.matchAll(/^\| `(\w+)` \| (.+) \| (.+) \|$/gm)].map(match => match[1]).filter(name => name !== 'origin');
  assert.deepEqual(describedKinds, ['namespace', 'module', 'type', 'callable', 'field', 'variable', 'parameter',
    'type_parameter', 'enum_value', 'property', 'label', 'macro', 'language_specific']);
  assert.deepEqual(describedOrigins, ['source', 'generated', 'external', 'system', 'intrinsic', 'placeholder']);
  for (const record of model.Symbol) {
    assert(describedKinds.includes(record.kind));
    assert(describedOrigins.includes(record.origin));
    assert(!('language_identity' in record));
    if (record.origin === 'placeholder') assert.equal(record.identity_state, 'provisional');
  }
  for (const kind of ['OWNS', 'HAS_DECLARATION', 'HAS_PROFILE', 'HAS_TYPE']) {
    assert(symbol.includes(`| \`${kind}\` |`));
  }
  assert(symbol.includes('child: 0..1 owner'));
  assert(symbol.includes('Declaration: exactly 1 symbol'));
  assert(symbol.includes('profile: exactly 1 owning Symbol'));
});

test('direct binding validation rejects orphaned assessments, false selections and unrelated implementations', () => {
  const mutations = [
    call => { call.binding_results = []; },
    call => { call.binding_results.push({ ...call.binding_results[0] }); },
    call => { call.binding_results[0].state = 'unresolved'; },
    call => { call.invokes[0].id = 'forbidden-edge-id'; },
    call => { call.invokes[0].target_id = 'symbol:frame-id'; },
    call => { call.invokes[0].applicability = 'unknown'; },
    call => { call.possible_implementation[0].target_id = 'decl:main'; }
  ];
  for (const mutate of mutations) {
    const copy = JSON.parse(JSON.stringify(model));
    mutate(copy.Expression.find(record => record.id === 'call:dispatch-execute'));
    assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy));
  }
});

test('walkthrough renders direct call facts, dependency views and unknown SDK boundaries without removed nodes', () => {
  const app = readFileSync(new URL('app.js', import.meta.url), 'utf8');
  const tourSetup = app.slice(app.indexOf('  const tour ='), app.indexOf('  const example ='));
  const projectCalls = app.slice(app.indexOf('  function renderProjectCalls()'), app.indexOf('  function renderTour()'));
  const renderTour = app.match(/  function renderTour\(\) \{[\s\S]*?\n  \}/)[0];
  const elements = new Map();
  const browser = {
    example, dependencies: context.window.CODE_GRAPH_DEPENDENCIES(model),
    state: { tour: 5, dependencyView: 'members' },
    document: { querySelector: selector => {
      if (!elements.has(selector)) elements.set(selector, { innerHTML: '' });
      return elements.get(selector);
    } },
    escape: value => String(value), sourceText: text, exampleValue: value => String(value),
    renderSourceExcerpts: () => '', renderExample: () => {}
  };
  runInNewContext(`${tourSetup}\n${projectCalls}\n${renderTour}\nrenderTour();`, browser);
  let html = elements.get('#tour-content').innerHTML;
  assert(html.includes('call:make-context'));
  assert(html.includes('POSSIBLE_IMPLEMENTATION'));
  assert(html.includes('Code Facts conformance'));
  assert(!/CallProfile|ImplementationSet|data-entity="(?:Reference|Resolution)"/.test(html));
  browser.state.dependencyView = 'components';
  runInNewContext('renderTour();', browser);
  html = elements.get('#tour-content').innerHTML;
  assert(html.includes('dependency-group'));
  assert(html.includes('conditional-dispatch'));
});

test('example cards and JSON expose structural relationships separately from node attributes', () => {
  const app = readFileSync(new URL('app.js', import.meta.url), 'utf8');
  const rendering = app.slice(app.indexOf('  function renderExample()'), app.indexOf('  function sourceText('));
  const target = { innerHTML: '' };
  const browser = { example, profiles: {}, state: { tour: 0, exampleScope: 'step', exampleView: 'records' },
    tour: [{ title: 'Project structure' }], document: { querySelector: () => target },
    escape: value => String(value), exampleValue: value => String(value) };
  runInNewContext(`${rendering}\nrenderExample();`, browser);
  assert(target.innerHTML.includes('HAS_PROJECT'));
  assert(target.innerHTML.includes('is_descriptor'));
  assert(!target.innerHTML.includes('undefined'));
  browser.state.exampleView = 'json';
  runInNewContext('renderExample();', browser);
  assert(target.innerHTML.includes('"relationships"'));
  assert(target.innerHTML.includes('"source_id": "repository:example"'));
  browser.state.tour = 1;
  browser.tour.push({ title: 'Symbols' });
  runInNewContext('renderExample();', browser);
  assert(!target.innerHTML.includes('"relationships"'));
});

test('Declaration exposes scalar properties and documents forms, visibility, linkage, and native relationships', () => {
  const declaration = context.window.CODE_GRAPH_SOURCE.split('### Declaration\n')[1].split('### CallableProfile\n')[0];
  const properties = declaration.split('#### Declaration Forms')[0];
  const names = properties.split('\n').filter(line => /^\| `/.test(line))
    .flatMap(line => [...line.split('|')[1].matchAll(/`(\w+)`/g)].map(match => match[1]));
  assert.deepEqual(names, ['form', 'start_offset', 'end_offset', 'name_start_offset', 'name_end_offset',
    'body_start_offset', 'body_end_offset', 'visibility', 'linkage', 'modifiers', 'presence_condition']);
  const forms = declaration.split('#### Declaration Forms')[1].split('#### Declaration Visibility and Linkage')[0];
  const describedForms = [...forms.matchAll(/^\| `(\w+)` \| (.+) \| (.+) \|$/gm)]
    .map(match => match[1]).filter(name => name !== 'form');
  assert.deepEqual(describedForms, ['declaration', 'definition', 'forward_declaration', 'implicit']);
  const categories = declaration.split('#### Declaration Visibility and Linkage')[1].split('#### Declaration Relationships')[0];
  const [visibility, linkage] = categories.split('| `linkage` | Meaning |');
  const values = table => [...table.matchAll(/^\| `(\w+)` \| (.+) \|$/gm)]
    .map(match => match[1]).filter(name => name !== 'visibility');
  assert.deepEqual(values(visibility), ['public', 'protected', 'private', 'internal', 'package', 'local', 'language_specific']);
  assert.deepEqual(values(linkage), ['external', 'internal', 'none', 'language_specific']);
  assert(declaration.includes('Declaration: exactly 1 file anchor'));
  assert(declaration.includes('child: 0..1 nearest declaration parent'));
  assert(declaration.includes('`CONSISTS_OF` | `ProjectFile -> Declaration`'));
  assert(declaration.includes('Declaration: 0..1 initializer'));
  assert(declaration.includes('Top-level declarations have no declaration parent'));
  assert(declaration.includes('encoded as a scalar JSON string in Neo4j'));
});

test('portable Declaration locations and initializers satisfy the native scalar-coordinate and relationship contract', () => {
  for (const declaration of model.Declaration) {
    assert.equal(entities.get(declaration.symbol_id).category, 'Symbol');
    assert.equal(entities.get(declaration.file_id).category, 'ProjectFile');
    if (declaration.parent_declaration_id) {
      assert.equal(entities.get(declaration.parent_declaration_id).file_id, declaration.file_id);
    }
    if (declaration.initializer_expression_id) {
      const initializer = entities.get(declaration.initializer_expression_id);
      assert.equal(initializer.category, 'Expression');
      assert.equal(initializer.file_id, declaration.file_id);
    }
    if (!declaration.span) {
      assert(!declaration.name_span && !declaration.body_span);
      continue;
    }
    assert.equal(entities.get(declaration.span.file_id).category, 'ProjectFile');
    for (const range of [declaration.span, declaration.name_span, declaration.body_span].filter(Boolean)) {
      assert.equal(range.file_id, declaration.span.file_id, 'One file-membership source version for all declaration offsets');
      assert(Number.isInteger(range.start_offset) && Number.isInteger(range.end_offset));
      assert(range.start_offset >= declaration.span.start_offset);
      assert(range.end_offset >= range.start_offset && range.end_offset <= declaration.span.end_offset);
    }
  }
});

test('expression and call contracts use native properties and relationships without a condition node', () => {
  const specification = context.window.CODE_GRAPH_SOURCE;
  const expression = specification.split('### Expression\n')[1].split('## 8.')[0];
  const call = expression.split('#### Invocation Properties')[1];
  const properties = text => text.split('\n').filter(line => /^\| `/.test(line))
    .flatMap(line => [...line.split('|')[1].matchAll(/`(\w+)`/g)].map(match => match[1]));
  assert.deepEqual(properties(expression.split('#### Expression Kinds')[0]),
    ['kind', 'start_offset', 'end_offset', 'operator', 'literal_category', 'literal_value']);
  assert.deepEqual(properties(call.split('#### Call Kinds')[0]),
    ['call_kind', 'condition_predicate', 'condition_completeness']);
  assert(!/^### CallCondition$/m.test(specification));
  for (const name of ['CONSISTS_OF', 'CONTAINS_EXPRESSION', 'HAS_OPERAND', 'INTRODUCES', 'HAS_TYPE', 'HAS_TYPE_USE']) {
    assert(expression.includes(`| \`${name}\` |`), name);
  }
  for (const name of ['HAS_CALLEE', 'HAS_ARGUMENT', 'CONDITION_EXPRESSION']) {
    assert(call.includes(`| \`${name}\` |`), name);
  }
  assert(call.includes('never graph IDs hidden in JSON'));
  assert(call.includes('The empty string') || call.includes('the empty string'));
  assert(call.includes('Absent') || call.includes('An absent condition means not recorded or unknown'));
  assert(call.includes('target-selection restrictions qualify individual INVOKES relationships'));
});

test('C++ source preserves the provided constructs and string literals', () => {
  assert.equal(example.filename, 'example.cpp');
  const file = entities.get('inventory:example');
  assert.equal(file.language, 'cpp');
  assert.equal(model.Project[0].language_settings.standard, 'c++17');
  assert.equal(externalContent[file.content_ref], code);
  assert(!('content' in file));
  assert.equal((code.match(/^#include/gm) || []).length, 3);
  assert(!code.includes('\\_'));
  assert(!code.includes('\\*'));
  assert(code.includes(String.raw`<< "\\n";`));
  assert(code.includes('SceneManager* owner_manager_;'));
  assert(code.includes('std::make_shared<RenderContext>(42, manager.get())'));
});

test('identities, profile bases, and every typed reference are valid', () => {
  const standalone = Object.entries(model).filter(([category]) => !profiles[category]).flatMap(([, records]) => records);
  assert.equal(entities.size, standalone.length, 'Duplicate standalone identities');
  for (const [category, [base, kind]] of Object.entries(profiles)) {
    for (const profile of model[category]) {
      assert.equal(entities.get(profile.id).category, base);
      assert.equal(entities.get(profile.id).kind, kind);
    }
  }
  for (const [category, kind] of [['CallableProfile', 'callable'], ['ParameterProfile', 'parameter'], ['TypeProfile', 'type']]) {
    const owners = new Set();
    for (const profile of model[category]) {
      assert.equal(entities.get(profile.id).category, category);
      assert.notEqual(profile.id, profile.symbol_id);
      assert.equal(entities.get(profile.symbol_id).category, 'Symbol');
      assert.equal(entities.get(profile.symbol_id).kind, kind);
      assert(!owners.has(profile.symbol_id), `Duplicate HAS_PROFILE for ${profile.symbol_id}`);
      owners.add(profile.symbol_id);
    }
  }
  for (const expression of model.Expression.filter(record => ['call', 'construction'].includes(record.kind))) {
    assert(expression.call_kind);
    assert.equal(entities.get(expression.callee_expression_id).category, 'Expression');
    assert(Array.isArray(expression.arguments));
  }
  for (const category of ['CallProfile', 'Reference', 'Resolution', 'ImplementationSet']) assert(!(category in model));
  function visit(value, key = '') {
    if (Array.isArray(value)) return value.forEach(item => visit(item, key));
    if (value && typeof value === 'object') return Object.entries(value).forEach(([name, child]) => visit(child, name));
    if (/_ids?$/.test(key)) assert(entities.has(value), `Dangling ${key}: ${value}`);
  }
  visit(model);
  for (const ids of example.stepRecordIds.filter(Boolean)) for (const id of ids) assert(entities.has(id), `Missing projected record: ${id}`);
  visit(example.conditionalCalls);
});

test('all spans are real bounded UTF-8 ranges; names lie within declarations', () => {
  function visit(value, inheritedFile) {
    if (!value || typeof value !== 'object') return;
    const file = value.file_id ?? value.span?.file_id ?? inheritedFile;
    if ('start_offset' in value) {
      assert.equal(file, 'inventory:example');
      assert(value.start_offset >= 0 && value.end_offset > value.start_offset && value.end_offset <= sourceBytes.length);
    }
    Object.values(value).forEach(child => visit(child, file));
  }
  visit(model);
  visit(example.excerpts);
  for (const source of entities.values()) {
    const keys = new Set();
    for (const use of source.name_uses || []) {
      assert(!keys.has(use.key));
      keys.add(use.key);
      assert(use.start_offset >= source.span.start_offset && use.end_offset <= source.span.end_offset);
      assert(!('id' in use) && !('file_id' in use));
    }
  }
  for (const decl of model.Declaration) {
    assert(decl.name_span.start_offset >= decl.span.start_offset);
    assert(decl.name_span.end_offset <= decl.span.end_offset);
    assert.equal(text(decl.name_span), entities.get(decl.symbol_id).name);
    if (decl.body_span) {
      assert.equal(decl.body_span.file_id, decl.span.file_id);
      assert(decl.body_span.start_offset >= decl.span.start_offset && decl.body_span.end_offset <= decl.span.end_offset);
    }
  }
  assert.equal(text(entities.get('call:make-context').span), 'std::make_shared<RenderContext>(42, manager.get())');
  const callee = entities.get('callee:make-context');
  assert.equal(text(callee.name_uses[0]), 'std::make_shared');
});

test('forward declarations and out-of-class definitions preserve identity and ownership', () => {
  assert.equal(entities.get('decl:RenderContext-forward').symbol_id, entities.get('decl:RenderContext').symbol_id);
  assert.equal(entities.get('decl:dispatch-forward').symbol_id, entities.get('decl:dispatch').symbol_id);
  assert.equal(entities.get('decl:dispatch').parent_declaration_id, 'decl:Engine');
  assert.equal(entities.get('symbol:dispatch').owner_symbol_id, 'symbol:SceneManager');
  assert.equal(entities.get('decl:dispatch-forward').parent_declaration_id, 'decl:SceneManager');
  for (const [category, parent] of [['Symbol', 'owner_symbol_id'], ['Declaration', 'parent_declaration_id']]) {
    for (const record of model[category]) {
      const seen = new Set();
      for (let node = record; node; node = entities.get(node[parent])) {
        assert(!seen.has(node.id), `Cyclic ${parent}`);
        seen.add(node.id);
      }
    }
  }
});

test('nested calls, source argument order, and receivers are not flattened or duplicated', () => {
  const factory = entities.get('call:make-context');
  assert.equal(factory.arguments[0].expression_id, 'expression:frame-number');
  assert.equal(factory.arguments[1].expression_id, 'call:manager-get');
  for (const call of model.Expression.filter(record => ['call', 'construction'].includes(record.kind))) {
    assert.equal(call.operands.length, 0);
    for (const expressionId of [call.callee_expression_id, ...call.arguments.map(argument => argument.expression_id)]) {
      const expression = entities.get(expressionId);
      assert.equal(expression.category, 'Expression');
      assert.equal(expression.file_id, call.file_id);
      assert.equal(expression.declaration_id, call.declaration_id);
      assert.equal(expression.span.file_id, call.span.file_id);
      assert(expression.span.start_offset >= call.span.start_offset && expression.span.end_offset <= call.span.end_offset);
    }
    assert(!('receiver_expression_id' in call));
    assert(!('type_use_ids' in call));
  }
  assert.equal(entities.get('callee:dispatch-execute').operator, '->');
  assert.equal(entities.get('callee:dispatch-execute').operands[0].expression_id, 'receiver:dispatch-execute');
  const ctor = model.CallableProfile.find(record => record.symbol_id === 'symbol:render-ctor');
  assert.equal(ctor.parameter_ids.length, 2, 'Implicit receiver must not count as a source parameter');
  assert.equal(model.ParameterProfile.find(record => record.symbol_id === 'symbol:ctor-manager').passing_mode, 'value');
});

test('type layers and written generic argument positions are preserved', () => {
  assert.equal(entities.get('type:scene-pointer').element_type_id, 'type:SceneManager');
  assert.equal(entities.get('type:shared-render').arguments[0].type_id, 'type:RenderContext');
  assert.equal(entities.get('type:level-name').dimensions[0], 'MainGameLevel'.length + 1);
  assert.equal(entities.get('type:const-char').qualifiers[0], 'const');
  for (const key of ['make-manager', 'make-context']) {
    const use = entities.get(`typeuse:${key}-argument`);
    assert.equal(use.subject_id, `call:${key}`);
    assert.equal(use.role, 'argument');
    assert.equal(use.position, 0);
  }
  const binding = entities.get('call:dispatch-execute').invokes[0].receiver_binding;
  assert.equal(binding.conversions[0].source_type_id, 'type:shared-render');
  assert.equal(binding.conversions[0].target_type_id, 'type:render-pointer');
});

test('type node contracts separate source occurrence, semantic structure, and relationship properties', () => {
  const specification = context.window.CODE_GRAPH_SOURCE;
  const use = specification.split('### TypeUse\n')[1].split('#### HAS_TYPE Edges')[0];
  const type = specification.split('### TypeExpression\n')[1].split('### TypeUse\n')[0];
  const propertyNames = table => table.split('\n').filter(line => /^\| `/.test(line))
    .flatMap(line => [...line.split('|')[1].matchAll(/`(\w+)`/g)].map(match => match[1]));
  assert.deepEqual(propertyNames(use.split('#### TypeUse Relationships')[0]), ['start_offset', 'end_offset']);
  assert.deepEqual(propertyNames(type.split('The common stable')[0]), ['kind', 'qualifiers', 'completeness']);
  const variants = type.split('| `kind` | Additional Node Properties |')[1].split('#### TypeExpression Qualifiers')[0];
  assert.deepEqual(propertyNames(variants), ['builtin', 'nominal', 'type_parameter', 'pointer', 'reference',
    'nullable', 'array', 'function', 'generic_application', 'tuple', 'union', 'intersection', 'wildcard', 'dependent', 'unknown']);
  for (const line of variants.split('\n').filter(line => /^\| `/.test(line))) {
    assert(!/\b\w+_ids?\b/.test(line.split('|')[2]), 'Variant node properties do not store cross-node IDs');
  }
  assert(use.includes('no `form` property'));
  assert(use.includes('Its `position` property is a zero-based sibling index'));
  assert(use.includes('A TypeUse does not point directly to TypeProfile'));
  assert(type.includes('For `const T*`'));
  assert(type.includes('For `T* const`'));
  assert(type.includes('share one zero-based position sequence'));
});

test('written type uses have no form and preserve one containing construct, ranges, and ordered argument positions', () => {
  const positions = new Set();
  for (const use of model.TypeUse) {
    assert(!('form' in use));
    const parent = entities.get(use.subject_id);
    assert(['Declaration', 'Expression', 'Annotation', 'TypeUse'].includes(parent.category));
    assert.equal(entities.get(use.span.file_id).category, 'ProjectFile');
    assert(['declared', 'return', 'base', 'constraint', 'cast', 'argument', 'annotation', 'language_specific'].includes(use.role));
    if (parent.category === 'TypeUse') {
      assert.equal(use.span.file_id, parent.span.file_id);
      assert(use.span.start_offset >= parent.span.start_offset && use.span.end_offset <= parent.span.end_offset);
      assert.notEqual(use.position, undefined);
    }
    if (use.role === 'argument') assert.notEqual(use.position, undefined);
    if (use.position !== undefined) {
      assert(Number.isInteger(use.position) && use.position >= 0);
      const key = `${use.subject_id}:${use.role}:${use.position}`;
      assert(!positions.has(key), 'HAS_TYPE_USE positions are unique within one parent and role');
      positions.add(key);
    }
  }
  const spelling = entities.get('typeuse:active-context');
  const application = entities.get(spelling.has_type[0].target_id);
  assert.equal(application.kind, 'generic_application');
  const argument = entities.get(application.arguments[0].type_id);
  assert.equal(argument.kind, 'nominal');
  const profile = model.TypeProfile.find(record => record.symbol_id === argument.symbol_id);
  assert(profile && profile.id !== argument.symbol_id);
  assert.equal(profile.type_kind, 'class');
  const inferred = entities.get('typeuse:manager-variable');
  assert.equal(text(inferred.span), 'auto');
  assert.equal(entities.get(inferred.has_type[0].target_id).kind, 'generic_application');
});

test('type qualifiers stay on their own semantic layer rather than a written use or declaration', () => {
  const copy = JSON.parse(JSON.stringify(model));
  copy.TypeExpression.push(
    { id: 'type:test-char', kind: 'builtin', builtin_name: 'char', language: 'cpp', qualifiers: [], completeness: 'complete' },
    { id: 'type:test-pointer-to-const', kind: 'pointer', element_type_id: 'type:const-char', qualifiers: [], completeness: 'complete' },
    { id: 'type:test-const-pointer', kind: 'pointer', element_type_id: 'type:test-char', qualifiers: ['const'], completeness: 'complete' }
  );
  const before = JSON.stringify(copy);
  const view = context.window.CODE_GRAPH_DEPENDENCIES(copy);
  assert.equal(JSON.stringify(copy), before);
  const pointerToConst = view.byId.get('type:test-pointer-to-const');
  const constPointer = view.byId.get('type:test-const-pointer');
  assert.equal(pointerToConst.qualifiers.length, 0);
  assert.equal(view.byId.get(pointerToConst.element_type_id).qualifiers[0], 'const');
  assert.equal(constPointer.qualifiers[0], 'const');
  assert.equal(view.byId.get(constPointer.element_type_id).qualifiers.length, 0);
  assert(!model.TypeUse.some(record => 'qualifiers' in record));
});

test('resolved project targets and unsupported SDK decisions remain distinct', () => {
  const pairs = new Set();
  for (const source of entities.values()) {
    for (const result of source.binding_results || []) {
      const pair = `${source.id}:${result.site_key}:${result.project_id}`;
      assert(!pairs.has(pair), 'Multiple current assessments for one source/site/context');
      pairs.add(pair);
      const isSource = result.site_key === 'source';
      const targets = (isSource ? source.imports_from || []
        : source[result.site_key === 'call' ? 'invokes' : 'refers_to'] || []).filter(edge =>
        edge.site_key === result.site_key && edge.project_id === result.project_id);
      if (result.state === 'resolved') {
        assert(source.evidence?.length);
        assert.equal(result.candidate_set_completeness, 'complete');
        const selected = targets.filter(edge => edge.state === (isSource ? 'established' : 'selected'));
        assert.equal(selected.length, 1);
        assert.equal(entities.get(selected[0].target_id).identity_state, 'established');
        if (!isSource) assert.equal(selected[0].applicability, 'applicable');
      } else {
        assert(!targets.some(edge => edge.state === (isSource ? 'established' : 'selected')));
        assert.equal(result.candidate_set_completeness, 'unknown');
      }
    }
    for (const edge of source.possible_implementation || []) {
      assert.equal(entities.get(edge.target_id).form, 'definition');
      assert.equal(entities.get(edge.target_id).symbol_id, source.invokes[edge.target_position].target_id);
    }
  }
  for (const id of ['make-manager', 'make-context', 'manager-get', 'move-name', 'move-context']) {
    assert.equal(entities.get(`call:${id}`).binding_results.find(result => result.site_key === 'call').state, 'unsupported');
  }
});

test('the model preserves conditional source dependencies without execution records', () => {
  const path = ['update-dispatch', 'dispatch-execute', 'execute-finalize', 'finalize-update'];
  const targets = path.map(key => entities.get(`call:${key}`).invokes.find(edge => edge.state === 'selected').target_id);
  assert.equal(targets.join(' -> '), 'symbol:dispatch -> symbol:execute -> symbol:finalize -> symbol:update');
  for (const conditional of example.conditionalCalls) {
    const declaration = entities.get(conditional.declaration_id), call = entities.get(conditional.call_id);
    assert.equal(declaration.category, 'Declaration');
    assert.equal(call.declaration_id, declaration.id);
    assert(call.span.start_offset >= declaration.body_span.start_offset && call.span.end_offset <= declaration.body_span.end_offset);
    assert(!('presence_condition' in call), 'A source if is not a PresenceCondition');
    const condition = call.condition;
    assert.equal(condition.predicate.expression_id, conditional.condition_expression_id);
    assert.equal(condition.completeness, 'complete');
    assert(model.Coverage.some(record => record.subject_id === call.id && record.dimension === 'calls' && record.attribute_path === 'condition' && record.state === 'complete'));
    assert(call.evidence.some(record => record.method === 'syntax' && record.authority === 'observed'));
  }
  assert.equal(entities.get('coverage:references').state, 'partial');
  assert.equal(entities.get('diagnostic:dependency-cycle').code, 'example.STRUCTURAL_DEPENDENCY_CYCLE');
  assert.match(entities.get('diagnostic:dependency-cycle').message, /do not prove execution/);
  for (const category of ['SourceMapping', 'FlowNode', 'FlowEdge', 'DataFlowRelation']) assert(!(category in model));
  assert(!model.Coverage.some(record => ['control_flow', 'data_flow'].includes(record.dimension)));
});

test('the offline specification and teaching schema match the sole specification', () => {
  const specification = readFileSync(new URL('Code Graph Data Model v2.md', import.meta.url), 'utf8');
  assert.equal(context.window.CODE_GRAPH_SOURCE, specification);
  const names = [...specification.matchAll(/^### (\w+)$/gm)].map(match => match[1]);
  assert.equal(names.length, 22);
  assert.equal(new Set(names).size, names.length);
  for (const category of Object.keys(model)) assert(names.includes(category), `Unknown category: ${category}`);
  assert(!('CodeDataset' in model));
  assert(!specification.includes('CodeDataset'));
  const conformance = specification.slice(specification.indexOf('## 14.'));
  assert.equal((conformance.match(/\*\*(?:Syntactic|Semantic) dataset\*\*/g) || []).length, 2);
});

test('project structures, typed endpoints, and explorer summaries stay documented without discovery configuration', () => {
  const specification = context.window.CODE_GRAPH_SOURCE;
  const structures = new Map([...specification.matchAll(/^### (\w+)\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)]
    .map(match => [match[1], match[2]]));
  const app = readFileSync(new URL('app.js', import.meta.url), 'utf8');
  assert(!specification.includes('ProjectDiscovery'));
  assert(!specification.includes('discovery_id'));
  assert(!app.includes('ProjectDiscovery'));
  assert(!specification.includes('ProjectRelation'));
  assert(!app.includes('ProjectRelation'));
  for (const name of ['Repository', 'Project', 'Directory', 'ProjectFile', 'ExternalLibrary']) {
    assert(structures.has(name), `Missing project structure: ${name}`);
    assert(app.includes(`    ${name}: '`), `Missing explorer summary: ${name}`);
  }
  assert.match(structures.get('Repository'), /`revision` !.*Full Git commit hash.*incremental processing/);
  assert(!structures.get('Repository').includes('vcs_kind'));
  assert.match(structures.get('Project'), /`language` !/);
  assert(!/^\| `(?:\w+_id|contains|external|depends_on)`/m.test(structures.get('Project')));
  for (const name of ['Directory', 'ProjectFile']) {
    assert.match(structures.get(name), /`name` !/);
    assert(!/parent_directory_id|content_digest/.test(structures.get(name)));
  }
  assert.match(structures.get('Project'), /`CONTAINS` \| `Project -> Directory` or `ProjectFile`/);
  assert.match(structures.get('Project'), /`EXTERNAL` \| `Project -> ExternalLibrary`/);
  assert.match(structures.get('Project'), /`DEPENDS_ON` \| `Project -> Project`/);
  for (const edge of ['CONTAINS', 'EXTERNAL', 'DEPENDS_ON', 'HAS_PROJECT', 'PARENT_OF']) {
    assert(app.includes(`'${edge}'`), `Missing direct schema connection: ${edge}`);
  }
  assert(structures.has('Module'));
  assert(!structures.has('Scope'));
  assert(!/\b(?:scope_id|parent_scope_id|body_scope_id|owner_declaration_id)\b/.test(specification));
  assert.match(structures.get('Declaration'), /`CONTAINS_DECLARATION` \| `Declaration -> Declaration`/);
  assert.match(structures.get('Expression'), /`CONTAINS_EXPRESSION` \| Declaration -> Expression/);
  assert.match(structures.get('Import'), /`CONTAINS_IMPORT` \| Declaration -> Import/);
  assert(!/root_module_ids|parent_module_id|`module_id`|Id -> Module/.test(specification));
  assert.match(structures.get('Project'), /`language_settings` !/);
  assert.match(structures.get('Project'), /`defines` !/);
  assert.match(structures.get('Project'), /`search_paths` !/);
  assert(!structures.has('CodeDataset'));
  assert(!structures.has('SemanticRelation'));
  assert(!structures.has('SemanticProperty'));
  assert.match(structures.get('ProjectFile'), /`content_ref` \?/);
  assert.match(structures.get('Coverage'), /`ASSESSED_IN` \| Coverage -> Project/);
  for (const dimension of ['projects', 'files', 'project_dependencies', 'external_libraries']) {
    assert(structures.get('Coverage').includes(`\`${dimension}\``), `Missing structural coverage: ${dimension}`);
  }
  let columns = 0;
  for (const line of specification.split('\n')) {
    if (!line.startsWith('|')) { columns = 0; continue; }
    const count = line.split('|').length;
    if (!columns) columns = count;
    assert.equal(count, columns, `Inconsistent Markdown table columns: ${line}`);
  }
});

test('files use external content and source coordinates remain embedded on project facts', () => {
  const specification = context.window.CODE_GRAPH_SOURCE;
  const categories = [...specification.matchAll(/^### (\w+)$/gm)].map(match => match[1]);
  for (const category of ['SourceSpan', 'SourceFile', 'AnalysisContext', 'AnalysisUnit']) {
    assert(!categories.includes(category));
    assert(!(category in model));
    const copy = JSON.parse(JSON.stringify(model));
    copy[category] = [];
    assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /Unsupported graph category/);
  }
  assert(specification.includes('SourceSpan has no id, graph node, or standalone edge'));
  assert(specification.includes('Elasticsearch is one possible backend, not a required dependency'));
  assert(specification.includes('MUST NOT publish a falsely unique binding'));
  for (const field of ['content', 'content_digest', 'language_version', 'original_encoding', 'project_file_id']) {
    for (const file of model.ProjectFile) assert(!(field in file));
    const copy = JSON.parse(JSON.stringify(model));
    copy.ProjectFile[0][field] = 'obsolete';
    assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /ProjectFile storage contract/);
  }
  assert(!/"(?:context_id|unit_id|context_digest|entry_file_ids|participating_file_ids)":/.test(JSON.stringify(model)));
  for (const record of [...model.Declaration, ...model.Expression, ...model.Import]) {
    assert(!('project_id' in record), 'Project membership is transitive, not a code-node property');
    assert.equal(record.file_id, record.span.file_id);
    const file = entities.get(record.span.file_id);
    assert.equal(file.category, 'ProjectFile');
    assert(record.span.end_offset <= new TextEncoder().encode(externalContent[file.content_ref]).length);
  }
});

test('source range validation reads the external store without embedding text in the graph', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const source = copy.Expression.find(record => record.id === 'call:dispatch-execute');
  source.evidence[0].source_spans = [{ ...source.span, end_offset: sourceBytes.length + 1 }];
  const requested = new Set();
  assert.throws(() => deriveDependencies(copy, { readContent: reference => {
    requested.add(reference);
    return externalContent[reference];
  } }), /quality source range/);
  assert(requested.has(entities.get('inventory:example').content_ref));
  assert(!JSON.stringify(copy).includes('"content":'));
});

test('resolved includes target ordinary ProjectFile nodes without file groups', () => {
  const { fixture, span, file_id, project_id } = directiveFixture('#include "types.h"');
  fixture.ProjectFile.push({ id: 'file:header', uri: 'memory:///types.h', name: 'types.h', kind: 'source', origin: 'source' });
  fixture.Import.push({ id: 'import:header', project_id, file_id, span, form: 'include', source_form: 'quoted_header',
    is_reexport: false, bindings: [], path_segments: ['types.h'],
    binding_results: [{ project_id, site_key: 'source', state: 'resolved', candidate_set_completeness: 'complete', reason_codes: [] }],
    imports_from: [{ project_id, site_key: 'source', target_id: 'file:header', state: 'established' }] });
  fixture.Coverage.push({ id: 'coverage:header', subject_id: 'file:header', project_id, dimension: 'declarations', state: 'unknown' });
  const view = context.window.CODE_GRAPH_DEPENDENCIES(fixture);
  assert.equal(view.edges.length, 1);
  assert.equal(view.edges[0].from, file_id);
  assert.equal(view.edges[0].to, 'file:header');
  assert.equal(view.edges[0].kind, 'imports_from');
  assert.equal(fixture.ProjectFile.length, 2);
  assert.equal(fixture.Project.length, 1);
  assert.equal(fixture.Symbol.length, 0, 'Resolving a header must not fabricate analyzed symbols');
  assert.equal(fixture.Coverage[0].state, 'unknown');
});

test('declarations and expressions preserve project/file containment without lexical-area nodes', () => {
  assert(!('Scope' in model));
  assert(!/"(?:scope_id|parent_scope_id|body_scope_id|owner_declaration_id)"/.test(JSON.stringify(model)));
  for (const declaration of model.Declaration) {
    assert.equal(entities.get(declaration.file_id).category, 'ProjectFile');
    if (declaration.parent_declaration_id) {
      const parent = entities.get(declaration.parent_declaration_id);
      assert.equal(parent.category, 'Declaration');
      assert.equal(parent.file_id, declaration.file_id);
    }
  }
  for (const record of [...model.Expression, ...model.Import]) {
    assert.equal(entities.get(record.file_id).category, 'ProjectFile');
    if (record.declaration_id) {
      const declaration = entities.get(record.declaration_id);
      assert.equal(declaration.category, 'Declaration');
      assert.equal(declaration.file_id, record.file_id);
    }
  }
  for (const use of model.TypeUse) {
    let subject = entities.get(use.subject_id);
    while (subject.category === 'TypeUse') subject = entities.get(subject.subject_id);
    if (subject.category === 'Annotation') subject = entities.get(subject.declaration_id);
    assert(['Declaration', 'Expression'].includes(subject.category));
    assert.equal(entities.get(subject.file_id).category, 'ProjectFile');
  }
});

test('lambda and local-function body dependencies stay with their own callable declarations', () => {
  for (const kind of ['lambda', 'local_function']) {
    const copy = JSON.parse(JSON.stringify(model));
    copy.Symbol.push({ id: 'symbol:test-callable', kind: 'callable', owner_symbol_id: 'symbol:update',
      origin: 'source', identity_state: 'established' });
    copy.Declaration.push({ id: 'decl:test-callable', symbol_id: 'symbol:test-callable', file_id: 'inventory:example',
      parent_declaration_id: 'decl:update', form: 'implicit', modifiers: [] });
    copy.CallableProfile.push({ id: 'profile:test-callable', symbol_id: 'symbol:test-callable', callable_kind: kind, parameter_ids: [],
      type_parameter_ids: [], receiver_qualifiers: [] });
    copy.Expression.find(record => record.id === 'call:update-dispatch').declaration_id = 'decl:test-callable';
    const view = context.window.CODE_GRAPH_DEPENDENCIES(copy);
    const calls = view.edges.filter(edge => edge.kind === 'call' && edge.supporting_ids.includes('call:update-dispatch'));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].from, 'symbol:test-callable');
    assert.equal(calls[0].to, 'symbol:dispatch');
    assert(!view.edges.some(edge => edge.kind === 'call' && edge.to === 'symbol:test-callable'), 'Declaring a callable is not invoking it');
  }
});

test('analysis boundaries are descriptor-based projects and file-level dependencies retain their file owner', () => {
  assert(!('Module' in model));
  assert(!('ProjectRelation' in model));
  assert(!('CodeDataset' in model));
  for (const record of [...model.Declaration, ...model.Expression, ...model.Import]) {
    const membership = example.relationships.filter(edge => edge.type === 'CONTAINS' && edge.target_id === record.file_id
      && entities.get(edge.source_id).category === 'Project');
    assert.equal(membership.length, 1);
    assert.equal(membership[0].source_id, 'project:example');
  }
  for (const project of model.Project) {
    assert(!Object.keys(project).some(key => /_id$/.test(key) || ['contains', 'external', 'depends_on'].includes(key)));
    assert.equal(project.language, 'cpp');
    const repositories = example.relationships.filter(edge => edge.type === 'HAS_PROJECT' && edge.target_id === project.id);
    assert.equal(repositories.length, 1);
    const repository = entities.get(repositories[0].source_id);
    assert.equal(repository.category, 'Repository');
    assert.match(repository.revision, /^[0-9a-f]{40}$/);
    const membership = example.relationships.filter(edge => edge.source_id === project.id && edge.type === 'CONTAINS');
    assert.equal(membership.filter(edge => edge.is_descriptor).length, 1);
    assert.equal(membership.filter(edge => edge.is_root).length, 1);
    assert.equal(entities.get(membership.find(edge => edge.is_descriptor).target_id).kind, 'descriptor');
    assert.equal(entities.get(membership.find(edge => edge.is_root).target_id).category, 'Directory');
    assert.equal(new Set(membership.map(edge => edge.target_id)).size, membership.length);
    for (const edge of membership) assert(['physical', 'declared', 'both'].includes(edge.membership));
  }
  for (const edge of example.relationships) {
    assert(!('id' in edge));
    assert(entities.has(edge.source_id) && entities.has(edge.target_id));
    assert(['established', 'candidate'].includes(edge.state));
  }
  for (const file of model.ProjectFile) {
    assert(file.name);
    assert(!('content_digest' in file) && !('parent_directory_id' in file));
    const parents = example.relationships.filter(edge => edge.type === 'CONTAINS' && edge.target_id === file.id && entities.get(edge.source_id).category === 'Directory');
    assert.equal(parents.length, 1);
  }
  for (const directory of model.Directory) {
    assert(directory.name);
    assert(!('parent_directory_id' in directory));
  }
  const descriptorRef = entities.get('project:example').evidence.find(entry => entry.key === 'example-project').detail.descriptor_ref;
  assert.match(externalContent[descriptorRef], /add_executable\(engine_example example.cpp\)/);
  const copy = JSON.parse(JSON.stringify(model));
  copy.Expression.find(record => record.id === 'call:update-dispatch').declaration_id = 'decl:manager-variable';
  const initializerView = context.window.CODE_GRAPH_DEPENDENCIES(copy);
  assert(initializerView.edges.some(edge => edge.kind === 'call' && edge.from === 'symbol:main' && edge.to === 'symbol:dispatch'));
  delete copy.Expression.find(record => record.id === 'call:update-dispatch').declaration_id;
  const view = context.window.CODE_GRAPH_DEPENDENCIES(copy);
  assert(view.edges.some(edge => edge.kind === 'call' && edge.from === 'inventory:example' && edge.to === 'symbol:dispatch'));
  assert.equal(entities.get('coverage:external-libraries').state, 'unknown');
});

test('component aggregation retains provenance, source types, and optional implementation uncertainty', () => {
  const before = JSON.stringify(model);
  const view = context.window.CODE_GRAPH_DEPENDENCIES(model);
  assert.equal(JSON.stringify(model), before, 'Derived views must not mutate canonical records');
  for (const [from, to] of [['symbol:SceneManager', 'symbol:RenderContext'], ['symbol:RenderContext', 'symbol:SceneManager']]) {
    const group = view.components.find(group => group.from === from && group.to === to);
    assert(group.occurrences.some(edge => edge.kind === 'call' && edge.certainty === 'selected'));
    assert(group.occurrences.some(edge => edge.kind === 'type'));
    assert(group.occurrences.some(edge => edge.kind === 'implementation' && edge.certainty === 'possible'));
    assert.equal(group.project_ids.join(','), 'project:example');
    for (const edge of group.occurrences) for (const id of edge.supporting_ids) assert(entities.has(id));
  }
  const edge = view.edges.find(edge => edge.kind === 'call' && edge.supporting_ids.includes('call:dispatch-execute'));
  assert.equal(edge.from, 'symbol:dispatch', 'A source block does not replace its nearest callable owner');
  assert.equal(edge.to, 'symbol:execute');
  assert.equal(edge.call_condition.predicate.expression_id, 'condition:dispatch');
  assert.equal(edge.call_condition.completeness, 'complete');
  assert.equal(edge.target_condition, undefined, 'Absent target conditions remain unknown');
  assert(edge.evidence_refs.some(entry => entry.subject_id === 'call:dispatch-execute' && entry.key === 'conditional-dispatch'));
  assert(edge.supporting_ids.includes('coverage:conditional-dispatch'));
  assert(!view.edges.some(edge => ['call:make-context', 'call:manager-get'].some(id => edge.kind === 'call' && edge.supporting_ids.includes(id))));
});

test('supported possible candidates survive without selection; inapplicable targets produce no edge', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const call = copy.Expression.find(record => record.id === 'call:dispatch-execute');
  const resolution = call.binding_results.find(record => record.site_key === 'call');
  resolution.state = 'partial';
  resolution.candidate_set_completeness = 'partial';
  delete call.possible_implementation;
  call.evidence = call.evidence.filter(record => record.attribute_path === 'condition');
  for (const coverage of copy.Coverage.filter(record => record.subject_id === call.id && record.attribute_path?.startsWith('binding_results'))) {
    coverage.state = 'partial';
  }
  call.invokes = [
    { site_key: 'call', project_id: resolution.project_id, state: 'candidate', target_id: 'symbol:execute', applicability: 'applicable', reason_codes: [],
      condition: { predicate: { kind: 'expression', expression_id: 'condition:dispatch' }, completeness: 'partial' } },
    { site_key: 'call', project_id: resolution.project_id, state: 'candidate', target_id: 'symbol:finalize', applicability: 'unknown', reason_codes: ['synthetic_partial_candidate'],
      condition: { predicate: { kind: 'not', predicate: { kind: 'expression', expression_id: 'condition:dispatch' } }, completeness: 'partial' } },
    { site_key: 'call', project_id: resolution.project_id, state: 'rejected', target_id: 'symbol:update', applicability: 'inapplicable', reason_codes: ['synthetic_rejected_candidate'] }
  ];
  call.evidence.push({ key: 'synthetic-candidates', project_id: resolution.project_id, attribute_path: 'invokes[1]', method: 'manual',
    authority: 'inferred', supports: [{ subject_id: 'symbol:finalize' }], source_spans: [],
    detail: { boundary: 'Synthetic view-state test, not additional C++ analysis.' } });
  const edges = context.window.CODE_GRAPH_DEPENDENCIES(copy).edges.filter(edge => edge.kind === 'call' && edge.supporting_ids.includes(call.id));
  assert.equal(edges.length, 2);
  assert(edges.every(edge => edge.certainty === 'possible' && edge.candidate_set_completeness === 'partial'));
  assert.equal(edges.map(edge => edge.to).sort().join(','), 'symbol:execute,symbol:finalize');
  for (const edge of edges) {
    assert.equal(edge.call_condition.predicate.expression_id, 'condition:dispatch');
    const candidate = call.invokes.find(record => record.target_id === edge.to);
    assert.equal(JSON.stringify(edge.target_condition), JSON.stringify(candidate.condition));
  }
  call.evidence.find(record => record.key === 'synthetic-candidates').supports = [{ subject_id: 'symbol:execute' }];
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /needs evidence/, 'Unrelated evidence must not establish an unknown candidate');
  call.evidence = [];
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /needs evidence/);
});

test('aggregated contexts and presence conditions are retained rather than flattened', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const source = copy.Import.find(record => record.id === 'import:Engine');
  const original = source.binding_results.find(result => result.site_key !== 'source');
  copy.Project.push({ ...copy.Project[0], id: 'context:alternate' });
  source.binding_results.push({ ...original, project_id: 'context:alternate' });
  source.refers_to.push({ ...source.refers_to[0], project_id: 'context:alternate' });
  copy.Import.find(record => record.id === 'import:Engine').presence_condition = { kind: 'defined', name: 'SYNTHETIC_VARIANT' };
  const group = context.window.CODE_GRAPH_DEPENDENCIES(copy).components.find(group => group.from === 'symbol:main' && group.to === 'symbol:Engine');
  assert.equal(group.project_ids.slice().sort().join(','), 'context:alternate,project:example');
  const occurrences = group.occurrences.filter(edge => edge.kind === 'reference');
  assert.equal(occurrences.length, 2);
  assert(occurrences.every(edge => edge.presence_conditions.length === 1));
});

test('selected target conditions stay attached to their occurrence and analysis context', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const call = copy.Expression.find(record => record.id === 'call:dispatch-execute');
  const original = call.invokes[0];
  original.condition = {
    predicate: { kind: 'expression', expression_id: 'condition:dispatch' }, completeness: 'complete'
  };
  const alternate = JSON.parse(JSON.stringify(original));
  alternate.project_id = 'context:conditional-alternate';
  alternate.condition = {
    predicate: { kind: 'unknown', reason: 'synthetic_configuration_boundary' }, completeness: 'unknown'
  };
  copy.Project.push({ ...copy.Project[0], id: alternate.project_id });
  call.binding_results.push({ ...call.binding_results[0], project_id: alternate.project_id });
  call.invokes.push(alternate);
  const before = JSON.stringify(copy);
  const view = context.window.CODE_GRAPH_DEPENDENCIES(copy);
  assert.equal(JSON.stringify(copy), before, 'Condition propagation must not mutate canonical records');
  const group = view.components.find(record => record.from === 'symbol:SceneManager' && record.to === 'symbol:RenderContext');
  for (const resolution of [original, alternate]) {
    const edge = group.occurrences.find(record => record.kind === 'call' && record.supporting_ids.includes(call.id) && record.project_id === resolution.project_id);
    assert.equal(edge.certainty, 'selected');
    assert.equal(edge.project_id, resolution.project_id);
    assert.equal(edge.call_condition.predicate.expression_id, 'condition:dispatch');
    assert.equal(JSON.stringify(edge.target_condition), JSON.stringify(resolution.condition));
  }
  const unassessed = view.edges.find(edge => edge.kind === 'call' && edge.supporting_ids.includes('call:update-dispatch'));
  assert.equal(unassessed.call_condition, undefined, 'Missing branch analysis is not an unconditional predicate');
});

test('composite occurrence conditions preserve logical structure, uncertainty, and edge-specific support', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const profile = copy.Expression.find(record => record.id === 'call:dispatch-execute');
  profile.condition = {
    predicate: { kind: 'and', predicates: [
      { kind: 'expression', expression_id: 'condition:dispatch' },
      { kind: 'or', predicates: [
        { kind: 'not', predicate: { kind: 'expression', expression_id: 'condition:dispatch' } },
        { kind: 'unknown', reason: 'synthetic_unassessed_restriction' }
      ] }
    ] }, completeness: 'partial'
  };
  const before = JSON.stringify(copy);
  const view = context.window.CODE_GRAPH_DEPENDENCIES(copy);
  assert.equal(JSON.stringify(copy), before);
  const edge = view.edges.find(record => record.kind === 'call' && record.supporting_ids.includes(profile.id));
  assert.equal(JSON.stringify(edge.call_condition), JSON.stringify(profile.condition));
  assert.equal(edge.target_condition, undefined);
  assert(edge.evidence_refs.some(entry => entry.key === 'conditional-dispatch'));
  assert(edge.supporting_ids.includes('coverage:conditional-dispatch'));
  assert(!view.edges.some(record => record.kind === 'reference' && (record.supporting_ids.includes('coverage:conditional-dispatch') ||
    record.evidence_refs.some(entry => entry.subject_id === profile.id && entry.key === 'conditional-dispatch'))), 'Occurrence support must not leak into callee lookup');
  profile.condition = { predicate: { kind: 'and', predicates: [] }, completeness: 'complete' };
  const unrestricted = context.window.CODE_GRAPH_DEPENDENCIES(copy).edges.find(record =>
    record.kind === 'call' && record.supporting_ids.includes(profile.id));
  assert.equal(unrestricted.call_condition.predicate.kind, 'and');
  assert.equal(unrestricted.call_condition.predicate.predicates.length, 0);
  assert.equal(unrestricted.call_condition.completeness, 'complete');
});

test('candidate dependent types preserve their explicit symbolic dependencies', () => {
  const copy = JSON.parse(JSON.stringify(model));
  copy.TypeExpression.push({ id: 'type:synthetic-dependent', kind: 'dependent', qualifiers: [], completeness: 'partial',
    dependency_ids: ['symbol:SceneManager', 'symbol:RenderContext'] });
  copy.Declaration.find(record => record.id === 'decl:context-variable').has_type.push({
    project_id: 'project:example', target_id: 'type:synthetic-dependent', role: 'inferred', state: 'candidate' });
  const edges = context.window.CODE_GRAPH_DEPENDENCIES(copy).edges.filter(edge => edge.type_expression_id === 'type:synthetic-dependent');
  assert.equal(edges.length, 2);
  assert(edges.every(edge => edge.kind === 'type' && edge.certainty === 'possible'));
});

test('HAS_TYPE directly connects permitted subjects to contextual type expressions without identities', () => {
  assert(model.TypeExpression.length);
  assert(!('Type' in model));
  assert(!('TypeBinding' in model));
  const allowedSources = new Set(['Declaration', 'Expression', 'TypeUse', 'Symbol']);
  const observedSources = new Set();
  for (const source of entities.values()) {
    for (const edge of source.has_type || []) {
      assert(allowedSources.has(source.category));
      observedSources.add(source.category);
      assert.deepEqual(Object.keys(edge).sort(), ['project_id', 'role', 'state', 'target_id']);
      assert.equal(entities.get(edge.target_id).category, 'TypeExpression');
      assert.equal(entities.get(edge.project_id).category, 'Project');
      assert(['declared', 'inferred', 'return', 'receiver', 'constraint'].includes(edge.role));
      assert(['established', 'candidate', 'unknown'].includes(edge.state));
    }
  }
  assert.deepEqual([...observedSources].sort(), ['Declaration', 'Expression', 'TypeUse']);
  assert(model.Symbol.every(record => !record.has_type?.length), 'Available declaration types are not copied onto Symbols');
  const call = entities.get('call:manager-get');
  assert(call.has_type.some(edge => edge.role === 'inferred'));
  assert(!model.TypeUse.some(record => record.subject_id === call.id));
  const argument = entities.get('typeuse:make-context-argument');
  assert.notEqual(argument.role, argument.has_type[0].role, 'Syntax and semantic edge roles are distinct');
});

test('HAS_TYPE alternatives retain edge paths, contexts, and their own evidence and coverage', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const source = copy.Declaration.find(record => record.id === 'decl:context-variable');
  copy.Project.push({ ...copy.Project[0], id: 'context:type-alternate' });
  source.has_type = [
    { target_id: 'type:scene-pointer', project_id: 'project:example', role: 'inferred', state: 'candidate' },
    { target_id: 'type:render-pointer', project_id: 'project:example', role: 'inferred', state: 'candidate' },
    { target_id: 'type:scene-pointer', project_id: 'context:type-alternate', role: 'inferred', state: 'established' },
    { target_id: 'type:render-pointer', project_id: 'project:example', role: 'inferred', state: 'unknown' }
  ];
  source.has_type.forEach((edge, index) => {
    source.evidence ??= [];
    source.evidence.push({ key: `type-${index}`, project_id: edge.project_id,
      attribute_path: `has_type[${index}]`, method: 'manual', authority: 'inferred', supports: [], source_spans: [] });
    copy.Coverage.push({ id: `coverage:type-${index}`, subject_id: source.id,
      project_id: edge.project_id, dimension: 'types', attribute_path: `has_type[${index}]`, state: 'partial' });
  });
  copy.Coverage.push({ id: 'coverage:wrong-type-context', subject_id: source.id,
    project_id: 'project:example', dimension: 'types', attribute_path: 'has_type[2]', state: 'partial' });
  const before = JSON.stringify(copy);
  const edges = context.window.CODE_GRAPH_DEPENDENCIES(copy).edges.filter(edge => edge.type_subject_id === source.id);
  assert.equal(JSON.stringify(copy), before, 'Typing projection must not mutate canonical records');
  assert.equal(edges.length, 3, 'Unknown typing does not establish a dependency');
  edges.forEach((edge, index) => {
    assert.equal(edge.attribute_path, `has_type[${index}]`);
    assert.equal(edge.project_id, source.has_type[index].project_id);
    assert.equal(edge.type_expression_id, source.has_type[index].target_id);
    assert.equal(edge.certainty, index === 2 ? 'established' : 'possible');
    assert.deepEqual([...edge.evidence_refs].map(entry => entry.key), [`type-${index}`]);
    assert.deepEqual([...edge.supporting_ids].filter(id => id.startsWith('coverage:')), [`coverage:type-${index}`]);
    assert(edge.supporting_ids.includes(source.id));
    assert(edge.supporting_ids.includes(edge.type_expression_id));
  });
});

test('semantic guide renders all direct edge labels as source-node excerpts without relationship nodes', () => {
  const app = readFileSync(new URL('app.js', import.meta.url), 'utf8');
  assert(!app.includes('SemanticRelation'));
  assert(!app.includes('SemanticProperty'));
  const elements = new Map(['#semantic-content', '#semantic-toc'].map(selector => [selector, { innerHTML: '' }]));
  const records = [];
  const browser = {
    window: { CODE_GRAPH_SOURCE: context.window.CODE_GRAPH_SOURCE, CODE_GRAPH_EXAMPLE: example },
    document: { querySelector: selector => {
      assert(elements.has(selector), `Unexpected guide element: ${selector}`);
      return elements.get(selector);
    } },
    JSON: { stringify: (value, ...args) => { records.push(value); return JSON.stringify(value, ...args); } }
  };
  const setup = app.slice(0, app.indexOf('  const state ='));
  const labeling = app.slice(app.indexOf('  function relationLabel('), app.indexOf('  function renderRelationInfo('));
  const formatting = app.slice(app.indexOf('  function inline('), app.indexOf('  function related('));
  const guide = app.slice(app.indexOf('  function renderSemanticGuide()'), app.indexOf('  const tour ='));
  runInNewContext(`${setup}\n${labeling}\nconst example = window.CODE_GRAPH_EXAMPLE;\n${formatting}\n${guide}\nrenderSemanticGuide();
    window.schema = { semanticKinds, links, entities,
      propertyHeading: markdown('#### Embedded Semantic Properties'),
      edgeHeading: markdown('#### Semantic Edges') };\n})();`, browser);
  const { semanticKinds, links } = browser.window.schema;
  assert.equal(semanticKinds.length, 11);
  assert.equal(records.length, 11);
  records.forEach((source, index) => {
    const { kind, from, to } = semanticKinds[index];
    assert(source.id);
    assert.equal(source[kind].length, 1);
    const edge = source[kind][0];
    assert(edge.target_id && edge.project_id && edge.state);
    assert(!('id' in edge || 'source_id' in edge || 'kind' in edge));
    for (const sourceType of from) {
      for (const targetType of to) {
        assert(links.some(link => link.from === sourceType && link.to === targetType &&
          link.field === (sourceType === 'Import' ? kind.toUpperCase() : `${kind}[].target_id`)));
      }
    }
  });
  assert(elements.get('#semantic-content').innerHTML.includes('data-example-id="import:Engine"'));
  assert(elements.get('#semantic-content').innerHTML.includes('inherits[0].semantic_properties[0]'));
  assert.equal(browser.window.schema.propertyHeading, '<h4>Embedded Semantic Properties</h4>');
  assert.equal(browser.window.schema.edgeHeading, '<h4>Semantic Edges</h4>');
  const annotation = browser.window.schema.entities.find(record => record.name === 'Annotation');
  assert(!annotation.markdown.includes('#### Semantic Edges'), 'Edge properties are not Annotation attributes');
});

test('direct semantic edges preserve contexts, conditions, typed details, and edge-specific support', () => {
  assert(!('SemanticRelation' in model));
  assert(!('SemanticProperty' in model));
  const copy = JSON.parse(JSON.stringify(model));
  const source = copy.Symbol.find(record => record.id === 'symbol:SceneManager');
  source.presence_condition = { kind: 'defined', name: 'SYNTHETIC_SOURCE' };
  copy.Project.push({ ...copy.Project[0], id: 'context:semantic-alternate' });
  source.inherits = ['project:example', 'context:semantic-alternate'].map((projectId, index) => ({
    target_id: 'type:RenderContext', project_id: projectId, state: index ? 'candidate' : 'established',
    presence_condition: { kind: 'defined', name: `SYNTHETIC_EDGE_${index}` },
    details: { visibility: 'public' },
    semantic_properties: [
      { name: 'cpp.synthetic_flag', value: false, state: 'established' },
      { name: 'cpp.synthetic_result', value: null, state: 'unknown' }
    ]
  }));
  source.inherits.forEach((edge, index) => {
    source.evidence ??= [];
    source.evidence.push({ key: `semantic-${index}`, project_id: edge.project_id,
      attribute_path: `inherits[${index}]`, method: 'manual', authority: 'inferred', supports: [], source_spans: [] });
    source.evidence.push({ key: `semantic-property-${index}`, project_id: edge.project_id,
      attribute_path: `inherits[${index}].semantic_properties[0]`, method: 'manual', authority: 'inferred', supports: [], source_spans: [] });
    copy.Coverage.push({ id: `coverage:semantic-${index}`, subject_id: source.id,
      project_id: edge.project_id, dimension: 'types', attribute_path: `inherits[${index}]`, state: 'partial' });
    copy.Coverage.push({ id: `coverage:semantic-property-${index}`, subject_id: source.id,
      project_id: edge.project_id, dimension: 'types', attribute_path: `inherits[${index}].semantic_properties[0]`, state: 'partial' });
  });
  copy.Coverage.push({ id: 'coverage:semantic-wrong-context', subject_id: source.id,
    project_id: 'project:example', dimension: 'types', attribute_path: 'inherits[1]', state: 'complete' });
  const before = JSON.stringify(copy);
  const edges = context.window.CODE_GRAPH_DEPENDENCIES(copy).edges.filter(edge => edge.kind === 'inherits');
  assert.equal(JSON.stringify(copy), before);
  assert.equal(edges.length, 2);
  edges.forEach((edge, index) => {
    assert.equal(edge.from, source.id);
    assert.equal(edge.to, 'symbol:RenderContext');
    assert.equal(edge.semantic_target_id, 'type:RenderContext');
    assert.equal(edge.semantic_source_id, source.id);
    assert.equal(edge.attribute_path, `inherits[${index}]`);
    assert.equal(edge.project_id, source.inherits[index].project_id);
    assert.equal(edge.certainty, index ? 'possible' : 'established');
    assert.equal(edge.details.visibility, 'public');
    assert.equal(edge.semantic_properties[0].value, false);
    assert.equal(edge.semantic_properties[1].value, null);
    assert.equal(edge.semantic_properties[0].project_id, undefined, 'Embedded properties inherit this edge context');
    assert.deepEqual([...edge.evidence_refs].map(entry => entry.key), [`semantic-${index}`]);
    assert.deepEqual([...edge.supporting_ids].filter(id => id.startsWith('coverage:semantic')), [`coverage:semantic-${index}`]);
    assert.deepEqual([...edge.presence_conditions].map(condition => condition.name), [`SYNTHETIC_EDGE_${index}`, 'SYNTHETIC_SOURCE']);
  });
  const imported = context.window.CODE_GRAPH_DEPENDENCIES(model).edges.find(edge => edge.kind === 'imports_from');
  assert.equal(imported.semantic_source_id, 'import:Engine');
  assert.equal(imported.attribute_path, 'imports_from[0]');
  assert(imported.evidence_refs.some(entry => entry.subject_id === 'import:Engine' && entry.key === 'using-Engine'));
  const invalid = JSON.parse(JSON.stringify(copy));
  invalid.Symbol.find(record => record.id === source.id).inherits[0].id = 'forbidden:edge-id';
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(invalid), /Invalid INHERITS edge/);
});

test('optional node semantic properties preserve values and contexts without extra identities or dependency work', () => {
  const frame = entities.get('expression:frame-number');
  assert.equal(frame.semantic_properties[0].name, 'value_category');
  assert.equal(frame.semantic_properties[0].value, 'prvalue');
  assert.equal(frame.semantic_properties[0].project_id, 'project:example');
  assert(frame.evidence.some(record => record.attribute_path === 'semantic_properties[0]'));
  const copy = JSON.parse(JSON.stringify(model));
  const source = copy.Expression.find(record => record.id === frame.id);
  delete source.semantic_properties;
  const baseline = JSON.stringify(context.window.CODE_GRAPH_DEPENDENCIES(copy).edges);
  copy.Project.push({ ...copy.Project[0], id: 'context:property-alternate' });
  source.semantic_properties = [
    { name: 'value_category', value: 'prvalue', project_id: 'project:example', state: 'established' },
    { name: 'value_category', value: null, project_id: 'context:property-alternate', state: 'unknown' },
    { name: 'cpp.synthetic_flag', value: false, project_id: 'project:example', state: 'established' },
    { name: 'cpp.synthetic_measure', value: 0, project_id: 'project:example', state: 'candidate' },
    { name: 'cpp.synthetic_result', value: null, project_id: 'project:example', state: 'not_applicable' }
  ];
  const before = JSON.stringify(copy);
  const view = context.window.CODE_GRAPH_DEPENDENCIES(copy);
  assert.equal(JSON.stringify(copy), before);
  assert.equal(JSON.stringify(view.edges), baseline, 'Additional properties do not create or establish dependencies');
  assert.equal(view.byId.size, entities.size + 1, 'Only the added context introduces an identity');
  for (const property of source.semantic_properties) {
    assert(!('id' in property || 'subject_id' in property));
    assert.equal(view.byId.get(property.project_id).category, 'Project');
    if (['unknown', 'not_applicable'].includes(property.state)) assert.equal(property.value, null);
  }
});
