import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, access } from 'node:fs/promises';
import { createOfferFlowServer } from '../../apps/api/src/server.ts';
import { loadApiConfig } from '../../apps/api/src/config.ts';
import { MemoryStore } from '../../apps/api/src/store/memory-store.ts';
import { createApiClient } from '../../packages/api-client/src/index.ts';
import { isApplicationSyncRequest } from '../../packages/contracts/src/applications.ts';
import { createResumeDocument } from '../../packages/domain/src/resumes.ts';

// Isolated local server; no database, real credentials, AI, mail, or remote feed.
let generations = 0;
const app = createOfferFlowServer({
  config: { ...loadApiConfig({}), opportunitySourceUrl: undefined, opportunitySeedPath: undefined },
  store: new MemoryStore({ persistence: false }),
  assistant: { model: 'audit-local', async *generate() { generations++; yield 'audit response'; } }
});
app.server.listen(0, '127.0.0.1');
await once(app.server, 'listening');
const base = `http://127.0.0.1:${app.server.address().port}`;
let token;
async function req(path, body, headers = {}) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  let payload; try { payload = JSON.parse(text); } catch {}
  return { status: response.status, payload, text };
}
try {
  token = (await req('/v1/auth/demo', {})).payload.data.accessToken;
  const conversation = (await req('/v1/conversations', {})).payload.data.conversation;
  const body = { content: 'hello audit', clientMessageId: 'c779f746-e04d-4d78-92df-e418846ad282' };
  await req(`/v1/conversations/${conversation.id}/messages`, body);
  await req(`/v1/conversations/${conversation.id}/messages`, body);
  const messages = (await req(`/v1/conversations/${conversation.id}`)).payload.data.messages;
  assert.equal(messages.filter(m => m.role === 'user').length, 1);
  assert.equal(messages.filter(m => m.role === 'assistant').length, 2);
  assert.equal(generations, 2);
  console.log('CONFIRMED duplicate clientMessageId: one user message, two assistant generations');

  const malformed = { deviceId: 'audit', changes: [{ changeId: 'bad', baseRevision: 0, application: {} }] };
  assert.equal(isApplicationSyncRequest(malformed), true);
  console.log('CONFIRMED sync contract accepts application: {}');

  const code = (await req('/v1/auth/device-codes', {})).payload.data.code;
  token = undefined;
  for (let i = 0; i < 21; i++) await req('/v1/auth/login', { email: 'absent@example.invalid', password: 'wrong' }, { 'x-forwarded-for': '192.0.2.1' });
  assert.equal((await req('/v1/auth/login', { email: 'absent@example.invalid', password: 'wrong' }, { 'x-forwarded-for': '192.0.2.1' })).status, 429);
  assert.equal((await req('/v1/auth/login', { email: 'absent@example.invalid', password: 'wrong' }, { 'x-forwarded-for': '192.0.2.2' })).status, 401);
  console.log('CONFIRMED changing untrusted X-Forwarded-For bypasses auth rate limit');
  const exchanged = await req('/v1/auth/device-token', { code, deviceId: 'unbound-device', deviceName: 'audit' }, { 'x-forwarded-for': '192.0.2.1' });
  assert.equal(exchanged.status, 200);
  token = exchanged.payload.data.accessToken;
  console.log('CONFIRMED device code exchanges without origin/device binding, even on auth-limited IP');

  const document = createResumeDocument({ id: 'audit-template', title: 'audit', profile: { experiences: [], projects: [], campusExperiences: [], education: [], awards: [] } });
  assert.equal((await req('/v1/resume-templates', { id: document.id, name: 'audit', document })).status, 201);
  const templates = (await req('/v1/resume-templates')).payload.data.templates;
  assert.equal(templates.length, 1);
  const exported = (await req('/v1/account/export')).payload.data;
  assert.equal('resumeTemplates' in exported, false);
  assert.equal((await req('/v1/chat-context')).payload.data.contexts.some(c => c.kind === 'resume'), false);
  console.log('CONFIRMED saved base resume missing from account export and chat context');

  const partial = [{ type: 'message.started', message: { id: 'audit', status: 'streaming' } }, { type: 'message.delta', messageId: 'audit', delta: 'partial' }];
  const client = createApiClient({ baseUrl: 'http://unused.invalid', fetchImpl: async () => new Response(partial.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } }) });
  const events = [];
  for await (const e of client.chat.sendMessage('audit', body)) events.push(e);
  assert.equal(events.length, 2);
  console.log('CONFIRMED SSE EOF without completed/done accepted as normal completion');

  const release = JSON.parse(await readFile(new URL('../../apps/web/public/extension-release.json', import.meta.url)));
  let exists = true; try { await access(new URL('../../apps/web/public' + release.downloadUrl, import.meta.url)); } catch { exists = false; }
  assert.equal(exists, false);
  console.log(`CONFIRMED configured extension ${release.version} ZIP missing from public directory`);
} finally {
  app.server.closeAllConnections();
  await new Promise(resolve => app.server.close(resolve));
}
