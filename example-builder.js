(() => {
  'use strict';

  const CATEGORIES = [
    'CodeDataset', 'SourceFile', 'Module', 'AnalysisContext', 'AnalysisUnit',
    'Scope', 'Symbol', 'Declaration', 'TypeProfile', 'CallableProfile', 'ParameterProfile',
    'Import', 'Annotation', 'Expression', 'CallProfile', 'Reference', 'Type', 'TypeUse', 'TypeBinding',
    'Resolution', 'ImplementationSet', 'SemanticRelation', 'Evidence', 'Coverage', 'Diagnostic'
  ];
  const encode = text => new TextEncoder().encode(text);
  const fingerprint = text => {
    let hash = 0x811c9dc5;
    for (const byte of encode(text)) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    return hash.toString(16).padStart(8, '0');
  };

  // Spelling grammar: Name, Name<A>, Name[A] (Python), A | B, A?, A[], &A, &'a A, [A] (slice),
  // (a: A) => R (TypeScript), Callable[[A], R] (Python), and Fn(A) -> R, fn(A), dyn X, impl X (Rust).
  function parseType(src) {
    let at = 0;
    const skip = () => { while (src[at] === ' ') at++; };
    const fail = () => { throw new Error(`Cannot parse type spelling: ${src}`); };
    function word() {
      const match = /^[A-Za-z_]\w*/.exec(src.slice(at));
      if (!match) fail();
      at += match[0].length;
      return match[0];
    }
    function list(close) {
      const items = [];
      skip();
      if (src[at] === close) { at++; return items; }
      do { items.push(union()); skip(); } while (src[at] === ',' && ++at);
      if (src[at] !== close) fail();
      at++;
      return items;
    }
    function namedParameters() {
      const items = [];
      skip();
      if (src[at] === ')') { at++; return items; }
      do {
        skip(); word(); skip();
        if (src[at] !== ':') fail();
        at++;
        items.push(union());
        skip();
      } while (src[at] === ',' && ++at);
      if (src[at] !== ')') fail();
      at++;
      return items;
    }
    function suffix(node, start) {
      for (;;) {
        if (src[at] === '?') { at++; node = { kind: 'nullable', start, end: at, children: [node] }; }
        else if (src.startsWith('[]', at)) { at += 2; node = { kind: 'array', start, end: at, children: [node] }; }
        else return node;
      }
    }
    function atom() {
      skip();
      const start = at;
      if (src[at] === '&') {
        at++;
        const lifetime = /^'\w+ */.exec(src.slice(at));
        if (lifetime) at += lifetime[0].length;
        const inner = atom();
        return { kind: 'reference', start, end: inner.end, children: [inner], qualifiers: lifetime ? [lifetime[0].trim()] : [] };
      }
      if (src[at] === '[') {
        at++;
        const inner = union();
        skip();
        if (src[at] !== ']') fail();
        at++;
        return suffix({ kind: 'array', start, end: at, children: [inner] }, start);
      }
      if (src[at] === '(') {
        at++;
        const parameters = namedParameters();
        skip();
        if (!src.startsWith('=>', at)) fail();
        at += 2;
        const result = union();
        return { kind: 'function', start, end: result.end, children: [...parameters, result], returns: true, qualifiers: [] };
      }
      const name = word();
      if (name === 'dyn' || name === 'impl') {
        const inner = atom();
        return { ...inner, start, qualifiers: [name, ...(inner.qualifiers || [])] };
      }
      if (['Fn', 'FnMut', 'FnOnce', 'fn'].includes(name) && src[at] === '(') {
        at++;
        const parameters = list(')');
        const close = at;
        skip();
        if (src.startsWith('->', at)) {
          at += 2;
          const result = union();
          return { kind: 'function', start, end: result.end, children: [...parameters, result], returns: true, qualifiers: name === 'fn' ? [] : [name] };
        }
        at = close;
        return { kind: 'function', start, end: close, children: parameters, returns: false, qualifiers: name === 'fn' ? [] : [name] };
      }
      if (name === 'Callable' && src.startsWith('[[', at)) {
        at += 2;
        const parameters = list(']');
        skip();
        if (src[at] !== ',') fail();
        at++;
        const result = union();
        skip();
        if (src[at] !== ']') fail();
        at++;
        return { kind: 'function', start, end: at, children: [...parameters, result], returns: true, qualifiers: [] };
      }
      let node = { kind: 'name', name, start, end: at, children: [] };
      if (src[at] === '<' || (src[at] === '[' && src[at + 1] !== ']')) {
        const close = src[at] === '<' ? '>' : ']';
        at++;
        node = { kind: 'generic', name, start, end: 0, children: list(close) };
        node.end = at;
      }
      return suffix(node, start);
    }
    function union() {
      const parts = [atom()];
      skip();
      while (src[at] === '|') { at++; parts.push(atom()); skip(); }
      return parts.length > 1
        ? { kind: 'union', start: parts[0].start, end: parts[parts.length - 1].end, children: parts }
        : parts[0];
    }
    const node = union();
    skip();
    if (at !== src.length) fail();
    return node;
  }

  window.CODE_GRAPH_BUILD_EXAMPLE = d => {
    const code = d.code;
    const contextId = d.contextId;
    const model = Object.fromEntries(CATEGORIES.map(category => [category, []]));
    const add = (category, record) => { model[category].push(record); return record; };
    const contextual = record => ({ ...record, context_id: contextId });
    const files = [{ key: 'example', filename: d.filename, code }, ...(d.files || [])]
      .map(file => ({ ...file, id: `file:${file.key}` }));
    const sources = Object.fromEntries(files.map(file => [file.key, file.code]));
    const classKeys = d.classes.map(item => item.key);
    const projectTypes = [...classKeys, ...(d.aliases || []).map(item => item.key)];
    const externals = d.externals || [];
    const declaredTypes = new Map();
    const methodsByKey = new Map(d.methods.map(method => [method.key, method]));
    const paramKeys = new Map(d.methods.map(method => [method.key, method.params.map(param => param.key)]));
    const trace = {};
    const callRanges = {};
    const indirectBoundary = d.indirectBoundary || 'A callable value reaches this callee through the cited source records. It is a possible target, not a selected or executed one; callers outside the assessed source may pass other callables.';
    const externalBoundary = d.externalBoundary || 'The receiver has a declared functional-interface type, so the interface method is the declaration-level target under the stated library contract.';
    const implementationBoundary = d.implementationBoundary || 'This source callable is converted to the functional interface at the cited site, so it is a possible implementation. Callers outside the assessed source may supply others.';
    const fileOf = key => methodsByKey.get(key)?.file || (methodsByKey.get(key)?.parent ? fileOf(methodsByKey.get(key).parent) : 'example');

    const locate = (text, from = 0, file = 'example') => {
      const start = sources[file].indexOf(text, from);
      if (start < 0) throw new Error(`${d.label} teaching source fragment not found in ${file}: ${text}`);
      return { file, start, end: start + text.length };
    };
    const sourceSpan = range => {
      const text = sources[range.file || 'example'];
      return { file_id: `file:${range.file || 'example'}`, start_offset: encode(text.slice(0, range.start)).length,
        end_offset: encode(text.slice(0, range.end)).length };
    };
    function within(text, range) {
      const found = locate(text, range.start, range.file || 'example');
      if (found.end > range.end) throw new Error(`${d.label} fragment is outside its expected construct: ${text}`);
      return found;
    }
    function body(signature, end = 'brace', file = 'example', from = 0) {
      const text = sources[file];
      const start = locate(signature, from, file).start;
      if (end === 'indent') {
        const indent = start - (text.lastIndexOf('\n', start) + 1);
        let stop = text.indexOf('\n', start);
        let cursor = stop + 1;
        while (cursor < text.length) {
          const lineEnd = text.indexOf('\n', cursor) < 0 ? text.length : text.indexOf('\n', cursor);
          const line = text.slice(cursor, lineEnd);
          if (line.trim()) {
            if (/^ */.exec(line)[0].length <= indent) break;
            stop = lineEnd;
          }
          cursor = lineEnd + 1;
        }
        return { file, start, end: stop };
      }
      let depth = 0;
      for (let index = text.indexOf('{', start); index < text.length; index++) {
        if (text[index] === '{') depth++;
        if (text[index] === '}' && --depth === 0) return { file, start, end: index + 1 };
      }
      throw new Error(`Unclosed body in the ${d.label} teaching source: ${signature}`);
    }
    // A multi-line call spans from its opening text to the parenthesis matching its first one.
    function balanced(opening, range) {
      const text = sources[range.file || 'example'];
      const start = within(opening, range).start;
      let depth = 0;
      for (let index = text.indexOf('(', start); index < range.end; index++) {
        if (text[index] === '(') depth++;
        if (text[index] === ')' && --depth === 0) return { file: range.file || 'example', start, end: index + 1 };
      }
      throw new Error(`Unbalanced call in the ${d.label} teaching source: ${opening}`);
    }
    const nameOf = symbolId => model.Symbol.find(record => record.id === symbolId).name;

    const coverage = (id, subject, dimension, state, reasons = [], excluded = []) =>
      add('Coverage', contextual({ id, subject_id: subject, dimension, state, reason_codes: reasons, excluded_spans: excluded }));
    const evidence = (id, subject, supporting, detail, spans = [], method = 'manual') =>
      add('Evidence', { id, subject_id: subject, method, source_spans: spans, supporting_ids: supporting, authority: 'established', detail });
    function symbol(id, name, kind, owner, origin = 'source') {
      return add('Symbol', { id, ...(name ? { name } : {}), kind, ...(owner ? { owner_symbol_id: owner } : {}), origin, identity_state: 'established' });
    }
    function scope(id, kind, parent, owner, range) {
      return add('Scope', { id, unit_id: 'unit:example', kind, ...(parent ? { parent_scope_id: parent } : {}),
        ...(owner ? { owner_declaration_id: owner } : {}), ...(range ? { span: sourceSpan(range) } : {}) });
    }
    function declaration(id, symbolId, scopeId, range, options = {}) {
      const name = nameOf(symbolId);
      return add('Declaration', { id, symbol_id: symbolId, scope_id: scopeId, form: 'definition',
        ...(range ? { span: sourceSpan(range) } : {}), ...(range && name ? { name_span: sourceSpan(within(name, range)) } : {}),
        modifiers: [], ...options });
    }
    const bind = (id, subject, type, role = 'declared') =>
      add('TypeBinding', contextual({ id, subject_id: subject, type_id: type, role, state: 'established' }));

    // Types
    const types = new Set();
    function addType(record) {
      if (!types.has(record.id)) {
        types.add(record.id);
        add('Type', { qualifiers: [], completeness: 'complete', ...record });
      }
      return record.id;
    }
    const classTypeId = key => addType({ id: `type:${key}`, kind: 'nominal', symbol_id: `symbol:${key}` });
    const externalFor = (name, arity) => externals.find(item => item.name === name && (item.params || 0) === arity);
    function typeFor(node, src) {
      const spelled = src.slice(node.start, node.end).replace(/\s+/g, '');
      const children = () => node.children.map(child => typeFor(child, src));
      if (node.kind === 'name') {
        if (d.builtins[node.name] !== undefined) {
          return addType({ id: `type:${node.name}`, kind: 'builtin', builtin_name: d.builtins[node.name], language: d.language });
        }
        if (projectTypes.includes(node.name)) return classTypeId(node.name);
        const external = externalFor(node.name, node.arity || 0);
        if (external) {
          const key = external.id || external.name;
          return addType({ id: `type:${key}`, kind: 'nominal', symbol_id: `symbol:ext-${key}` });
        }
        throw new Error(`Unknown type name in the ${d.label} example: ${node.name}`);
      }
      const id = `type:${spelled}`;
      const parts = children();
      const qualifiers = node.qualifiers || [];
      if (node.kind === 'generic') {
        const head = typeFor({ kind: 'name', name: node.name, arity: node.children.length, start: 0, end: node.name.length, children: [] }, node.name);
        return addType({ id, kind: 'generic_application', generic_type_id: head,
          arguments: parts.map(type_id => ({ category: 'type', type_id })) });
      }
      if (node.kind === 'function') {
        const result = node.returns ? parts[parts.length - 1]
          : typeFor({ kind: 'name', name: d.builtins.unit !== undefined ? 'unit' : 'void', start: 0, end: 0, children: [] }, '');
        return addType({ id, kind: 'function', qualifiers, parameter_type_ids: node.returns ? parts.slice(0, -1) : parts,
          return_type_id: result });
      }
      if (node.kind === 'nullable') return addType({ id, kind: 'nullable', element_type_id: parts[0] });
      if (node.kind === 'array') return addType({ id, kind: 'array', element_type_id: parts[0], dimensions: ['unknown'] });
      if (node.kind === 'reference') return addType({ id, kind: 'reference', qualifiers, reference_kind: 'lvalue', element_type_id: parts[0] });
      return addType({ id, kind: 'union', component_type_ids: parts });
    }
    const typeOf = spelling => typeFor(parseType(spelling), spelling);

    function resolved(id, subject, target, extra = {}) {
      const result = add('Resolution', contextual({
        id, subject_id: subject, state: 'resolved', selected_target_id: target,
        candidates: [{ target_symbol_id: target, applicability: 'applicable', reason_codes: [], conversions: [] }],
        candidate_set_completeness: 'complete', argument_bindings: [], type_substitutions: {}, reason_codes: [], ...extra
      }));
      coverage(`coverage:${id}`, subject, 'candidate_scope', 'complete');
      return result;
    }
    // An unknown receiver keeps a possible candidate only with evidence of the values that reach it.
    function partial(id, subject, target, spans, flows = []) {
      add('Resolution', contextual({
        id, subject_id: subject, state: 'partial', candidates: [{ target_symbol_id: target, applicability: 'unknown',
          reason_codes: ['receiver_type_not_established'], conversions: [] }],
        candidate_set_completeness: 'partial', argument_bindings: [], type_substitutions: {},
        reason_codes: ['receiver_type_not_established'], ...(subject.startsWith('call:') ? { dispatch_kind: 'dynamic' } : {})
      }));
      coverage(`coverage:${id}`, subject, 'candidate_scope', 'partial', ['receiver_type_not_established']);
      const record = evidence(`evidence:${id}`, id, [target, ...flows, 'evidence:contracts'],
        { boundary: d.partialBoundary }, spans, flows.length ? 'inference' : 'language_rules');
      record.attribute_path = 'candidates[0]';
      if (flows.length) record.authority = 'inferred';
    }
    function reference(id, site, range, role, target, qualification = 'unqualified', mode = 'resolved', flows) {
      add('Reference', { id, site_id: site, span: sourceSpan(range), role, qualification });
      if (target && mode === 'partial') partial(`resolution:${id}`, id, target, [sourceSpan(range)], flows);
      else if (target) {
        resolved(`resolution:${id}`, id, target);
        evidence(`evidence:${id}`, `resolution:${id}`, [site, target, 'evidence:contracts'],
          { rule: d.referenceRule }, [sourceSpan(range)], 'language_rules');
      } else add('Resolution', contextual({
        id: `resolution:${id}`, subject_id: id, state: 'unsupported', candidates: [],
        candidate_set_completeness: 'unknown', argument_bindings: [], type_substitutions: {},
        reason_codes: ['external_library_not_analyzed']
      }));
    }

    const TYPE_USE_FORMS = { name: 'named', generic: 'generic', nullable: 'nullable', union: 'union', reference: 'reference', array: 'array', function: 'function' };
    function typeUseTree(node, src, base, subject, scopeId, role, id, position) {
      const range = { file: base.file, start: base.start + node.start, end: base.start + node.end };
      add('TypeUse', { id, subject_id: subject, scope_id: scopeId, span: sourceSpan(range), form: TYPE_USE_FORMS[node.kind], role,
        ...(position === undefined ? {} : { position }) });
      bind(`binding:${id}`, id, typeFor(node, src));
      if (node.kind === 'name' && projectTypes.includes(node.name)) {
        reference(`reference:type-${id}`, id, range, 'type', `symbol:${node.name}`);
      }
      node.children.forEach((child, index) => {
        const isResult = node.kind === 'function' && node.returns && index === node.children.length - 1;
        typeUseTree(child, src, base, id, scopeId,
          node.kind === 'generic' ? 'argument' : isResult ? 'return' : 'language_specific', `${id}-${index}`, isResult ? 0 : index);
      });
      return id;
    }
    function declaredUse(declId, scopeId, range, typeText, idBase, role = 'declared') {
      const found = within(typeText, range);
      typeUseTree(parseType(typeText), typeText, found, declId, scopeId, role, `typeuse:${idBase}`);
    }
    function typedDeclaration(key, scopeId, range, spec, options = {}) {
      const symbolId = `symbol:${key}`, declId = `decl:${key}`;
      const record = declaration(declId, symbolId, scopeId, range, options);
      if (spec.typeText) {
        declaredUse(declId, scopeId, range, spec.typeText, key);
        declaredTypes.set(symbolId, typeOf(spec.typeText));
        bind(`binding:decl:${key}`, declId, declaredTypes.get(symbolId), 'declared');
      } else if (spec.type) {
        declaredTypes.set(symbolId, typeOf(spec.type));
        bind(`binding:decl:${key}`, declId, declaredTypes.get(symbolId), 'inferred');
      }
      return record;
    }

    // Dataset, units, files, and file-level module scopes
    const settings = { module_id: 'module:example', language_settings: { language: d.language, version: d.version },
      defines: {}, search_paths: [], dependency_context_ids: [] };
    add('CodeDataset', { id: 'dataset:example-v2', schema_version: 'v2', digest_algorithm: 'fnv1a32',
      producer: `codatori. / hand-authored ${d.label} teaching projection`, root_module_ids: ['module:example'] });
    for (const file of files) {
      add('SourceFile', { id: file.id, uri: `memory:///${file.filename}`, content: file.code,
        content_digest: fingerprint(file.code), language: d.language, origin: 'source' });
    }
    add('Module', { id: 'module:example', name: 'Engine example', kind: 'executable' });
    add('AnalysisContext', { id: contextId, ...settings, context_digest: fingerprint(JSON.stringify(settings)) });
    add('AnalysisUnit', { id: 'unit:example', context_id: contextId,
      entry_file_ids: files.filter(file => file.key === 'example' || file.entry).map(file => file.id),
      participating_file_ids: files.map(file => file.id) });

    const rootScopes = { example: 'scope:module' };
    const bodyScopes = {};
    const wholeFile = file => ({ file, start: 0, end: sources[file].length });
    if (d.fileModules) {
      // Each file is a module symbol; the package scope only holds their implicit declarations.
      scope('scope:package', 'namespace', null, null, null);
      for (const file of files) {
        const scopeId = file.key === 'example' ? 'scope:module' : `scope:file-${file.key}`;
        rootScopes[file.key] = scopeId;
        bodyScopes[`module-${file.key}`] = scopeId;
        symbol(`symbol:module-${file.key}`, file.filename.replace(/\.\w+$/, ''), 'module');
        declaration(`decl:module-${file.key}`, `symbol:module-${file.key}`, 'scope:package', null,
          { form: 'implicit', body_scope_id: scopeId });
        scope(scopeId, 'module', null, `decl:module-${file.key}`, wholeFile(file.key));
      }
    } else {
      if (d.packageScope) scope('scope:package', 'namespace', null, null, null);
      scope('scope:module', 'module', d.packageScope ? 'scope:package' : null, null, wholeFile('example'));
      for (const file of files.slice(1)) {
        const scopeId = `scope:file-${file.key}`;
        rootScopes[file.key] = scopeId;
        const declared = d.moduleDeclarations?.find(item => item.file === file.key);
        if (declared) {
          symbol(`symbol:${declared.key}`, declared.name, 'module');
          declaration(`decl:${declared.key}`, `symbol:${declared.key}`, 'scope:module', locate(declared.text),
            { form: 'declaration', body_scope_id: scopeId });
          bodyScopes[declared.key] = scopeId;
        }
        scope(scopeId, 'module', d.packageScope ? 'scope:package' : declared ? 'scope:module' : null,
          declared ? `decl:${declared.key}` : null, wholeFile(file.key));
      }
    }
    for (const item of d.intrinsics || []) symbol(`symbol:${item.key}`, item.name, item.kind, `symbol:${item.owner}`, 'intrinsic');

    let lexicalRoot = 'scope:module', ownerRoot = null;
    const namespaceScopes = {};
    if (d.module) {
      const range = body(d.module.sig, d.end);
      ownerRoot = 'symbol:Engine';
      lexicalRoot = 'scope:Engine';
      symbol('symbol:Engine', d.module.name, d.module.kind);
      declaration('decl:Engine', 'symbol:Engine', 'scope:module', range, { body_scope_id: 'scope:Engine' });
      scope('scope:Engine', d.module.kind === 'module' ? 'module' : 'namespace', 'scope:module', 'decl:Engine', range);
      namespaceScopes.example = 'scope:Engine';
      for (const reopen of d.module.reopen || []) {
        // A namespace opened again in another file is another declaration of the same symbol.
        const reopenRange = body(reopen.sig, d.end, reopen.file);
        const scopeId = `scope:Engine-${reopen.file}`;
        declaration(`decl:Engine-${reopen.file}`, 'symbol:Engine', rootScopes[reopen.file], reopenRange, { body_scope_id: scopeId });
        scope(scopeId, 'namespace', rootScopes[reopen.file], `decl:Engine-${reopen.file}`, reopenRange);
        namespaceScopes[reopen.file] = scopeId;
      }
    }

    // Types and members
    const classRanges = {};
    for (const item of d.classes) {
      const file = item.file || 'example';
      const range = body(item.sig, d.end, file);
      classRanges[item.key] = range;
      const lexicalParent = item.outside ? rootScopes[file] : (namespaceScopes[file] || rootScopes[file]);
      symbol(`symbol:${item.key}`, item.key, 'type', item.outside ? null : ownerRoot);
      declaration(`decl:${item.key}`, `symbol:${item.key}`, lexicalParent, range, {
        body_scope_id: `scope:${item.key}`, modifiers: item.mods || [], ...(item.vis ? { visibility: item.vis } : {}) });
      scope(`scope:${item.key}`, 'type', lexicalParent, `decl:${item.key}`, range);
      add('TypeProfile', { id: `symbol:${item.key}`, type_kind: item.typeKind || 'class', type_parameter_ids: [] });
      bodyScopes[item.key] = `scope:${item.key}`;
      if (item.impl) {
        const implRange = body(item.impl, d.end, file);
        declaration(`decl:${item.key}-impl`, `symbol:${item.key}`, lexicalParent, implRange, { body_scope_id: `scope:${item.key}-impl` });
        scope(`scope:${item.key}-impl`, 'type', lexicalParent, `decl:${item.key}-impl`, implRange);
        bodyScopes[item.key] = `scope:${item.key}-impl`;
      }
    }
    for (const item of externals) {
      const key = item.id || item.name;
      symbol(`symbol:ext-${key}`, item.name, 'type', null, 'external');
      const parameters = [];
      for (let index = 0; index < (item.params || 0); index++) {
        const id = `symbol:ext-${key}-T${index}`;
        symbol(id, 'T', 'type_parameter', `symbol:ext-${key}`, 'external');
        parameters.push(id);
      }
      add('TypeProfile', { id: `symbol:ext-${key}`, type_kind: item.kind || 'class', type_parameter_ids: parameters });
      for (const member of item.members || []) {
        // Library members are established external symbols; their bodies are not available.
        const memberId = `symbol:ext-${key}-${member.name}`;
        symbol(memberId, member.name, 'callable', `symbol:ext-${key}`, 'external');
        const parameterIds = (member.params || []).map(([name, type], index) => {
          const id = `${memberId}-p${index}`;
          symbol(id, name, 'parameter', memberId, 'external');
          add('ParameterProfile', { id, binding_kind: 'positional', passing_mode: 'value' });
          declaredTypes.set(id, typeOf(type));
          return id;
        });
        add('CallableProfile', { id: memberId, callable_kind: 'method', parameter_ids: parameterIds, type_parameter_ids: [],
          receiver_mode: 'instance', variadic_style: 'none', receiver_qualifiers: [] });
      }
    }
    for (const item of d.aliases || []) {
      // A type alias keeps its own symbol; uses of its name are nominal types of that symbol.
      const file = item.file || 'example';
      const range = locate(item.text, 0, file);
      const scopeId = bodyScopes[item.owner] || rootScopes[file];
      symbol(`symbol:${item.key}`, item.name, 'type', `symbol:${item.owner}`);
      declaration(`decl:${item.key}`, `symbol:${item.key}`, scopeId, range, { ...(item.vis ? { visibility: item.vis } : {}) });
      add('TypeProfile', { id: `symbol:${item.key}`, type_kind: 'alias', type_parameter_ids: [] });
      declaredUse(`decl:${item.key}`, scopeId, range, item.target, `alias-${item.key}`);
      add('SemanticRelation', contextual({ id: `relation:alias-${item.key}`, source_id: `symbol:${item.key}`,
        target_id: typeOf(item.target), kind: 'aliases', site_id: `decl:${item.key}`, state: 'established' }));
    }

    const fieldInitializers = [];
    for (const field of d.fields) {
      symbol(`symbol:${field.key}`, field.name, 'field', `symbol:${field.owner}`);
      const scopeId = field.scope ? `scope:${field.scope}` : `scope:${field.owner}`;
      const range = within(field.text, classRanges[field.owner]);
      const options = { visibility: field.vis, ...(field.mods ? { modifiers: field.mods } : {}) };
      if (field.init?.literal) {
        const value = { ...range, start: sources[range.file].indexOf('=', range.start) + 1 };
        options.initializer_expression_id = literal(`expression:init-${field.key}`, scopeId, field.init.literal, value,
          field.init.category, field.init.value, field.init.type);
      }
      typedDeclaration(field.key, scopeId, range, field, options);
      if (field.init?.assign) fieldInitializers.push([`decl:${field.key}`, `expression:assign-${field.init.assign}-value`]);
    }

    // Callables: methods, top-level functions, local functions, and lambdas, in source nesting order.
    const methodRanges = {};
    const lambdaExpressions = {};
    const classOwner = key => {
      for (let method = methodsByKey.get(key); method; method = methodsByKey.get(method.parent)) {
        if (classKeys.includes(method.owner)) return method.owner;
      }
      return null;
    };
    const selfSymbol = key => {
      for (let method = methodsByKey.get(key); method; method = methodsByKey.get(method.parent)) {
        if (method.receiver === 'explicit_object') return `symbol:${method.key}-self`;
      }
      throw new Error(`No explicit receiver parameter encloses ${key}`);
    };
    for (const method of d.methods) {
      const key = method.key, file = fileOf(key);
      const parentRange = method.parent ? methodRanges[method.parent] : null;
      const range = method.text ? within(method.text, parentRange)
        : body(method.sig, d.end, file, parentRange ? parentRange.start : 0);
      methodRanges[key] = range;
      const owner = method.parent ? `symbol:${method.parent}` : method.owner ? `symbol:${method.owner}` : null;
      symbol(`symbol:${key}`, method.name, 'callable', owner);
      const lexical = method.parent ? `scope:${method.parent}` : method.owner ? bodyScopes[method.owner] : rootScopes[file];
      declaration(`decl:${key}`, `symbol:${key}`, lexical, range, {
        body_scope_id: `scope:${key}`, modifiers: method.mods || [], ...(method.vis ? { visibility: method.vis } : {}) });
      scope(`scope:${key}`, 'callable', lexical, `decl:${key}`, range);
      if (method.kind === 'lambda') {
        lambdaExpressions[key] = add('Expression', { id: `expression:lambda-${key}`, scope_id: lexical, span: sourceSpan(range),
          kind: 'lambda', operands: [], introduced_symbol_id: `symbol:${key}` }).id;
        if (method.type) bind(`binding:expression:lambda-${key}`, `expression:lambda-${key}`, typeOf(method.type), 'inferred');
      }
      const isMember = classKeys.includes(method.owner) && !['function', 'local_function', 'lambda'].includes(method.kind);
      const receiverMode = method.receiver || (isMember ? 'instance' : 'none');
      method.receiver = receiverMode;
      add('CallableProfile', { id: `symbol:${key}`, callable_kind: method.kind, parameter_ids: [],
        type_parameter_ids: [], receiver_mode: receiverMode, variadic_style: 'none', receiver_qualifiers: [] });
      if (method.ret) {
        const retType = method.ret.text ? typeOf(method.ret.text) : typeOf(method.ret.type);
        const after = method.ret.after ? { ...range, start: sources[file].indexOf(method.ret.after, range.start) } : range;
        if (method.ret.text) declaredUse(`decl:${key}`, `scope:${key}`, after, method.ret.text, `return-${key}`, 'return');
        bind(`binding:return-${key}`, `decl:${key}`, retType, 'return');
      }
      if (receiverMode !== 'none' && method.owner) bind(`binding:receiver-${key}`, `symbol:${key}`, classTypeId(method.owner), 'receiver');
    }
    for (const method of d.methods) {
      const profile = model.CallableProfile.find(record => record.id === `symbol:${method.key}`);
      if (d.selfParameter && method.receiver === 'explicit_object') {
        // Python spells the receiver as an ordinary first parameter; it is a source parameter, not an implicit this.
        const selfId = `symbol:${method.key}-self`;
        symbol(selfId, 'self', 'parameter', `symbol:${method.key}`);
        declaration(`decl:${method.key}-self`, selfId, `scope:${method.key}`, within('self', methodRanges[method.key]));
        add('ParameterProfile', { id: selfId, binding_kind: 'positional', passing_mode: 'value' });
        declaredTypes.set(selfId, classTypeId(method.owner));
        bind(`binding:decl:${method.key}-self`, `decl:${method.key}-self`, declaredTypes.get(selfId), 'inferred');
        profile.parameter_ids.push(selfId);
      }
      for (const param of method.params) {
        symbol(`symbol:${param.key}`, param.name, 'parameter', `symbol:${method.key}`);
        typedDeclaration(param.key, `scope:${method.key}`, within(param.text, methodRanges[method.key]), param);
        add('ParameterProfile', { id: `symbol:${param.key}`, binding_kind: 'positional', passing_mode: param.mode || 'value' });
        profile.parameter_ids.push(`symbol:${param.key}`);
      }
    }
    for (const method of d.methods) {
      for (const capture of method.captures || []) {
        add('SemanticRelation', contextual({ id: `relation:capture-${method.key}-${capture.symbol}`, source_id: `symbol:${method.key}`,
          target_id: `symbol:${capture.symbol}`, kind: 'captures', site_id: lambdaExpressions[method.key] || `decl:${method.key}`,
          state: 'established', details: { mode: capture.mode } }));
      }
    }

    // Expressions
    function namedExpression(id, scopeId, range, symbolId, role = 'read') {
      add('Expression', { id, scope_id: scopeId, span: sourceSpan(range), kind: 'name', operands: [] });
      reference(`reference:${id}`, id, range, role, symbolId);
      if (declaredTypes.has(symbolId)) bind(`binding:${id}`, id, declaredTypes.get(symbolId), 'inferred');
      return id;
    }
    function literal(id, scopeId, text, range, category, value, type) {
      add('Expression', { id, scope_id: scopeId, span: sourceSpan(within(text, range)), kind: 'literal',
        operands: [], literal: { category, value } });
      if (type) bind(`binding:${id}`, id, typeOf(type), 'inferred');
      return id;
    }
    function selfExpression(id, ctx, range) {
      if (d.selfParameter) return namedExpression(id, ctx.scope, range, selfSymbol(ctx.method));
      add('Expression', { id, scope_id: ctx.scope, span: sourceSpan(range), kind: 'language_specific', operands: [] });
      bind(`binding:${id}`, id, classTypeId(ctx.owner), 'inferred');
      return id;
    }
    const placeType = (spec, ctx) => spec.type ? null : spec.symbol ? declaredTypes.get(spec.symbol)
      : spec.field ? declaredTypes.get(`symbol:${spec.field}`) : classTypeId(ctx.owner);
    function place(id, ctx, parent, spec, role, created) {
      created.push(id);
      if (spec.type) return namedExpression(id, ctx.scope, within(spec.type, parent), `symbol:${spec.type}`, 'type');
      if (spec.symbol) return namedExpression(id, ctx.scope, within(spec.name, parent), spec.symbol, role);
      const field = `symbol:${spec.field}`;
      if (spec.field && !spec.self) return namedExpression(id, ctx.scope, within(nameOf(field), parent), field, role);
      if (!spec.field) return selfExpression(id, ctx, within(spec.self, parent));
      const fieldName = nameOf(field), range = within(`${spec.self}.${fieldName}`, parent), selfId = `${id}-self`;
      created.push(selfId);
      selfExpression(selfId, ctx, { ...range, end: range.start + spec.self.length });
      add('Expression', { id, scope_id: ctx.scope, span: sourceSpan(range), kind: 'member_access', operator: '.',
        operands: [{ role: 'base', expression_id: selfId }] });
      reference(`reference:${id}`, id, { ...range, start: range.end - fieldName.length }, role, field, 'member');
      if (declaredTypes.has(field)) bind(`binding:${id}`, id, declaredTypes.get(field), 'inferred');
      return id;
    }

    function argument(arg, id, range, ctx, created) {
      if (arg.call) return buildCall(arg.call, { ...ctx, range }, created);
      if (arg.lambda) {
        created.push(lambdaExpressions[arg.lambda]);
        return lambdaExpressions[arg.lambda];
      }
      if (arg.place) return place(id, ctx, range, arg.place, 'read', created);
      created.push(id);
      if (arg.literal) return literal(id, ctx.scope, arg.literal, range, arg.category, arg.value, arg.type);
      if (arg.collection) {
        const text = within(arg.collection.text, range);
        const items = arg.collection.items.map((item, index) => argument(item, `${id}-item${index}`, text, ctx, created));
        add('Expression', { id, scope_id: ctx.scope, span: sourceSpan(text), kind: 'collection',
          operands: items.map(expressionId => ({ role: 'element', expression_id: expressionId })) });
        if (arg.collection.type) bind(`binding:${id}`, id, typeOf(arg.collection.type), 'inferred');
        return id;
      }
      if (arg.fnref) {
        // A qualified function value such as Pipeline::cullObjects or Pipeline.CullObjects; it is not a call.
        const spec = arg.fnref, text = within(spec.text, range), baseId = `${id}-base`;
        created.push(baseId);
        namedExpression(baseId, ctx.scope, within(spec.base, text), `symbol:${spec.base}`, 'type');
        add('Expression', { id, scope_id: ctx.scope, span: sourceSpan(text), kind: spec.op === '.' ? 'member_access' : 'language_specific',
          operator: spec.op, operands: [{ role: 'base', expression_id: baseId }] });
        reference(`reference:${id}`, id, { ...text, start: text.end - spec.name.length }, 'read', `symbol:${spec.target}`, 'qualified');
        if (spec.type) bind(`binding:${id}`, id, typeOf(spec.type), 'inferred');
        return id;
      }
      if (arg.op) {
        const text = within(arg.text, range);
        const inner = arg.operand ? argument(arg.operand, `${id}-operand`, text, ctx, created)
          : namedExpression(`${id}-operand`, ctx.scope, within(arg.name, text), arg.symbol);
        if (!arg.operand) created.push(`${id}-operand`);
        add('Expression', { id, scope_id: ctx.scope, span: sourceSpan(text), kind: 'operator', operator: arg.op,
          operands: [{ role: 'operand', expression_id: inner }] });
        if (arg.type) bind(`binding:${id}`, id, typeOf(arg.type), 'inferred');
        return id;
      }
      return namedExpression(id, ctx.scope, within(arg.name, range), arg.symbol);
    }

    function candidateEvidence(resolutionId, callRange, index, target, supporting, boundary) {
      const record = evidence(`evidence:${resolutionId}-${index}`, resolutionId, [target, ...supporting], { boundary },
        [sourceSpan(callRange)], 'inference');
      record.attribute_path = `candidates[${index}]`;
      record.authority = 'inferred';
    }
    function buildCall(spec, ctx, parentCreated) {
      const key = spec.key, callId = `call:${key}`, calleeId = `callee:${key}`;
      const created = trace[key] = [callId, calleeId, `reference:${key}-callee`];
      const callRange = callRanges[key] = spec.open ? balanced(spec.open, ctx.range) : within(spec.text, ctx.range);
      const text = sources[callRange.file];
      const paren = text.indexOf('(', callRange.start);
      const argRange = { file: callRange.file, start: paren + 1, end: callRange.end };
      const argIds = (spec.args || []).map((arg, index) => argument(arg, `expression:${key}-arg${index}`, argRange, ctx, created));
      const calleeRange = spec.construct ? within(spec.name, callRange) : { file: callRange.file, start: callRange.start, end: paren };
      const nameRange = spec.name ? within(spec.name, calleeRange) : calleeRange;
      const isStatic = Boolean(spec.receiver?.type);
      let receiverType = null, receiverKnown = true;
      if (spec.receiver) {
        const receiverId = place(`receiver:${key}`, ctx, calleeRange, spec.receiver, 'read', created);
        receiverType = placeType(spec.receiver, ctx);
        receiverKnown = receiverType !== undefined;
        add('Expression', { id: calleeId, scope_id: ctx.scope, span: sourceSpan(calleeRange), kind: 'member_access',
          operator: '.', operands: [{ role: 'base', expression_id: receiverId }] });
      } else add('Expression', { id: calleeId, scope_id: ctx.scope, span: sourceSpan(calleeRange), kind: 'name', operands: [] });
      add('Expression', { id: callId, scope_id: ctx.scope, span: sourceSpan(callRange),
        kind: spec.construct && d.constructKind !== 'call' ? 'construction' : 'call', operands: [] });
      add('CallProfile', { id: callId, call_kind: spec.construct ? 'constructor' : spec.indirect ? 'indirect' : 'ordinary',
        callee_expression_id: calleeId, arguments: argIds.map(expressionId => ({ expression_id: expressionId, expansion: 'none' })) });
      const calleeText = text.slice(calleeRange.start, calleeRange.end);
      const qualification = spec.receiver && !isStatic ? 'member' : /::|\./.test(calleeText) ? 'qualified' : 'unqualified';
      const external = spec.external ? `symbol:ext-${spec.external}` : null;
      const nameTarget = spec.construct ? `symbol:${spec.class}` : spec.callee ? spec.callee.symbol
        : external || (spec.target ? `symbol:${spec.target}` : null);
      const flows = spec.receiver?.field ? d.receiverFlows?.[spec.receiver.field] : undefined;
      reference(`reference:${key}-callee`, calleeId, nameRange, 'callee', nameTarget, qualification,
        receiverKnown ? 'resolved' : 'partial', flows);
      if (spec.callee && declaredTypes.has(spec.callee.symbol)) bind(`binding:${calleeId}`, calleeId, declaredTypes.get(spec.callee.symbol), 'inferred');
      if (spec.type) bind(`binding:${callId}`, callId, typeOf(spec.type), 'inferred');
      const resolution = `resolution:${callId}`;
      const receiverBinding = spec.receiver && !isStatic ? { receiver_binding: { expression_id: `receiver:${key}`, conversions: [] } } : {};
      if (spec.indirect) {
        // A call through a callable value keeps every supported candidate; none is selected.
        const candidates = spec.indirect.candidates;
        add('Resolution', contextual({ id: resolution, subject_id: callId, state: 'partial',
          candidates: candidates.map(candidate => ({ target_symbol_id: `symbol:${candidate.target}`,
            applicability: candidate.applicability || 'applicable', reason_codes: [], conversions: [] })),
          candidate_set_completeness: 'partial', dispatch_kind: 'indirect', argument_bindings: [], type_substitutions: {},
          reason_codes: spec.indirect.reasons, ...receiverBinding }));
        coverage(`coverage:${resolution}`, callId, 'candidate_scope', 'partial', spec.indirect.reasons);
        candidates.forEach((candidate, index) => candidateEvidence(resolution, callRange, index, `symbol:${candidate.target}`,
          candidate.evidence, candidate.note || indirectBoundary));
      } else if (external) {
        // A functional-interface call selects the interface method; lambdas are possible implementations.
        const parameters = model.CallableProfile.find(profile => profile.id === external).parameter_ids;
        resolved(resolution, callId, external, { dispatch_kind: spec.dispatch, ...receiverBinding,
          argument_bindings: argIds.map((_, index) => ({ parameter_id: parameters[index], argument_positions: [index], conversions: [] })) });
        evidence(`evidence:${key}`, resolution, [external, 'evidence:contracts'], { boundary: externalBoundary }, [sourceSpan(callRange)]);
        if (spec.implementations) {
          add('ImplementationSet', { id: `implementation:${key}`, resolution_id: resolution,
            definition_ids: spec.implementations.map(item => `decl:${item.target}`), completeness: 'partial' });
          spec.implementations.forEach((item, index) => {
            const record = evidence(`evidence:implementation:${key}-${index}`, `implementation:${key}`,
              [`decl:${item.target}`, ...item.evidence], { boundary: item.note || implementationBoundary }, [sourceSpan(callRange)], 'language_rules');
            record.attribute_path = `definition_ids[${index}]`;
          });
        }
      } else if (!spec.target) {
        add('Resolution', contextual({ id: resolution, subject_id: callId, state: 'unsupported', candidates: [],
          candidate_set_completeness: 'unknown', argument_bindings: [], type_substitutions: {},
          reason_codes: ['external_library_call_not_analyzed'] }));
      } else if (!receiverKnown) {
        partial(resolution, callId, `symbol:${spec.target}`, [sourceSpan(callRange)], flows);
      } else {
        const target = `symbol:${spec.target}`;
        const targetMethod = methodsByKey.get(spec.target);
        const parameters = paramKeys.get(spec.target);
        const instanceMember = classKeys.includes(targetMethod.owner) && targetMethod.receiver !== 'none';
        const extra = { dispatch_kind: !spec.construct && instanceMember ? d.dispatch : 'direct' };
        if (spec.receiver && !isStatic) {
          const ownerType = classTypeId(targetMethod.owner);
          extra.receiver_binding = { expression_id: `receiver:${key}`,
            ...(d.selfParameter ? { parameter_id: `symbol:${spec.target}-self` } : {}),
            conversions: receiverType && receiverType !== ownerType ? [
              { kind: 'language_specific', source_type_id: receiverType, target_type_id: ownerType, state: 'established' }
            ] : [] };
        }
        resolved(resolution, callId, target, {
          ...extra,
          argument_bindings: argIds.map((_, index) => parameters[index]
            ? { parameter_id: `symbol:${parameters[index]}`, argument_positions: [index],
              conversions: (spec.conversions?.[index] ? [spec.conversions[index]] : []) } : null).filter(Boolean)
        });
        add('ImplementationSet', { id: `implementation:${key}`, resolution_id: resolution,
          definition_ids: [`decl:${spec.target}`], completeness: 'complete' });
        evidence(`evidence:${key}`, resolution, [target, 'evidence:contracts'], { boundary: d.callBoundary },
          [sourceSpan(callRange)]);
      }
      parentCreated?.push(...created);
      return callId;
    }

    // Conditional blocks come first: calls inside them use the block scope where the language has one.
    const blockScopes = d.blockScopes !== false;
    const conditionalCalls = [];
    const guards = d.guards.map(guard => {
      const file = guard.in ? fileOf(guard.in) : 'example';
      const parentScope = guard.in ? `scope:${guard.in}` : rootScopes[file];
      const statement = body(guard.start, d.end, file);
      const blockId = blockScopes ? `scope:${guard.key}-conditional` : parentScope;
      if (blockScopes) scope(blockId, 'block', parentScope, null, statement);
      if (guard.pattern) {
        symbol(`symbol:${guard.pattern.key}`, guard.pattern.name, 'variable', `symbol:${guard.in}`);
        typedDeclaration(guard.pattern.key, blockId, within(guard.pattern.text, statement), guard.pattern, { visibility: 'local' });
      }
      const ctx = { scope: parentScope, owner: classOwner(guard.in), method: guard.in };
      let conditionId;
      if (guard.cond.place) {
        const conditionRange = within(guard.cond.text, statement), created = [];
        if (guard.cond.op) {
          const operand = place(`condition:${guard.key}-operand`, ctx, conditionRange, guard.cond.place, 'read', created);
          const right = literal(`condition:${guard.key}-literal`, ctx.scope, guard.cond.literal.text, conditionRange,
            guard.cond.literal.category, guard.cond.literal.value);
          conditionId = `condition:${guard.key}`;
          add('Expression', { id: conditionId, scope_id: ctx.scope, span: sourceSpan(conditionRange), kind: 'operator',
            operator: guard.cond.op, operands: [{ role: 'left', expression_id: operand }, { role: 'right', expression_id: right }] });
        } else conditionId = place(`condition:${guard.key}`, ctx, conditionRange, guard.cond.place, 'read', created);
      }
      conditionalCalls.push({ call_id: `call:${guard.call}`, ...(conditionId ? { condition_expression_id: conditionId } : {}),
        condition_text: guard.cond.text, ...(blockScopes ? { scope_id: blockId } : {}) });
      return { ...guard, statement, blockId, conditionId };
    });

    // Loops: the element variable is declared in the loop scope where the language has one.
    const loops = {};
    for (const statement of d.statements.filter(item => item.loop)) {
      const item = statement.loop, file = fileOf(statement.in);
      const range = body(item.start, d.end, file, methodRanges[statement.in].start);
      const scopeId = blockScopes ? `scope:${item.key}` : `scope:${statement.in}`;
      if (blockScopes) scope(scopeId, 'block', `scope:${statement.in}`, null, range);
      loops[item.key] = { range, scope: scopeId };
      const variable = item.variable;
      symbol(`symbol:${variable.key}`, variable.name, 'variable', `symbol:${statement.in}`);
      const header = { file, start: range.start, end: sources[file].indexOf(d.end === 'indent' ? ':' : '{', range.start) };
      typedDeclaration(variable.key, scopeId, within(variable.text, header), variable, { visibility: 'local' });
      namedExpression(`expression:${item.key}-iterable`, `scope:${statement.in}`,
        within(item.iterable.name, { ...header, start: within(variable.text, header).end }), item.iterable.symbol);
    }

    // Imports
    for (const item of d.imports || []) {
      const file = item.file || 'example';
      const range = locate(item.text, 0, file);
      add('Import', { id: `import:${item.key}`, scope_id: item.scope === 'namespace' ? 'scope:Engine' : rootScopes[file],
        span: sourceSpan(range), kind: item.kind, path_segments: item.path, ...(item.relative ? { relative_level: item.relative } : {}),
        bindings: (item.bindings || []).map(name => ({ imported_name: name, wildcard: false })).concat(item.wildcard ? [{ wildcard: true }] : []) });
      reference(`reference:import-${item.key}`, `import:${item.key}`, within(item.pathText, range), 'import',
        item.target ? `symbol:${item.target}` : null);
      for (const [name, target] of Object.entries(item.bindingTargets || {})) {
        // Each imported name is its own reference to the exported symbol.
        reference(`reference:import-${item.key}-${name}`, `import:${item.key}`, within(name, range), 'import', `symbol:${target}`);
      }
      for (const target of item.relations || []) {
        add('SemanticRelation', contextual({ id: `relation:${item.key}`, source_id: `import:${item.key}`,
          target_id: target.startsWith('file:') ? target : `symbol:${target}`, kind: 'imports_from', state: 'established' }));
      }
    }

    // Statements in source order
    for (const statement of d.statements) {
      if (statement.loop) continue;
      const file = statement.in ? fileOf(statement.in) : 'example';
      const guard = guards.find(item => item.call === statement.call?.key);
      const loop = statement.block ? loops[statement.block] : null;
      const moduleRange = { file, start: statement.after ? methodRanges[statement.after].end : 0, end: sources[file].length };
      const ctx = {
        scope: guard ? guard.blockId : loop ? loop.scope : statement.in ? `scope:${statement.in}` : rootScopes[file],
        range: guard ? guard.statement : loop ? loop.range : statement.in ? methodRanges[statement.in] : moduleRange,
        owner: classOwner(statement.in), method: statement.in
      };
      if (statement.assign) {
        const item = statement.assign, range = within(item.text, ctx.range), created = [];
        const target = place(`expression:assign-${item.key}-target`, ctx, range, item.target, 'write', created);
        const afterOperator = { file, start: sources[file].indexOf('=', range.start) + 1, end: range.end };
        const value = namedExpression(`expression:assign-${item.key}-value`, ctx.scope, within(item.value.name, afterOperator), item.value.symbol);
        add('Expression', { id: `expression:assign-${item.key}`, scope_id: ctx.scope, span: sourceSpan(range), kind: 'assignment',
          operator: '=', operands: [{ role: 'target', expression_id: target }, { role: 'value', expression_id: value }] });
      } else if (statement.local) {
        const item = statement.local, initializer = buildCall(statement.init, ctx);
        symbol(`symbol:${item.key}`, item.name, 'variable', `symbol:${statement.in}`);
        typedDeclaration(item.key, ctx.scope, within(item.text, ctx.range), item,
          { initializer_expression_id: initializer, visibility: 'local' });
      } else if (statement.ret) {
        const item = statement.ret;
        namedExpression(`expression:${item.key}`, ctx.scope, within(item.name, within(item.text, ctx.range)), item.symbol);
      } else buildCall(statement.call, ctx);
    }
    for (const [declId, value] of fieldInitializers) model.Declaration.find(record => record.id === declId).initializer_expression_id = value;

    // Executable decorators: an application call with the decorated definition as its implicit operand.
    for (const item of d.decorators || []) {
      const file = fileOf(item.decl);
      const declaration = model.Declaration.find(record => record.id === `decl:${item.decl}`);
      const range = locate(item.text, 0, file);
      const callId = `call:decorate-${item.key}`, calleeId = `callee:decorate-${item.key}`, annotationId = `annotation:${item.key}`;
      add('Annotation', { id: annotationId, declaration_id: declaration.id, span: sourceSpan(range), arguments: [] });
      add('Expression', { id: calleeId, scope_id: declaration.scope_id, span: sourceSpan(within(item.callee, range)), kind: 'name', operands: [] });
      reference(`reference:decorate-${item.key}-callee`, calleeId, within(item.callee, range), 'callee', `symbol:${item.target}`);
      add('Expression', { id: callId, scope_id: declaration.scope_id, span: sourceSpan(range), kind: 'call', operands: [] });
      add('CallProfile', { id: callId, call_kind: 'language_specific', callee_expression_id: calleeId, arguments: [] });
      const resolution = `resolution:${callId}`;
      resolved(resolution, callId, `symbol:${item.target}`, { dispatch_kind: 'direct',
        argument_bindings: [{ parameter_id: `symbol:${item.param}`, argument_positions: [], conversions: [] }] });
      evidence(`evidence:decorate-${item.key}`, resolution, [`symbol:${item.target}`, 'evidence:contracts'], { boundary: d.callBoundary }, [sourceSpan(range)]);
      const operand = evidence(`evidence:decorate-${item.key}-operand`, resolution, [annotationId, declaration.id],
        { rule: 'The decorated definition is the implicit operand of the decorator application; it is not a source argument.' },
        [sourceSpan(range)], 'language_rules');
      operand.attribute_path = 'argument_bindings[0]';
      add('ImplementationSet', { id: `implementation:decorate-${item.key}`, resolution_id: resolution,
        definition_ids: [`decl:${item.target}`], completeness: 'complete' });
      if (item.type) {
        bind(`binding:${callId}`, callId, typeOf(item.type), 'inferred');
        bind(`binding:decl:${item.decl}-decorated`, declaration.id, typeOf(item.type), 'inferred');
      }
      trace[`decorate-${item.key}`] = [annotationId, callId, calleeId, `reference:decorate-${item.key}-callee`];
      callRanges[`decorate-${item.key}`] = range;
    }

    for (const guard of guards) {
      const callId = `call:${guard.call}`;
      model.CallProfile.find(record => record.id === callId).condition = {
        predicate: guard.conditionId ? { kind: 'expression', expression_id: guard.conditionId }
          : { kind: 'unknown', reason: guard.cond.unknown },
        completeness: guard.conditionId ? 'complete' : 'partial'
      };
      const supporting = [...(guard.conditionId ? [guard.conditionId] : []), ...(blockScopes ? [guard.blockId] : [])];
      const conditionEvidence = evidence(`evidence:conditional-${guard.key}`, callId, supporting,
        { boundary: 'The call occurs inside this source conditional block. No branch outcome or path feasibility is asserted.' },
        [sourceSpan(guard.statement)], 'syntax');
      conditionEvidence.authority = 'observed';
      conditionEvidence.attribute_path = 'condition';
      coverage(`coverage:conditional-${guard.key}`, callId, 'condition', guard.conditionId ? 'complete' : 'partial',
        guard.conditionId ? [] : [guard.cond.unknown]);
    }

    // Evidence, coverage, and diagnostics
    evidence('evidence:contracts', contextId, ['unit:example'], { assumptions: d.assumptions });
    const logSpans = files.flatMap(file => {
      const spans = [];
      let offset = 0;
      for (const line of file.code.split('\n')) {
        const match = d.log.exec(line);
        if (match) spans.push(sourceSpan({ file: file.key, start: offset + match.index, end: offset + line.trimEnd().length }));
        offset += line.length + 1;
      }
      return spans;
    });
    coverage('coverage:configuration', 'unit:example', 'configuration', 'partial', ['external_library_sources_not_exported']);
    coverage('coverage:syntax', 'unit:example', 'syntax', 'partial', ['focused_teaching_projection'], logSpans);
    coverage('coverage:declarations', 'unit:example', 'declarations', 'partial', ['project_declarations_only']);
    coverage('coverage:calls', 'unit:example', 'calls', 'partial', ['logging_and_implicit_library_calls_omitted'], logSpans);
    coverage('coverage:types', 'unit:example', 'types', 'partial', d.typeCoverage || ['library_internal_types_not_exported']);
    coverage('coverage:imports', 'unit:example', 'imports', 'partial', ['imported_library_sources_not_analyzed']);
    coverage('coverage:references', 'unit:example', 'references', 'partial', ['focused_project_references_only'], logSpans);
    for (const implementation of model.ImplementationSet) {
      if (implementation.completeness === 'complete') {
        coverage(`coverage:${implementation.id}`, implementation.id, 'implementations', 'complete');
        evidence(`evidence:${implementation.id}`, implementation.id, [implementation.resolution_id, ...implementation.definition_ids],
          { boundary: 'One known source definition within this assessed source. No runtime target completeness is claimed.' });
      } else {
        coverage(`coverage:${implementation.id}`, implementation.id, 'implementations', 'partial', ['callers_outside_assessed_source']);
      }
    }
    add('Diagnostic', contextual({ id: 'diagnostic:projection', severity: 'info', code: 'ILLUSTRATIVE_COVERAGE',
      subject_id: 'unit:example', message: `This hand-authored projection omits logging calls and library overload sets; execution analysis is outside scope. It is not an analyzer export.` }));
    add('Diagnostic', contextual({ id: 'diagnostic:dependency-cycle', severity: 'info', code: 'STRUCTURAL_DEPENDENCY_CYCLE',
      subject_id: 'call:finalize-update', span: sourceSpan(callRanges['finalize-update']),
      message: 'The project member relationships contain a structural cycle, and the functional pipeline calls back into RenderContext through a possible callback target. Cyclic dependencies are permitted; these records do not prove execution, branch outcomes, termination, or simultaneous applicability. The program is not executed.' }));

    // Walkthrough projection
    const ids = new Set(Object.values(model).flatMap(records => records.map(record => record.id)));
    const pick = list => list.filter(id => ids.has(id));
    const byPrefix = (...prefixes) => [...ids].filter(id => prefixes.some(prefix => id.startsWith(prefix)));
    const focusCalls = ['make-context', 'dispatch-execute', 'update-dispatch', 'execute-run-pipeline', 'run-stage'];
    const steps = [
      ['CodeDataset', 'SourceFile', 'Module', 'AnalysisContext', 'AnalysisUnit', ...(model.Import.length ? ['Import'] : [])],
      ['Symbol', 'Declaration', 'Scope', 'TypeProfile', 'CallableProfile', 'ParameterProfile', 'SemanticRelation'],
      ['Expression', 'CallProfile', 'Reference', ...(model.Annotation.length ? ['Annotation'] : [])],
      ['Type', 'TypeUse', 'TypeBinding'],
      ['Resolution', 'Evidence'],
      ['ImplementationSet', 'Evidence', 'Coverage', 'Diagnostic', 'Scope', 'Expression', 'SemanticRelation']
    ];
    const functionalIds = ['symbol:run-pipeline', 'decl:run-pipeline', 'scope:run-pipeline', 'symbol:make-stage', 'symbol:stage-lambda',
      'decl:stage-lambda', 'scope:stage-lambda', 'symbol:wrapper', 'decl:wrapper', 'symbol:finalize-lambda', 'decl:finalize-lambda',
      'symbol:module-pipeline', 'decl:module-pipeline', 'symbol:pipeline', 'decl:pipeline', 'symbol:Pipeline', 'decl:Pipeline',
      'scope:file-pipeline', 'relation:capture-stage-lambda-make-stage-label', 'relation:capture-wrapper-traced-step'];
    const stepRecordIds = [
      null,
      pick(['symbol:Engine', 'symbol:SceneManager', 'symbol:RenderContext', 'symbol:dispatch', 'symbol:scene-ctor', 'symbol:ctor-name',
        'decl:SceneManager', 'decl:RenderContext', 'decl:SceneManager-impl', 'decl:dispatch', 'decl:ctor-name',
        'scope:Engine', 'scope:SceneManager', 'scope:SceneManager-impl', 'scope:dispatch', ...functionalIds]),
      pick([...focusCalls.flatMap(key => trace[key] || []), ...(trace['decorate-cull'] || []), 'expression:lambda-finalize-lambda']),
      [...pick([...types].filter(id => model.Type.some(record => record.id === id))),
        ...byPrefix('typeuse:active-context', 'typeuse:owner-manager', 'binding:decl:active-context', 'binding:decl:owner-manager',
          'binding:decl:manager-variable', 'binding:typeuse:active-context', 'binding:typeuse:owner-manager', 'binding:call:make-context',
          'binding:receiver-dispatch', 'typeuse:alias-', 'typeuse:run-', 'binding:decl:run-', 'binding:decl:cull-decorated')],
      pick(['update-dispatch', 'dispatch-execute', 'finalize-update', 'main-set-context', 'make-context', 'execute-run-pipeline',
        'run-stage', 'run-complete', 'wrapper-step']
        .flatMap(key => [`resolution:call:${key}`, `resolution:reference:${key}-callee`, `evidence:resolution:call:${key}-0`,
          `evidence:resolution:call:${key}-1`])),
      pick([...byPrefix('implementation:', 'relation:capture-'), 'evidence:contracts', 'evidence:conditional-dispatch', 'evidence:conditional-finalize',
        'coverage:references', 'coverage:calls', 'diagnostic:dependency-cycle', 'diagnostic:projection',
        ...conditionalCalls.flatMap(record => [record.scope_id, record.condition_expression_id])])
    ];
    const line = range => {
      const text = sources[range.file || 'example'];
      return { file: range.file || 'example', start: range.start, end: text.indexOf('\n', range.start) < 0 ? text.length : text.indexOf('\n', range.start) };
    };
    const excerpt = (caption, range) => ({ caption, span: sourceSpan(range) });
    const firstClass = classRanges[d.classes[0].key];
    const headerEnd = code.slice(0, firstClass.start).trimEnd().length;
    const fieldRange = key => within(d.fields.find(item => item.key === key).text, classRanges[d.fields.find(item => item.key === key).owner]);
    const signature = key => line(methodRanges[key]);
    const excerpts = [
      [headerEnd > 0 ? excerpt('Imports and module-level declarations are source observations; the project import connects the second file.', { start: 0, end: headerEnd })
        : excerpt('The first class declaration begins this source file.', line(firstClass)),
        excerpt('Two cooperating classes are declared in this file.', line(firstClass)),
        excerpt('The functional pipeline is a second SourceFile with top-level functions.', signature('run-pipeline'))],
      [excerpt('A class member declaration has its own symbol and owner.', fieldRange('owner-manager')),
        excerpt('A method declaration introduces one callable symbol.', methodRanges.dispatch),
        excerpt('A factory returns a closure: the lambda is a callable symbol that captures label.', methodRanges['make-stage'])],
      [excerpt('A construction or factory call keeps its argument expressions.', callRanges['make-context']),
        excerpt('A receiver is the callee member-access base.', callRanges['dispatch-execute']),
        excerpt('A higher-order call passes stages and a callback lambda as ordinary arguments.', callRanges['execute-run-pipeline']),
        excerpt('A call through a parameter is an indirect invocation of a callable value.', callRanges['run-stage'])],
      [excerpt('A field type spelling is preserved with its structure.', fieldRange('active-context')),
        excerpt('The back-reference field stores a type, not ownership.', fieldRange('owner-manager')),
        excerpt('A local variable obtains its type from its initializer.', within(d.statements.find(item => item.local).local.text, methodRanges.main)),
        excerpt('Function types describe callable values without naming a callable symbol.', signature('run-pipeline'))],
      [excerpt('A known receiver type selects a project member; execution is not assessed.', callRanges['dispatch-execute']),
        excerpt('The reverse member call has its own resolution.', callRanges['finalize-update']),
        excerpt(model.ImplementationSet.some(item => item.id === 'implementation:run-stage')
          ? 'An interface call selects the interface method; source lambdas remain possible implementations.'
          : 'An indirect call keeps evidence-backed candidates and selects none.', callRanges['run-stage'])],
      [...guards.filter(guard => ['dispatch', 'finalize'].includes(guard.key)).map((guard, index) => excerpt(index === 0
        ? 'Retain this conditional source dependency without proving the branch executes.'
        : 'The reciprocal relationship forms a structural dependency cycle.', guard.statement)),
      excerpt('The pipeline reaches back into RenderContext only through a possible callback target.', methodRanges['finalize-lambda'])]
    ];

    const tour = [
      { text: `Your ${d.label} example has two source files: an object-oriented engine and a functional pipeline module that the engine uses. Each SourceFile preserves its entire displayed source; SourceSpan points to UTF-8 byte ranges in one of them. AnalysisContext states ${d.settingsText}. ${d.tourNotes[0]}`,
        caution: 'Analysis reads these immutable inputs without transforming them. Imported library contents are not exported; Coverage is explicitly partial and logging statements are omitted.' },
      { text: `SceneManager and RenderContext each have one type symbol, and each method or constructor has one callable symbol. The pipeline’s functions, local functions, and lambdas are callable symbols too, owned by their module or enclosing callable. Declaration records connect symbols to source ranges and scopes; TypeProfile, CallableProfile, and ParameterProfile describe them, and captures relations record the variables a closure uses. ${d.tourNotes[1]}`,
        caution: 'A symbol’s owner is not the same thing as a source location. Lexical scope and semantic ownership are distinct, and a lambda’s enclosing method does not become the caller of the calls in its body.' },
      { text: `A construction or factory call, a call with an explicit receiver, a call on the enclosing object, and a call through a callable value are each recorded as syntax first. The callee member access holds the receiver as its base operand, and CallProfile holds the callee and the ordered arguments; a lambda argument is a lambda Expression that introduces its callable. ${d.tourNotes[2]}`,
        caution: 'Callee and arguments live only in CallProfile. Passing a lambda as an argument does not establish that it is called; semantic receiver conversions belong in binding records.' },
      { text: `A spelling is not a semantic type. TypeUse preserves what was written; TypeBinding gives fields, parameters, expressions, and locals a contextual type value. Function types describe callable values independently of any callable symbol. ${d.tourNotes[3]}`,
        caution: 'A back-reference field stores a type, not ownership of the target; it is also not owner_symbol_id, which belongs to the class declaring the field. Reciprocal references and cyclic calls do not imply a lifetime cycle.' },
      { text: `The project’s members have declaration-level targets only where the receiver or callee is established. A call through a callable value keeps every supported candidate, each backed by evidence of the arguments, returns, and collection elements that reach it, and selects none. ${d.tourNotes[4]}`,
        caution: 'Only resolved records have selected_target_id. A matching name alone does not establish a possible dependency: candidates need evidence. A function reachable from callers outside the assessed source keeps a partial candidate set even when one candidate is found.' },
      { text: `SceneManager and RenderContext depend on each other through calls and type bindings. RenderContext also depends on the pipeline, and the pipeline reaches back into RenderContext through a possible callback target. Aggregate these occurrences into component relationships while retaining their supporting records and static contexts. ${d.tourNotes[5]}`,
        caution: 'The reciprocal relationships form permitted structural cycles. A call inside a conditional remains a dependency without proving the branch executes, and a possible callback target is not a claim that the callback runs. Neither conformance level requires execution order, path feasibility, or runtime target prediction.' }
    ];
    const notes = [
      'Both source files are preserved. Imported library sources are not fabricated; Import directives remain visible as Import records, and the project import resolves to the pipeline module.',
      `The classes, methods, functions, and lambdas share symbols with their declarations. ${d.noteIdentity}`,
      'Nested argument calls, collections, and lambdas are stored as separate Expression records. Explicit receivers live in member-access operands; CallProfile alone stores the callee and source arguments.',
      d.noteTypes,
      d.noteResolution,
      'References, resolutions, type bindings, and capture relations support derived component dependencies. Conditional blocks and callback candidates retain their relationships without execution claims. ImplementationSet is optional source-definition knowledge.'
    ];
    return {
      id: d.id, label: d.label, filename: d.filename, code, files: files.map(({ id, filename, code: text }) => ({ id, filename, code: text })),
      model, steps, stepRecordIds, excerpts, conditionalCalls, notes, tour,
      contractsNote: 'Stated library contracts and incomplete external-library coverage',
      sourceNote: 'This teaching input is hand-authored for the Code Graph model. Each file is preserved unchanged in its SourceFile.content; logging statements are intentionally omitted from the record projection.'
    };
  };
})();
