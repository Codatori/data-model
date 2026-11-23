(() => {
  'use strict';

  const sceneCode = String.raw`#pragma once

#include <iostream>
#include <memory>
#include <string>
#include <utility>

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

        void update_scene(int frame_id);
        void dispatch_render_pass();
    };
} // namespace Engine
`;
  const renderCode = String.raw`#pragma once

#include "SceneManager.hpp"

namespace Engine {
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

    inline void SceneManager::update_scene(int frame_id) {
        std::cout << "[SceneManager] Requested frame #" << frame_id << "\\n";
        dispatch_render_pass();
    }
} // namespace Engine
`;
  const viewerCode = String.raw`#include "RenderContext.hpp"

class Application {
public:
    void render(Engine::SceneManager& manager, int frame_id);
};

void Application::render(Engine::SceneManager& manager, int frame_id) {
    manager.update_scene(frame_id);
}

int main() {
    using namespace Engine;

    auto manager = std::make_shared<SceneManager>("MainGameLevel");

    auto context = std::make_shared<RenderContext>(42, manager.get());

    manager->set_render_context(context);

    Application application;
    application.render(*manager, 42);

    std::cout << "--- Starting execution flow --- \\n";
    manager->update_scene();

    return 0;
}
`;
  const code = sceneCode + renderCode + viewerCode;
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
    engineRender: body('namespace Engine {\n    class RenderContext {'),
    scene: body('class SceneManager {'),
    render: body('class RenderContext {'),
    sceneCtor: body('explicit SceneManager(std::string name)'),
    set: body('void set_render_context('),
    update: body('void update_scene()'),
    renderCtor: body('RenderContext(int frame_id, SceneManager* manager)'),
    execute: body('void execute_pipeline()'),
    finalize: body('void finalize_frame()'),
    dispatch: body('inline void SceneManager::dispatch_render_pass()'),
    main: body('int main()'),
    updateFrame: body('inline void SceneManager::update_scene(int frame_id)'),
    application: body('class Application {'),
    applicationRender: body('void Application::render(Engine::SceneManager& manager, int frame_id)')
  };
  const projectId = 'project:example';
  const model = Object.fromEntries([
    'Repository', 'Project', 'Directory', 'ProjectFile',
    'Symbol', 'Declaration', 'TypeProfile', 'CallableProfile', 'ParameterProfile',
    'Import', 'Expression', 'TypeExpression', 'TypeUse', 'Diagnostic', 'Resource'
  ].map(category => [category, []]));
  const symbolProfiles = new Set(['CallableProfile', 'ParameterProfile', 'TypeProfile']);
  const add = (category, record) => {
    if (symbolProfiles.has(category)) record = { ...record, symbol_id: record.id, id: `profile:${category}:${record.id}` };
    model[category].push(record);
    return record;
  };
  const contextual = record => ({ ...record, project_id: projectId });
  const evidence = (key, subject, supporting, detail, spans = [], method = 'manual') => {
    const source = Object.values(model).flat().find(record => record.id === subject);
    source.evidence ??= [];
    const entry = { key, method, source_spans: spans, supports: supporting.map(subject_id => ({ subject_id })),
      authority: 'established', detail,
      ...([...model.Repository, ...model.Project].some(record => record.id === subject) ? { project_independent: true } : { project_id: projectId }) };
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
    source.binding_results.push(contextual({ site_key: siteKey, state: target ? 'resolved' : 'unsupported',
      candidate_set_completeness: target ? 'complete' : 'unknown', reason_codes: target ? [] : ['standard_library_binding_not_analyzed'] }));
    if (!target) return;
    source[field] ??= [];
    const edge = contextual({ site_key: siteKey, target_id: target, state: 'selected', applicability: 'applicable', reason_codes: [], ...extra });
    source[field].push(edge);
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
        argument_bindings: (options.parameters || (options.parameter ? [options.parameter] : [])).map((parameter, position) => ({
          parameter_id: parameter, argument_positions: [position], conversions: []
        }))
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

  const descriptor = 'add_library(engine INTERFACE)\ntarget_include_directories(engine INTERFACE ${CMAKE_CURRENT_SOURCE_DIR})\ntarget_compile_features(engine INTERFACE cxx_std_17)\ntarget_sources(engine INTERFACE ${CMAKE_CURRENT_SOURCE_DIR}/SceneManager.hpp ${CMAKE_CURRENT_SOURCE_DIR}/RenderContext.hpp)\n';
  const viewerDescriptor = 'add_executable(viewer main.cpp)\ntarget_link_libraries(viewer PRIVATE engine)\n';
  const rootDescriptor = 'cmake_minimum_required(VERSION 3.16)\nproject(EngineWorkspace LANGUAGES CXX)\nadd_subdirectory(engine)\nadd_subdirectory(viewer)\n';
  const contentRef = path => `teaching://engine/0123456789abcdef0123456789abcdef01234567/${path}`;
  const sources = [
    { id: 'inventory:example', path: 'engine/SceneManager.hpp', content: sceneCode, project: projectId },
    { id: 'inventory:render', path: 'engine/RenderContext.hpp', content: renderCode, project: projectId },
    { id: 'inventory:viewer', path: 'viewer/main.cpp', content: viewerCode, project: 'project:viewer' }
  ];
  let sourceOffset = 0;
  for (const source of sources) {
    source.start = sourceOffset;
    sourceOffset += encode(source.content).length;
    source.end = sourceOffset;
  }
  const settings = { language_settings: { language: 'cpp', standard: 'c++17' }, defines: {}, search_paths: [] };
  add('Repository', { id: 'repository:example', uri: 'memory:///', name: 'Engine workspace (illustrative Git snapshot)',
    revision: '0123456789abcdef0123456789abcdef01234567' });
  add('Directory', { id: 'directory:example', uri: 'memory:///engine/', name: 'engine' });
  add('Directory', { id: 'directory:repository', uri: 'memory:///', name: 'engine-workspace' });
  add('Directory', { id: 'directory:viewer', uri: 'memory:///viewer/', name: 'viewer' });
  for (const [id, path] of [['inventory:descriptor', 'engine/CMakeLists.txt'],
    ['inventory:viewer-descriptor', 'viewer/CMakeLists.txt'], ['inventory:root-descriptor', 'CMakeLists.txt']]) {
    add('ProjectFile', { id, uri: `memory:///${path}`, name: 'CMakeLists.txt', kind: 'descriptor', origin: 'source', content_ref: contentRef(path) });
  }
  // Each build descriptor is also classified as a non-code Resource backed by its single ProjectFile.
  for (const [id, file] of [['resource:descriptor', 'inventory:descriptor'], ['resource:viewer-descriptor', 'inventory:viewer-descriptor'],
    ['resource:root-descriptor', 'inventory:root-descriptor']]) add('Resource', { id, kind: 'descriptor', media_type: 'text/x-cmake', file_id: file });
  for (const source of sources) add('ProjectFile', { id: source.id, uri: `memory:///${source.path}`,
    name: source.path.split('/').pop(), kind: 'source', origin: 'source', language: 'cpp', content_ref: contentRef(source.path) });
  add('Project', { id: projectId, name: 'engine', language: 'cpp', build_system: 'cmake', kind: 'library', ...settings,
    search_paths: [{ uri: 'memory:///engine/', kind: 'include' }] });
  add('Project', { id: 'project:viewer', name: 'viewer', language: 'cpp', build_system: 'cmake', kind: 'executable', ...settings,
    search_paths: [{ uri: 'memory:///engine/', kind: 'include' }] });
  const relationships = [
    { source_id: 'repository:example', type: 'HAS_PROJECT', target_id: 'project:example', state: 'established' },
    { source_id: 'repository:example', type: 'HAS_PROJECT', target_id: 'project:viewer', state: 'established' },
    { source_id: 'project:viewer', type: 'DEPENDS_ON', target_id: projectId, state: 'established' },
    ...['directory:example', 'inventory:descriptor', 'inventory:example', 'inventory:render'].map(target => ({
      source_id: 'project:example', type: 'CONTAINS', target_id: target, state: 'established',
      membership: ['inventory:example', 'inventory:render'].includes(target) ? 'both' : 'physical',
      ...(target === 'inventory:descriptor' ? { is_descriptor: true } : {}),
      ...(target === 'directory:example' ? { is_root: true } : {})
    })),
    ...['inventory:descriptor', 'inventory:example', 'inventory:render'].map(target => ({
      source_id: 'directory:example', type: 'CONTAINS', target_id: target, state: 'established'
    })),
    ...['directory:viewer', 'inventory:viewer-descriptor', 'inventory:viewer'].map(target => ({
      source_id: 'project:viewer', type: 'CONTAINS', target_id: target, state: 'established',
      membership: target === 'inventory:viewer' ? 'both' : 'physical',
      ...(target === 'directory:viewer' ? { is_root: true } : {}),
      ...(target === 'inventory:viewer-descriptor' ? { is_descriptor: true } : {})
    })),
    ...['inventory:viewer-descriptor', 'inventory:viewer'].map(target => ({
      source_id: 'directory:viewer', type: 'CONTAINS', target_id: target, state: 'established'
    })),
    ...['directory:example', 'directory:viewer'].map(target => ({
      source_id: 'directory:repository', type: 'PARENT_OF', target_id: target, state: 'established'
    })),
    { source_id: 'directory:repository', type: 'CONTAINS', target_id: 'inventory:root-descriptor', state: 'established' },
    ...model.Resource.map(resource => ({ source_id: resource.id, type: 'CLASSIFIES', target_id: resource.file_id, state: 'established' }))
  ];
  model.Resource.forEach(resource => delete resource.file_id);
  evidence('example-project', 'project:example', ['inventory:descriptor', 'inventory:example'],
    { descriptor_ref: contentRef('engine/CMakeLists.txt'),
      boundary: 'Hand-authored CMake interface-library target with two public headers; no SDK dependency resolution or execution is claimed.' });
  evidence('viewer-project', 'project:viewer', ['inventory:viewer-descriptor', 'inventory:root-descriptor'],
    { descriptor_ref: contentRef('viewer/CMakeLists.txt'), boundary: 'target_link_libraries(viewer PRIVATE engine) establishes the explicit viewer -> engine build dependency.' });
  // The C++ global namespace is unnamed and has no declaration; it owns every top-level entity.
  add('Symbol', { id: 'symbol:global', kind: 'namespace', origin: 'intrinsic', identity_state: 'established' });
  symbol('symbol:Engine', 'Engine', 'namespace', 'symbol:global');
  symbol('symbol:SceneManager', 'SceneManager', 'type', 'symbol:Engine');
  symbol('symbol:RenderContext', 'RenderContext', 'type', 'symbol:Engine');
  declaration('decl:Engine', 'symbol:Engine', null, ranges.engine, { body_span: bodySpan(ranges.engine) });
  declaration('decl:SceneManager', 'symbol:SceneManager', 'decl:Engine', ranges.scene, { body_span: bodySpan(ranges.scene) });
  declaration('decl:RenderContext-forward', 'symbol:RenderContext', 'decl:Engine', locate('class RenderContext;'), { form: 'forward_declaration' });
  declaration('decl:Engine-render', 'symbol:Engine', null, ranges.engineRender, { body_span: bodySpan(ranges.engineRender) });
  declaration('decl:RenderContext', 'symbol:RenderContext', 'decl:Engine-render', ranges.render, { body_span: bodySpan(ranges.render) });
  for (const name of ['SceneManager', 'RenderContext']) add('TypeProfile', {
    id: `symbol:${name}`, type_kind: 'class', type_parameter_ids: []
  });
  symbol('symbol:std', 'std', 'namespace', 'symbol:global', 'external');
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
    symbol(`symbol:${key}`, name, 'callable', owner ? `symbol:${owner}` : 'symbol:global');
    const parentDeclarationId = key === 'main' ? null : key === 'dispatch' ? 'decl:Engine-render' : `decl:${owner}`;
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

  for (const header of ['iostream', 'memory', 'string', 'utility']) {
    const range = locate(`#include <${header}>`);
    add('Import', { id: `import:${header}`, ...containment(null), span: sourceSpan(range),
      form: 'include', is_reexport: false, source_form: 'angle_header', path_segments: [header], bindings: [],
      binding_results: [contextual({ site_key: 'source', state: 'unsupported', candidate_set_completeness: 'unknown',
        reason_codes: ['header_contents_not_analyzed'] })] });
  }
  add('Import', { id: 'import:Engine', ...containment('decl:main'), span: sourceSpan(within('using namespace Engine;', ranges.main)),
    form: 'using', is_reexport: false, source_form: 'qualified_name', path_segments: ['Engine'], bindings: [{ key: 'namespace', wildcard: true }],
    binding_results: [contextual({ site_key: 'source', state: 'resolved', candidate_set_completeness: 'complete', reason_codes: [] })],
    imports_from: [contextual({ target_id: 'symbol:Engine', site_key: 'source', state: 'established' })] });
  reference('reference:using-Engine', 'import:Engine', within('Engine', within('using namespace Engine;', ranges.main)), 'import', 'symbol:Engine');
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
  // A written type name binds through its own name use, like every other resolved name in the example.
  function typeName(key, spelling, name, symbolId, qualification) {
    const decl = model.Declaration.find(record => record.id === `decl:${key}`);
    const range = within(spelling, { start: decl.span.start_offset, end: decl.span.end_offset });
    reference(`reference:type-${key}`, `typeuse:${key}`, within(name, range), 'type', symbolId, qualification);
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
  for (const key of ['scene-name', 'ctor-name']) typeName(key, 'std::string', 'string', 'symbol:std-string', 'qualified');
  for (const key of ['active-context', 'set-context-parameter']) typeName(key, 'std::shared_ptr', 'shared_ptr', 'symbol:std-shared', 'qualified');
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

  symbol('symbol:Application', 'Application', 'type', 'symbol:global');
  add('TypeProfile', { id: 'symbol:Application', type_kind: 'class', type_parameter_ids: [] });
  add('TypeExpression', { id: 'type:Application', kind: 'nominal', symbol_id: 'symbol:Application', qualifiers: [], completeness: 'complete' });
  add('TypeExpression', { id: 'type:scene-reference', kind: 'reference', reference_kind: 'lvalue',
    element_type_id: 'type:SceneManager', qualifiers: [], completeness: 'complete' });
  declaration('decl:Application', 'symbol:Application', null, ranges.application, { body_span: bodySpan(ranges.application) });
  for (const [key, name, owner, parent, range] of [
    ['update-frame', 'update_scene', 'SceneManager', 'Engine-render', ranges.updateFrame],
    ['application-render', 'render', 'Application', null, ranges.applicationRender]
  ]) {
    symbol(`symbol:${key}`, name, 'callable', `symbol:${owner}`);
    declaration(`decl:${key}`, `symbol:${key}`, parent ? `decl:${parent}` : null, range,
      { body_span: bodySpan(range), modifiers: key === 'update-frame' ? ['inline'] : [], visibility: 'public' });
    declaration(`decl:${key}-forward`, `symbol:${key}`, `decl:${owner}`, key === 'update-frame'
      ? within('void update_scene(int frame_id);', ranges.scene)
      : within('void render(Engine::SceneManager& manager, int frame_id);', ranges.application),
    { form: 'declaration', visibility: 'public' });
    add('CallableProfile', { id: `symbol:${key}`, callable_kind: 'method', parameter_ids: [], type_parameter_ids: [],
      receiver_mode: 'instance', variadic_style: 'none', receiver_qualifiers: [] });
    methodDefinitions.set(`symbol:${key}`, `decl:${key}`);
    bind(`decl:${key}`, 'type:void', 'return');
    bind(`decl:${key}-forward`, 'type:void', 'return');
    bind(`decl:${key}`, `type:${owner}`, 'receiver');
    typeUse(`typeuse:return-${key}`, `decl:${key}`, within('void', range), 'return', 'type:void');
    reference(`reference:${key}-owner`, `decl:${key}`, within(owner, range), 'type', `symbol:${owner}`);
  }
  for (const [key, name, owner, spelling, range, type] of [
    ['update-frame-id', 'frame_id', 'update-frame', 'int frame_id', ranges.updateFrame, 'type:int'],
    ['application-manager', 'manager', 'application-render', 'Engine::SceneManager& manager', ranges.applicationRender, 'type:scene-reference'],
    ['application-frame', 'frame_id', 'application-render', 'int frame_id', ranges.applicationRender, 'type:int']
  ]) {
    symbol(`symbol:${key}`, name, 'parameter', `symbol:${owner}`);
    typedDeclaration(`decl:${key}`, `symbol:${key}`, `decl:${owner}`, within(spelling, range), type);
    add('ParameterProfile', { id: `symbol:${key}`, binding_kind: 'positional', passing_mode: key === 'application-manager' ? 'reference' : 'value' });
    model.CallableProfile.find(profile => profile.symbol_id === `symbol:${owner}`).parameter_ids.push(`symbol:${key}`);
    declaredTypeUse(key, spelling.slice(0, spelling.lastIndexOf(' ')), type);
  }
  reference('reference:application-manager-type', 'typeuse:application-manager',
    within('SceneManager', within('Engine::SceneManager& manager', ranges.applicationRender)), 'type', 'symbol:SceneManager', 'qualified');
  const frameArgument = namedExpression('expression:application-frame', 'decl:application-render',
    within('frame_id', within('manager.update_scene(frame_id)', ranges.applicationRender)), 'symbol:application-frame');
  call('application-update', 'decl:application-render', 'manager.update_scene(frame_id)', ranges.applicationRender, {
    receiver: { name: 'manager', symbol: 'symbol:application-manager', operator: '.' },
    name: 'update_scene', target: 'symbol:update-frame', args: [frameArgument], parameter: 'symbol:update-frame-id', type: 'type:void'
  });
  model.Expression.find(record => record.id === 'call:application-update').invokes.push(contextual({
    site_key: 'call', target_id: 'symbol:update', state: 'rejected', applicability: 'inapplicable',
    reason_codes: ['argument_count_mismatch'], dispatch_kind: 'direct', argument_bindings: []
  }));
  evidence('overload-selection', 'call:application-update', ['decl:update-frame-forward', 'decl:update'],
    { rule: 'The int argument selects update_scene(int); update_scene() is rejected by arity. Overloading is not overriding.' },
    [sourceSpan(within('manager.update_scene(frame_id)', ranges.applicationRender))], 'language_rules').attribute_path = 'invokes[1]';
  call('update-frame-dispatch', 'decl:update-frame', 'dispatch_render_pass()', ranges.updateFrame, { target: 'symbol:dispatch', type: 'type:void' });
  symbol('symbol:application-variable', 'application', 'variable', 'symbol:main');
  typedDeclaration('decl:application-variable', 'symbol:application-variable', 'decl:main',
    within('Application application;', ranges.main), 'type:Application');
  declaredTypeUse('application-variable', 'Application', 'type:Application');
  typeName('application-variable', 'Application', 'Application', 'symbol:Application', 'unqualified');
  const applicationCall = within('application.render(*manager, 42)', ranges.main);
  const managerArgument = namedExpression('expression:application-manager-base', 'decl:main',
    within('manager', applicationCall), 'symbol:manager-variable');
  add('Expression', { id: 'expression:application-manager', ...containment('decl:main'),
    span: sourceSpan(within('*manager', applicationCall)), kind: 'unary', operator: '*',
    operands: [{ role: 'operand', expression_id: managerArgument }] });
  bind('expression:application-manager', 'type:SceneManager', 'inferred');
  const applicationFrame = literal('expression:application-frame-literal', 'decl:main', '42', applicationCall, 'integer', 42, 'type:int');
  call('main-application', 'decl:main', 'application.render(*manager, 42)', ranges.main, {
    receiver: { name: 'application', symbol: 'symbol:application-variable', operator: '.' },
    name: 'render', target: 'symbol:application-render', args: ['expression:application-manager', applicationFrame],
    parameters: ['symbol:application-manager', 'symbol:application-frame'], type: 'type:void'
  });
  for (const [key, header, target] of [
    ['scene-header', 'SceneManager.hpp', 'inventory:example'],
    ['render-header', 'RenderContext.hpp', 'inventory:render']
  ]) {
    const directive = locate(`#include "${header}"`, key === 'scene-header' ? sceneCode.length : sceneCode.length + renderCode.length);
    const record = add('Import', { id: `import:${key}`, ...containment(null), span: sourceSpan(directive),
      form: 'include', source_form: 'quoted_header', path_segments: [header], bindings: [], is_reexport: false,
      binding_results: [contextual({ site_key: 'source', state: 'resolved', candidate_set_completeness: 'complete', reason_codes: [] })],
      imports_from: [contextual({ target_id: target, site_key: 'source', state: 'established' })] });
    evidence(key, record.id, [target, 'inventory:descriptor'],
      { rule: 'Quoted include resolves to the checked-in teaching header through the engine target include directory.' },
      [sourceSpan(directive)], 'manual').attribute_path = 'imports_from[0]';
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
    conditionalCalls.push({ call_id: invocation, condition_expression_id: conditionId, declaration_id: `decl:${key}` });
  }
  evidence('RenderContext-identity', 'symbol:RenderContext', ['decl:RenderContext-forward', 'decl:RenderContext', 'inventory:descriptor'],
    { rule: 'The forward declaration and class definition denote the same Engine::RenderContext under C++ class declaration rules.' },
    [sourceSpan(locate('class RenderContext;')), sourceSpan(ranges.render)], 'language_rules');
  evidence('dispatch-identity', 'symbol:dispatch', ['decl:dispatch-forward', 'decl:dispatch', 'inventory:descriptor'],
    { rule: 'The out-of-class qualified definition matches the zero-parameter SceneManager member declaration, not a new namespace function.' },
    [sourceSpan(within('void dispatch_render_pass();', ranges.scene)), sourceSpan(ranges.dispatch)], 'language_rules');
  evidence('update-frame-identity', 'symbol:update-frame', ['decl:update-frame-forward', 'decl:update-frame', 'inventory:descriptor'],
    { rule: 'The out-of-class qualified definition matches the int-parameter SceneManager member declaration, a distinct overload from update_scene().' },
    [sourceSpan(within('void update_scene(int frame_id);', ranges.scene)), sourceSpan(ranges.updateFrame)], 'language_rules');
  const applicationIdentity = evidence('application-render-identity', 'symbol:application-render',
    ['decl:application-render-forward', 'decl:application-render', 'inventory:viewer-descriptor'],
    { rule: 'The out-of-class qualified definition matches the Application member declaration with the same parameter types.' },
    [sourceSpan(within('void render(Engine::SceneManager& manager, int frame_id);', ranges.application)), sourceSpan(ranges.applicationRender)], 'language_rules');
  applicationIdentity.project_id = 'project:viewer';
  const globalNamespace = evidence('global-namespace', 'symbol:global', ['decl:Engine', 'decl:Engine-render', 'decl:Application', 'decl:main'],
    { rule: 'Under C++ rules, declarations outside any namespace belong to the unnamed global namespace, shared by both projects.' }, [], 'language_rules');
  delete globalNamespace.project_id;
  globalNamespace.project_independent = true;
  evidence('Engine-identity', 'symbol:Engine', ['decl:Engine', 'decl:Engine-render', 'inventory:descriptor'],
    { rule: 'Both namespace Engine blocks reopen one namespace under C++ namespace rules; each file keeps its own declaration.' },
    [sourceSpan(ranges.engine), sourceSpan(ranges.engineRender)], 'language_rules');
  evidence('cpp-contracts', projectId, ['inventory:example'],
    { assumptions: [
      'Normal C++17 standard headers; no macros replace the displayed project declarations.',
      'Supplied public type contracts: string is the standard alias, shared_ptr<T> has one type parameter, make_shared<T> returns shared_ptr<T>, get/operator-> return T*, move produces an rvalue reference.',
      'These limited contracts support illustrated types and receiver lookup, not a complete SDK overload analysis or prediction of execution.'
    ] });
  for (const expression of model.Expression.filter(record => record.possible_implementation)) {
    evidence(`implementation:${expression.id}`, expression.id, expression.possible_implementation.map(edge => edge.target_id),
      { boundary: 'One known non-virtual source definition within this assessed source. No linker or runtime target completeness is claimed.' }).attribute_path = 'possible_implementation[0]';
  }
  add('Diagnostic', { id: 'diagnostic:projection', severity: 'info', code: 'example.PROJECTION_LIMITATION',
    subject_id: 'repository:example', message: 'This hand-authored projection does not analyze SDK header contents or resolve external libraries, and omits stream insertion operators. Execution analysis is outside scope. It is not an analyzer export.' });
  add('Diagnostic', contextual({ id: 'diagnostic:dependency-cycle', severity: 'info', code: 'example.STRUCTURAL_DEPENDENCY_CYCLE',
    subject_id: 'call:finalize-update', span: sourceSpan(within('owner_manager_->update_scene()', ranges.finalize)),
    related_subjects: [{ subject_id: 'decl:finalize', role: 'caller' }, { subject_id: 'decl:update', role: 'target' }],
    related_spans: [{ span: sourceSpan(ranges.update), message: 'The related method participates in the structural cycle.' }],
    message: 'The project member relationships contain a structural cycle. Cyclic dependencies are permitted; these records do not prove execution, branch outcomes, termination, or simultaneous applicability. The program is not executed.' }));

  const excerpt = (caption, range) => ({ caption, span: sourceSpan(range) });
  window.CODE_GRAPH_EXAMPLE = {
    filename: 'engine-workspace', code, model, relationships,
    externalContent: Object.fromEntries([
      ...sources.map(source => [contentRef(source.path), source.content]),
      [contentRef('engine/CMakeLists.txt'), descriptor],
      [contentRef('viewer/CMakeLists.txt'), viewerDescriptor],
      [contentRef('CMakeLists.txt'), rootDescriptor]
    ]),
    sourceNote: 'Hand-authored C++17 workspace in examples/engine-workspace: viewer depends on the header-only engine library. The repository and commit represent an illustrative Git snapshot; no nested Git repository is required. This is a focused static projection, not analyzer output or an execution trace.',
    steps: [
      ['Repository', 'Project', 'Directory', 'ProjectFile', 'Resource', 'Import'],
      ['Symbol', 'Declaration', 'TypeProfile', 'CallableProfile', 'ParameterProfile'],
      ['Expression'],
      ['TypeExpression', 'TypeUse', 'Declaration', 'Expression', 'Symbol'],
      ['Expression', 'Import'],
      ['Diagnostic', 'Expression', 'Project']
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
        'diagnostic:dependency-cycle', 'diagnostic:projection',
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
      'One illustrative repository, two descriptor-based projects, three C++ files. viewer DEPENDS_ON engine is a build fact, not an inferred execution path. ProjectFile stores only versioned external content references. The teaching commit hash is illustrative; the checked-in folder has no nested Git repository.',
      'RenderContext, dispatch_render_pass and update_scene(int) retain identity across files. The reopened namespace shares one symbol but has separate file-local declarations. update_scene() is a distinct overload, not an override. Application::render has both a declaration and a qualified definition.',
      'The outer factory’s second argument is call:manager-get, not a flattened manager expression. Explicit receivers live in member-access operands; the call Expression stores its callee and source arguments.',
      'shared_ptr<RenderContext> is a generic application; SceneManager* is a pointer layer over a nominal class type. Supplied public C++17 type contracts support auto and get() result types, independently of SDK overload resolution.',
      'The cross-project call selects update_scene(int) and rejects update_scene() by arity. Its context remains viewer while its implementation is in engine/RenderContext.hpp. Standard-library calls remain unsupported; type contracts do not invent SDK overload selections.',
      'Application -> SceneManager crosses project boundaries; SceneManager <-> RenderContext stays inside engine. Direct source relationships support derived dependencies independently of explicit build DEPENDS_ON. Source if blocks and cycles make no execution claims.'
    ]
  };
  const extraStepRecords = [
    [],
    ['symbol:Application', 'profile:TypeProfile:symbol:Application', 'symbol:application-render', 'symbol:update', 'symbol:update-frame',
      'decl:Application', 'decl:Engine-render', 'decl:application-render-forward', 'decl:application-render',
      'decl:update', 'decl:update-frame-forward', 'decl:update-frame', 'decl:application-manager', 'decl:application-frame', 'decl:update-frame-id',
      'profile:CallableProfile:symbol:update', 'profile:CallableProfile:symbol:update-frame',
      'profile:CallableProfile:symbol:application-render', 'profile:ParameterProfile:symbol:application-manager',
      'profile:ParameterProfile:symbol:application-frame', 'profile:ParameterProfile:symbol:update-frame-id'],
    ['call:main-application', 'callee:main-application', 'expression:application-manager', 'expression:application-manager-base',
      'expression:application-frame-literal', 'call:application-update', 'callee:application-update', 'expression:application-frame'],
    ['type:Application', 'type:scene-reference', 'typeuse:application-manager', 'decl:application-manager', 'decl:application-variable'],
    ['call:application-update', 'callee:application-update', 'call:main-application', 'call:update-frame-dispatch', 'import:render-header', 'import:scene-header'],
    ['call:application-update', 'call:update-frame-dispatch', 'project:viewer']
  ];
  extraStepRecords.forEach((ids, step) => window.CODE_GRAPH_EXAMPLE.stepRecordIds[step]?.push(...ids));
  const extraExcerpts = [
    [],
    [excerpt('The same overload is declared in one file and defined in another.', within('void update_scene(int frame_id);', ranges.scene)),
      excerpt('Its qualified definition retains the SceneManager semantic owner.', ranges.updateFrame)],
    [excerpt('Cross-project call with a reference parameter and an explicit int argument.', ranges.applicationRender)],
    [excerpt('An lvalue reference adds a type layer; it does not transfer ownership.', within('Engine::SceneManager& manager', ranges.applicationRender))],
    [excerpt('The int argument selects update_scene(int), not update_scene().', within('manager.update_scene(frame_id);', ranges.applicationRender))],
    [excerpt('Application depends on an engine member across the project boundary.', ranges.applicationRender)]
  ];
  extraExcerpts.forEach((items, step) => window.CODE_GRAPH_EXAMPLE.excerpts[step].push(...items));
  function localize(value, source) {
    if (Array.isArray(value)) return value.map(child => localize(child, source));
    if (!value || typeof value !== 'object') return value;
    const span = value.span || (value.file_id && 'start_offset' in value ? value : null);
    if (span) source = sources.find(item => span.start_offset >= item.start && span.start_offset < item.end);
    const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, localize(child, source)]));
    if (source && 'start_offset' in value) {
      if (value.end_offset > source.end) throw new Error('Teaching source range crosses a file boundary');
      result.start_offset -= source.start;
      result.end_offset -= source.start;
    }
    if (source && value.file_id) result.file_id = source.id;
    if (source?.project === 'project:viewer') {
      if (value.project_id === projectId) result.project_id = source.project;
      if (value.subject_id === 'inventory:descriptor') result.subject_id = 'inventory:viewer-descriptor';
    }
    return result;
  }
  for (const [category, records] of Object.entries(model)) model[category] = records.map(record => localize(record));
  window.CODE_GRAPH_EXAMPLE.excerpts = localize(window.CODE_GRAPH_EXAMPLE.excerpts);
  const records = new Map(Object.values(model).flat().map(record => [record.id, record]));
  for (const diagnostic of model.Diagnostic) {
    const subject = records.get(diagnostic.subject_id);
    const file = subject?.file_id || subject?.span?.file_id || subject?.id;
    const source = sources.find(item => item.id === file);
    if (diagnostic.project_id && source) diagnostic.project_id = source.project;
  }
})();
