(() => {
  'use strict';

  const P = (key, name, text, typeText, type) => ({ key, name, text, ...(typeText ? { typeText } : {}), ...(type ? { type } : {}) });
  const M = (key, name, owner, sig, kind, params, ret, extra) =>
    ({ key, name, owner, sig, kind, params: params || [], ...(ret ? { ret } : {}), ...extra });
  const L = (key, parent, source, params, extra) =>
    ({ key, name: null, parent, kind: 'lambda', params: params || [], ...(source.endsWith('{') || source.endsWith('=>') ? { sig: source } : { text: source }), ...extra });
  const F = (key, name, owner, text, vis, typeText, type) =>
    ({ key, name, owner, text, vis, ...(typeText ? { typeText } : {}), ...(type ? { type } : {}) });
  const lit = (text, category, value, type) => ({ literal: text, category, value, ...(type ? { type } : {}) });
  const manager = { name: 'manager', symbol: 'symbol:manager-variable' };
  const flowTo = (...ids) => ids;

  // The program is the same in every language; only spelling and typing differ.
  function statements(c) {
    const fieldName = key => c.fields.find(item => item.key === key).name;
    const ref = (key, self) => self ? `${self}.${fieldName(key)}` : fieldName(key);
    const own = (key, self) => self ? { self, field: key } : { field: key };
    const assign = (inKey, key, field, param, paramName) => ({ in: inKey, assign: { key,
      text: `${ref(field, c.aself)} = ${paramName}`, target: own(field, c.aself),
      value: { name: paramName, symbol: `symbol:${param}` } } });
    const prefix = c.self ? `${c.self}.` : '';
    const type = c.voidType ? { type: c.voidType } : {};
    const m = c.m, n = c.n;
    const local = (key, name, text, spelled) => ({ key, name, text, ...(m.explicit ? { typeText: spelled } : {}), type: spelled });
    return [
      ...(c.assigns ? [
        assign('scene-ctor', 'scene-name', 'scene-name', 'ctor-name', c.pn.name),
        assign('set-context', 'set-context', 'active-context', 'set-context-parameter', 'context'),
        assign('render-ctor', 'frame-id', 'frame-id', 'ctor-frame', c.pn.frame),
        assign('render-ctor', 'owner-manager', 'owner-manager', 'ctor-manager', 'manager')
      ] : []),
      { in: 'update', call: { key: 'update-dispatch', text: `${prefix}${n.dispatch}()`, name: n.dispatch,
        ...(c.self ? { receiver: { self: c.self } } : {}), target: 'dispatch', ...type } },
      { in: 'dispatch', call: { key: 'dispatch-execute', text: `${ref('active-context', c.self)}.${n.execute}()`, name: n.execute,
        receiver: own('active-context', c.self), target: 'execute', ...type } },
      { in: 'finalize-lambda', call: { key: 'execute-finalize', text: `${prefix}${n.finalize}()`, name: n.finalize,
        ...(c.self ? { receiver: { self: c.self } } : {}), target: 'finalize', ...type } },
      { in: 'finalize', call: { key: 'finalize-update', text: `${ref('owner-manager', c.self)}.${n.update}()`, name: n.update,
        receiver: own('owner-manager', c.self), target: 'update', ...type } },
      { in: 'main', local: local('manager-variable', 'manager', m.mgrDecl, 'SceneManager'),
        init: { key: 'make-manager', text: m.mgrCtor, construct: true, name: 'SceneManager', class: 'SceneManager', target: 'scene-ctor',
          args: [lit('"MainGameLevel"', 'string', 'MainGameLevel', c.types.str)], type: 'SceneManager' } },
      { in: 'main', local: local('context-variable', 'context', m.ctxDecl, 'RenderContext'),
        init: { key: 'make-context', text: m.ctxCtor, construct: true, name: 'RenderContext', class: 'RenderContext', target: 'render-ctor',
          args: [lit('42', 'integer', 42, c.types.int), { name: 'manager', symbol: 'symbol:manager-variable' }], type: 'RenderContext' } },
      { in: 'main', call: { key: 'main-set-context', text: `manager.${n.set}(context)`, name: n.set, receiver: manager,
        target: 'set-context', args: [{ name: 'context', symbol: 'symbol:context-variable' }], ...type } },
      { in: 'main', call: { key: 'main-update', text: `manager.${n.update}()`, name: n.update, receiver: manager,
        target: 'update', ...type } },
      ...(c.functional || [])
    ];
  }
  const names = { update: 'updateScene', dispatch: 'dispatchRenderPass', execute: 'executePipeline', finalize: 'finalizeFrame', set: 'setRenderContext' };
  const camelFields = (vis, texts, types) => [
    F('scene-name', 'sceneName', 'SceneManager', texts[0], vis, types[0]),
    F('active-context', 'activeContext', 'SceneManager', texts[1], vis, types[1]),
    F('frame-id', 'frameId', 'RenderContext', texts[2], vis, types[2]),
    F('owner-manager', 'ownerManager', 'RenderContext', texts[3], vis, types[3])
  ];
  const guards = (dispatchGuard, finalizeGuard) => [
    { key: 'dispatch', in: 'dispatch', call: 'dispatch-execute', ...dispatchGuard },
    { key: 'finalize', in: 'finalize', call: 'finalize-update', ...finalizeGuard }
  ];

  // Candidate evidence shared by the ports: which source records carry each callable value to the call.
  const stageLoop = (start, variable) => ({ in: 'run-pipeline', loop: { key: 'stage-loop', start,
    variable: { key: 'stage-variable', name: 'stage', ...variable }, iterable: { name: variable.iterable, symbol: 'symbol:run-stages' } } });
  const indirectCall = (key, inKey, text, name, callee, args, candidates, extra) => ({ in: inKey, ...extra?.statement,
    call: { key, text, name, callee: { symbol: `symbol:${callee}` }, args, ...extra?.call,
      indirect: { reasons: ['callable_parameter_of_exported_function'], candidates } } });
  const tracedCandidate = supporting => ({ target: 'cull', evidence: supporting,
    note: 'The cited site supplies cull_objects as the step parameter of traced, so the wrapper may call it. Other callers outside the assessed source may pass other steps.' });
  const stageCandidates = (wrapperFlow, lambdaFlow) => [
    { target: 'wrapper', evidence: wrapperFlow,
      note: 'traced returns its wrapper, and that result is an element of the stages argument. The loop variable may therefore hold the wrapper.' },
    { target: 'stage-lambda', evidence: lambdaFlow,
      note: 'make_stage returns this lambda, and that result is an element of the stages argument. The loop variable may therefore hold the lambda.' }
  ];
  const completeCandidate = supporting => [{ target: 'finalize-lambda', evidence: supporting,
    note: 'The lambda is the third argument of the only run_pipeline call in the assessed source. Callers outside it may pass other callbacks.' }];
  const stageFlow = (item, ...extra) => [...extra, item, 'expression:execute-run-pipeline-arg0', 'call:execute-run-pipeline', 'decl:stage-variable'];
  const lambdaFlow = (...extra) => ['expression:lambda-stage-lambda', 'call:execute-make-stage', ...extra,
    'expression:execute-run-pipeline-arg0', 'call:execute-run-pipeline', 'decl:stage-variable'];
  const callbackFlow = ['expression:lambda-finalize-lambda', 'call:execute-run-pipeline'];
  const pipelineBindings = (cull, make, run, traced) => ({ [cull]: 'cull', [make]: 'make-stage', [run]: 'run-pipeline', ...(traced ? { [traced]: 'traced' } : {}) });

  // TypeScript
  const tsSource = String.raw`import { cullObjects, makeStage, runPipeline, traced } from "./pipeline";

export class SceneManager {
  private sceneName: string;
  private activeContext: RenderContext | null = null;

  constructor(name: string) {
    this.sceneName = name;
  }

  setRenderContext(context: RenderContext): void {
    this.activeContext = context;
  }

  updateScene(): void {
    console.log("[SceneManager] Updating scene: " + this.sceneName);
    this.dispatchRenderPass();
  }

  dispatchRenderPass(): void {
    console.log("[SceneManager] Dispatching render pass to context...");
    if (this.activeContext) {
      this.activeContext.executePipeline();
    }
  }
}

export class RenderContext {
  private frameId: number;
  private ownerManager: SceneManager;

  constructor(frameId: number, manager: SceneManager) {
    this.frameId = frameId;
    this.ownerManager = manager;
  }

  executePipeline(): void {
    console.log("[RenderContext] Executing rendering pipeline for frame #" + this.frameId);
    runPipeline([traced(cullObjects), makeStage("Shading")], this.frameId, () => this.finalizeFrame());
  }

  finalizeFrame(): void {
    console.log("[RenderContext] Frame finalized. Requesting next state from manager...");
    if (this.ownerManager) {
      this.ownerManager.updateScene();
    }
  }
}

function main(): void {
  const manager = new SceneManager("MainGameLevel");
  const context = new RenderContext(42, manager);
  manager.setRenderContext(context);
  manager.updateScene();
}

main();
`;
  const tsPipeline = String.raw`export type Stage = (frameId: number) => void;

export function traced(step: Stage): Stage {
  function wrapper(frameId: number): void {
    console.log("[Pipeline] Entering stage for frame #" + frameId);
    step(frameId);
  }
  return wrapper;
}

export function cullObjects(frameId: number): void {
  console.log("[Pipeline] Culling objects for frame #" + frameId);
}

export function makeStage(label: string): Stage {
  return (frameId: number): void => {
    console.log("[Pipeline] " + label + " for frame #" + frameId);
  };
}

export function runPipeline(stages: Stage[], frameId: number, onComplete: () => void): void {
  for (const stage of stages) {
    stage(frameId);
  }
  onComplete();
}
`;
  const ts = {
    id: 'typescript', label: 'TypeScript', filename: 'example.ts', language: 'typescript', version: '5', contextId: 'context:ts5',
    code: tsSource, files: [{ key: 'pipeline', filename: 'pipeline.ts', code: tsPipeline }], fileModules: true,
    end: 'brace', dispatch: 'virtual', log: /console\.log/,
    builtins: { void: 'void', number: 'number', string: 'string', null: 'null' },
    classes: [{ key: 'SceneManager', sig: 'export class SceneManager {', vis: 'public' },
      { key: 'RenderContext', sig: 'export class RenderContext {', vis: 'public' }],
    aliases: [{ key: 'Stage', name: 'Stage', owner: 'module-pipeline', file: 'pipeline', text: 'export type Stage = (frameId: number) => void;',
      target: '(frameId: number) => void', vis: 'public' }],
    fields: camelFields('private', ['private sceneName: string;', 'private activeContext: RenderContext | null = null;',
      'private frameId: number;', 'private ownerManager: SceneManager;'],
    ['string', 'RenderContext | null', 'number', 'SceneManager'])
      .map(item => item.key === 'active-context' ? { ...item, init: { literal: 'null', category: 'null', value: null } } : item),
    methods: [
      M('scene-ctor', 'constructor', 'SceneManager', 'constructor(name: string) {', 'constructor', [P('ctor-name', 'name', 'name: string', 'string')], null, { vis: 'public' }),
      M('set-context', 'setRenderContext', 'SceneManager', 'setRenderContext(context: RenderContext): void {', 'method',
        [P('set-context-parameter', 'context', 'context: RenderContext', 'RenderContext')], { text: 'void' }, { vis: 'public' }),
      M('update', 'updateScene', 'SceneManager', 'updateScene(): void {', 'method', [], { text: 'void' }, { vis: 'public' }),
      M('dispatch', 'dispatchRenderPass', 'SceneManager', 'dispatchRenderPass(): void {', 'method', [], { text: 'void' }, { vis: 'public' }),
      M('render-ctor', 'constructor', 'RenderContext', 'constructor(frameId: number, manager: SceneManager) {', 'constructor',
        [P('ctor-frame', 'frameId', 'frameId: number', 'number'), P('ctor-manager', 'manager', 'manager: SceneManager', 'SceneManager')], null, { vis: 'public' }),
      M('execute', 'executePipeline', 'RenderContext', 'executePipeline(): void {', 'method', [], { text: 'void' }, { vis: 'public' }),
      L('finalize-lambda', 'execute', '() => this.finalizeFrame()'),
      M('finalize', 'finalizeFrame', 'RenderContext', 'finalizeFrame(): void {', 'method', [], { text: 'void' }, { vis: 'public' }),
      M('main', 'main', 'module-example', 'function main(): void {', 'function', [], { text: 'void' }),
      M('traced', 'traced', 'module-pipeline', 'export function traced(step: Stage): Stage {', 'function',
        [P('traced-step', 'step', 'step: Stage', 'Stage')], { text: 'Stage', after: '):' }, { file: 'pipeline', vis: 'public' }),
      M('wrapper', 'wrapper', null, 'function wrapper(frameId: number): void {', 'local_function',
        [P('wrapper-frame', 'frameId', 'frameId: number', 'number')], { text: 'void' }, { parent: 'traced', captures: [{ symbol: 'traced-step', mode: 'reference' }] }),
      M('cull', 'cullObjects', 'module-pipeline', 'export function cullObjects(frameId: number): void {', 'function',
        [P('cull-frame', 'frameId', 'frameId: number', 'number')], { text: 'void' }, { file: 'pipeline', vis: 'public' }),
      M('make-stage', 'makeStage', 'module-pipeline', 'export function makeStage(label: string): Stage {', 'function',
        [P('make-stage-label', 'label', 'label: string', 'string')], { text: 'Stage', after: '):' }, { file: 'pipeline', vis: 'public' }),
      L('stage-lambda', 'make-stage', '(frameId: number): void => {', [P('stage-lambda-frame', 'frameId', 'frameId: number', 'number')],
        { ret: { text: 'void' }, captures: [{ symbol: 'make-stage-label', mode: 'reference' }] }),
      M('run-pipeline', 'runPipeline', 'module-pipeline', 'export function runPipeline(stages: Stage[], frameId: number, onComplete: () => void): void {', 'function',
        [P('run-stages', 'stages', 'stages: Stage[]', 'Stage[]'), P('run-frame', 'frameId', 'frameId: number', 'number'),
          P('run-on-complete', 'onComplete', 'onComplete: () => void', '() => void')], { text: 'void', after: '): ' }, { file: 'pipeline', vis: 'public' })
    ],
    guards: guards(
      { start: 'if (this.activeContext) {', cond: { text: 'this.activeContext', place: { self: 'this', field: 'active-context' } } },
      { start: 'if (this.ownerManager) {', cond: { text: 'this.ownerManager', place: { self: 'this', field: 'owner-manager' } } }),
    imports: [{ key: 'pipeline', text: 'import { cullObjects, makeStage, runPipeline, traced } from "./pipeline";', kind: 'symbol',
      path: ['pipeline'], relative: 1, pathText: './pipeline', bindings: ['cullObjects', 'makeStage', 'runPipeline', 'traced'],
      target: 'module-pipeline', relations: ['module-pipeline'], bindingTargets: pipelineBindings('cullObjects', 'makeStage', 'runPipeline', 'traced') }],
    settingsText: 'TypeScript 5 with two ES module files',
    referenceRule: 'Unique visible project binding in the displayed module and class scopes under the stated source assumptions.',
    callBoundary: 'The receiver type is declared and the member is unique in the displayed source, or the callee is a uniquely imported module function; no subclass overrides it within the assessed source.',
    partialBoundary: 'A member of this name exists, but the receiver type is not established; no target is selected.',
    assumptions: [
      'Strict null checks; no declaration merging or monkey patching changes the displayed classes or modules.',
      'The assessed source contains no subclass of SceneManager or RenderContext, so member lookup is complete within it.',
      'The pipeline functions are exported, so callers outside the assessed source may pass other callables to their parameters.',
      'Logging calls to the host console object are omitted rather than analysed.'
    ],
    tourNotes: [
      'example.ts imports four functions from pipeline.ts; the Import keeps one reference per imported name and an imports_from relation to the pipeline module symbol.',
      'Each file is a module symbol with an implicit declaration. The local function wrapper and the arrow functions are callable symbols owned by their enclosing function or method, with captures relations for step and label.',
      'Calls on this are written with an explicit this receiver. stage(frameId) and onComplete() call parameters, so they are indirect calls; the callee reference resolves to the parameter, not to a function.',
      'Stage is a type alias over a function type. activeContext is RenderContext | null: a union layer is preserved, and the if narrows it to RenderContext at the receiver binding.',
      'Declared types select the class members. The indirect calls in the pipeline keep the wrapper, the stage lambda, and the callback lambda as possible targets, each supported by the argument and return records that carry it.',
      'SceneManager and RenderContext depend on each other, RenderContext depends on the pipeline module, and the pipeline reaches back through the callback lambda as a possible dependency.'
    ],
    noteIdentity: 'TypeScript has no separate declaration and definition for these members, so each symbol has one declaration. Arrow functions are anonymous callable symbols.',
    noteTypes: 'RenderContext | null is a union type over the nominal RenderContext type and the null builtin. Stage is an alias symbol whose target is a function type; uses of Stage stay nominal references to the alias.',
    noteResolution: 'Receiver types come from declared field types, so every class member call is resolved. Calls through stage, step, and onComplete stay partial with evidence-backed candidates.'
  };
  ts.statements = statements({ ...ts, self: 'this', aself: 'this', assigns: true, n: names, pn: { name: 'name', frame: 'frameId' }, voidType: 'void',
    types: { str: 'string', int: 'number' },
    m: { mgrDecl: 'const manager = new SceneManager("MainGameLevel");', mgrCtor: 'new SceneManager("MainGameLevel")',
      ctxDecl: 'const context = new RenderContext(42, manager);', ctxCtor: 'new RenderContext(42, manager)' },
    functional: [
      { in: 'execute', call: { key: 'execute-run-pipeline', text: 'runPipeline([traced(cullObjects), makeStage("Shading")], this.frameId, () => this.finalizeFrame())',
        name: 'runPipeline', target: 'run-pipeline', type: 'void', args: [
          { collection: { text: '[traced(cullObjects), makeStage("Shading")]', type: 'Stage[]', items: [
            { call: { key: 'execute-traced', text: 'traced(cullObjects)', name: 'traced', target: 'traced', type: 'Stage',
              args: [{ name: 'cullObjects', symbol: 'symbol:cull' }] } },
            { call: { key: 'execute-make-stage', text: 'makeStage("Shading")', name: 'makeStage', target: 'make-stage', type: 'Stage',
              args: [lit('"Shading"', 'string', 'Shading', 'string')] } }] } },
          { place: { self: 'this', field: 'frame-id' } }, { lambda: 'finalize-lambda' }] } },
      { in: null, after: 'main', call: { key: 'module-main', text: 'main()', name: 'main', target: 'main', type: 'void' } },
      { in: 'traced', ret: { key: 'return-wrapper', text: 'return wrapper', name: 'wrapper', symbol: 'symbol:wrapper' } },
      indirectCall('wrapper-step', 'wrapper', 'step(frameId)', 'step', 'traced-step', [{ name: 'frameId', symbol: 'symbol:wrapper-frame' }],
        [tracedCandidate(['expression:execute-traced-arg0', 'call:execute-traced'])]),
      stageLoop('for (const stage of stages) {', { text: 'stage', type: 'Stage', iterable: 'stages' }),
      indirectCall('run-stage', 'run-pipeline', 'stage(frameId)', 'stage', 'stage-variable', [{ name: 'frameId', symbol: 'symbol:run-frame' }],
        stageCandidates(stageFlow('call:execute-traced', 'expression:return-wrapper'), lambdaFlow()), { statement: { block: 'stage-loop' } }),
      indirectCall('run-complete', 'run-pipeline', 'onComplete()', 'onComplete', 'run-on-complete', [], completeCandidate(callbackFlow))
    ] });

  // JavaScript
  const jsSource = String.raw`import { cullObjects, makeStage, runPipeline, traced } from "./pipeline.js";

class SceneManager {
  constructor(name) {
    this.sceneName = name;
    this.activeContext = null;
  }

  setRenderContext(context) {
    this.activeContext = context;
  }

  updateScene() {
    console.log("[SceneManager] Updating scene: " + this.sceneName);
    this.dispatchRenderPass();
  }

  dispatchRenderPass() {
    console.log("[SceneManager] Dispatching render pass to context...");
    if (this.activeContext) {
      this.activeContext.executePipeline();
    }
  }
}

class RenderContext {
  constructor(frameId, manager) {
    this.frameId = frameId;
    this.ownerManager = manager;
  }

  executePipeline() {
    console.log("[RenderContext] Executing rendering pipeline for frame #" + this.frameId);
    runPipeline([traced(cullObjects), makeStage("Shading")], this.frameId, () => this.finalizeFrame());
  }

  finalizeFrame() {
    console.log("[RenderContext] Frame finalized. Requesting next state from manager...");
    if (this.ownerManager) {
      this.ownerManager.updateScene();
    }
  }
}

function main() {
  const manager = new SceneManager("MainGameLevel");
  const context = new RenderContext(42, manager);
  manager.setRenderContext(context);
  manager.updateScene();
}

main();
`;
  const jsPipeline = String.raw`export function traced(step) {
  function wrapper(frameId) {
    console.log("[Pipeline] Entering stage for frame #" + frameId);
    step(frameId);
  }
  return wrapper;
}

export function cullObjects(frameId) {
  console.log("[Pipeline] Culling objects for frame #" + frameId);
}

export function makeStage(label) {
  return (frameId) => {
    console.log("[Pipeline] " + label + " for frame #" + frameId);
  };
}

export function runPipeline(stages, frameId, onComplete) {
  for (const stage of stages) {
    stage(frameId);
  }
  onComplete();
}
`;
  const js = {
    id: 'javascript', label: 'JavaScript', filename: 'example.js', language: 'javascript', version: 'es2022', contextId: 'context:es2022',
    code: jsSource, files: [{ key: 'pipeline', filename: 'pipeline.js', code: jsPipeline }], fileModules: true,
    end: 'brace', dispatch: 'dynamic', log: /console\.log/,
    builtins: { string: 'string', number: 'number' },
    classes: [{ key: 'SceneManager', sig: 'class SceneManager {' }, { key: 'RenderContext', sig: 'class RenderContext {' }],
    fields: camelFields(undefined, ['this.sceneName = name', 'this.activeContext = null', 'this.frameId = frameId', 'this.ownerManager = manager'], [])
      .map(item => ({ ...item, scope: item.owner === 'SceneManager' ? 'scene-ctor' : 'render-ctor',
        init: item.key === 'active-context' ? { literal: 'null', category: 'null', value: null } : { assign: item.key } })),
    methods: [
      M('scene-ctor', 'constructor', 'SceneManager', 'constructor(name) {', 'constructor', [P('ctor-name', 'name', 'name')]),
      M('set-context', 'setRenderContext', 'SceneManager', 'setRenderContext(context) {', 'method', [P('set-context-parameter', 'context', 'context')]),
      M('update', 'updateScene', 'SceneManager', 'updateScene() {', 'method'),
      M('dispatch', 'dispatchRenderPass', 'SceneManager', 'dispatchRenderPass() {', 'method'),
      M('render-ctor', 'constructor', 'RenderContext', 'constructor(frameId, manager) {', 'constructor',
        [P('ctor-frame', 'frameId', 'frameId'), P('ctor-manager', 'manager', 'manager')]),
      M('execute', 'executePipeline', 'RenderContext', 'executePipeline() {', 'method'),
      L('finalize-lambda', 'execute', '() => this.finalizeFrame()'),
      M('finalize', 'finalizeFrame', 'RenderContext', 'finalizeFrame() {', 'method'),
      M('main', 'main', 'module-example', 'function main() {', 'function'),
      M('traced', 'traced', 'module-pipeline', 'export function traced(step) {', 'function', [P('traced-step', 'step', 'step')], null, { file: 'pipeline' }),
      M('wrapper', 'wrapper', null, 'function wrapper(frameId) {', 'local_function', [P('wrapper-frame', 'frameId', 'frameId')], null,
        { parent: 'traced', captures: [{ symbol: 'traced-step', mode: 'reference' }] }),
      M('cull', 'cullObjects', 'module-pipeline', 'export function cullObjects(frameId) {', 'function', [P('cull-frame', 'frameId', 'frameId')], null, { file: 'pipeline' }),
      M('make-stage', 'makeStage', 'module-pipeline', 'export function makeStage(label) {', 'function', [P('make-stage-label', 'label', 'label')], null, { file: 'pipeline' }),
      L('stage-lambda', 'make-stage', '(frameId) => {', [P('stage-lambda-frame', 'frameId', 'frameId')],
        { captures: [{ symbol: 'make-stage-label', mode: 'reference' }] }),
      M('run-pipeline', 'runPipeline', 'module-pipeline', 'export function runPipeline(stages, frameId, onComplete) {', 'function',
        [P('run-stages', 'stages', 'stages'), P('run-frame', 'frameId', 'frameId'), P('run-on-complete', 'onComplete', 'onComplete')], null, { file: 'pipeline' })
    ],
    guards: guards(
      { start: 'if (this.activeContext) {', cond: { text: 'this.activeContext', place: { self: 'this', field: 'active-context' } } },
      { start: 'if (this.ownerManager) {', cond: { text: 'this.ownerManager', place: { self: 'this', field: 'owner-manager' } } }),
    imports: [{ key: 'pipeline', text: 'import { cullObjects, makeStage, runPipeline, traced } from "./pipeline.js";', kind: 'symbol',
      path: ['pipeline.js'], relative: 1, pathText: './pipeline.js', bindings: ['cullObjects', 'makeStage', 'runPipeline', 'traced'],
      target: 'module-pipeline', relations: ['module-pipeline'], bindingTargets: pipelineBindings('cullObjects', 'makeStage', 'runPipeline', 'traced') }],
    // Untyped fields keep possible candidates; the evidence is the values written to them, not the member name.
    receiverFlows: {
      'active-context': flowTo('expression:assign-set-context', 'call:main-set-context', 'binding:expression:main-set-context-arg0'),
      'owner-manager': flowTo('expression:assign-owner-manager', 'call:make-context', 'binding:expression:make-context-arg1')
    },
    settingsText: 'ECMAScript 2022 with two ES module files',
    typeCoverage: ['no_declared_types_in_source'],
    referenceRule: 'Unique visible project binding in the displayed module and class scopes under the stated source assumptions.',
    callBoundary: 'The receiver is an object created from a project class in this module, or the callee is a uniquely imported module function, and no prototype assignment changes the member within the assessed source.',
    partialBoundary: 'The only values written to this field in the assessed source are the cited constructor or setter arguments, which have a project class type at their call sites. The field itself has no declared or inferred type, so the candidate’s applicability is not established and no target is selected.',
    assumptions: [
      'No prototype assignment, Object.defineProperty, or eval changes the displayed classes or modules.',
      'A local initialised by new on a project class has that class as its inferred type.',
      'Fields and parameters carry no declared type, so their types are not inferred beyond the displayed constructions.',
      'The pipeline functions are exported, so callers outside the assessed source may pass other callables to their parameters.',
      'Logging calls to the host console object are omitted rather than analysed.'
    ],
    tourNotes: [
      'example.js imports four functions from pipeline.js; the Import keeps one reference per imported name and an imports_from relation to the pipeline module symbol.',
      'Fields are created by assignment in the constructor, so their declarations sit in the constructor scope while their owner is the class. wrapper and the arrow functions are callable symbols owned by their enclosing function or method.',
      'Calls on this are written with an explicit this receiver. stage(frameId) and onComplete() call parameters, so they are indirect calls; the callee reference resolves to the parameter, not to a function.',
      'The source spells no types. Only the locals initialised with new receive an inferred binding; fields, parameters, and callable values have no TypeUse or TypeBinding.',
      'Calls on the manager and context locals are selected through their inferred types. Calls through the untyped fields stay partial: the evidence is the constructor and setter arguments written to the field, not the member name. Indirect calls keep evidence-backed candidates.',
      'Both class directions are connected as possible dependencies. RenderContext depends on the pipeline module, and the pipeline reaches back through the callback lambda as a possible dependency.'
    ],
    noteIdentity: 'Each field symbol has one declaration at its first assignment, in the constructor scope. Arrow functions are anonymous callable symbols.',
    noteTypes: 'There are no declared types. Types exist only as inferred bindings for locals initialised with new and for literals.',
    noteResolution: 'Locals created by new have known classes, so their calls are selected. Calls through the untyped fields are partial, supported by the values written to the fields. Calls through callable parameters are partial with evidence-backed candidates.'
  };
  js.statements = statements({ ...js, self: 'this', aself: 'this', assigns: true, n: names, pn: { name: 'name', frame: 'frameId' }, voidType: null,
    types: { str: 'string', int: 'number' },
    m: { mgrDecl: 'const manager = new SceneManager("MainGameLevel");', mgrCtor: 'new SceneManager("MainGameLevel")',
      ctxDecl: 'const context = new RenderContext(42, manager);', ctxCtor: 'new RenderContext(42, manager)' },
    functional: [
      { in: 'execute', call: { key: 'execute-run-pipeline', text: 'runPipeline([traced(cullObjects), makeStage("Shading")], this.frameId, () => this.finalizeFrame())',
        name: 'runPipeline', target: 'run-pipeline', args: [
          { collection: { text: '[traced(cullObjects), makeStage("Shading")]', items: [
            { call: { key: 'execute-traced', text: 'traced(cullObjects)', name: 'traced', target: 'traced', args: [{ name: 'cullObjects', symbol: 'symbol:cull' }] } },
            { call: { key: 'execute-make-stage', text: 'makeStage("Shading")', name: 'makeStage', target: 'make-stage',
              args: [lit('"Shading"', 'string', 'Shading', 'string')] } }] } },
          { place: { self: 'this', field: 'frame-id' } }, { lambda: 'finalize-lambda' }] } },
      { in: null, after: 'main', call: { key: 'module-main', text: 'main()', name: 'main', target: 'main' } },
      { in: 'traced', ret: { key: 'return-wrapper', text: 'return wrapper', name: 'wrapper', symbol: 'symbol:wrapper' } },
      indirectCall('wrapper-step', 'wrapper', 'step(frameId)', 'step', 'traced-step', [{ name: 'frameId', symbol: 'symbol:wrapper-frame' }],
        [tracedCandidate(['expression:execute-traced-arg0', 'call:execute-traced'])]),
      stageLoop('for (const stage of stages) {', { text: 'stage', iterable: 'stages' }),
      indirectCall('run-stage', 'run-pipeline', 'stage(frameId)', 'stage', 'stage-variable', [{ name: 'frameId', symbol: 'symbol:run-frame' }],
        stageCandidates(stageFlow('call:execute-traced', 'expression:return-wrapper'), lambdaFlow()), { statement: { block: 'stage-loop' } }),
      indirectCall('run-complete', 'run-pipeline', 'onComplete()', 'onComplete', 'run-on-complete', [], completeCandidate(callbackFlow))
    ] });

  // Java
  const javaSource = String.raw`import java.util.List;

final class SceneManager {
    private final String sceneName;
    private RenderContext activeContext;

    SceneManager(String name) {
        this.sceneName = name;
    }

    void setRenderContext(RenderContext context) {
        this.activeContext = context;
    }

    void updateScene() {
        System.out.println("[SceneManager] Updating scene: " + sceneName);
        dispatchRenderPass();
    }

    void dispatchRenderPass() {
        System.out.println("[SceneManager] Dispatching render pass to context...");
        if (activeContext != null) {
            activeContext.executePipeline();
        }
    }
}

final class RenderContext {
    private final int frameId;
    private final SceneManager ownerManager;

    RenderContext(int frameId, SceneManager manager) {
        this.frameId = frameId;
        this.ownerManager = manager;
    }

    void executePipeline() {
        System.out.println("[RenderContext] Executing rendering pipeline for frame #" + frameId);
        Pipeline.runPipeline(
            List.of(Pipeline.traced(Pipeline::cullObjects), Pipeline.makeStage("Shading")),
            frameId,
            () -> finalizeFrame());
    }

    void finalizeFrame() {
        System.out.println("[RenderContext] Frame finalized. Requesting next state from manager...");
        if (ownerManager != null) {
            ownerManager.updateScene();
        }
    }
}

public final class Main {
    public static void main(String[] args) {
        SceneManager manager = new SceneManager("MainGameLevel");
        RenderContext context = new RenderContext(42, manager);
        manager.setRenderContext(context);
        manager.updateScene();
    }
}
`;
  const javaPipeline = String.raw`import java.util.List;
import java.util.function.IntConsumer;

final class Pipeline {
    static IntConsumer traced(IntConsumer step) {
        return frameId -> {
            System.out.println("[Pipeline] Entering stage for frame #" + frameId);
            step.accept(frameId);
        };
    }

    static void cullObjects(int frameId) {
        System.out.println("[Pipeline] Culling objects for frame #" + frameId);
    }

    static IntConsumer makeStage(String label) {
        return frameId -> System.out.println("[Pipeline] " + label + " for frame #" + frameId);
    }

    static void runPipeline(List<IntConsumer> stages, int frameId, Runnable onComplete) {
        for (IntConsumer stage : stages) {
            stage.accept(frameId);
        }
        onComplete.run();
    }
}
`;
  const javaStatic = { mods: ['static'], vis: 'package', receiver: 'none', file: 'pipeline' };
  const java = {
    id: 'java', label: 'Java', filename: 'Main.java', language: 'java', version: '17', contextId: 'context:java17',
    code: javaSource, files: [{ key: 'pipeline', filename: 'Pipeline.java', code: javaPipeline, entry: true }], packageScope: true,
    end: 'brace', dispatch: 'direct', log: /System\.out/,
    builtins: { void: 'void', int: 'int' },
    externals: [{ name: 'String' }, { name: 'List', params: 1, kind: 'interface' },
      { name: 'IntConsumer', kind: 'interface', members: [{ name: 'accept', params: [['value', 'int']] }] },
      { name: 'Runnable', kind: 'interface', members: [{ name: 'run' }] }],
    classes: [
      { key: 'SceneManager', sig: 'final class SceneManager {', mods: ['final'], vis: 'package' },
      { key: 'RenderContext', sig: 'final class RenderContext {', mods: ['final'], vis: 'package' },
      { key: 'Main', sig: 'public final class Main {', mods: ['final'], vis: 'public' },
      { key: 'Pipeline', sig: 'final class Pipeline {', mods: ['final'], vis: 'package', file: 'pipeline' }],
    fields: camelFields('private', ['private final String sceneName;', 'private RenderContext activeContext;',
      'private final int frameId;', 'private final SceneManager ownerManager;'],
    ['String', 'RenderContext', 'int', 'SceneManager']).map(item => ({ ...item, mods: item.key === 'active-context' ? [] : ['final'] })),
    methods: [
      M('scene-ctor', 'SceneManager', 'SceneManager', 'SceneManager(String name) {', 'constructor', [P('ctor-name', 'name', 'String name', 'String')], null, { vis: 'package' }),
      M('set-context', 'setRenderContext', 'SceneManager', 'void setRenderContext(RenderContext context) {', 'method',
        [P('set-context-parameter', 'context', 'RenderContext context', 'RenderContext')], { text: 'void' }, { vis: 'package' }),
      M('update', 'updateScene', 'SceneManager', 'void updateScene() {', 'method', [], { text: 'void' }, { vis: 'package' }),
      M('dispatch', 'dispatchRenderPass', 'SceneManager', 'void dispatchRenderPass() {', 'method', [], { text: 'void' }, { vis: 'package' }),
      M('render-ctor', 'RenderContext', 'RenderContext', 'RenderContext(int frameId, SceneManager manager) {', 'constructor',
        [P('ctor-frame', 'frameId', 'int frameId', 'int'), P('ctor-manager', 'manager', 'SceneManager manager', 'SceneManager')], null, { vis: 'package' }),
      M('execute', 'executePipeline', 'RenderContext', 'void executePipeline() {', 'method', [], { text: 'void' }, { vis: 'package' }),
      L('finalize-lambda', 'execute', '() -> finalizeFrame()', [], { type: 'Runnable' }),
      M('finalize', 'finalizeFrame', 'RenderContext', 'void finalizeFrame() {', 'method', [], { text: 'void' }, { vis: 'package' }),
      M('main', 'main', 'Main', 'public static void main(String[] args) {', 'method', [P('main-args', 'args', 'String[] args', 'String[]')],
        { text: 'void' }, { mods: ['static'], vis: 'public', receiver: 'none' }),
      M('traced', 'traced', 'Pipeline', 'static IntConsumer traced(IntConsumer step) {', 'method',
        [P('traced-step', 'step', 'IntConsumer step', 'IntConsumer')], { text: 'IntConsumer' }, javaStatic),
      L('wrapper', 'traced', 'frameId -> {', [P('wrapper-frame', 'frameId', 'frameId', null, 'int')],
        { type: 'IntConsumer', captures: [{ symbol: 'traced-step', mode: 'value' }] }),
      M('cull', 'cullObjects', 'Pipeline', 'static void cullObjects(int frameId) {', 'method', [P('cull-frame', 'frameId', 'int frameId', 'int')], { text: 'void' }, javaStatic),
      M('make-stage', 'makeStage', 'Pipeline', 'static IntConsumer makeStage(String label) {', 'method',
        [P('make-stage-label', 'label', 'String label', 'String')], { text: 'IntConsumer' }, javaStatic),
      L('stage-lambda', 'make-stage', 'frameId -> System.out.println("[Pipeline] " + label + " for frame #" + frameId)',
        [P('stage-lambda-frame', 'frameId', 'frameId', null, 'int')], { type: 'IntConsumer', captures: [{ symbol: 'make-stage-label', mode: 'value' }] }),
      M('run-pipeline', 'runPipeline', 'Pipeline', 'static void runPipeline(List<IntConsumer> stages, int frameId, Runnable onComplete) {', 'method',
        [P('run-stages', 'stages', 'List<IntConsumer> stages', 'List<IntConsumer>'), P('run-frame', 'frameId', 'int frameId', 'int'),
          P('run-on-complete', 'onComplete', 'Runnable onComplete', 'Runnable')], { text: 'void' }, javaStatic)
    ],
    guards: guards(
      { start: 'if (activeContext != null) {', cond: { text: 'activeContext != null', place: { field: 'active-context' }, op: '!=', literal: { text: 'null', category: 'null', value: null } } },
      { start: 'if (ownerManager != null) {', cond: { text: 'ownerManager != null', place: { field: 'owner-manager' }, op: '!=', literal: { text: 'null', category: 'null', value: null } } }),
    imports: [
      { key: 'List', text: 'import java.util.List;', kind: 'symbol', path: ['java', 'util', 'List'], pathText: 'java.util.List' },
      { key: 'pipeline-List', file: 'pipeline', text: 'import java.util.List;', kind: 'symbol', path: ['java', 'util', 'List'], pathText: 'java.util.List' },
      { key: 'pipeline-IntConsumer', file: 'pipeline', text: 'import java.util.function.IntConsumer;', kind: 'symbol',
        path: ['java', 'util', 'function', 'IntConsumer'], pathText: 'java.util.function.IntConsumer' }
    ],
    settingsText: 'Java 17 with two compilation units in the default package',
    referenceRule: 'Unique visible project binding in the displayed class and package scopes under the stated source assumptions.',
    callBoundary: 'The receiver type is declared and the member is unique in a final class, or the callee is a static method of a final class, so no override can exist within the assessed source.',
    partialBoundary: 'A member of this name exists, but the receiver type is not established; no target is selected.',
    externalBoundary: 'The receiver is declared as a functional interface, so its single abstract method is the declaration-level target under the java.util.function and java.lang contracts.',
    assumptions: [
      'Main.java and Pipeline.java are the only compilation units in the default package; no other source adds members.',
      'SceneManager, RenderContext, and Pipeline are final, so their members cannot be overridden.',
      'IntConsumer.accept and Runnable.run are the single abstract methods of their java.util.function and java.lang interfaces.',
      'Pipeline methods are package-visible, so other classes in the package may pass other implementations.',
      'String is the java.lang class; List.of and logging calls on System.out are not analysed.'
    ],
    tourNotes: [
      'Main.java and Pipeline.java are two compilation units in one default package, so Pipeline needs no project import. The java.util imports are library imports without project targets.',
      'Java has no top-level functions: the functional pipeline is a final class of static methods. Lambdas are anonymous callable symbols owned by the method that contains them, with captures relations for step and label.',
      'Static calls such as Pipeline.runPipeline keep the class name as the base of a member access, without a receiver binding. Pipeline::cullObjects is a method reference expression that refers to cullObjects without calling it.',
      'IntConsumer and Runnable are external functional interfaces; the lambdas and the method reference are converted to them. String[] is an array layer over a nominal external String type.',
      'Calls through functional interfaces are interface method calls: stage.accept selects IntConsumer.accept. The source lambdas and the referenced method are possible implementations in ImplementationSet, each with conversion-site evidence.',
      'SceneManager and RenderContext depend on each other, RenderContext depends on Pipeline, and Pipeline reaches back through the callback lambda as a possible implementation.'
    ],
    noteIdentity: 'Main owns the static main method and Pipeline owns the static pipeline methods. Lambdas are anonymous callable symbols owned by their enclosing method.',
    noteTypes: 'IntConsumer, Runnable, and List are external interfaces. The local variables spell SceneManager and RenderContext, so their bindings come from TypeUse.',
    noteResolution: 'Class member calls are resolved, direct targets. Functional-interface calls select the interface method, and ImplementationSet records the source lambdas as possible implementations with partial completeness.'
  };
  java.statements = statements({ ...java, self: null, aself: 'this', assigns: true, n: names, pn: { name: 'name', frame: 'frameId' }, voidType: 'void',
    types: { str: 'String', int: 'int' },
    m: { explicit: true, mgrDecl: 'SceneManager manager = new SceneManager("MainGameLevel");', mgrCtor: 'new SceneManager("MainGameLevel")',
      ctxDecl: 'RenderContext context = new RenderContext(42, manager);', ctxCtor: 'new RenderContext(42, manager)' },
    functional: [
      { in: 'execute', call: { key: 'execute-run-pipeline', open: 'Pipeline.runPipeline(', receiver: { type: 'Pipeline' }, name: 'runPipeline',
        target: 'run-pipeline', type: 'void', args: [
          { call: { key: 'list-of', text: 'List.of(Pipeline.traced(Pipeline::cullObjects), Pipeline.makeStage("Shading"))', name: 'of',
            type: 'List<IntConsumer>', args: [
              { call: { key: 'execute-traced', text: 'Pipeline.traced(Pipeline::cullObjects)', receiver: { type: 'Pipeline' }, name: 'traced',
                target: 'traced', type: 'IntConsumer', args: [{ fnref: { text: 'Pipeline::cullObjects', base: 'Pipeline', name: 'cullObjects',
                  target: 'cull', op: '::', type: 'IntConsumer' } }] } },
              { call: { key: 'execute-make-stage', text: 'Pipeline.makeStage("Shading")', receiver: { type: 'Pipeline' }, name: 'makeStage',
                target: 'make-stage', type: 'IntConsumer', args: [lit('"Shading"', 'string', 'Shading', 'String')] } }] } },
          { place: { field: 'frame-id' } }, { lambda: 'finalize-lambda' }] } },
      { in: 'wrapper', call: { key: 'wrapper-step', text: 'step.accept(frameId)', name: 'accept', receiver: { name: 'step', symbol: 'symbol:traced-step' },
        external: 'IntConsumer-accept', dispatch: 'interface', type: 'void', args: [{ name: 'frameId', symbol: 'symbol:wrapper-frame' }],
        implementations: [{ target: 'cull', evidence: ['expression:execute-traced-arg0', 'call:execute-traced'],
          note: 'The method reference Pipeline::cullObjects is converted to IntConsumer at the cited traced call and invokes cullObjects. Other callers may pass other implementations.' }] } },
      stageLoop('for (IntConsumer stage : stages) {', { text: 'IntConsumer stage', typeText: 'IntConsumer', iterable: 'stages' }),
      { in: 'run-pipeline', block: 'stage-loop', call: { key: 'run-stage', text: 'stage.accept(frameId)', name: 'accept',
        receiver: { name: 'stage', symbol: 'symbol:stage-variable' }, external: 'IntConsumer-accept', dispatch: 'interface', type: 'void',
        args: [{ name: 'frameId', symbol: 'symbol:run-frame' }], implementations: [
          { target: 'wrapper', evidence: ['expression:lambda-wrapper', 'call:execute-traced', 'call:list-of', 'call:execute-run-pipeline', 'decl:stage-variable'] },
          { target: 'stage-lambda', evidence: ['expression:lambda-stage-lambda', 'call:execute-make-stage', 'call:list-of', 'call:execute-run-pipeline', 'decl:stage-variable'] }] } },
      { in: 'run-pipeline', call: { key: 'run-complete', text: 'onComplete.run()', name: 'run', receiver: { name: 'onComplete', symbol: 'symbol:run-on-complete' },
        external: 'Runnable-run', dispatch: 'interface', type: 'void', implementations: [{ target: 'finalize-lambda', evidence: callbackFlow }] } }
    ] });

  // C#
  const csharpSource = String.raw`using System;
using Engine;

namespace Engine
{
    public sealed class SceneManager
    {
        private readonly string _sceneName;
        private RenderContext? _activeContext;

        public SceneManager(string name)
        {
            _sceneName = name;
        }

        public void SetRenderContext(RenderContext context)
        {
            _activeContext = context;
        }

        public void UpdateScene()
        {
            Console.WriteLine($"[SceneManager] Updating scene: {_sceneName}");
            DispatchRenderPass();
        }

        public void DispatchRenderPass()
        {
            Console.WriteLine("[SceneManager] Dispatching render pass to context...");
            if (_activeContext != null)
            {
                _activeContext.ExecutePipeline();
            }
        }
    }

    public sealed class RenderContext
    {
        private readonly int _frameId;
        private readonly SceneManager _ownerManager;

        public RenderContext(int frameId, SceneManager manager)
        {
            _frameId = frameId;
            _ownerManager = manager;
        }

        public void ExecutePipeline()
        {
            Console.WriteLine($"[RenderContext] Executing rendering pipeline for frame #{_frameId}");
            Pipeline.RunPipeline(
                new[] { Pipeline.Traced(Pipeline.CullObjects), Pipeline.MakeStage("Shading") },
                _frameId,
                () => FinalizeFrame());
        }

        public void FinalizeFrame()
        {
            Console.WriteLine("[RenderContext] Frame finalized. Requesting next state from manager...");
            if (_ownerManager != null)
            {
                _ownerManager.UpdateScene();
            }
        }
    }
}

internal static class Program
{
    private static void Main()
    {
        var manager = new SceneManager("MainGameLevel");
        var context = new RenderContext(42, manager);
        manager.SetRenderContext(context);
        manager.UpdateScene();
    }
}
`;
  const csharpPipeline = String.raw`using System;
using System.Collections.Generic;

namespace Engine
{
    public static class Pipeline
    {
        public static Action<int> Traced(Action<int> step)
        {
            return frameId =>
            {
                Console.WriteLine($"[Pipeline] Entering stage for frame #{frameId}");
                step(frameId);
            };
        }

        public static void CullObjects(int frameId)
        {
            Console.WriteLine($"[Pipeline] Culling objects for frame #{frameId}");
        }

        public static Action<int> MakeStage(string label)
        {
            return frameId => Console.WriteLine($"[Pipeline] {label} for frame #{frameId}");
        }

        public static void RunPipeline(IEnumerable<Action<int>> stages, int frameId, Action onComplete)
        {
            foreach (var stage in stages)
            {
                stage(frameId);
            }
            onComplete();
        }
    }
}
`;
  const csStatic = { mods: ['static'], vis: 'public', receiver: 'none', file: 'pipeline' };
  const cs = {
    id: 'csharp', label: 'C#', filename: 'Example.cs', language: 'csharp', version: '12', contextId: 'context:csharp12',
    code: csharpSource, files: [{ key: 'pipeline', filename: 'Pipeline.cs', code: csharpPipeline, entry: true }], packageScope: true,
    end: 'brace', dispatch: 'direct', log: /Console\.WriteLine/,
    builtins: { void: 'void', int: 'int', string: 'string' },
    externals: [{ name: 'Action', kind: 'language_specific' }, { id: 'Action-1', name: 'Action', params: 1, kind: 'language_specific' },
      { name: 'IEnumerable', params: 1, kind: 'interface' }],
    module: { sig: 'namespace Engine', name: 'Engine', kind: 'namespace', reopen: [{ file: 'pipeline', sig: 'namespace Engine' }] },
    classes: [
      { key: 'SceneManager', sig: 'public sealed class SceneManager', mods: ['final'], vis: 'public' },
      { key: 'RenderContext', sig: 'public sealed class RenderContext', mods: ['final'], vis: 'public' },
      { key: 'Program', sig: 'internal static class Program', mods: ['static'], vis: 'internal', outside: true },
      { key: 'Pipeline', sig: 'public static class Pipeline', mods: ['static'], vis: 'public', file: 'pipeline' }],
    fields: [
      F('scene-name', '_sceneName', 'SceneManager', 'private readonly string _sceneName;', 'private', 'string'),
      F('active-context', '_activeContext', 'SceneManager', 'private RenderContext? _activeContext;', 'private', 'RenderContext?'),
      F('frame-id', '_frameId', 'RenderContext', 'private readonly int _frameId;', 'private', 'int'),
      F('owner-manager', '_ownerManager', 'RenderContext', 'private readonly SceneManager _ownerManager;', 'private', 'SceneManager')
    ].map(item => ({ ...item, mods: item.key === 'active-context' ? [] : ['final'] })),
    methods: [
      M('scene-ctor', 'SceneManager', 'SceneManager', 'public SceneManager(string name)', 'constructor', [P('ctor-name', 'name', 'string name', 'string')], null, { vis: 'public' }),
      M('set-context', 'SetRenderContext', 'SceneManager', 'public void SetRenderContext(RenderContext context)', 'method',
        [P('set-context-parameter', 'context', 'RenderContext context', 'RenderContext')], { text: 'void' }, { vis: 'public' }),
      M('update', 'UpdateScene', 'SceneManager', 'public void UpdateScene()', 'method', [], { text: 'void' }, { vis: 'public' }),
      M('dispatch', 'DispatchRenderPass', 'SceneManager', 'public void DispatchRenderPass()', 'method', [], { text: 'void' }, { vis: 'public' }),
      M('render-ctor', 'RenderContext', 'RenderContext', 'public RenderContext(int frameId, SceneManager manager)', 'constructor',
        [P('ctor-frame', 'frameId', 'int frameId', 'int'), P('ctor-manager', 'manager', 'SceneManager manager', 'SceneManager')], null, { vis: 'public' }),
      M('execute', 'ExecutePipeline', 'RenderContext', 'public void ExecutePipeline()', 'method', [], { text: 'void' }, { vis: 'public' }),
      L('finalize-lambda', 'execute', '() => FinalizeFrame()', [], { type: 'Action' }),
      M('finalize', 'FinalizeFrame', 'RenderContext', 'public void FinalizeFrame()', 'method', [], { text: 'void' }, { vis: 'public' }),
      M('main', 'Main', 'Program', 'private static void Main()', 'method', [], { text: 'void' }, { mods: ['static'], vis: 'private', receiver: 'none' }),
      M('traced', 'Traced', 'Pipeline', 'public static Action<int> Traced(Action<int> step)', 'method',
        [P('traced-step', 'step', 'Action<int> step', 'Action<int>')], { text: 'Action<int>' }, csStatic),
      L('wrapper', 'traced', 'frameId =>', [P('wrapper-frame', 'frameId', 'frameId', null, 'int')],
        { type: 'Action<int>', captures: [{ symbol: 'traced-step', mode: 'reference' }] }),
      M('cull', 'CullObjects', 'Pipeline', 'public static void CullObjects(int frameId)', 'method', [P('cull-frame', 'frameId', 'int frameId', 'int')], { text: 'void' }, csStatic),
      M('make-stage', 'MakeStage', 'Pipeline', 'public static Action<int> MakeStage(string label)', 'method',
        [P('make-stage-label', 'label', 'string label', 'string')], { text: 'Action<int>' }, csStatic),
      L('stage-lambda', 'make-stage', 'frameId => Console.WriteLine($"[Pipeline] {label} for frame #{frameId}")',
        [P('stage-lambda-frame', 'frameId', 'frameId', null, 'int')], { type: 'Action<int>', captures: [{ symbol: 'make-stage-label', mode: 'reference' }] }),
      M('run-pipeline', 'RunPipeline', 'Pipeline', 'public static void RunPipeline(IEnumerable<Action<int>> stages, int frameId, Action onComplete)', 'method',
        [P('run-stages', 'stages', 'IEnumerable<Action<int>> stages', 'IEnumerable<Action<int>>'), P('run-frame', 'frameId', 'int frameId', 'int'),
          P('run-on-complete', 'onComplete', 'Action onComplete', 'Action')], { text: 'void' }, csStatic)
    ],
    guards: guards(
      { start: 'if (_activeContext != null)', cond: { text: '_activeContext != null', place: { field: 'active-context' }, op: '!=', literal: { text: 'null', category: 'null', value: null } } },
      { start: 'if (_ownerManager != null)', cond: { text: '_ownerManager != null', place: { field: 'owner-manager' }, op: '!=', literal: { text: 'null', category: 'null', value: null } } }),
    imports: [
      { key: 'System', text: 'using System;', kind: 'using', path: ['System'], pathText: 'System' },
      { key: 'Engine', text: 'using Engine;', kind: 'using', path: ['Engine'], pathText: 'Engine', wildcard: true, target: 'Engine', relations: ['Engine'] },
      { key: 'pipeline-System', file: 'pipeline', text: 'using System;', kind: 'using', path: ['System'], pathText: 'System' },
      { key: 'pipeline-Generic', file: 'pipeline', text: 'using System.Collections.Generic;', kind: 'using', path: ['System', 'Collections', 'Generic'],
        pathText: 'System.Collections.Generic' }
    ],
    settingsText: 'C# 12 with nullable reference types enabled and two files in one compilation',
    referenceRule: 'Unique visible project binding in the displayed namespace and class scopes under the stated source assumptions.',
    callBoundary: 'The receiver type is declared and the member is unique in a sealed class, or the callee is a member of a static class, so no override can exist within the assessed source.',
    partialBoundary: 'A member of this name exists, but the receiver type is not established; no target is selected.',
    assumptions: [
      'Example.cs and Pipeline.cs are the only sources in the assembly; no extension method or partial class adds members.',
      'SceneManager and RenderContext are sealed and Pipeline is static, so their members cannot be overridden.',
      'Action and Action<int> are System delegate types; invoking a delegate value calls whichever method or lambda it holds.',
      'Pipeline is public, so callers outside the assessed source may pass other delegates.',
      'Logging calls to Console are omitted rather than analysed.'
    ],
    tourNotes: [
      'Example.cs and Pipeline.cs are two files of one compilation. Both open namespace Engine, so the namespace symbol has two declarations. using directives are library imports, plus the project namespace import.',
      'The functional pipeline is a static class of static methods. Lambdas are anonymous callable symbols owned by the method that contains them, with captures relations for step and label.',
      'Static calls such as Pipeline.RunPipeline keep the class name as the base of a member access, without a receiver binding. Pipeline.CullObjects passed to Traced is a method group, not a call. stage(frameId) invokes a delegate value, so it is an indirect call.',
      'Action<int> and Action are external delegate types. RenderContext? is a nullable layer over the nominal type. var locals spell no type, so their bindings are inferred.',
      'Class member calls are selected, direct targets. Delegate invocations keep the method group and lambdas that reach them as possible targets, each supported by argument and collection records.',
      'SceneManager and RenderContext depend on each other, RenderContext depends on Pipeline, and Pipeline reaches back through the callback lambda as a possible dependency.'
    ],
    noteIdentity: 'The namespace symbol owns the Engine classes and has a declaration in each file. Program sits outside it and reaches the classes through the using directive.',
    noteTypes: 'RenderContext? is a nullable layer over the nominal type. Action<int> and Action are external delegate types; the var locals spell no type, so only inferred bindings exist for them.',
    noteResolution: 'Class member calls are resolved, direct targets. Delegate invocations are indirect calls with evidence-backed candidates and a partial candidate set.'
  };
  cs.statements = statements({ ...cs, self: null, aself: null, assigns: true, n: { update: 'UpdateScene', dispatch: 'DispatchRenderPass', execute: 'ExecutePipeline', finalize: 'FinalizeFrame', set: 'SetRenderContext' },
    pn: { name: 'name', frame: 'frameId' }, voidType: 'void', types: { str: 'string', int: 'int' },
    m: { mgrDecl: 'var manager = new SceneManager("MainGameLevel");', mgrCtor: 'new SceneManager("MainGameLevel")',
      ctxDecl: 'var context = new RenderContext(42, manager);', ctxCtor: 'new RenderContext(42, manager)' },
    functional: [
      { in: 'execute', call: { key: 'execute-run-pipeline', open: 'Pipeline.RunPipeline(', receiver: { type: 'Pipeline' }, name: 'RunPipeline',
        target: 'run-pipeline', type: 'void', args: [
          { collection: { text: 'new[] { Pipeline.Traced(Pipeline.CullObjects), Pipeline.MakeStage("Shading") }', type: 'Action<int>[]', items: [
            { call: { key: 'execute-traced', text: 'Pipeline.Traced(Pipeline.CullObjects)', receiver: { type: 'Pipeline' }, name: 'Traced',
              target: 'traced', type: 'Action<int>', args: [{ fnref: { text: 'Pipeline.CullObjects', base: 'Pipeline', name: 'CullObjects',
                target: 'cull', op: '.', type: 'Action<int>' } }] } },
            { call: { key: 'execute-make-stage', text: 'Pipeline.MakeStage("Shading")', receiver: { type: 'Pipeline' }, name: 'MakeStage',
              target: 'make-stage', type: 'Action<int>', args: [lit('"Shading"', 'string', 'Shading', 'string')] } }] } },
          { place: { field: 'frame-id' } }, { lambda: 'finalize-lambda' }] } },
      indirectCall('wrapper-step', 'wrapper', 'step(frameId)', 'step', 'traced-step', [{ name: 'frameId', symbol: 'symbol:wrapper-frame' }],
        [tracedCandidate(['expression:execute-traced-arg0', 'call:execute-traced'])], { call: { type: 'void' } }),
      stageLoop('foreach (var stage in stages)', { text: 'var stage', type: 'Action<int>', iterable: 'stages' }),
      indirectCall('run-stage', 'run-pipeline', 'stage(frameId)', 'stage', 'stage-variable', [{ name: 'frameId', symbol: 'symbol:run-frame' }],
        stageCandidates(stageFlow('call:execute-traced', 'expression:lambda-wrapper'), lambdaFlow()),
        { statement: { block: 'stage-loop' }, call: { type: 'void' } }),
      indirectCall('run-complete', 'run-pipeline', 'onComplete()', 'onComplete', 'run-on-complete', [], completeCandidate(callbackFlow), { call: { type: 'void' } })
    ] });

  // Python
  const pythonSource = String.raw`from __future__ import annotations

from pipeline import cull_objects, make_stage, run_pipeline


class SceneManager:
    def __init__(self, name: str) -> None:
        self._scene_name = name
        self._active_context: RenderContext | None = None

    def set_render_context(self, context: RenderContext) -> None:
        self._active_context = context

    def update_scene(self) -> None:
        print(f"[SceneManager] Updating scene: {self._scene_name}")
        self.dispatch_render_pass()

    def dispatch_render_pass(self) -> None:
        print("[SceneManager] Dispatching render pass to context...")
        if self._active_context is not None:
            self._active_context.execute_pipeline()


class RenderContext:
    def __init__(self, frame_id: int, manager: SceneManager) -> None:
        self._frame_id = frame_id
        self._owner_manager = manager

    def execute_pipeline(self) -> None:
        print(f"[RenderContext] Executing rendering pipeline for frame #{self._frame_id}")
        run_pipeline([cull_objects, make_stage("Shading")], self._frame_id, lambda: self.finalize_frame())

    def finalize_frame(self) -> None:
        print("[RenderContext] Frame finalized. Requesting next state from manager...")
        if self._owner_manager is not None:
            self._owner_manager.update_scene()


def main() -> None:
    manager = SceneManager("MainGameLevel")
    context = RenderContext(42, manager)
    manager.set_render_context(context)
    manager.update_scene()


if __name__ == "__main__":
    main()
`;
  const pythonPipeline = String.raw`from collections.abc import Callable

type Stage = Callable[[int], None]


def traced(step: Stage) -> Stage:
    def wrapper(frame_id: int) -> None:
        print(f"[Pipeline] Entering stage for frame #{frame_id}")
        step(frame_id)

    return wrapper


@traced
def cull_objects(frame_id: int) -> None:
    print(f"[Pipeline] Culling objects for frame #{frame_id}")


def make_stage(label: str) -> Stage:
    return lambda frame_id: print(f"[Pipeline] {label} for frame #{frame_id}")


def run_pipeline(stages: list[Stage], frame_id: int, on_complete: Callable[[], None]) -> None:
    for stage in stages:
        stage(frame_id)
    on_complete()
`;
  const pyMethod = { receiver: 'explicit_object', vis: 'public' };
  const pyFunction = { file: 'pipeline', vis: 'public' };
  const py = {
    id: 'python', label: 'Python', filename: 'example.py', language: 'python', version: '3.12', contextId: 'context:py312',
    code: pythonSource, files: [{ key: 'pipeline', filename: 'pipeline.py', code: pythonPipeline }], fileModules: true,
    selfParameter: true, blockScopes: false,
    end: 'indent', dispatch: 'dynamic', log: /\bprint\(/,
    builtins: { None: 'None', int: 'int', str: 'str', list: 'list' },
    intrinsics: [{ key: 'module-example-name', name: '__name__', kind: 'variable', owner: 'module-example' }],
    classes: [{ key: 'SceneManager', sig: 'class SceneManager:' }, { key: 'RenderContext', sig: 'class RenderContext:' }],
    aliases: [{ key: 'Stage', name: 'Stage', owner: 'module-pipeline', file: 'pipeline', text: 'type Stage = Callable[[int], None]',
      target: 'Callable[[int], None]' }],
    // Underscore names are private only by convention, so visibility is language-specific rather than private.
    fields: [
      F('scene-name', '_scene_name', 'SceneManager', 'self._scene_name = name', 'language_specific', null, 'str'),
      F('active-context', '_active_context', 'SceneManager', 'self._active_context: RenderContext | None = None', 'language_specific', 'RenderContext | None'),
      F('frame-id', '_frame_id', 'RenderContext', 'self._frame_id = frame_id', 'language_specific', null, 'int'),
      F('owner-manager', '_owner_manager', 'RenderContext', 'self._owner_manager = manager', 'language_specific', null, 'SceneManager')
    ].map(item => ({ ...item, scope: item.owner === 'SceneManager' ? 'scene-ctor' : 'render-ctor',
      init: item.key === 'active-context' ? { literal: 'None', category: 'null', value: null } : { assign: item.key } })),
    methods: [
      M('scene-ctor', '__init__', 'SceneManager', 'def __init__(self, name: str) -> None:', 'constructor', [P('ctor-name', 'name', 'name: str', 'str')], { text: 'None' }, pyMethod),
      M('set-context', 'set_render_context', 'SceneManager', 'def set_render_context(self, context: RenderContext) -> None:', 'method',
        [P('set-context-parameter', 'context', 'context: RenderContext', 'RenderContext')], { text: 'None' }, pyMethod),
      M('update', 'update_scene', 'SceneManager', 'def update_scene(self) -> None:', 'method', [], { text: 'None' }, pyMethod),
      M('dispatch', 'dispatch_render_pass', 'SceneManager', 'def dispatch_render_pass(self) -> None:', 'method', [], { text: 'None' }, pyMethod),
      M('render-ctor', '__init__', 'RenderContext', 'def __init__(self, frame_id: int, manager: SceneManager) -> None:', 'constructor',
        [P('ctor-frame', 'frame_id', 'frame_id: int', 'int'), P('ctor-manager', 'manager', 'manager: SceneManager', 'SceneManager')], { text: 'None' }, pyMethod),
      M('execute', 'execute_pipeline', 'RenderContext', 'def execute_pipeline(self) -> None:', 'method', [], { text: 'None' }, pyMethod),
      L('finalize-lambda', 'execute', 'lambda: self.finalize_frame()', [], { captures: [{ symbol: 'execute-self', mode: 'reference' }] }),
      M('finalize', 'finalize_frame', 'RenderContext', 'def finalize_frame(self) -> None:', 'method', [], { text: 'None' }, pyMethod),
      M('main', 'main', 'module-example', 'def main() -> None:', 'function', [], { text: 'None' }),
      M('traced', 'traced', 'module-pipeline', 'def traced(step: Stage) -> Stage:', 'function',
        [P('traced-step', 'step', 'step: Stage', 'Stage')], { text: 'Stage', after: '->' }, pyFunction),
      M('wrapper', 'wrapper', null, 'def wrapper(frame_id: int) -> None:', 'local_function',
        [P('wrapper-frame', 'frame_id', 'frame_id: int', 'int')], { text: 'None' }, { parent: 'traced', captures: [{ symbol: 'traced-step', mode: 'reference' }] }),
      M('cull', 'cull_objects', 'module-pipeline', 'def cull_objects(frame_id: int) -> None:', 'function',
        [P('cull-frame', 'frame_id', 'frame_id: int', 'int')], { text: 'None' }, pyFunction),
      M('make-stage', 'make_stage', 'module-pipeline', 'def make_stage(label: str) -> Stage:', 'function',
        [P('make-stage-label', 'label', 'label: str', 'str')], { text: 'Stage' }, pyFunction),
      L('stage-lambda', 'make-stage', 'lambda frame_id: print(f"[Pipeline] {label} for frame #{frame_id}")',
        [P('stage-lambda-frame', 'frame_id', 'frame_id', null, 'int')], { captures: [{ symbol: 'make-stage-label', mode: 'reference' }] }),
      M('run-pipeline', 'run_pipeline', 'module-pipeline', 'def run_pipeline(stages: list[Stage], frame_id: int, on_complete: Callable[[], None]) -> None:', 'function',
        [P('run-stages', 'stages', 'stages: list[Stage]', 'list[Stage]'), P('run-frame', 'frame_id', 'frame_id: int', 'int'),
          P('run-on-complete', 'on_complete', 'on_complete: Callable[[], None]', 'Callable[[], None]')], { text: 'None', after: '->' }, pyFunction)
    ],
    guards: [...guards(
      { start: 'if self._active_context is not None:', cond: { text: 'self._active_context is not None', place: { self: 'self', field: 'active-context' }, op: 'is not', literal: { text: 'None', category: 'null', value: null } } },
      { start: 'if self._owner_manager is not None:', cond: { text: 'self._owner_manager is not None', place: { self: 'self', field: 'owner-manager' }, op: 'is not', literal: { text: 'None', category: 'null', value: null } } }),
    { key: 'main-guard', in: null, call: 'module-main', start: 'if __name__ == "__main__":', cond: { text: '__name__ == "__main__"',
      place: { name: '__name__', symbol: 'symbol:module-example-name' }, op: '==', literal: { text: '"__main__"', category: 'string', value: '__main__' } } }],
    decorators: [{ key: 'cull', decl: 'cull', text: '@traced', callee: 'traced', target: 'traced', param: 'traced-step', type: 'Stage' }],
    imports: [
      { key: 'future', text: 'from __future__ import annotations', kind: 'symbol', path: ['__future__'], pathText: '__future__', bindings: ['annotations'] },
      { key: 'pipeline', text: 'from pipeline import cull_objects, make_stage, run_pipeline', kind: 'symbol', path: ['pipeline'], pathText: 'pipeline',
        bindings: ['cull_objects', 'make_stage', 'run_pipeline'], target: 'module-pipeline', relations: ['module-pipeline'],
        bindingTargets: pipelineBindings('cull_objects', 'make_stage', 'run_pipeline') },
      { key: 'callable', file: 'pipeline', text: 'from collections.abc import Callable', kind: 'symbol', path: ['collections', 'abc'],
        pathText: 'collections.abc', bindings: ['Callable'] }
    ],
    constructKind: 'call',
    settingsText: 'Python 3.12 with annotations evaluated lazily, in two module files',
    referenceRule: 'Unique visible project binding in the displayed module, function, and class scopes under the stated source assumptions.',
    callBoundary: 'The receiver type is annotated or inferred from a project construction, or the callee is a uniquely imported module function, and no subclass overrides the member within the assessed source.',
    partialBoundary: 'A member of this name exists, but the receiver type is not established; no target is selected.',
    assumptions: [
      'The two displayed modules are the whole program; no monkey patching, __getattr__, metaclass, custom __new__, or dynamic class assignment changes them.',
      'The assessed source contains no subclass of SceneManager or RenderContext, so member lookup is complete within it.',
      'A local assigned from a project class call has that class as its inferred type; an attribute assigned from an annotated parameter takes its annotation.',
      'The pipeline functions are importable, so callers outside the assessed source may pass other callables to their parameters.',
      'Logging calls to print are omitted rather than analysed.'
    ],
    tourNotes: [
      'example.py imports three functions from pipeline.py; the Import keeps one reference per imported name and an imports_from relation to the pipeline module symbol. The if __name__ guard keeps the module-level main() call with its condition.',
      'Each file is a module symbol. Methods spell self as their first parameter, so self is a parameter symbol and receiver_mode is explicit_object. Attributes are declared by assignment in __init__, in its scope, while their owner is the class.',
      'A class call such as SceneManager(...) is an ordinary call that resolves to __init__. @traced is an executable decorator: an Annotation plus an application call whose implicit operand is cull_objects. stage(frame_id) and on_complete() call parameters, so they are indirect calls.',
      'type Stage is an alias over a Callable function type. Annotations such as RenderContext | None are preserved as union TypeUse records; cull_objects has an inferred Stage binding for its decorated value.',
      'Annotated and inferred receivers select every class member. Calls through stage, step, and on_complete keep the wrapper, the lambdas, and the decorated definition as possible targets, each with argument, return, or decorator evidence.',
      'SceneManager and RenderContext depend on each other, RenderContext depends on the pipeline module, and the pipeline reaches back through the callback lambda as a possible dependency.'
    ],
    noteIdentity: 'Python has no separate declaration and definition for these members; each attribute symbol has one declaration at its first assignment. self is an explicit parameter; the decorated cull_objects keeps a single symbol.',
    noteTypes: 'RenderContext | None is a union over the nominal RenderContext type and the None builtin. Stage is an alias symbol whose target is a Callable function type; the decorated cull_objects is bound to Stage, the decorator’s result.',
    noteResolution: 'Annotations and class-call inference establish every receiver, so every class member call is resolved. Indirect calls, including the call through the decorated cull_objects value, keep evidence-backed candidates and select none.'
  };
  py.statements = statements({ ...py, self: 'self', aself: 'self', assigns: true, n: { update: 'update_scene', dispatch: 'dispatch_render_pass', execute: 'execute_pipeline', finalize: 'finalize_frame', set: 'set_render_context' },
    pn: { name: 'name', frame: 'frame_id' }, voidType: 'None', types: { str: 'str', int: 'int' },
    m: { mgrDecl: 'manager = SceneManager("MainGameLevel")', mgrCtor: 'SceneManager("MainGameLevel")',
      ctxDecl: 'context = RenderContext(42, manager)', ctxCtor: 'RenderContext(42, manager)' },
    functional: [
      { in: 'execute', call: { key: 'execute-run-pipeline', text: 'run_pipeline([cull_objects, make_stage("Shading")], self._frame_id, lambda: self.finalize_frame())',
        name: 'run_pipeline', target: 'run-pipeline', type: 'None', args: [
          { collection: { text: '[cull_objects, make_stage("Shading")]', type: 'list[Stage]', items: [
            { name: 'cull_objects', symbol: 'symbol:cull' },
            { call: { key: 'execute-make-stage', text: 'make_stage("Shading")', name: 'make_stage', target: 'make-stage', type: 'Stage',
              args: [lit('"Shading"', 'string', 'Shading', 'str')] } }] } },
          { place: { self: 'self', field: 'frame-id' } }, { lambda: 'finalize-lambda' }] } },
      { in: null, call: { key: 'module-main', text: 'main()', name: 'main', target: 'main', type: 'None' } },
      { in: 'traced', ret: { key: 'return-wrapper', text: 'return wrapper', name: 'wrapper', symbol: 'symbol:wrapper' } },
      indirectCall('wrapper-step', 'wrapper', 'step(frame_id)', 'step', 'traced-step', [{ name: 'frame_id', symbol: 'symbol:wrapper-frame' }],
        [{ target: 'cull', evidence: ['annotation:cull', 'call:decorate-cull'],
          note: 'The @traced application passes cull_objects as the implicit step operand, so the wrapper may call the original definition. Other callers may pass other steps.' }],
        { call: { type: 'None' } }),
      stageLoop('for stage in stages:', { text: 'stage', type: 'Stage', iterable: 'stages' }),
      indirectCall('run-stage', 'run-pipeline', 'stage(frame_id)', 'stage', 'stage-variable', [{ name: 'frame_id', symbol: 'symbol:run-frame' }],
        stageCandidates(stageFlow('expression:execute-run-pipeline-arg0-item0', 'expression:return-wrapper', 'call:decorate-cull'), lambdaFlow()),
        { statement: { block: 'stage-loop' }, call: { type: 'None' } }),
      indirectCall('run-complete', 'run-pipeline', 'on_complete()', 'on_complete', 'run-on-complete', [], completeCandidate(callbackFlow), { call: { type: 'None' } })
    ] });

  // Rust
  const rustSource = String.raw`mod pipeline;

mod engine {
    use crate::pipeline::{cull_objects, make_stage, run_pipeline, traced};
    use std::cell::RefCell;
    use std::rc::{Rc, Weak};

    pub struct SceneManager {
        scene_name: String,
        active_context: RefCell<Option<Rc<RenderContext>>>,
    }

    impl SceneManager {
        pub fn new(name: &str) -> SceneManager {
            SceneManager {
                scene_name: name.to_string(),
                active_context: RefCell::new(None),
            }
        }

        pub fn set_render_context(&self, context: Rc<RenderContext>) {
            self.active_context.replace(Some(context));
        }

        pub fn update_scene(&self) {
            println!("[SceneManager] Updating scene: {}", self.scene_name);
            self.dispatch_render_pass();
        }

        pub fn dispatch_render_pass(&self) {
            println!("[SceneManager] Dispatching render pass to context...");
            if let Some(context) = self.active_context.borrow().as_ref() {
                context.execute_pipeline();
            }
        }
    }

    pub struct RenderContext {
        frame_id: u32,
        owner_manager: Weak<SceneManager>,
    }

    impl RenderContext {
        pub fn new(frame_id: u32, manager: Weak<SceneManager>) -> RenderContext {
            RenderContext { frame_id, owner_manager: manager }
        }

        pub fn execute_pipeline(&self) {
            println!("[RenderContext] Executing rendering pipeline for frame #{}", self.frame_id);
            run_pipeline(&[traced(cull_objects), make_stage("Shading")], self.frame_id, || self.finalize_frame());
        }

        pub fn finalize_frame(&self) {
            println!("[RenderContext] Frame finalized. Requesting next state from manager...");
            if let Some(manager) = self.owner_manager.upgrade() {
                manager.update_scene();
            }
        }
    }
}

use engine::{RenderContext, SceneManager};
use std::rc::Rc;

fn main() {
    let manager = Rc::new(SceneManager::new("MainGameLevel"));
    let context = Rc::new(RenderContext::new(42, Rc::downgrade(&manager)));
    manager.set_render_context(context);
    manager.update_scene();
}
`;
  const rustPipeline = String.raw`pub type Stage = Box<dyn Fn(u32)>;

pub fn traced(step: fn(u32)) -> Stage {
    Box::new(move |frame_id: u32| {
        println!("[Pipeline] Entering stage for frame #{}", frame_id);
        step(frame_id);
    })
}

pub fn cull_objects(frame_id: u32) {
    println!("[Pipeline] Culling objects for frame #{}", frame_id);
}

pub fn make_stage(label: &'static str) -> Stage {
    Box::new(move |frame_id: u32| println!("[Pipeline] {} for frame #{}", label, frame_id))
}

pub fn run_pipeline(stages: &[Stage], frame_id: u32, on_complete: impl FnOnce()) {
    for stage in stages {
        stage(frame_id);
    }
    on_complete();
}
`;
  const rustLibrary = key => ({ key, kind: 'symbol', path: ['std'], pathText: 'std' });
  const rustFunction = { file: 'pipeline', vis: 'public' };
  const rust = {
    id: 'rust', label: 'Rust', filename: 'example.rs', language: 'rust', version: '2021', contextId: 'context:rust2021',
    code: rustSource, files: [{ key: 'pipeline', filename: 'pipeline.rs', code: rustPipeline }],
    moduleDeclarations: [{ key: 'pipeline', name: 'pipeline', text: 'mod pipeline;', file: 'pipeline' }],
    end: 'brace', dispatch: 'direct', log: /println!/,
    builtins: { str: 'str', u32: 'u32', unit: '()' },
    externals: [{ name: 'String' }, { name: 'Option', params: 1 }, { name: 'Rc', params: 1 }, { name: 'RefCell', params: 1 }, { name: 'Weak', params: 1 },
      { name: 'Box', params: 1 }],
    module: { sig: 'mod engine {', name: 'engine', kind: 'module' },
    classes: [
      { key: 'SceneManager', sig: 'pub struct SceneManager {', impl: 'impl SceneManager {', typeKind: 'struct', vis: 'public' },
      { key: 'RenderContext', sig: 'pub struct RenderContext {', impl: 'impl RenderContext {', typeKind: 'struct', vis: 'public' }],
    aliases: [{ key: 'Stage', name: 'Stage', owner: 'pipeline', file: 'pipeline', text: 'pub type Stage = Box<dyn Fn(u32)>;',
      target: 'Box<dyn Fn(u32)>', vis: 'public' }],
    fields: [
      F('scene-name', 'scene_name', 'SceneManager', 'scene_name: String,', 'private', 'String'),
      F('active-context', 'active_context', 'SceneManager', 'active_context: RefCell<Option<Rc<RenderContext>>>,', 'private', 'RefCell<Option<Rc<RenderContext>>>'),
      F('frame-id', 'frame_id', 'RenderContext', 'frame_id: u32,', 'private', 'u32'),
      F('owner-manager', 'owner_manager', 'RenderContext', 'owner_manager: Weak<SceneManager>,', 'private', 'Weak<SceneManager>')
    ],
    methods: [
      M('scene-ctor', 'new', 'SceneManager', 'pub fn new(name: &str) -> SceneManager {', 'method', [P('ctor-name', 'name', 'name: &str', '&str')], { text: 'SceneManager' }, { receiver: 'none', vis: 'public' }),
      M('set-context', 'set_render_context', 'SceneManager', 'pub fn set_render_context(&self, context: Rc<RenderContext>) {', 'method',
        [P('set-context-parameter', 'context', 'context: Rc<RenderContext>', 'Rc<RenderContext>')], { type: 'unit' }, { vis: 'public' }),
      M('update', 'update_scene', 'SceneManager', 'pub fn update_scene(&self) {', 'method', [], { type: 'unit' }, { vis: 'public' }),
      M('dispatch', 'dispatch_render_pass', 'SceneManager', 'pub fn dispatch_render_pass(&self) {', 'method', [], { type: 'unit' }, { vis: 'public' }),
      M('render-ctor', 'new', 'RenderContext', 'pub fn new(frame_id: u32, manager: Weak<SceneManager>) -> RenderContext {', 'method',
        [P('ctor-frame', 'frame_id', 'frame_id: u32', 'u32'), P('ctor-manager', 'manager', 'manager: Weak<SceneManager>', 'Weak<SceneManager>')],
        { text: 'RenderContext' }, { receiver: 'none', vis: 'public' }),
      M('execute', 'execute_pipeline', 'RenderContext', 'pub fn execute_pipeline(&self) {', 'method', [], { type: 'unit' }, { vis: 'public' }),
      L('finalize-lambda', 'execute', '|| self.finalize_frame()'),
      M('finalize', 'finalize_frame', 'RenderContext', 'pub fn finalize_frame(&self) {', 'method', [], { type: 'unit' }, { vis: 'public' }),
      M('main', 'main', null, 'fn main() {', 'function', [], { type: 'unit' }),
      M('traced', 'traced', 'pipeline', 'pub fn traced(step: fn(u32)) -> Stage {', 'function',
        [P('traced-step', 'step', 'step: fn(u32)', 'fn(u32)')], { text: 'Stage', after: '->' }, rustFunction),
      L('wrapper', 'traced', 'move |frame_id: u32| {', [P('wrapper-frame', 'frame_id', 'frame_id: u32', 'u32')],
        { captures: [{ symbol: 'traced-step', mode: 'move' }] }),
      M('cull', 'cull_objects', 'pipeline', 'pub fn cull_objects(frame_id: u32) {', 'function', [P('cull-frame', 'frame_id', 'frame_id: u32', 'u32')], { type: 'unit' }, rustFunction),
      M('make-stage', 'make_stage', 'pipeline', "pub fn make_stage(label: &'static str) -> Stage {", 'function',
        [P('make-stage-label', 'label', "label: &'static str", "&'static str")], { text: 'Stage', after: '->' }, rustFunction),
      L('stage-lambda', 'make-stage', 'move |frame_id: u32| println!("[Pipeline] {} for frame #{}", label, frame_id)',
        [P('stage-lambda-frame', 'frame_id', 'frame_id: u32', 'u32')], { captures: [{ symbol: 'make-stage-label', mode: 'move' }] }),
      M('run-pipeline', 'run_pipeline', 'pipeline', 'pub fn run_pipeline(stages: &[Stage], frame_id: u32, on_complete: impl FnOnce()) {', 'function',
        [P('run-stages', 'stages', 'stages: &[Stage]', '&[Stage]'), P('run-frame', 'frame_id', 'frame_id: u32', 'u32'),
          P('run-on-complete', 'on_complete', 'on_complete: impl FnOnce()', 'impl FnOnce()')], { type: 'unit' }, rustFunction)
    ],
    guards: guards(
      { start: 'if let Some(context) = self.active_context.borrow().as_ref() {', pattern: { key: 'context-pattern', name: 'context', text: 'Some(context)', type: '&Rc<RenderContext>' },
        cond: { text: 'let Some(context) = self.active_context.borrow().as_ref()', unknown: 'pattern_match_not_modeled' } },
      { start: 'if let Some(manager) = self.owner_manager.upgrade() {', pattern: { key: 'manager-pattern', name: 'manager', text: 'Some(manager)', type: 'Rc<SceneManager>' },
        cond: { text: 'let Some(manager) = self.owner_manager.upgrade()', unknown: 'pattern_match_not_modeled' } }),
    imports: [
      { key: 'pipeline', text: 'use crate::pipeline::{cull_objects, make_stage, run_pipeline, traced};', kind: 'symbol', path: ['crate', 'pipeline'],
        pathText: 'crate::pipeline', bindings: ['cull_objects', 'make_stage', 'run_pipeline', 'traced'], target: 'pipeline', relations: ['pipeline'],
        scope: 'namespace', bindingTargets: pipelineBindings('cull_objects', 'make_stage', 'run_pipeline', 'traced') },
      { ...rustLibrary('cell'), text: 'use std::cell::RefCell;', path: ['std', 'cell'], bindings: ['RefCell'], scope: 'namespace' },
      { ...rustLibrary('rc'), text: 'use std::rc::{Rc, Weak};', path: ['std', 'rc'], bindings: ['Rc', 'Weak'], scope: 'namespace' },
      { key: 'Engine', text: 'use engine::{RenderContext, SceneManager};', kind: 'symbol', path: ['engine'], pathText: 'engine',
        bindings: ['RenderContext', 'SceneManager'], target: 'Engine', relations: ['Engine'] },
      { ...rustLibrary('rc-main'), text: 'use std::rc::Rc;', path: ['std', 'rc'], bindings: ['Rc'] }
    ],
    settingsText: 'Rust 2021 in a single crate with a file module',
    referenceRule: 'Unique visible project binding in the displayed module, impl, and block scopes under the stated source assumptions.',
    callBoundary: 'The receiver type is declared or inferred and the associated function or method is unique in its impl block, or the callee is a uniquely imported module function; no trait object or generic dispatch is involved.',
    partialBoundary: 'A member of this name exists, but the receiver type is not established; no target is selected.',
    assumptions: [
      'The displayed crate is the only source; no trait implementation adds members to SceneManager or RenderContext.',
      'Supplied public contracts: Rc::new returns Rc<T>, Rc::downgrade returns Weak<T>, Weak::upgrade returns Option<Rc<T>>, and method calls auto-dereference an Rc receiver.',
      'Calling a Box<dyn Fn(u32)>, an fn pointer, or an impl FnOnce value invokes the closure or function it holds.',
      'The pipeline functions are public, so other modules may pass other callables to their parameters.',
      'These limited contracts support the illustrated types and receiver lookup, not a complete standard-library analysis.',
      'Logging macros are omitted rather than analysed.'
    ],
    tourNotes: [
      'mod pipeline; declares a module whose body is the second file, pipeline.rs. use crate::pipeline::{...} brings its functions into the engine module and is preserved as an imports_from relation to the module symbol.',
      'Each struct has two declarations of one type symbol: the struct definition and its impl block. The pipeline functions are owned by the pipeline module; closures are anonymous callable symbols with move captures.',
      'Rc::new, Box::new, and RefCell::replace are ordinary calls with unsupported resolution, but their closure arguments stay lambda expressions. stage(frame_id), step(frame_id), and on_complete() call callable values, so they are indirect calls.',
      'Stage is an alias over Box<dyn Fn(u32)>, a generic application with a function-type argument. fn(u32) and impl FnOnce() are function types; the if-let pattern variables take inferred bindings.',
      'Project receivers have declared or inferred types, with an auto-dereference conversion from Rc. Indirect calls keep the closures and the function item cull_objects as possible targets, each supported by argument and Box::new records.',
      'The Weak back-reference is a type dependency without ownership. RenderContext depends on the pipeline module, and the pipeline reaches back through the callback closure as a possible dependency.'
    ],
    noteIdentity: 'Each struct and its impl block are two declarations of one type symbol. The pipeline module symbol is declared by mod pipeline; and owns its functions and the Stage alias.',
    noteTypes: 'Rc, Weak, RefCell, Option, and Box are external generic types. Stage aliases Box<dyn Fn(u32)>, whose argument is a function type qualified as dyn. The pattern variables get inferred reference or Rc bindings.',
    noteResolution: 'Project receivers have declared or inferred types, with an auto-dereference conversion from Rc. Library calls remain unsupported. Indirect calls are partial with evidence-backed candidates; the if-let conditions keep an unknown predicate.'
  };
  rust.statements = [
    { in: 'set-context', call: { key: 'replace-context', text: 'self.active_context.replace(Some(context))', name: 'replace',
      receiver: { self: 'self', field: 'active-context' }, type: 'Option<Rc<RenderContext>>',
      args: [{ call: { key: 'some-context', text: 'Some(context)', type: 'Option<Rc<RenderContext>>',
        args: [{ name: 'context', symbol: 'symbol:set-context-parameter' }] } }] } },
    { in: 'update', call: { key: 'update-dispatch', text: 'self.dispatch_render_pass()', name: 'dispatch_render_pass', receiver: { self: 'self' }, target: 'dispatch', type: 'unit' } },
    { in: 'dispatch', call: { key: 'dispatch-execute', text: 'context.execute_pipeline()', name: 'execute_pipeline',
      receiver: { name: 'context', symbol: 'symbol:context-pattern' }, target: 'execute', type: 'unit' } },
    { in: 'execute', call: { key: 'execute-run-pipeline', text: 'run_pipeline(&[traced(cull_objects), make_stage("Shading")], self.frame_id, || self.finalize_frame())',
      name: 'run_pipeline', target: 'run-pipeline', type: 'unit', args: [
        { op: '&', text: '&[traced(cull_objects), make_stage("Shading")]', type: '&[Stage]', operand: { collection: {
          text: '[traced(cull_objects), make_stage("Shading")]', items: [
            { call: { key: 'execute-traced', text: 'traced(cull_objects)', name: 'traced', target: 'traced', type: 'Stage',
              args: [{ name: 'cull_objects', symbol: 'symbol:cull' }],
              conversions: [{ kind: 'language_specific', target_type_id: 'type:fn(u32)', state: 'established' }] } },
            { call: { key: 'execute-make-stage', text: 'make_stage("Shading")', name: 'make_stage', target: 'make-stage', type: 'Stage',
              args: [lit('"Shading"', 'string', 'Shading', "&'static str")] } }] } } },
        { place: { self: 'self', field: 'frame-id' } }, { lambda: 'finalize-lambda' }] } },
    { in: 'finalize-lambda', call: { key: 'execute-finalize', text: 'self.finalize_frame()', name: 'finalize_frame', receiver: { self: 'self' }, target: 'finalize', type: 'unit' } },
    { in: 'finalize', call: { key: 'finalize-update', text: 'manager.update_scene()', name: 'update_scene',
      receiver: { name: 'manager', symbol: 'symbol:manager-pattern' }, target: 'update', type: 'unit' } },
    { in: 'main', local: { key: 'manager-variable', name: 'manager', text: 'let manager = Rc::new(SceneManager::new("MainGameLevel"));', type: 'Rc<SceneManager>' },
      init: { key: 'rc-manager', text: 'Rc::new(SceneManager::new("MainGameLevel"))', type: 'Rc<SceneManager>',
        args: [{ call: { key: 'make-manager', text: 'SceneManager::new("MainGameLevel")', name: 'SceneManager::new', target: 'scene-ctor', type: 'SceneManager',
          args: [lit('"MainGameLevel"', 'string', 'MainGameLevel', '&str')] } }] } },
    { in: 'main', local: { key: 'context-variable', name: 'context', text: 'let context = Rc::new(RenderContext::new(42, Rc::downgrade(&manager)));', type: 'Rc<RenderContext>' },
      init: { key: 'rc-context', text: 'Rc::new(RenderContext::new(42, Rc::downgrade(&manager)))', type: 'Rc<RenderContext>',
        args: [{ call: { key: 'make-context', text: 'RenderContext::new(42, Rc::downgrade(&manager))', name: 'RenderContext::new', target: 'render-ctor', type: 'RenderContext',
          args: [lit('42', 'integer', 42, 'u32'), { call: { key: 'downgrade', text: 'Rc::downgrade(&manager)', type: 'Weak<SceneManager>',
            args: [{ op: '&', text: '&manager', name: 'manager', symbol: 'symbol:manager-variable' }] } }] } }] } },
    { in: 'main', call: { key: 'main-set-context', text: 'manager.set_render_context(context)', name: 'set_render_context', receiver: manager,
      target: 'set-context', args: [{ name: 'context', symbol: 'symbol:context-variable' }], type: 'unit' } },
    { in: 'main', call: { key: 'main-update', text: 'manager.update_scene()', name: 'update_scene', receiver: manager, target: 'update', type: 'unit' } },
    { in: 'traced', call: { key: 'box-wrapper', open: 'Box::new(', args: [{ lambda: 'wrapper' }] } },
    indirectCall('wrapper-step', 'wrapper', 'step(frame_id)', 'step', 'traced-step', [{ name: 'frame_id', symbol: 'symbol:wrapper-frame' }],
      [tracedCandidate(['expression:execute-traced-arg0', 'call:execute-traced'])], { call: { type: 'unit' } }),
    { in: 'make-stage', call: { key: 'box-stage', open: 'Box::new(', args: [{ lambda: 'stage-lambda' }] } },
    stageLoop('for stage in stages {', { text: 'stage', type: '&Stage', iterable: 'stages' }),
    indirectCall('run-stage', 'run-pipeline', 'stage(frame_id)', 'stage', 'stage-variable', [{ name: 'frame_id', symbol: 'symbol:run-frame' }],
      stageCandidates(stageFlow('call:execute-traced', 'expression:lambda-wrapper', 'call:box-wrapper', 'expression:execute-run-pipeline-arg0-operand'),
        lambdaFlow('call:box-stage', 'expression:execute-run-pipeline-arg0-operand')),
      { statement: { block: 'stage-loop' }, call: { type: 'unit' } }),
    indirectCall('run-complete', 'run-pipeline', 'on_complete()', 'on_complete', 'run-on-complete', [], completeCandidate(callbackFlow), { call: { type: 'unit' } })
  ];

  const order = [ts, js, java, cs, py, rust];
  window.CODE_GRAPH_EXAMPLES = window.CODE_GRAPH_EXAMPLES || {};
  for (const descriptor of order) {
    window.CODE_GRAPH_EXAMPLES[descriptor.id] = window.CODE_GRAPH_BUILD_EXAMPLE(descriptor);
  }
})();
