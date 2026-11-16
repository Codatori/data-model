import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const context = { window: {}, TextEncoder, TextDecoder };
runInNewContext(readFileSync(new URL('example-model.js', import.meta.url), 'utf8'), context);
runInNewContext(readFileSync(new URL('example-builder.js', import.meta.url), 'utf8'), context);
runInNewContext(readFileSync(new URL('example-languages.js', import.meta.url), 'utf8'), context);
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
const fileBytes = new Map(example.files.map(file => [file.id, new TextEncoder().encode(file.code)]));
const text = span => new TextDecoder().decode(fileBytes.get(span.file_id).slice(span.start_offset, span.end_offset));

test('C++ source preserves the provided constructs and string literals', () => {
  assert.equal(example.filename, 'example.cpp');
  assert.equal(model.SourceFile[0].language, 'cpp');
  assert.equal(model.AnalysisContext[0].language_settings.standard, 'c++17');
  assert.equal(model.SourceFile[0].content, code);
  assert.equal((code.match(/^#include </gm) || []).length, 3);
  assert(code.includes('#include "pipeline.hpp"'));
  assert.equal(model.SourceFile[1].content, example.files[1].code);
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
      assert(fileBytes.has(value.file_id), `Unknown file: ${value.file_id}`);
      assert(value.start_offset >= 0 && value.end_offset > value.start_offset && value.end_offset <= fileBytes.get(value.file_id).length);
    }
    Object.values(value).forEach(visit);
  }
  visit(model);
  visit(example.excerpts);
  for (const decl of model.Declaration) {
    if (!entities.get(decl.symbol_id).name) {
      assert(!decl.name_span, 'An anonymous lambda has no name span');
      continue;
    }
    assert.equal(decl.name_span.file_id, decl.span.file_id);
    assert(decl.name_span.start_offset >= decl.span.start_offset);
    assert(decl.name_span.end_offset <= decl.span.end_offset);
    assert.equal(text(decl.name_span), entities.get(decl.symbol_id).name);
  }
  assert.equal(text(entities.get('call:make-context').span), 'std::make_shared<RenderContext>(42, manager.get())');
  assert.equal(text(entities.get('reference:make-context-callee').span), 'std::make_shared');
});

test('forward declarations and out-of-class definitions preserve identity and ownership', () => {
  assert.equal(entities.get('decl:RenderContext-forward').symbol_id, entities.get('decl:RenderContext').symbol_id);
  assert.equal(entities.get('decl:dispatch-forward').symbol_id, entities.get('decl:dispatch').symbol_id);
  assert.equal(entities.get('decl:dispatch').scope_id, 'scope:Engine');
  assert.equal(entities.get('symbol:dispatch').owner_symbol_id, 'symbol:SceneManager');
  assert.equal(entities.get('scope:dispatch').parent_scope_id, 'scope:SceneManager');
  for (const [category, parent] of [['Symbol', 'owner_symbol_id'], ['Scope', 'parent_scope_id']]) {
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
      assert.equal(resolution.candidate_set_completeness, resolution.state === 'partial' ? 'partial' : 'unknown');
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
    const scope = entities.get(conditional.scope_id), call = entities.get(conditional.call_id);
    assert.equal(scope.kind, 'block');
    assert.equal(call.scope_id, scope.id);
    assert(call.span.start_offset >= scope.span.start_offset && call.span.end_offset <= scope.span.end_offset);
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
  for (const category of Object.keys(model)) assert(names.includes(category), `Unknown category: ${category}`);
  assert.equal(model.CodeDataset[0].schema_version, 'v2');
  const conformance = specification.slice(specification.indexOf('## 14.'));
  assert.equal((conformance.match(/\*\*(?:Syntactic|Semantic) dataset\*\*/g) || []).length, 2);
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
  copy.Type.push({ id: 'type:synthetic-dependent', kind: 'dependent', qualifiers: [], completeness: 'partial',
    dependency_ids: ['symbol:SceneManager', 'symbol:RenderContext'] });
  copy.TypeBinding.push({ id: 'binding:synthetic-dependent', subject_id: 'decl:context-variable',
    context_id: 'context:cpp17', type_id: 'type:synthetic-dependent', role: 'inferred', state: 'candidate' });
  const edges = context.window.CODE_GRAPH_DEPENDENCIES(copy).edges.filter(edge => edge.supporting_ids.includes('binding:synthetic-dependent'));
  assert.equal(edges.length, 2);
  assert(edges.every(edge => edge.kind === 'type' && edge.certainty === 'possible'));
});

for (const [id, language] of Object.entries(context.window.CODE_GRAPH_EXAMPLES).filter(([id]) => id !== 'cpp')) {
  test(`${language.label} example is a valid, bounded, self-consistent model`, () => {
    const records = new Map(Object.entries(language.model).filter(([category]) => !profiles[category])
      .flatMap(([category, list]) => list.map(record => [record.id, { category, ...record }])));
    const standalone = Object.entries(language.model).filter(([category]) => !profiles[category]).flatMap(([, list]) => list);
    assert.equal(records.size, standalone.length, 'Duplicate standalone identities');
    const bytes = new Map(language.files.map(file => [file.id, new TextEncoder().encode(file.code)]));
    const read = span => new TextDecoder().decode(bytes.get(span.file_id).slice(span.start_offset, span.end_offset));
    assert.equal(language.model.SourceFile[0].content, language.code);
    assert.deepEqual(language.model.SourceFile.map(file => [file.id, file.content]), language.files.map(file => [file.id, file.code]));
    function visit(value, key = '') {
      if (Array.isArray(value)) return value.forEach(item => visit(item, key));
      if (value && typeof value === 'object') {
        if ('start_offset' in value) {
          assert(bytes.has(value.file_id), `Unknown file: ${value.file_id}`);
          assert(value.start_offset >= 0 && value.end_offset > value.start_offset && value.end_offset <= bytes.get(value.file_id).length);
        }
        return Object.entries(value).forEach(([name, child]) => visit(child, name));
      }
      if (/_ids?$/.test(key)) assert(records.has(value), `Dangling ${key}: ${value}`);
    }
    visit(language.model);
    visit(language.conditionalCalls);
    visit(language.excerpts);
    for (const ids of language.stepRecordIds.filter(Boolean)) for (const recordId of ids) assert(records.has(recordId), `Missing ${recordId}`);
    for (const decl of language.model.Declaration) {
      if (records.get(decl.symbol_id).name && decl.span) assert.equal(read(decl.name_span), records.get(decl.symbol_id).name);
      else assert(!decl.name_span, 'Anonymous or implicit declarations have no name span');
      if (decl.span) assert(decl.span.file_id === decl.name_span?.file_id || !decl.name_span);
    }
    for (const profile of language.model.CallProfile) assert.equal(records.get(profile.id).operands.length, 0);
    assert.equal(language.model.CodeDataset[0].schema_version, 'v2');
    assert.equal(language.excerpts.length, 6);
    assert.equal(language.notes.length, 6);
    assert.equal(language.tour.length, 6);
  });

  test(`${language.label} example keeps the SceneManager/RenderContext cycle without execution claims`, () => {
    const view = context.window.CODE_GRAPH_DEPENDENCIES(language.model);
    for (const [from, to] of [['symbol:SceneManager', 'symbol:RenderContext'], ['symbol:RenderContext', 'symbol:SceneManager']]) {
      const group = view.components.find(item => item.from === from && item.to === to);
      assert(group?.occurrences.some(edge => edge.kind === 'call'), `Missing ${from} -> ${to} call`);
    }
    assert(language.conditionalCalls.length >= 2);
    for (const conditional of language.conditionalCalls) {
      const call = language.model.CallProfile.find(record => record.id === conditional.call_id);
      assert(call.condition, 'A conditional call keeps its condition');
      if (conditional.scope_id) assert(language.model.Scope.find(record => record.id === conditional.scope_id).kind === 'block');
    }
    for (const resolution of language.model.Resolution) {
      assert.equal('selected_target_id' in resolution, resolution.state === 'resolved');
      if (resolution.state === 'resolved') {
        assert.equal(resolution.candidate_set_completeness, 'complete');
        assert(language.model.Evidence.some(record => record.subject_id === resolution.id));
      }
    }
    for (const category of ['FlowNode', 'FlowEdge', 'DataFlowRelation']) assert(!(category in language.model));
    assert.equal(language.model.Diagnostic.find(record => record.code === 'STRUCTURAL_DEPENDENCY_CYCLE').severity, 'info');
  });
}

test('untyped JavaScript keeps unknown receivers as possible dependencies', () => {
  const js = context.window.CODE_GRAPH_EXAMPLES.javascript;
  const resolution = js.model.Resolution.find(record => record.id === 'resolution:call:dispatch-execute');
  assert.equal(resolution.state, 'partial');
  assert.equal(resolution.candidates[0].applicability, 'unknown');
  const edge = context.window.CODE_GRAPH_DEPENDENCIES(js.model).edges.find(item => item.supporting_ids.includes('call:dispatch-execute'));
  assert.equal(edge.certainty, 'possible');
  assert.equal(js.model.TypeUse.length, 0, 'JavaScript spells no types');
});

test('JavaScript untyped-field candidates cite the values written to the field, not the member name', () => {
  const js = context.window.CODE_GRAPH_EXAMPLES.javascript;
  const evidence = js.model.Evidence.find(record => record.subject_id === 'resolution:call:dispatch-execute');
  assert.equal(evidence.method, 'inference');
  assert(evidence.supporting_ids.includes('expression:assign-set-context'));
  assert(evidence.supporting_ids.includes('call:main-set-context'));
});

const allExamples = Object.values(context.window.CODE_GRAPH_EXAMPLES);
const baseRecords = language => new Map(Object.entries(language.model).filter(([category]) => !profiles[category])
  .flatMap(([, list]) => list.map(record => [record.id, record])));

for (const language of allExamples) {
  test(`${language.label} functional module keeps callable-value targets possible and evidence-backed`, () => {
    const records = baseRecords(language);
    assert.equal(language.model.SourceFile.length, 2, 'The pipeline module is a second source file');
    const view = context.window.CODE_GRAPH_DEPENDENCIES(language.model);
    const component = id => view.components.find(group => group.from === id || group.to === id) && id;
    const pipeline = ['symbol:module-pipeline', 'symbol:pipeline', 'symbol:Pipeline'].find(component);
    const back = view.components.find(group => group.from === pipeline && group.to === 'symbol:RenderContext');
    assert(back, 'The pipeline reaches back into RenderContext');
    assert(back.occurrences.every(edge => edge.certainty === 'possible'), 'A callback target is never selected');
    assert(view.components.some(group => group.from === 'symbol:RenderContext' && group.to === pipeline &&
      group.occurrences.some(edge => edge.kind === 'call' && edge.certainty === 'selected')));
    // A call inside a lambda belongs to the lambda, not to the method that creates it.
    assert.equal(records.get('call:execute-finalize').scope_id, 'scope:finalize-lambda');
    assert(view.edges.some(edge => edge.from === 'symbol:finalize-lambda' && edge.to === 'symbol:finalize' && edge.certainty === 'selected'));
    for (const key of ['wrapper-step', 'run-stage', 'run-complete']) {
      const resolution = records.get(`resolution:call:${key}`);
      const implementation = language.model.ImplementationSet.find(record => record.resolution_id === resolution.id);
      if (resolution.state === 'resolved') {
        // Functional-interface calls select the interface method; source lambdas are possible implementations.
        assert.equal(resolution.dispatch_kind, 'interface');
        assert.equal(records.get(resolution.selected_target_id).origin, 'external');
        assert.equal(implementation.completeness, 'partial');
        implementation.definition_ids.forEach((id, index) => assert(language.model.Evidence.some(record =>
          record.subject_id === implementation.id && record.attribute_path === `definition_ids[${index}]` && record.supporting_ids.length > 1)));
      } else {
        assert.equal(resolution.state, 'partial');
        assert.equal(resolution.dispatch_kind, 'indirect');
        assert.equal(resolution.candidate_set_completeness, 'partial');
        assert(!implementation);
        resolution.candidates.forEach((candidate, index) => {
          const evidence = language.model.Evidence.find(record => record.subject_id === resolution.id && record.attribute_path === `candidates[${index}]`);
          assert(evidence.supporting_ids.some(id => id !== candidate.target_symbol_id && records.get(id)?.span), 'Candidates cite source flow records');
        });
      }
    }
    assert(language.model.SemanticRelation.some(record => record.kind === 'captures' && record.source_id === 'symbol:stage-lambda'));
  });
}

test('Python models self as a parameter and a decorator as an application with an implicit operand', () => {
  const py = context.window.CODE_GRAPH_EXAMPLES.python;
  const records = baseRecords(py);
  const update = py.model.CallableProfile.find(record => record.id === 'symbol:update');
  assert.equal(update.receiver_mode, 'explicit_object');
  assert.equal(update.parameter_ids.join(), 'symbol:update-self');
  assert.equal(records.get('resolution:call:update-dispatch').receiver_binding.parameter_id, 'symbol:dispatch-self');
  assert.equal(records.get('receiver:update-dispatch').kind, 'name');
  assert.equal(records.get('decl:scene-name').scope_id, 'scope:scene-ctor', 'An attribute is declared where it is assigned');
  assert.equal(records.get('decl:scene-name').visibility, 'language_specific');
  const annotation = py.model.Annotation.find(record => record.declaration_id === 'decl:cull');
  const application = py.model.CallProfile.find(record => record.id === 'call:decorate-cull');
  assert.equal(application.call_kind, 'language_specific');
  assert.equal(application.arguments.length, 0);
  assert.equal(JSON.stringify(records.get('call:decorate-cull').span), JSON.stringify(annotation.span));
  assert.equal(records.get('resolution:call:decorate-cull').argument_bindings[0].argument_positions.length, 0);
  assert.equal(py.model.Symbol.filter(record => record.name === 'cull_objects').length, 1, 'A decorator does not create a second symbol');
  const main = records.get('call:module-main');
  assert.equal(main.scope_id, 'scope:module');
  assert.equal(py.model.CallProfile.find(record => record.id === 'call:module-main').condition.predicate.expression_id, 'condition:main-guard');
});

test('module-level entry calls keep module scope instead of a fabricated caller', () => {
  for (const id of ['typescript', 'javascript', 'python']) {
    const language = context.window.CODE_GRAPH_EXAMPLES[id];
    const call = language.model.Expression.find(record => record.id === 'call:module-main');
    assert.equal(call.scope_id, 'scope:module');
    const edge = context.window.CODE_GRAPH_DEPENDENCIES(language.model).edges.find(item => item.supporting_ids.includes('call:module-main'));
    assert.equal(edge.from, 'symbol:module-example');
    assert.equal(edge.to, 'symbol:main');
  }
});
