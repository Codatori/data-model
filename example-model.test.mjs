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
const profiles = {
  TypeProfile: ['Symbol', 'type'], CallableProfile: ['Symbol', 'callable'],
  ParameterProfile: ['Symbol', 'parameter'], CallProfile: ['Expression', 'call']
};
const entities = new Map(Object.entries(model).filter(([category]) => !profiles[category])
  .flatMap(([category, records]) => records.map(record => [record.id, { category, ...record }])));
const sourceBytes = new TextEncoder().encode(code);
const text = span => new TextDecoder().decode(sourceBytes.slice(span.start_offset, span.end_offset));

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
    ['Repository', 'Project', 'HAS PROJECT'], ['Project', 'AnalysisContext', 'HAS CONTEXT'],
    ['AnalysisContext', 'AnalysisUnit', 'HAS UNIT'], ['AnalysisUnit', 'Declaration', 'HAS DECLARATION'],
    ['Declaration', 'Expression', 'CONTAINS EXPRESSION'], ['Project', 'ProjectFile', 'CONTAINS'],
    ['Project', 'ExternalLibrary', 'EXTERNAL'], ['Expression', 'TypeExpression', 'HAS_TYPE']
  ]) assert(schemaRelations.some(group => group.displayFrom === from && group.displayTo === to && group.label === label && group.overview), `${from} -> ${to}`);
  assert(schemaRelations.some(group => group.from === 'Project' && group.to === 'Project' && group.label === 'DEPENDS_ON'));
  assert(schemaRelations.filter(group => group.to === 'TypeExpression' && group.label === 'HAS_TYPE').length >= 4);
});

test('C++ source preserves the provided constructs and string literals', () => {
  assert.equal(example.filename, 'example.cpp');
  assert.equal(model.SourceFile[0].language, 'cpp');
  assert.equal(model.AnalysisContext[0].language_settings.standard, 'c++17');
  assert.equal(model.SourceFile[0].content, code);
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
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if ('start_offset' in value) {
      assert.equal(value.file_id, 'file:example');
      assert(value.start_offset >= 0 && value.end_offset > value.start_offset && value.end_offset <= sourceBytes.length);
    }
    Object.values(value).forEach(visit);
  }
  visit(model);
  visit(example.excerpts);
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
  assert.equal(text(entities.get('reference:make-context-callee').span), 'std::make_shared');
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
  const factory = model.CallProfile.find(record => record.id === 'call:make-context');
  assert.equal(factory.arguments[0].expression_id, 'expression:frame-number');
  assert.equal(factory.arguments[1].expression_id, 'call:manager-get');
  for (const profile of model.CallProfile) {
    assert.equal(entities.get(profile.id).operands.length, 0);
    assert(!('receiver_expression_id' in profile));
    assert(!('type_use_ids' in profile));
  }
  assert.equal(entities.get('callee:dispatch-execute').operator, '->');
  assert.equal(entities.get('callee:dispatch-execute').operands[0].expression_id, 'receiver:dispatch-execute');
  const ctor = model.CallableProfile.find(record => record.id === 'symbol:render-ctor');
  assert.equal(ctor.parameter_ids.length, 2, 'Implicit receiver must not count as a source parameter');
  assert.equal(model.ParameterProfile.find(record => record.id === 'symbol:ctor-manager').passing_mode, 'value');
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
  const binding = entities.get('resolution:call:dispatch-execute').receiver_binding;
  assert.equal(binding.conversions[0].source_type_id, 'type:shared-render');
  assert.equal(binding.conversions[0].target_type_id, 'type:render-pointer');
});

test('resolved project targets and unsupported SDK decisions remain distinct', () => {
  const pairs = new Set();
  for (const resolution of model.Resolution) {
    const pair = `${resolution.subject_id}:${resolution.context_id}`;
    assert(!pairs.has(pair), 'Multiple current resolutions for one subject/context');
    pairs.add(pair);
    if (resolution.state === 'resolved') {
      assert(model.Evidence.some(record => record.subject_id === resolution.id), `Missing lookup/binding evidence: ${resolution.id}`);
      assert.equal(resolution.candidate_set_completeness, 'complete');
      assert.equal(entities.get(resolution.selected_target_id).identity_state, 'established');
      assert(resolution.candidates.some(candidate => candidate.target_symbol_id === resolution.selected_target_id && candidate.applicability === 'applicable'));
    } else {
      assert(!('selected_target_id' in resolution));
      assert.equal(resolution.candidate_set_completeness, 'unknown');
    }
  }
  for (const id of ['make-manager', 'make-context', 'manager-get', 'move-name', 'move-context']) {
    assert.equal(entities.get(`resolution:call:${id}`).state, 'unsupported');
  }
  for (const implementation of model.ImplementationSet) {
    const target = entities.get(implementation.resolution_id).selected_target_id;
    for (const id of implementation.definition_ids) {
      assert.equal(entities.get(id).form, 'definition');
      assert.equal(entities.get(id).symbol_id, target);
    }
  }
});

test('the model preserves conditional source dependencies without execution records', () => {
  const path = ['update-dispatch', 'dispatch-execute', 'execute-finalize', 'finalize-update'];
  const targets = path.map(key => entities.get(`resolution:call:${key}`).selected_target_id);
  assert.equal(targets.join(' -> '), 'symbol:dispatch -> symbol:execute -> symbol:finalize -> symbol:update');
  for (const conditional of example.conditionalCalls) {
    const declaration = entities.get(conditional.declaration_id), call = entities.get(conditional.call_id);
    assert.equal(declaration.category, 'Declaration');
    assert.equal(call.declaration_id, declaration.id);
    assert(call.span.start_offset >= declaration.body_span.start_offset && call.span.end_offset <= declaration.body_span.end_offset);
    assert(!('presence_condition' in call), 'A source if is not a PresenceCondition');
    const condition = model.CallProfile.find(record => record.id === call.id).condition;
    assert.equal(condition.predicate.expression_id, conditional.condition_expression_id);
    assert.equal(condition.completeness, 'complete');
    assert(model.Coverage.some(record => record.subject_id === call.id && record.dimension === 'condition' && record.state === 'complete'));
    assert(model.Evidence.some(record => record.subject_id === call.id && record.method === 'syntax' && record.authority === 'observed'));
  }
  assert.equal(entities.get('coverage:references').state, 'partial');
  assert.equal(entities.get('diagnostic:dependency-cycle').code, 'STRUCTURAL_DEPENDENCY_CYCLE');
  assert.match(entities.get('diagnostic:dependency-cycle').message, /do not prove execution/);
  for (const category of ['SourceMapping', 'FlowNode', 'FlowEdge', 'DataFlowRelation']) assert(!(category in model));
  assert(!model.Coverage.some(record => ['control_flow', 'data_flow'].includes(record.dimension)));
});

test('the offline specification and teaching schema match the sole specification', () => {
  const specification = readFileSync(new URL('Code Graph Data Model v2.md', import.meta.url), 'utf8');
  assert.equal(context.window.CODE_GRAPH_SOURCE, specification);
  const names = [...specification.matchAll(/^### (\w+)$/gm)].map(match => match[1]);
  assert.equal(names.length, 29);
  assert.equal(new Set(names).size, names.length);
  for (const category of Object.keys(model)) assert(names.includes(category), `Unknown category: ${category}`);
  assert.equal(model.CodeDataset[0].schema_version, 'v2');
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
  assert.match(structures.get('Project'), /`descriptor_file_id` ! \| `Id -> ProjectFile`/);
  assert.match(structures.get('Project'), /`CONTAINS` \| `Project -> Directory` or `ProjectFile`/);
  assert.match(structures.get('Project'), /`EXTERNAL` \| `Project -> ExternalLibrary`/);
  assert.match(structures.get('Project'), /`DEPENDS_ON` \| `Project -> Project`/);
  for (const edge of ['contains', 'external', 'depends_on']) {
    assert(app.includes(`${edge}[].target_id`), `Missing direct schema connection: ${edge}`);
  }
  assert(!structures.has('Module'));
  assert(!structures.has('Scope'));
  assert(!/\b(?:scope_id|parent_scope_id|body_scope_id|owner_declaration_id)\b/.test(specification));
  assert.match(structures.get('Declaration'), /`parent_declaration_id` \? \| `Id -> Declaration`/);
  assert.match(structures.get('Expression'), /`declaration_id` \? \| `Id -> Declaration`/);
  assert.match(structures.get('Import'), /`declaration_id` \? \| `Id -> Declaration`/);
  assert(!/root_module_ids|parent_module_id|`module_id`|Id -> Module/.test(specification));
  assert.match(structures.get('AnalysisContext'), /`project_id` ! \| `Id -> Project`/);
  assert.match(structures.get('CodeDataset'), /`root_project_ids` ! \| Set of `Id -> Project`/);
  assert(!structures.has('SemanticRelation'));
  assert(!structures.has('SemanticProperty'));
  assert.match(structures.get('SourceFile'), /`project_file_id` \? \| `Id -> ProjectFile`/);
  assert.match(structures.get('Coverage'), /`context_id` \? \| `Id -> AnalysisContext`/);
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

test('declarations and expressions preserve unit containment without lexical-area nodes', () => {
  assert(!('Scope' in model));
  assert(!/"(?:scope_id|parent_scope_id|body_scope_id|owner_declaration_id)"/.test(JSON.stringify(model)));
  for (const declaration of model.Declaration) {
    assert.equal(entities.get(declaration.unit_id).category, 'AnalysisUnit');
    if (declaration.parent_declaration_id) {
      const parent = entities.get(declaration.parent_declaration_id);
      assert.equal(parent.category, 'Declaration');
      assert.equal(parent.unit_id, declaration.unit_id);
    }
  }
  for (const record of [...model.Expression, ...model.Import]) {
    assert.equal(entities.get(record.unit_id).category, 'AnalysisUnit');
    if (record.declaration_id) {
      const declaration = entities.get(record.declaration_id);
      assert.equal(declaration.category, 'Declaration');
      assert.equal(declaration.unit_id, record.unit_id);
    }
  }
  for (const use of model.TypeUse) {
    let subject = entities.get(use.subject_id);
    while (subject.category === 'TypeUse') subject = entities.get(subject.subject_id);
    if (subject.category === 'Annotation') subject = entities.get(subject.declaration_id);
    assert(['Declaration', 'Expression'].includes(subject.category));
    assert.equal(entities.get(subject.unit_id).category, 'AnalysisUnit');
  }
});

test('lambda and local-function body dependencies stay with their own callable declarations', () => {
  for (const kind of ['lambda', 'local_function']) {
    const copy = JSON.parse(JSON.stringify(model));
    copy.Symbol.push({ id: 'symbol:test-callable', kind: 'callable', owner_symbol_id: 'symbol:update',
      origin: 'source', identity_state: 'established' });
    copy.Declaration.push({ id: 'decl:test-callable', symbol_id: 'symbol:test-callable', unit_id: 'unit:example',
      parent_declaration_id: 'decl:update', form: 'implicit', modifiers: [] });
    copy.CallableProfile.push({ id: 'symbol:test-callable', callable_kind: kind, parameter_ids: [],
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

test('analysis boundaries are descriptor-based projects and global dependencies retain their project owner', () => {
  assert(!('Module' in model));
  assert(!('ProjectRelation' in model));
  assert.equal(model.CodeDataset[0].root_project_ids.join(','), 'project:example');
  for (const analysis of model.AnalysisContext) assert.equal(entities.get(analysis.project_id).category, 'Project');
  for (const project of model.Project) {
    assert.equal(entities.get(project.repository_id).category, 'Repository');
    assert.equal(entities.get(project.descriptor_file_id).kind, 'descriptor');
    assert.equal(entities.get(project.root_directory_id).category, 'Directory');
    for (const target of [project.descriptor_file_id, project.root_directory_id]) {
      assert(project.contains.some(edge => edge.state === 'established' && edge.target_id === target));
    }
    for (const [label, categories] of Object.entries({ contains: ['Directory', 'ProjectFile'], external: ['ExternalLibrary'], depends_on: ['Project'] })) {
      assert(Array.isArray(project[label]));
      for (const edge of project[label]) {
        assert(!('id' in edge));
        assert(!('source_id' in edge));
        assert(!('kind' in edge));
        assert(categories.includes(entities.get(edge.target_id)?.category), `Invalid ${label} endpoint`);
        assert(['established', 'candidate'].includes(edge.state));
        if (label === 'contains') assert(['physical', 'declared', 'both'].includes(edge.membership));
        else assert(['direct', 'transitive', 'unknown'].includes(edge.directness));
        if (label === 'depends_on') assert.equal(entities.get(edge.target_id).repository_id, project.repository_id);
      }
    }
  }
  assert.match(entities.get('evidence:example-project').detail.descriptor_content, /add_executable\(engine_example example.cpp\)/);
  const copy = JSON.parse(JSON.stringify(model));
  copy.Expression.find(record => record.id === 'call:update-dispatch').declaration_id = 'decl:manager-variable';
  const initializerView = context.window.CODE_GRAPH_DEPENDENCIES(copy);
  assert(initializerView.edges.some(edge => edge.kind === 'call' && edge.from === 'symbol:main' && edge.to === 'symbol:dispatch'));
  delete copy.Expression.find(record => record.id === 'call:update-dispatch').declaration_id;
  const view = context.window.CODE_GRAPH_DEPENDENCIES(copy);
  assert(view.edges.some(edge => edge.kind === 'call' && edge.from === 'project:example' && edge.to === 'symbol:dispatch'));
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
    assert.equal(group.context_ids.join(','), 'context:cpp17');
    for (const edge of group.occurrences) for (const id of edge.supporting_ids) assert(entities.has(id));
  }
  const edge = view.edges.find(edge => edge.kind === 'call' && edge.supporting_ids.includes('call:dispatch-execute'));
  assert.equal(edge.from, 'symbol:dispatch', 'A source block does not replace its nearest callable owner');
  assert.equal(edge.to, 'symbol:execute');
  assert.equal(edge.call_condition.predicate.expression_id, 'condition:dispatch');
  assert.equal(edge.call_condition.completeness, 'complete');
  assert.equal(edge.target_condition, undefined, 'Absent target conditions remain unknown');
  assert(edge.supporting_ids.includes('evidence:conditional-dispatch'));
  assert(edge.supporting_ids.includes('coverage:conditional-dispatch'));
  assert(!view.edges.some(edge => ['call:make-context', 'call:manager-get'].some(id => edge.kind === 'call' && edge.supporting_ids.includes(id))));
});

test('supported possible candidates survive without selection; inapplicable targets produce no edge', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const resolution = copy.Resolution.find(record => record.id === 'resolution:call:dispatch-execute');
  resolution.state = 'partial';
  resolution.candidate_set_completeness = 'partial';
  delete resolution.selected_target_id;
  const removed = new Set(copy.ImplementationSet.filter(record => record.resolution_id === resolution.id).map(record => record.id));
  copy.ImplementationSet = copy.ImplementationSet.filter(record => !removed.has(record.id));
  copy.Evidence = copy.Evidence.filter(record => record.subject_id !== resolution.id && !removed.has(record.subject_id));
  copy.Coverage = copy.Coverage.filter(record => !removed.has(record.subject_id));
  for (const coverage of copy.Coverage.filter(record => record.subject_id === resolution.subject_id && record.dimension === 'candidate_scope')) {
    coverage.state = 'partial';
  }
  resolution.candidates = [
    { target_symbol_id: 'symbol:execute', applicability: 'applicable', conversions: [], reason_codes: [],
      condition: { predicate: { kind: 'expression', expression_id: 'condition:dispatch' }, completeness: 'partial' } },
    { target_symbol_id: 'symbol:finalize', applicability: 'unknown', conversions: [], reason_codes: ['synthetic_partial_candidate'],
      condition: { predicate: { kind: 'not', predicate: { kind: 'expression', expression_id: 'condition:dispatch' } }, completeness: 'partial' } },
    { target_symbol_id: 'symbol:update', applicability: 'inapplicable', conversions: [], reason_codes: ['synthetic_rejected_candidate'] }
  ];
  copy.Evidence.push({ id: 'evidence:synthetic-candidates', subject_id: resolution.id, method: 'manual',
    authority: 'inferred', supporting_ids: ['symbol:finalize'], source_spans: [],
    detail: { boundary: 'Synthetic view-state test, not additional C++ analysis.' } });
  const edges = context.window.CODE_GRAPH_DEPENDENCIES(copy).edges.filter(edge => edge.supporting_ids.includes(resolution.id));
  assert.equal(edges.length, 2);
  assert(edges.every(edge => edge.certainty === 'possible' && edge.candidate_set_completeness === 'partial'));
  assert.equal(edges.map(edge => edge.to).sort().join(','), 'symbol:execute,symbol:finalize');
  for (const edge of edges) {
    assert.equal(edge.call_condition.predicate.expression_id, 'condition:dispatch');
    const candidate = resolution.candidates.find(record => record.target_symbol_id === edge.to);
    assert.equal(JSON.stringify(edge.target_condition), JSON.stringify(candidate.condition));
  }
  copy.Evidence.find(record => record.id === 'evidence:synthetic-candidates').supporting_ids = ['symbol:execute'];
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /needs evidence/, 'Unrelated evidence must not establish an unknown candidate');
  copy.Evidence = copy.Evidence.filter(record => record.subject_id !== resolution.id);
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(copy), /needs evidence/);
});

test('aggregated contexts and presence conditions are retained rather than flattened', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const original = copy.Resolution.find(record => record.id === 'resolution:reference:using-Engine');
  copy.AnalysisContext.push({ ...copy.AnalysisContext[0], id: 'context:alternate' });
  copy.Resolution.push({ ...original, id: 'resolution:alternate', context_id: 'context:alternate' });
  copy.Import.find(record => record.id === 'import:Engine').presence_condition = { kind: 'defined', name: 'SYNTHETIC_VARIANT' };
  const group = context.window.CODE_GRAPH_DEPENDENCIES(copy).components.find(group => group.from === 'symbol:main' && group.to === 'symbol:Engine');
  assert.equal(group.context_ids.slice().sort().join(','), 'context:alternate,context:cpp17');
  const occurrences = group.occurrences.filter(edge => edge.kind === 'reference');
  assert.equal(occurrences.length, 2);
  assert(occurrences.every(edge => edge.presence_conditions.length === 1));
});

test('selected target conditions stay attached to their occurrence and analysis context', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const original = copy.Resolution.find(record => record.id === 'resolution:call:dispatch-execute');
  original.candidates[0].condition = {
    predicate: { kind: 'expression', expression_id: 'condition:dispatch' }, completeness: 'complete'
  };
  const alternate = JSON.parse(JSON.stringify(original));
  alternate.id = 'resolution:conditional-alternate';
  alternate.context_id = 'context:conditional-alternate';
  alternate.candidates[0].condition = {
    predicate: { kind: 'unknown', reason: 'synthetic_configuration_boundary' }, completeness: 'unknown'
  };
  copy.AnalysisContext.push({ ...copy.AnalysisContext[0], id: alternate.context_id });
  copy.Resolution.push(alternate);
  const before = JSON.stringify(copy);
  const view = context.window.CODE_GRAPH_DEPENDENCIES(copy);
  assert.equal(JSON.stringify(copy), before, 'Condition propagation must not mutate canonical records');
  const group = view.components.find(record => record.from === 'symbol:SceneManager' && record.to === 'symbol:RenderContext');
  for (const resolution of [original, alternate]) {
    const edge = group.occurrences.find(record => record.kind === 'call' && record.supporting_ids.includes(resolution.id));
    assert.equal(edge.certainty, 'selected');
    assert.equal(edge.context_id, resolution.context_id);
    assert.equal(edge.call_condition.predicate.expression_id, 'condition:dispatch');
    assert.equal(JSON.stringify(edge.target_condition), JSON.stringify(resolution.candidates[0].condition));
  }
  const unassessed = view.edges.find(edge => edge.kind === 'call' && edge.supporting_ids.includes('call:update-dispatch'));
  assert.equal(unassessed.call_condition, undefined, 'Missing branch analysis is not an unconditional predicate');
});

test('candidate dependent types preserve their explicit symbolic dependencies', () => {
  const copy = JSON.parse(JSON.stringify(model));
  copy.TypeExpression.push({ id: 'type:synthetic-dependent', kind: 'dependent', qualifiers: [], completeness: 'partial',
    dependency_ids: ['symbol:SceneManager', 'symbol:RenderContext'] });
  copy.Declaration.find(record => record.id === 'decl:context-variable').has_type.push({
    context_id: 'context:cpp17', target_id: 'type:synthetic-dependent', role: 'inferred', state: 'candidate' });
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
      assert.deepEqual(Object.keys(edge).sort(), ['context_id', 'role', 'state', 'target_id']);
      assert.equal(entities.get(edge.target_id).category, 'TypeExpression');
      assert.equal(entities.get(edge.context_id).category, 'AnalysisContext');
      assert(['declared', 'inferred', 'return', 'receiver', 'constraint'].includes(edge.role));
      assert(['established', 'candidate', 'unknown'].includes(edge.state));
    }
  }
  assert.deepEqual([...observedSources].sort(), [...allowedSources].sort());
  const call = entities.get('call:manager-get');
  assert(call.has_type.some(edge => edge.role === 'inferred'));
  assert(!model.TypeUse.some(record => record.subject_id === call.id));
  const argument = entities.get('typeuse:make-context-argument');
  assert.notEqual(argument.role, argument.has_type[0].role, 'Syntax and semantic edge roles are distinct');
});

test('HAS_TYPE alternatives retain edge paths, contexts, and their own evidence and coverage', () => {
  const copy = JSON.parse(JSON.stringify(model));
  const source = copy.Declaration.find(record => record.id === 'decl:context-variable');
  copy.AnalysisContext.push({ ...copy.AnalysisContext[0], id: 'context:type-alternate' });
  source.has_type = [
    { target_id: 'type:scene-pointer', context_id: 'context:cpp17', role: 'inferred', state: 'candidate' },
    { target_id: 'type:render-pointer', context_id: 'context:cpp17', role: 'inferred', state: 'candidate' },
    { target_id: 'type:scene-pointer', context_id: 'context:type-alternate', role: 'inferred', state: 'established' },
    { target_id: 'type:render-pointer', context_id: 'context:cpp17', role: 'inferred', state: 'unknown' }
  ];
  source.has_type.forEach((edge, index) => {
    copy.Evidence.push({ id: `evidence:type-${index}`, subject_id: source.id,
      attribute_path: `has_type[${index}]`, method: 'manual', authority: 'inferred', supporting_ids: [], source_spans: [] });
    copy.Coverage.push({ id: `coverage:type-${index}`, subject_id: source.id,
      context_id: edge.context_id, dimension: `has_type[${index}]`, state: 'partial' });
  });
  copy.Coverage.push({ id: 'coverage:wrong-type-context', subject_id: source.id,
    context_id: 'context:cpp17', dimension: 'has_type[2]', state: 'partial' });
  const before = JSON.stringify(copy);
  const edges = context.window.CODE_GRAPH_DEPENDENCIES(copy).edges.filter(edge => edge.type_subject_id === source.id);
  assert.equal(JSON.stringify(copy), before, 'Typing projection must not mutate canonical records');
  assert.equal(edges.length, 3, 'Unknown typing does not establish a dependency');
  edges.forEach((edge, index) => {
    assert.equal(edge.attribute_path, `has_type[${index}]`);
    assert.equal(edge.context_id, source.has_type[index].context_id);
    assert.equal(edge.type_expression_id, source.has_type[index].target_id);
    assert.equal(edge.certainty, index === 2 ? 'established' : 'possible');
    assert.deepEqual([...edge.supporting_ids].filter(id => id.startsWith('evidence:type-')), [`evidence:type-${index}`]);
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
  assert.equal(semanticKinds.length, 12);
  assert.equal(records.length, 12);
  records.forEach((source, index) => {
    const { kind, from, to } = semanticKinds[index];
    assert(source.id);
    assert.equal(source[kind].length, 1);
    const edge = source[kind][0];
    assert(edge.target_id && edge.context_id && edge.state);
    assert(!('id' in edge || 'source_id' in edge || 'kind' in edge));
    for (const sourceType of from) {
      for (const targetType of to) {
        assert(links.some(link => link.from === sourceType && link.to === targetType && link.field === `${kind}[].target_id`));
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
  copy.AnalysisContext.push({ ...copy.AnalysisContext[0], id: 'context:semantic-alternate' });
  source.inherits = ['context:cpp17', 'context:semantic-alternate'].map((contextId, index) => ({
    target_id: 'type:RenderContext', context_id: contextId, state: index ? 'candidate' : 'established',
    presence_condition: { kind: 'defined', name: `SYNTHETIC_EDGE_${index}` },
    details: { visibility: 'public' },
    semantic_properties: [
      { name: 'cpp.synthetic_flag', value: false, state: 'established' },
      { name: 'cpp.synthetic_result', value: null, state: 'unknown' }
    ]
  }));
  source.inherits.forEach((edge, index) => {
    copy.Evidence.push({ id: `evidence:semantic-${index}`, subject_id: source.id,
      attribute_path: `inherits[${index}]`, method: 'manual', authority: 'inferred', supporting_ids: [], source_spans: [] });
    copy.Evidence.push({ id: `evidence:semantic-property-${index}`, subject_id: source.id,
      attribute_path: `inherits[${index}].semantic_properties[0]`, method: 'manual', authority: 'inferred', supporting_ids: [], source_spans: [] });
    copy.Coverage.push({ id: `coverage:semantic-${index}`, subject_id: source.id,
      context_id: edge.context_id, dimension: `inherits[${index}]`, state: 'partial' });
    copy.Coverage.push({ id: `coverage:semantic-property-${index}`, subject_id: source.id,
      context_id: edge.context_id, dimension: `inherits[${index}].semantic_properties[0]`, state: 'partial' });
  });
  copy.Coverage.push({ id: 'coverage:semantic-wrong-context', subject_id: source.id,
    context_id: 'context:cpp17', dimension: 'inherits[1]', state: 'complete' });
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
    assert.equal(edge.context_id, source.inherits[index].context_id);
    assert.equal(edge.certainty, index ? 'possible' : 'established');
    assert.equal(edge.details.visibility, 'public');
    assert.equal(edge.semantic_properties[0].value, false);
    assert.equal(edge.semantic_properties[1].value, null);
    assert.equal(edge.semantic_properties[0].context_id, undefined, 'Embedded properties inherit this edge context');
    assert.deepEqual([...edge.supporting_ids].filter(id => id.startsWith('evidence:semantic')), [`evidence:semantic-${index}`]);
    assert.deepEqual([...edge.supporting_ids].filter(id => id.startsWith('coverage:semantic')), [`coverage:semantic-${index}`]);
    assert.deepEqual([...edge.presence_conditions].map(condition => condition.name), [`SYNTHETIC_EDGE_${index}`, 'SYNTHETIC_SOURCE']);
  });
  const imported = context.window.CODE_GRAPH_DEPENDENCIES(model).edges.find(edge => edge.kind === 'imports_from');
  assert.equal(imported.semantic_source_id, 'import:Engine');
  assert.equal(imported.attribute_path, 'imports_from[0]');
  assert(imported.supporting_ids.includes('evidence:using-Engine'));
  const invalid = JSON.parse(JSON.stringify(copy));
  invalid.Symbol.find(record => record.id === source.id).inherits[0].id = 'forbidden:edge-id';
  assert.throws(() => context.window.CODE_GRAPH_DEPENDENCIES(invalid), /Invalid INHERITS edge/);
});

test('optional node semantic properties preserve values and contexts without extra identities or dependency work', () => {
  const frame = entities.get('expression:frame-number');
  assert.equal(frame.semantic_properties[0].name, 'value_category');
  assert.equal(frame.semantic_properties[0].value, 'prvalue');
  assert.equal(frame.semantic_properties[0].context_id, 'context:cpp17');
  assert(model.Evidence.some(record => record.subject_id === frame.id && record.attribute_path === 'semantic_properties[0]'));
  const copy = JSON.parse(JSON.stringify(model));
  const source = copy.Expression.find(record => record.id === frame.id);
  delete source.semantic_properties;
  const baseline = JSON.stringify(context.window.CODE_GRAPH_DEPENDENCIES(copy).edges);
  copy.AnalysisContext.push({ ...copy.AnalysisContext[0], id: 'context:property-alternate' });
  source.semantic_properties = [
    { name: 'value_category', value: 'prvalue', context_id: 'context:cpp17', state: 'established' },
    { name: 'value_category', value: null, context_id: 'context:property-alternate', state: 'unknown' },
    { name: 'cpp.synthetic_flag', value: false, context_id: 'context:cpp17', state: 'established' },
    { name: 'cpp.synthetic_measure', value: 0, context_id: 'context:cpp17', state: 'candidate' },
    { name: 'cpp.synthetic_result', value: null, context_id: 'context:cpp17', state: 'not_applicable' }
  ];
  const before = JSON.stringify(copy);
  const view = context.window.CODE_GRAPH_DEPENDENCIES(copy);
  assert.equal(JSON.stringify(copy), before);
  assert.equal(JSON.stringify(view.edges), baseline, 'Additional properties do not create or establish dependencies');
  assert.equal(view.byId.size, entities.size + 1, 'Only the added context introduces an identity');
  for (const property of source.semantic_properties) {
    assert(!('id' in property || 'subject_id' in property));
    assert.equal(view.byId.get(property.context_id).category, 'AnalysisContext');
    if (['unknown', 'not_applicable'].includes(property.state)) assert.equal(property.value, null);
  }
});
