import { readFile, writeFile } from 'node:fs/promises';

const filename = 'Code Graph Data Model v2.md';
const source = await readFile(new URL(filename, import.meta.url), 'utf8');
await writeFile(new URL('model-data.js', import.meta.url),
  `// Generated from ${filename} by node build-model.mjs.\nwindow.CODE_GRAPH_SOURCE = ${JSON.stringify(source)};\n`);
console.log(`Updated model-data.js from ${filename}.`);
