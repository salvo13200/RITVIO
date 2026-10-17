import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
for (const path of ['README.md', 'docs/FASE-1.md', 'docs/API.md', 'docs/openapi.json', 'database/001_initial.sql', '.env.example']) {
  assert(existsSync(fileURLToPath(new URL(path, root))), `Artefatto mancante: ${path}`);
}
const spec = JSON.parse(read('docs/openapi.json'));
assert.equal(spec.openapi, '3.1.0');
assert(spec.components.securitySchemes.appSession);
const resolve = (pointer) => {
  assert(pointer.startsWith('#/'), `Riferimento esterno non verificabile: ${pointer}`);
  return pointer.slice(2).split('/').reduce((value, key) => value?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], spec);
};
function walk(value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref) assert(resolve(value.$ref), `Riferimento inesistente: ${value.$ref}`);
  if (value.type === 'object' && value.properties) {
    for (const name of value.required ?? []) assert(name in value.properties, `Campo required senza schema: ${name}`);
  }
  for (const child of Object.values(value)) walk(child);
}
walk(spec);
const operationIds = new Set();
const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
let operations = 0;
for (const [path, verbs] of Object.entries(spec.paths)) {
  const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  for (const [method, operation] of Object.entries(verbs)) {
    assert(methods.has(method), `Metodo non previsto: ${method}`);
    assert(!operationIds.has(operation.operationId), `operationId duplicato: ${operation.operationId}`);
    operationIds.add(operation.operationId);
    assert(operation.summary);
    assert([2, 3, 4, 5].includes(operation['x-phase']));
    const keys = new Set();
    for (const parameter of operation.parameters ?? []) {
      assert(!keys.has(`${parameter.in}:${parameter.name}`), `Parametro duplicato in ${path}`);
      keys.add(`${parameter.in}:${parameter.name}`);
      if (parameter.in === 'path') {
        assert(placeholders.includes(parameter.name), `Parametro path estraneo: ${parameter.name}`);
        assert.equal(parameter.required, true);
      }
    }
    for (const name of placeholders) assert(keys.has(`path:${name}`), `Parametro path mancante: ${path}/${name}`);
    assert(Object.keys(operation.responses).some((code) => /^[23]\d\d$/.test(code)), `Nessun successo in ${method} ${path}`);
    if (path.startsWith('/me')) assert(!operation.security || operation.security.length > 0, `/me non può essere anonimo: ${path}`);
    if (keys.has('header:If-Match')) assert(operation.responses[409] && operation.responses[428], `Errori di revisione mancanti: ${path}`);
    operations++;
  }
}
const youtube = spec.components.schemas.YouTubePlayback;
assert.equal(youtube.properties.capabilities.properties.background.const, false);
assert.equal(youtube.properties.capabilities.properties.offline.const, false);
assert(!('url' in youtube.properties), 'Il player YouTube non deve ricevere un URL audio');
const resolverPlayback = spec.components.schemas.ResolverYouTubePlayback;
assert.equal(resolverPlayback.properties.mode.const, 'youtube-audio-resolver');
assert.equal(resolverPlayback.properties.accessMethod.const, 'unofficial-extraction');
assert.equal(resolverPlayback.properties.capabilities.properties.offline.const, false);
assert.equal(resolverPlayback.properties.url.pattern, '^/v1/stream/[a-f0-9]{64}$');
assert(resolverPlayback.required.includes('expiresAt'));

const sql = read('database/001_initial.sql');
const tables = [...sql.matchAll(/CREATE TABLE ritvio\.([a-z_]+)/g)].map((match) => match[1]);
assert.equal(new Set(tables).size, tables.length, 'Tabella duplicata');
assert(sql.includes('REVOKE ALL ON SCHEMA ritvio FROM PUBLIC;'));
assert(sql.includes('DEFERRABLE INITIALLY DEFERRED'));
assert(sql.trimEnd().endsWith('COMMIT;'));
for (const required of ['users', 'sessions', 'media_refs', 'media_metadata', 'playlists', 'playlist_members', 'playlist_items', 'search_cache', 'provider_budgets']) {
  assert(tables.includes(required), `Tabella essenziale mancante: ${required}`);
}
const env = read('.env.example');
assert(!env.includes('YOUTUBE_API_KEY')); 
assert(!env.includes('EXPERIMENTAL_ENABLED')); 
assert(env.includes('APP_ACCENT="#C4B5FD"'));
console.log(`Verifica completata: ${operations} operazioni, ${Object.keys(spec.components.schemas).length} schemi API, ${tables.length} tabelle dichiarate.`);
console.log('Riferimenti e parametri coerenti. PostgreSQL, servizi e streaming non eseguiti in Fase 1.');
