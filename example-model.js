(() => {
  'use strict';

  const code = String.raw`#include <iostream>
#include <memory>
#include <string>

namespace Engine {
    class RenderContext;

    class SceneManager {
    private:
        std::string scene_name_;
        std::shared_ptr<RenderContext> active_context_;

    public:
        explicit SceneManager(std::string name) : scene_name_(std::move(name)) {}

        void set_render_context(std::shared_ptr<RenderContext> context) {
            active_context_ = std::move(context);
        }

        void update_scene() {
            std::cout << "[SceneManager] Updating scene: " << scene_name_ << "\\n";
            dispatch_render_pass();
        }

        void dispatch_render_pass();
    };

    class RenderContext {
    private:
        int frame_id_;
        SceneManager* owner_manager_;

    public:
        RenderContext(int frame_id, SceneManager* manager)
            : frame_id_(frame_id), owner_manager_(manager) {}

        void execute_pipeline() {
            std::cout << "[RenderContext] Executing rendering pipeline for frame #" << frame_id_ << "\\n";
            finalize_frame();
        }

        void finalize_frame() {
            std::cout << "[RenderContext] Frame finalized. Requesting next state from manager...\\n";
            if (owner_manager_) {
                owner_manager_->update_scene();
            }
        }
    };

    inline void SceneManager::dispatch_render_pass() {
        std::cout << "[SceneManager] Dispatching render pass to context...\\n";
        if (active_context_) {
            active_context_->execute_pipeline();
        }
    }
} // namespace Engine

int main() {
    using namespace Engine;

    auto manager = std::make_shared<SceneManager>("MainGameLevel");

    auto context = std::make_shared<RenderContext>(42, manager.get());

    manager->set_render_context(context);

    std::cout << "--- Starting execution flow --- \\n";
    manager->update_scene();

    return 0;
}
`;
  const encode = text => new TextEncoder().encode(text);
  const locate = (text, from = 0) => {
    const start = code.indexOf(text, from);
    if (start < 0) throw new Error(`C++ teaching source fragment not found: ${text}`);
    return { start, end: start + text.length };
  };
  const sourceSpan = range => ({
    file_id: 'inventory:example', start_offset: encode(code.slice(0, range.start)).length,
    end_offset: encode(code.slice(0, range.end)).length
  });
  function within(text, range) {
    const found = locate(text, range.start);
    if (found.end > range.end) throw new Error(`C++ fragment is outside its expected construct: ${text}`);
    return found;
  }
  function body(signature) {
    const start = locate(signature).start;
    const open = code.indexOf('{', start);
    let depth = 0;
    for (let index = open; index < code.length; index++) {
      if (code[index] === '{') depth++;
      if (code[index] === '}' && --depth === 0) return { start, end: index + 1 + Number(code[index + 1] === ';') };
    }
    throw new Error(`Unclosed body in the teaching source: ${signature}`);
  }
  const ranges = {
    engine: body('namespace Engine {'),
    scene: body('class SceneManager {'),
    render: body('class RenderContext {'),
    sceneCtor: body('explicit SceneManager(std::string name)'),
    set: body('void set_render_context('),
    update: body('void update_scene()'),
    renderCtor: body('RenderContext(int frame_id, SceneManager* manager)'),
    execute: body('void execute_pipeline()'),
    finalize: body('void finalize_frame()'),
    dispatch: body('inline void SceneManager::dispatch_render_pass()'),
    main: body('int main()')
  };
  const projectId = 'project:example';
  const model = Object.fromEntries([
    'Repository', 'Project', 'Directory', 'ProjectFile',
    'Symbol', 'Declaration', 'TypeProfile', 'CallableProfile', 'ParameterProfile',
    'Import', 'Expression', 'TypeExpression', 'TypeUse', 'Coverage', 'Diagnostic'
  ].map(category => [category, []]));
  const symbolProfiles = new Set(['CallableProfile', 'ParameterProfile', 'TypeProfile']);
  const add = (category, record) => {
    if (symbolProfiles.has(category)) record = { ...record, symbol_id: record.id, id: `profile:${category}:${record.id}` };
    model[category].push(record);
    return record;
  };
  const contextual = record => ({ ...record, project_id: projectId });
  const coverage = (id, subject, dimension, state, reasons = [], excluded = [], attributePath) => {
    const record = { id, subject_id: subject, dimension, state, reason_codes: reasons, excluded_spans: excluded,
      ...(attributePath ? { attribute_path: attributePath } : {}) };
    return add('Coverage', ['projects', 'files', 'project_dependencies', 'external_libraries'].includes(dimension) ? record : contextual(record));
  };
  const evidence = (key, subject, supporting, detail, spans = [], method = 'manual') => {
    const source = Object.values(model).flat().find(record => record.id === subject);
    source.evidence ??= [];
    const entry = { key, method, source_spans: spans, supports: supporting.map(subject_id => ({ subject_id })),
      authority: 'established', detail,
      ...(['repository:example', 'project:example'].includes(subject) ? { project_independent: true } : { project_id: projectId }) };
    source.evidence.push(entry);
    return entry;
  };
  function symbol(id, name, kind, owner, origin = 'source') {
    return add('Symbol', { id, name, kind, ...(owner ? { owner_symbol_id: owner } : {}), origin, identity_state: 'established' });
  }
  function containment(declarationId) {
    return { file_id: 'inventory:example', ...(declarationId ? { declaration_id: declarationId } : {}) };
  }
  const bodySpan = range => sourceSpan({ start: code.indexOf('{', range.start), end: range.end - Number(code[range.end - 1] === ';') });
  function declaration(id, symbolId, parentDeclarationId, range, options = {}) {
    const name = model.Symbol.find(record => record.id === symbolId).name;
    return add('Declaration', { id, symbol_id: symbolId, file_id: 'inventory:example',
      ...(parentDeclarationId ? { parent_declaration_id: parentDeclarationId } : {}), form: 'definition',
      span: sourceSpan(range), name_span: sourceSpan(within(name, range)), modifiers: [], ...options });
  }
  function bind(subject, type, role = 'declared') {
    const source = ['Declaration', 'Expression', 'TypeUse', 'Symbol']
      .flatMap(category => model[category]).find(record => record.id === subject);
    if (!source) throw new Error(`Missing HAS_TYPE source: ${subject}`);
    source.has_type ??= [];
    source.has_type.push(contextual({ target_id: type, role, state: 'established' }));
  }
  function recordBinding(source, siteKey, target, field, extra = {}) {
    source.binding_results ??= [];
    const index = source.binding_results.length;
    source.binding_results.push(contextual({ site_key: siteKey, state: target ? 'resolved' : 'unsupported',
      candidate_set_completeness: target ? 'complete' : 'unknown', reason_codes: target ? [] : ['standard_library_binding_not_analyzed'] }));
    if (!target) return;
    source[field] ??= [];
    const edge = contextual({ site_key: siteKey, target_id: target, state: 'selected', applicability: 'applicable', reason_codes: [], ...extra });
    source[field].push(edge);
    coverage(`coverage:${source.id}:${siteKey}`, source.id, field === 'invokes' ? 'calls' : 'references', 'complete', [], [], `binding_results[${index}]`);
    return edge;
  }
  function reference(id, site, range, role, target, qualification = 'unqualified') {
    const source = Object.values(model).flat().find(record => record.id === site);
    source.name_uses ??= [];
    const key = `name:${source.name_uses.length}`;
    source.name_uses.push({ key, start_offset: range.start, end_offset: range.end, role, qualification });
    recordBinding(source, key, target, 'refers_to');
    if (target) {
      const support = evidence(id, site, [target, 'inventory:descriptor'],
        { rule: 'Unique visible project binding in the displayed C++ scopes under the stated source and library assumptions.' },
        [sourceSpan(range)], 'language_rules');
      support.attribute_path = `refers_to[${source.refers_to.length - 1}]`;
    }
  }
  const declaredTypes = new Map();
  function typedDeclaration(id, symbolId, parentDeclarationId, range, type, options = {}) {
    const record = declaration(id, symbolId, parentDeclarationId, range, options);
    declaredTypes.set(symbolId, type);
    bind(id, type, options.inferred ? 'inferred' : 'declared');
    delete record.inferred;
    return record;
  }
  function typeUse(id, subject, range, role, type, position) {
    add('TypeUse', { id, subject_id: subject, span: sourceSpan(range), role,
      ...(position !== undefined ? { position } : {}) });
    if (type) bind(id, type);
    return id;
  }
  function namedExpression(id, declarationId, range, symbolId, role = 'read') {
    add('Expression', { id, ...containment(declarationId), span: sourceSpan(range), kind: 'name', operands: [] });
    reference(`reference:${id}`, id, range, role, symbolId);
    if (declaredTypes.has(symbolId)) bind(id, declaredTypes.get(symbolId), 'inferred');
    return id;
  }
  function literal(id, declarationId, text, range, category, value, type) {
    add('Expression', { id, ...containment(declarationId), span: sourceSpan(within(text, range)), kind: 'literal',
      operands: [], literal: { category, value } });
    bind(id, type, 'inferred');
    return id;
  }
  const methodDefinitions = new Map();
  function call(key, declarationId, text, range, options = {}) {
    const callId = `call:${key}`, calleeId = `callee:${key}`;
    const callRange = within(text, range);
    const calleeRange = { start: callRange.start, end: code.indexOf('(', callRange.start) };
    let receiver;
    if (options.receiver) {
      receiver = namedExpression(`receiver:${key}`, declarationId, within(options.receiver.name, calleeRange), options.receiver.symbol);
      add('Expression', { id: calleeId, ...containment(declarationId), span: sourceSpan(calleeRange),
        kind: 'member_access', operator: options.receiver.operator,
        operands: [{ role: 'base', expression_id: receiver }] });
    } else add('Expression', { id: calleeId, ...containment(declarationId), span: sourceSpan(calleeRange), kind: 'name', operands: [] });
    const invocation = add('Expression', { id: callId, ...containment(declarationId), span: sourceSpan(callRange), kind: 'call', operands: [],
      call_kind: 'ordinary', callee_expression_id: calleeId,
      arguments: (options.args || []).map(expressionId => ({ expression_id: expressionId, expansion: 'none' })) });
    const templateStart = code.indexOf('<', calleeRange.start);
    const nameRange = options.name ? within(options.name, calleeRange)
      : templateStart >= calleeRange.start && templateStart < calleeRange.end
        ? { start: calleeRange.start, end: templateStart } : calleeRange;
    reference(`reference:${key}-callee`, calleeId, nameRange, 'callee', options.target,
      options.receiver ? 'member' : text.startsWith('std::') ? 'qualified' : 'unqualified');
    if (options.type) bind(callId, options.type, 'inferred');
    if (options.target) {
      const receiverType = options.receiver ? declaredTypes.get(options.receiver.symbol) : null;
      const pointerType = receiverType === 'type:shared-render' ? 'type:render-pointer' : receiverType === 'type:shared-scene' ? 'type:scene-pointer' : null;
      recordBinding(invocation, 'call', options.target, 'invokes', {
        dispatch_kind: 'direct', ...(receiver ? { receiver_binding: {
          expression_id: receiver, conversions: pointerType ? [
            { kind: 'language_specific', source_type_id: receiverType, target_type_id: pointerType, state: 'established' }
          ] : []
        } } : {}),
        argument_bindings: options.parameter ? [{ parameter_id: options.parameter, argument_positions: [0], conversions: [] }] : []
      });
      invocation.possible_implementation = [contextual({ site_key: 'call', target_id: methodDefinitions.get(options.target), target_position: 0 })];
      invocation.binding_results.find(result => result.site_key === 'call').implementation_completeness = 'complete';
      const support = evidence(key, callId, [options.target, 'inventory:descriptor'],
        { boundary: 'Unique non-virtual project member in the displayed source; standard shared_ptr receiver behavior is a supplied teaching contract.' },
        [sourceSpan(callRange)]);
      support.attribute_path = 'invokes[0]';
    } else recordBinding(invocation, 'call', null, 'invokes');
    return callId;
  }

  const descriptor = 'cmake_minimum_required(VERSION 3.16)\nproject(EngineExample LANGUAGES CXX)\nadd_executable(engine_example example.cpp)\ntarget_compile_features(engine_example PRIVATE cxx_std_17)\n';
  const settings = { language_settings: { language: 'cpp', standard: 'c++17' }, defines: {}, search_paths: [] };
  add('Repository', { id: 'repository:example', uri: 'memory:///', name: 'Illustrative Engine workspace',
    revision: '0123456789abcdef0123456789abcdef01234567' });
  add('Directory', { id: 'directory:example', uri: 'memory:///', name: '/' });
  add('ProjectFile', { id: 'inventory:descriptor', uri: 'memory:///CMakeLists.txt', name: 'CMakeLists.txt', kind: 'descriptor',
    origin: 'source', content_ref: 'teaching://engine/0123456789abcdef0123456789abcdef01234567/CMakeLists.txt' });
  add('ProjectFile', { id: 'inventory:example', uri: 'memory:///example.cpp', name: 'example.cpp', kind: 'source',
    origin: 'source', language: 'cpp', content_ref: 'teaching://engine/0123456789abcdef0123456789abcdef01234567/example.cpp' });
  add('Project', { id: projectId, name: 'EngineExample', language: 'cpp', build_system: 'cmake', kind: 'executable', ...settings });
  const relationships = [
    { source_id: 'repository:example', type: 'HAS_PROJECT', target_id: 'project:example', state: 'established' },
    ...['directory:example', 'inventory:descriptor', 'inventory:example'].map(target => ({
      source_id: 'project:example', type: 'CONTAINS', target_id: target, state: 'established',
      membership: target === 'inventory:example' ? 'both' : 'physical',
      ...(target === 'inventory:descriptor' ? { is_descriptor: true } : {}),
      ...(target === 'directory:example' ? { is_root: true } : {})
    })),
    ...['inventory:descriptor', 'inventory:example'].map(target => ({
      source_id: 'directory:example', type: 'CONTAINS', target_id: target, state: 'established'
    }))
  ];
  evidence('example-project', 'project:example', ['inventory:descriptor', 'inventory:example'],
    { descriptor_ref: 'teaching://engine/0123456789abcdef0123456789abcdef01234567/CMakeLists.txt',
      boundary: 'Hand-authored teaching descriptor added to organize the supplied C++ source. It is not a discovered repository file; no build or dependency resolution was run.' });
  symbol('symbol:Engine', 'Engine', 'namespace');
  symbol('symbol:SceneManager', 'SceneManager', 'type', 'symbol:Engine');
  symbol('symbol:RenderContext', 'RenderContext', 'type', 'symbol:Engine');
  declaration('decl:Engine', 'symbol:Engine', null, ranges.engine, { body_span: bodySpan(ranges.engine) });
  declaration('decl:SceneManager', 'symbol:SceneManager', 'decl:Engine', ranges.scene, { body_span: bodySpan(ranges.scene) });
  declaration('decl:RenderContext-forward', 'symbol:RenderContext', 'decl:Engine', locate('class RenderContext;'), { form: 'forward_declaration' });
  declaration('decl:RenderContext', 'symbol:RenderContext', 'decl:Engine', ranges.render, { body_span: bodySpan(ranges.render) });
  for (const name of ['SceneManager', 'RenderContext']) add('TypeProfile', {
    id: `symbol:${name}`, type_kind: 'class', type_parameter_ids: []
  });
  symbol('symbol:std', 'std', 'namespace', null, 'external');
  symbol('symbol:std-string', 'string', 'type', 'symbol:std', 'external');
  symbol('symbol:std-shared', 'shared_ptr', 'type', 'symbol:std', 'external');
  symbol('symbol:std-shared-T', 'T', 'type_parameter', 'symbol:std-shared', 'external');
  add('TypeProfile', { id: 'symbol:std-string', type_kind: 'alias', type_parameter_ids: [] });
  add('TypeProfile', { id: 'symbol:std-shared', type_kind: 'class', type_parameter_ids: ['symbol:std-shared-T'] });

  const typeRecords = [
    { id: 'type:void', kind: 'builtin', builtin_name: 'void', language: 'cpp' },
    { id: 'type:int', kind: 'builtin', builtin_name: 'int', language: 'cpp' },
    { id: 'type:const-char', kind: 'builtin', builtin_name: 'char', language: 'cpp', qualifiers: ['const'] },
    { id: 'type:level-name', kind: 'array', element_type_id: 'type:const-char', dimensions: [14] },
    { id: 'type:SceneManager', kind: 'nominal', symbol_id: 'symbol:SceneManager' },
    { id: 'type:RenderContext', kind: 'nominal', symbol_id: 'symbol:RenderContext' },
    { id: 'type:std-string', kind: 'nominal', symbol_id: 'symbol:std-string' },
    { id: 'type:shared-template', kind: 'nominal', symbol_id: 'symbol:std-shared' },
    { id: 'type:shared-scene', kind: 'generic_application', generic_type_id: 'type:shared-template',
      arguments: [{ category: 'type', type_id: 'type:SceneManager' }] },
    { id: 'type:shared-render', kind: 'generic_application', generic_type_id: 'type:shared-template',
      arguments: [{ category: 'type', type_id: 'type:RenderContext' }] },
    { id: 'type:scene-pointer', kind: 'pointer', element_type_id: 'type:SceneManager' },
    { id: 'type:render-pointer', kind: 'pointer', element_type_id: 'type:RenderContext' },
    { id: 'type:moved-string', kind: 'reference', reference_kind: 'rvalue', element_type_id: 'type:std-string' },
    { id: 'type:moved-context', kind: 'reference', reference_kind: 'rvalue', element_type_id: 'type:shared-render' }
  ];
  typeRecords.forEach(record => add('TypeExpression', { qualifiers: [], completeness: 'complete', ...record }));
  const fields = [
    ['scene-name', 'scene_name_', 'SceneManager', 'std::string scene_name_;', 'type:std-string'],
    ['active-context', 'active_context_', 'SceneManager', 'std::shared_ptr<RenderContext> active_context_;', 'type:shared-render'],
    ['frame-id', 'frame_id_', 'RenderContext', 'int frame_id_;', 'type:int'],
    ['owner-manager', 'owner_manager_', 'RenderContext', 'SceneManager* owner_manager_;', 'type:scene-pointer']
  ];
  for (const [key, name, owner, text, type] of fields) {
    symbol(`symbol:${key}`, name, 'field', `symbol:${owner}`);
    typedDeclaration(`decl:${key}`, `symbol:${key}`, `decl:${owner}`, within(text, owner === 'SceneManager' ? ranges.scene : ranges.render), type, { visibility: 'private' });
  }
  const methods = [
    ['scene-ctor', 'SceneManager', 'SceneManager', 'sceneCtor', 'constructor'],
    ['set-context', 'set_render_context', 'SceneManager', 'set', 'method'],
    ['update', 'update_scene', 'SceneManager', 'update', 'method'],
    ['dispatch', 'dispatch_render_pass', 'SceneManager', 'dispatch', 'method'],
    ['render-ctor', 'RenderContext', 'RenderContext', 'renderCtor', 'constructor'],
    ['execute', 'execute_pipeline', 'RenderContext', 'execute', 'method'],
    ['finalize', 'finalize_frame', 'RenderContext', 'finalize', 'method'],
    ['main', 'main', null, 'main', 'function']
  ];
  for (const [key, name, owner, rangeKey, kind] of methods) {
    symbol(`symbol:${key}`, name, 'callable', owner ? `symbol:${owner}` : null);
    const parentDeclarationId = key === 'main' ? null : key === 'dispatch' ? 'decl:Engine' : `decl:${owner}`;
    declaration(`decl:${key}`, `symbol:${key}`, parentDeclarationId, ranges[rangeKey], {
      body_span: bodySpan(ranges[rangeKey]), modifiers: key === 'main' ? [] : key === 'scene-ctor' ? ['explicit', 'inline'] : ['inline'],
      ...(key !== 'main' ? { visibility: 'public' } : {})
    });
    add('CallableProfile', { id: `symbol:${key}`, callable_kind: kind, parameter_ids: [],
      type_parameter_ids: [], receiver_mode: owner ? 'instance' : 'none', variadic_style: 'none', receiver_qualifiers: [] });
    methodDefinitions.set(`symbol:${key}`, `decl:${key}`);
    if (kind !== 'constructor') bind(`decl:${key}`, key === 'main' ? 'type:int' : 'type:void', 'return');
    if (owner) bind(`decl:${key}`, `type:${owner}`, 'receiver');
  }
  declaration('decl:dispatch-forward', 'symbol:dispatch', 'decl:SceneManager', within('void dispatch_render_pass();', ranges.scene), {
    form: 'declaration', visibility: 'public'
  });
  reference('reference:dispatch-owner', 'decl:dispatch', within('SceneManager', ranges.dispatch), 'type', 'symbol:SceneManager');
  const parameters = [
    ['ctor-name', 'name', 'scene-ctor', 'std::string name', ranges.sceneCtor, 'type:std-string'],
    ['set-context-parameter', 'context', 'set-context', 'std::shared_ptr<RenderContext> context', ranges.set, 'type:shared-render'],
    ['ctor-frame', 'frame_id', 'render-ctor', 'int frame_id', ranges.renderCtor, 'type:int'],
    ['ctor-manager', 'manager', 'render-ctor', 'SceneManager* manager', ranges.renderCtor, 'type:scene-pointer']
  ];
  for (const [key, name, owner, text, range, type] of parameters) {
    symbol(`symbol:${key}`, name, 'parameter', `symbol:${owner}`);
    typedDeclaration(`decl:${key}`, `symbol:${key}`, `decl:${owner}`, within(text, range), type);
    add('ParameterProfile', { id: `symbol:${key}`, binding_kind: 'positional', passing_mode: 'value' });
    model.CallableProfile.find(profile => profile.symbol_id === `symbol:${owner}`).parameter_ids.push(`symbol:${key}`);
  }

  for (const header of ['iostream', 'memory', 'string']) {
    const range = locate(`#include <${header}>`);
    add('Import', { id: `import:${header}`, ...containment(null), span: sourceSpan(range),
      form: 'include', is_reexport: false, source_form: 'angle_header', path_segments: [header], bindings: [],
      binding_results: [contextual({ site_key: 'source', state: 'unsupported', candidate_set_completeness: 'unknown',
        reason_codes: ['header_contents_not_analyzed'] })] });
    coverage(`coverage:include-${header}`, `import:${header}`, 'imports', 'unknown', ['header_contents_not_analyzed'], [], 'binding_results[0]');
  }
  add('Import', { id: 'import:Engine', ...containment('decl:main'), span: sourceSpan(within('using namespace Engine;', ranges.main)),
    form: 'using', is_reexport: false, source_form: 'qualified_name', path_segments: ['Engine'], bindings: [{ key: 'namespace', wildcard: true }],
    binding_results: [contextual({ site_key: 'source', state: 'resolved', candidate_set_completeness: 'complete', reason_codes: [] })],
    imports_from: [contextual({ target_id: 'symbol:Engine', site_key: 'source', state: 'established' })] });
  reference('reference:using-Engine', 'import:Engine', within('Engine', within('using namespace Engine;', ranges.main)), 'import', 'symbol:Engine');
  coverage('coverage:using-Engine-source', 'import:Engine', 'imports', 'complete', [], [], 'binding_results[0]');
  evidence('using-Engine', 'import:Engine', ['symbol:Engine', 'inventory:descriptor'],
    { rule: 'The using directive names the Engine namespace in this analysis context.' },
    [sourceSpan(within('using namespace Engine;', ranges.main))], 'language_rules').attribute_path = 'imports_from[0]';

  function declaredTypeUse(key, text, type, role = 'declared', child) {
    const decl = model.Declaration.find(record => record.id === `decl:${key}`);
    const range = { start: decl.span.start_offset, end: decl.span.end_offset };
    const id = typeUse(`typeuse:${key}`, decl.id, within(text, range), role, type);
    if (child) {
      typeUse(`typeuse:${key}-element`, id, within(child.name, within(text, range)),
        child.role, child.type, 0);
      reference(`reference:type-${key}-element`, `typeuse:${key}-element`, within(child.name, within(text, range)), 'type', child.symbol);
    }
    return id;
  }
  declaredTypeUse('scene-name', 'std::string', 'type:std-string');
  declaredTypeUse('active-context', 'std::shared_ptr<RenderContext>', 'type:shared-render', 'declared',
    { name: 'RenderContext', role: 'argument', type: 'type:RenderContext', symbol: 'symbol:RenderContext' });
  declaredTypeUse('frame-id', 'int', 'type:int');
  declaredTypeUse('owner-manager', 'SceneManager*', 'type:scene-pointer', 'declared',
    { name: 'SceneManager', role: 'declared', type: 'type:SceneManager', symbol: 'symbol:SceneManager' });
  declaredTypeUse('ctor-name', 'std::string', 'type:std-string');
  declaredTypeUse('set-context-parameter', 'std::shared_ptr<RenderContext>', 'type:shared-render', 'declared',
    { name: 'RenderContext', role: 'argument', type: 'type:RenderContext', symbol: 'symbol:RenderContext' });
  declaredTypeUse('ctor-frame', 'int', 'type:int');
  declaredTypeUse('ctor-manager', 'SceneManager*', 'type:scene-pointer', 'declared',
    { name: 'SceneManager', role: 'declared', type: 'type:SceneManager', symbol: 'symbol:SceneManager' });
  for (const [key, , , rangeKey, kind] of methods) if (kind !== 'constructor') {
    const decl = model.Declaration.find(record => record.id === `decl:${key}`);
    typeUse(`typeuse:return-${key}`, decl.id, within(key === 'main' ? 'int' : 'void', ranges[rangeKey]),
      'return', key === 'main' ? 'type:int' : 'type:void');
  }

  const nameArgument = namedExpression('expression:ctor-name', 'decl:scene-ctor', within('name', within('std::move(name)', ranges.sceneCtor)), 'symbol:ctor-name');
  const moveName = call('move-name', 'decl:scene-ctor', 'std::move(name)', ranges.sceneCtor, { args: [nameArgument], type: 'type:moved-string' });
  const contextArgument = namedExpression('expression:set-context-argument', 'decl:set-context', within('context', within('std::move(context)', ranges.set)), 'symbol:set-context-parameter');
  const moveContext = call('move-context', 'decl:set-context', 'std::move(context)', ranges.set, { args: [contextArgument], type: 'type:moved-context' });
  const assignmentRange = within('active_context_ = std::move(context)', ranges.set);
  const assignmentTarget = namedExpression('expression:assignment-target', 'decl:set-context', within('active_context_', assignmentRange), 'symbol:active-context', 'write');
  add('Expression', { id: 'expression:assignment', ...containment('decl:set-context'), span: sourceSpan(assignmentRange), kind: 'assignment',
    operator: '=', operands: [{ role: 'target', expression_id: assignmentTarget }, { role: 'value', expression_id: moveContext }] });
  for (const [field, param, text] of [
    ['frame-id', 'ctor-frame', 'frame_id_(frame_id)'],
    ['owner-manager', 'ctor-manager', 'owner_manager_(manager)']
  ]) {
    const range = within(text, ranges.renderCtor);
    const parameterRange = { start: range.start + text.indexOf('(') + 1, end: range.end - 1 };
    namedExpression(`expression:${field}-initializer`, 'decl:render-ctor', parameterRange, `symbol:${param}`);
  }

  call('update-dispatch', 'decl:update', 'dispatch_render_pass()', ranges.update, { target: 'symbol:dispatch', type: 'type:void' });
  call('execute-finalize', 'decl:execute', 'finalize_frame()', ranges.execute, { target: 'symbol:finalize', type: 'type:void' });
  call('dispatch-execute', 'decl:dispatch', 'active_context_->execute_pipeline()', ranges.dispatch, {
    receiver: { name: 'active_context_', symbol: 'symbol:active-context', operator: '->' },
    name: 'execute_pipeline', target: 'symbol:execute', type: 'type:void'
  });
  call('finalize-update', 'decl:finalize', 'owner_manager_->update_scene()', ranges.finalize, {
    receiver: { name: 'owner_manager_', symbol: 'symbol:owner-manager', operator: '->' },
    name: 'update_scene', target: 'symbol:update', type: 'type:void'
  });
  const level = literal('expression:level-name', 'decl:manager-variable', '"MainGameLevel"', ranges.main, 'string', 'MainGameLevel', 'type:level-name');
  const factoryManager = call('make-manager', 'decl:manager-variable', 'std::make_shared<SceneManager>("MainGameLevel")', ranges.main, {
    args: [level], type: 'type:shared-scene'
  });
  symbol('symbol:manager-variable', 'manager', 'variable', 'symbol:main');
  typedDeclaration('decl:manager-variable', 'symbol:manager-variable', 'decl:main',
    within('auto manager = std::make_shared<SceneManager>("MainGameLevel");', ranges.main), 'type:shared-scene',
    { initializer_expression_id: factoryManager, inferred: true });
  const frame = literal('expression:frame-number', 'decl:context-variable', '42', ranges.main, 'integer', 42, 'type:int');
  model.Expression.find(record => record.id === frame).semantic_properties = [
    contextual({ name: 'value_category', value: 'prvalue', state: 'established' })
  ];
  evidence('frame-value-category', frame, ['inventory:descriptor'],
    { rule: 'A C++17 integer literal is a prvalue; this adds no execution claim.' },
    [sourceSpan(within('42', ranges.main))], 'language_rules').attribute_path = 'semantic_properties[0]';
  const getManager = call('manager-get', 'decl:context-variable', 'manager.get()', ranges.main, {
    receiver: { name: 'manager', symbol: 'symbol:manager-variable', operator: '.' }, name: 'get', type: 'type:scene-pointer'
  });
  const factoryContext = call('make-context', 'decl:context-variable', 'std::make_shared<RenderContext>(42, manager.get())', ranges.main, {
    args: [frame, getManager], type: 'type:shared-render'
  });
  symbol('symbol:context-variable', 'context', 'variable', 'symbol:main');
  typedDeclaration('decl:context-variable', 'symbol:context-variable', 'decl:main',
    within('auto context = std::make_shared<RenderContext>(42, manager.get());', ranges.main), 'type:shared-render',
    { initializer_expression_id: factoryContext, inferred: true });
  const setCallRange = within('manager->set_render_context(context)', ranges.main);
  const actualContext = namedExpression('expression:main-context-argument', 'decl:main', within('context', {
    start: code.indexOf('(', setCallRange.start) + 1, end: setCallRange.end
  }), 'symbol:context-variable');
  call('main-set-context', 'decl:main', 'manager->set_render_context(context)', ranges.main, {
    receiver: { name: 'manager', symbol: 'symbol:manager-variable', operator: '->' },
    name: 'set_render_context', target: 'symbol:set-context', args: [actualContext],
    parameter: 'symbol:set-context-parameter', type: 'type:void'
  });
  call('main-update', 'decl:main', 'manager->update_scene()', ranges.main, {
    receiver: { name: 'manager', symbol: 'symbol:manager-variable', operator: '->' },
    name: 'update_scene', target: 'symbol:update', type: 'type:void'
  });
  literal('expression:main-return', 'decl:main', '0', within('return 0;', ranges.main), 'integer', 0, 'type:int');
  for (const [key, name, type, symbolId] of [
    ['make-manager', 'SceneManager', 'type:SceneManager', 'symbol:SceneManager'],
    ['make-context', 'RenderContext', 'type:RenderContext', 'symbol:RenderContext']
  ]) {
    const range = within(name, within(`std::make_shared<${name}>`, ranges.main));
    typeUse(`typeuse:${key}-argument`, `call:${key}`, range, 'argument', type, 0);
    reference(`reference:${key}-type`, `typeuse:${key}-argument`, range, 'type', symbolId);
  }
  for (const [key, type] of [['manager-variable', 'type:shared-scene'], ['context-variable', 'type:shared-render']]) {
    const decl = model.Declaration.find(record => record.id === `decl:${key}`);
    typeUse(`typeuse:${key}`, decl.id, { start: decl.span.start_offset, end: decl.span.start_offset + 4 },
      'declared', null);
    bind(`typeuse:${key}`, type, 'inferred');
  }

  const conditionalCalls = [];
  for (const [key, condition, symbolId, range, invocation] of [
    ['dispatch', 'active_context_', 'symbol:active-context', ranges.dispatch, 'call:dispatch-execute'],
    ['finalize', 'owner_manager_', 'symbol:owner-manager', ranges.finalize, 'call:finalize-update']
  ]) {
    const statement = within(key === 'dispatch'
      ? 'if (active_context_) {\n            active_context_->execute_pipeline();\n        }'
      : 'if (owner_manager_) {\n                owner_manager_->update_scene();\n            }', range);
    const conditionRange = within(condition, statement);
    const conditionId = namedExpression(`condition:${key}`, `decl:${key}`, conditionRange, symbolId);
    const expression = model.Expression.find(record => record.id === invocation);
    expression.condition = {
      predicate: { kind: 'expression', expression_id: conditionId }, completeness: 'complete'
    };
    const conditionEvidence = evidence(`conditional-${key}`, invocation, [conditionId, `decl:${key}`],
      { boundary: 'The call occurs inside this source if block. No branch outcome or path feasibility is asserted.' },
      [sourceSpan(statement)], 'syntax');
    conditionEvidence.authority = 'observed';
    conditionEvidence.attribute_path = 'condition';
    coverage(`coverage:conditional-${key}`, invocation, 'calls', 'complete', [], [], 'condition');
    conditionalCalls.push({ call_id: invocation, condition_expression_id: conditionId, declaration_id: `decl:${key}` });
  }
  evidence('RenderContext-identity', 'symbol:RenderContext', ['decl:RenderContext-forward', 'decl:RenderContext', 'inventory:descriptor'],
    { rule: 'The forward declaration and class definition denote the same Engine::RenderContext under C++ class declaration rules.' },
    [sourceSpan(locate('class RenderContext;')), sourceSpan(ranges.render)], 'language_rules');
  evidence('dispatch-identity', 'symbol:dispatch', ['decl:dispatch-forward', 'decl:dispatch', 'inventory:descriptor'],
    { rule: 'The out-of-class qualified definition matches the zero-parameter SceneManager member declaration, not a new namespace function.' },
    [sourceSpan(within('void dispatch_render_pass();', ranges.scene)), sourceSpan(ranges.dispatch)], 'language_rules');
  evidence('cpp-contracts', projectId, ['inventory:example'],
    { assumptions: [
      'Normal C++17 standard headers; no macros replace the displayed project declarations.',
      'Supplied public type contracts: string is the standard alias, shared_ptr<T> has one type parameter, make_shared<T> returns shared_ptr<T>, get/operator-> return T*, move produces an rvalue reference.',
      'These limited contracts support illustrated types and receiver lookup, not a complete SDK overload analysis or prediction of execution.'
    ] });
  const streamSpans = code.split('\n').filter(line => line.includes('std::cout')).map(line => sourceSpan(locate(line.trim())));
  coverage('coverage:configuration', 'inventory:example', 'configuration', 'partial', ['sdk_search_paths_not_exported']);
  coverage('coverage:projects', 'repository:example', 'projects', 'complete');
  coverage('coverage:files', 'project:example', 'files', 'complete');
  coverage('coverage:project-dependencies', 'project:example', 'project_dependencies', 'unknown', ['build_not_evaluated']);
  coverage('coverage:external-libraries', 'project:example', 'external_libraries', 'unknown', ['library_resolution_not_performed']);
  coverage('coverage:syntax', 'inventory:example', 'syntax', 'partial', ['focused_teaching_projection'], streamSpans);
  coverage('coverage:declarations', 'inventory:example', 'declarations', 'partial', ['project_declarations_only']);
  coverage('coverage:calls', 'inventory:example', 'calls', 'partial', ['stream_operator_and_implicit_library_calls_omitted'], streamSpans);
  coverage('coverage:types', 'inventory:example', 'types', 'partial', ['standard_library_internal_types_not_exported']);
  coverage('coverage:imports', 'inventory:example', 'imports', 'partial', ['header_contents_not_analyzed']);
  coverage('coverage:references', 'inventory:example', 'references', 'partial', ['focused_project_references_only'], streamSpans);
  for (const expression of model.Expression.filter(record => record.possible_implementation)) {
    coverage(`coverage:implementation:${expression.id}`, expression.id, 'implementations', 'complete', [], [], 'possible_implementation[0]');
    evidence(`implementation:${expression.id}`, expression.id, expression.possible_implementation.map(edge => edge.target_id),
      { boundary: 'One known non-virtual source definition within this assessed source. No linker or runtime target completeness is claimed.' }).attribute_path = 'possible_implementation[0]';
  }
  add('Diagnostic', contextual({ id: 'diagnostic:projection', severity: 'info', code: 'example.ILLUSTRATIVE_COVERAGE',
    subject_id: 'inventory:example', message: 'This hand-authored projection omits stream insertion operators and SDK overload sets; execution analysis is outside scope. It is not an analyzer export.' }));
  add('Diagnostic', contextual({ id: 'diagnostic:dependency-cycle', severity: 'info', code: 'example.STRUCTURAL_DEPENDENCY_CYCLE',
    subject_id: 'call:finalize-update', span: sourceSpan(within('owner_manager_->update_scene()', ranges.finalize)),
    related_subjects: [{ subject_id: 'decl:finalize', role: 'caller' }, { subject_id: 'decl:update', role: 'target' }],
    related_spans: [{ span: sourceSpan(ranges.update), message: 'The related method participates in the structural cycle.' }],
    message: 'The project member relationships contain a structural cycle. Cyclic dependencies are permitted; these records do not prove execution, branch outcomes, termination, or simultaneous applicability. The program is not executed.' }));

  const excerpt = (caption, range) => ({ caption, span: sourceSpan(range) });
  window.CODE_GRAPH_EXAMPLE = {
    filename: 'example.cpp', code, model, relationships,
    externalContent: {
      'teaching://engine/0123456789abcdef0123456789abcdef01234567/example.cpp': code,
      'teaching://engine/0123456789abcdef0123456789abcdef01234567/CMakeLists.txt': descriptor
    },
    sourceNote: 'This teaching input was normalized from the supplied Markdown before analysis: escapes before underscores and pointer asterisks were removed. Analysis preserves this input unchanged, including the supplied C++ string literals. A separate hand-authored CMakeLists.txt teaching descriptor supplies the project boundary; it is not part of the original snippet, and no build was run.',
    steps: [
      ['Repository', 'Project', 'Directory', 'ProjectFile', 'Import'],
      ['Symbol', 'Declaration', 'TypeProfile', 'CallableProfile', 'ParameterProfile'],
      ['Expression'],
      ['TypeExpression', 'TypeUse', 'Declaration', 'Expression', 'Symbol'],
      ['Expression', 'Import'],
      ['Coverage', 'Diagnostic', 'Expression', 'Project']
    ],
    stepRecordIds: [
      null,
      ['symbol:Engine', 'symbol:SceneManager', 'symbol:RenderContext', 'symbol:dispatch', 'symbol:scene-ctor', 'symbol:ctor-name',
        'profile:TypeProfile:symbol:SceneManager', 'profile:TypeProfile:symbol:RenderContext',
        'profile:CallableProfile:symbol:dispatch', 'profile:CallableProfile:symbol:scene-ctor', 'profile:ParameterProfile:symbol:ctor-name',
        'decl:RenderContext-forward', 'decl:RenderContext', 'decl:dispatch-forward', 'decl:dispatch', 'decl:ctor-name',
        'decl:Engine', 'decl:SceneManager'],
      ['call:make-context', 'callee:make-context', 'call:manager-get', 'callee:manager-get', 'receiver:manager-get', 'expression:frame-number',
        'call:dispatch-execute', 'callee:dispatch-execute', 'receiver:dispatch-execute', 'call:update-dispatch', 'callee:update-dispatch',
        'callee:main-update'],
      ['type:SceneManager', 'type:RenderContext', 'type:std-string', 'type:shared-template', 'type:shared-render', 'type:shared-scene',
        'type:scene-pointer', 'type:render-pointer', 'type:const-char', 'type:level-name', 'typeuse:active-context', 'typeuse:active-context-element',
        'typeuse:owner-manager', 'typeuse:owner-manager-element', 'typeuse:make-context-argument', 'typeuse:manager-variable',
        'decl:active-context', 'decl:owner-manager', 'decl:manager-variable', 'call:manager-get',
        'call:make-context', 'symbol:dispatch'],
      ['call:update-dispatch', 'callee:update-dispatch', 'call:dispatch-execute',
        'call:finalize-update', 'call:main-set-context', 'call:make-context', 'call:manager-get'],
      ['call:update-dispatch', 'call:dispatch-execute', 'call:execute-finalize', 'call:finalize-update',
        projectId,
        'coverage:references', 'coverage:calls', 'diagnostic:dependency-cycle', 'diagnostic:projection',
        ...conditionalCalls.flatMap(record => [record.declaration_id, record.condition_expression_id])]
    ],
    excerpts: [
      [excerpt('Headers are source observations; their contents are outside this projection.', { start: 0, end: locate('namespace Engine').start }),
        excerpt('The namespace introduces the two cooperating classes.', locate('namespace Engine {\n    class RenderContext;'))],
      [excerpt('First occurrence of the RenderContext type.', locate('class RenderContext;')),
        excerpt('A member declaration inside SceneManager.', within('void dispatch_render_pass();', ranges.scene)),
        excerpt('Its definition is written later in namespace scope.', ranges.dispatch)],
      [excerpt('A factory call contains a separate nested manager.get() call.', within('auto context = std::make_shared<RenderContext>(42, manager.get());', ranges.main)),
        excerpt('An explicit receiver is the callee member-access base.', within('active_context_->execute_pipeline();', ranges.dispatch)),
        excerpt('An unqualified member call has an implicit receiver, not an extra source argument.', within('dispatch_render_pass();', ranges.update))],
      [excerpt('Generic ownership handle and raw pointer retain their type layers.', within('std::shared_ptr<RenderContext> active_context_;', ranges.scene)),
        excerpt('The back-reference has a pointer type, not semantic symbol ownership.', within('SceneManager* owner_manager_;', ranges.render)),
        excerpt('auto is deduced under the stated standard-library type contracts.', within('auto manager = std::make_shared<SceneManager>("MainGameLevel");', ranges.main))],
      [excerpt('A known receiver type selects a project member; execution is not assessed.', within('active_context_->execute_pipeline();', ranges.dispatch)),
        excerpt('A raw pointer can likewise have a known non-virtual declaration-level target.', within('owner_manager_->update_scene();', ranges.finalize)),
        excerpt('A known factory result type does not resolve its SDK overload set.', within('std::make_shared<RenderContext>(42, manager.get())', ranges.main))],
      [excerpt('Retain this conditional source dependency without proving the branch executes.', within('if (active_context_) {\n            active_context_->execute_pipeline();\n        }', ranges.dispatch)),
        excerpt('The reciprocal relationship forms a structural dependency cycle.', within('if (owner_manager_) {\n                owner_manager_->update_scene();\n            }', ranges.finalize))]
    ],
    conditionalCalls,
    notes: [
      'ProjectFile stores only a versioned external content reference. This offline example resolves teaching:// references from a separate demonstration store, outside the graph. Include and using directives remain visible as Import records. The repository commit hash is illustrative, not an observed Git revision.',
      'RenderContext’s forward declaration and definition share one symbol. Both dispatch_render_pass occurrences likewise share one callable symbol; the out-of-class definition has decl:Engine as its syntactic parent, while its semantic owner remains SceneManager.',
      'The outer factory’s second argument is call:manager-get, not a flattened manager expression. Explicit receivers live in member-access operands; the call Expression stores its callee and source arguments.',
      'shared_ptr<RenderContext> is a generic application; SceneManager* is a pointer layer over a nominal class type. Supplied public C++17 type contracts support auto and get() result types, independently of SDK overload resolution.',
      'Known non-virtual project calls have complete relevant local candidate scopes. Standard-library calls remain unsupported with unknown candidate scope and no selected target; type contracts do not invent resolved factory or move signatures.',
      'Direct INVOKES, REFERS_TO, POSSIBLE_IMPLEMENTATION and HAS_TYPE edges support derived component dependencies. Source if blocks retain their relationships without execution claims. No control/data-flow or runtime-state records are required.'
    ]
  };
})();
