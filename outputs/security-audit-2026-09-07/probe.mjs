// HISTORICAL baseline reproducer: its vulnerability-present assertions are expected
// to fail after repairs. Run apps/api/tests/data-security.test.mjs for regression.
// Local-only audit: synthetic users, MemoryStore, no database or external AI.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createOfferFlowServer } from '../../apps/api/src/server.ts';
import { loadApiConfig } from '../../apps/api/src/config.ts';
import { MemoryStore } from '../../apps/api/src/store/memory-store.ts';
import { createEmptyPersonalProfile } from '../../packages/domain/src/profile.ts';
import { createResumeTailorProvider } from '../../apps/api/src/ai/resume-tailor.ts';

test('local security audit (diagnostic assertions, not a security certification)', async (t) => {
  const store = new MemoryStore({ persistence: false });
  const config = { ...loadApiConfig({}), host: '127.0.0.1', port: 0 };
  const app = createOfferFlowServer({ config, store });
  app.server.listen(0, config.host);
  await once(app.server, 'listening');
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const users = ['a', 'b'].map(name => store.createUser(`audit-${name}@example.invalid`, `Synthetic ${name}`, 'audit-only-password'));
  const tokens = users.map(user => store.createSession(user.id, 'web', new Date(Date.now() + 3600000).toISOString()).accessToken);
  async function req(path, token, method = 'GET', body, extraHeaders = {}) {
    const response = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, payload: await response.json() };
  }
  const profile = { ...createEmptyPersonalProfile(), fullName: 'AUDIT_ONLY_A', idNumber: 'AUDIT_ID_NOT_REAL', healthStatus: 'AUDIT_HEALTH', familyMembers: [{ name: 'AUDIT_FAMILY' }], extraFields: { localOnlySentinel: 'AUDIT_PRIVATE' } };
  const now = new Date().toISOString();
  const template = { id: 'audit-template', name: 'Synthetic template', profile, origin: 'extension', createdAt: now, updatedAt: now };
  const document = { schemaVersion: 1, id: template.id, title: template.name, profile, template: {}, createdAt: now, updatedAt: now };
  const application = { id: 'audit-application', company: 'AUDIT_ONLY_COMPANY_A', position: 'Synthetic role', stage: 'applied', sourceUrl: 'https://example.invalid/job', sourceHost: 'example.invalid', responsibilities: [], requirements: [], events: [], createdAt: now, updatedAt: now };

  await t.test('anonymous private routes return 401', async () => {
    for (const path of ['/v1/applications', '/v1/resume-templates', '/v1/resume-versions', '/v1/account/export']) assert.equal((await req(path)).status, 401);
  });
  await t.test('reproduces unrestricted profile upload and round trip', async () => {
    assert.equal((await req('/v1/resume-templates/sync', tokens[0], 'POST', { templates: [template], userId: users[1].id })).status, 200);
    const saved = await req(`/v1/resume-templates/${template.id}`, tokens[0]);
    assert.equal(saved.payload.data.template.profile.idNumber, profile.idNumber);
    assert.deepEqual(saved.payload.data.template.profile.familyMembers, profile.familyMembers);
    assert.equal(saved.payload.data.template.profile.extraFields.localOnlySentinel, 'AUDIT_PRIVATE');
    assert.equal((await req('/v1/resume-templates', tokens[1])).payload.data.templates.length, 0);
  });
  await t.test('B cannot list/read/update/delete A template', async () => {
    const path = `/v1/resume-templates/${template.id}`;
    assert.equal((await req(path, tokens[1])).status, 404);
    assert.equal((await req(path, tokens[1], 'PATCH', { name: 'attempt', document })).status, 404);
    assert.equal((await req(path, tokens[1], 'DELETE')).status, 404);
  });
  await t.test('same template ID in two accounts does not overwrite A', async () => {
    assert.equal((await req('/v1/resume-templates/sync', tokens[1], 'POST', { templates: [{ ...template, profile: { ...profile, fullName: 'AUDIT_ONLY_B' } }] })).status, 200);
    assert.equal((await req(`/v1/resume-templates/${template.id}`, tokens[0])).payload.data.template.profile.fullName, 'AUDIT_ONLY_A');
    assert.equal((await req(`/v1/resume-templates/${template.id}`, tokens[1])).payload.data.template.profile.fullName, 'AUDIT_ONLY_B');
  });
  await t.test('B cannot list/read/update/delete A application or obtain it via sync', async () => {
    assert.equal((await req('/v1/applications', tokens[0], 'POST', { application, userId: users[1].id })).status, 201);
    assert.equal((await req('/v1/applications', tokens[1])).payload.data.applications.length, 0);
    const path = `/v1/applications/${application.id}`;
    assert.equal((await req(path, tokens[1])).status, 404);
    const denied = await req(path, tokens[1], 'PATCH', { application, expectedRevision: 1 });
    assert.equal(denied.status, 409); // No B-owned record: revision conflict, no A data.
    const absent = await req('/v1/applications/audit-nonexistent', tokens[1], 'PATCH', { application: { ...application, id: 'audit-nonexistent' }, expectedRevision: 1 });
    assert.equal(absent.status, denied.status);
    assert.deepEqual(absent.payload, denied.payload);
    assert.equal((await req(path, tokens[0])).payload.data.item.application.company, 'AUDIT_ONLY_COMPANY_A');
    assert.equal((await req(`${path}?expectedRevision=1`, tokens[1], 'DELETE')).status, 404);
    const synced = await req('/v1/applications/sync', tokens[1], 'POST', { deviceId: 'audit-b', cursor: '0', changes: [] });
    assert.equal(synced.status, 200);
    assert.equal(synced.payload.data.changes.length, 0);
  });
  let task;
  await t.test('B cannot access A tailoring task or resume version', async () => {
    const created = await req('/v1/tailor-tasks', tokens[0], 'POST', { sourceResumeId: template.id, sourceResumeName: template.name, sourceProfile: profile, job: { company: 'Synthetic', position: 'Synthetic', sourceUrl: '', responsibilities: [], requirements: [] } });
    assert.equal(created.status, 201);
    task = created.payload.data;
    assert.equal((await req(`/v1/tailor-tasks/${task.task.id}`, tokens[1])).status, 404);
    assert.equal((await req(`/v1/tailor-tasks/${task.task.id}`, tokens[1], 'POST')).status, 404);
    const path = `/v1/resume-versions/${task.version.version.id}`;
    assert.equal((await req(path, tokens[1])).status, 404);
    assert.equal((await req(path, tokens[1], 'PATCH', { document: task.version.version.document, expectedRevision: 1 })).status, 404);
    assert.equal((await req(`${path}?expectedRevision=1`, tokens[1], 'DELETE')).status, 404);
  });
  await t.test('export excludes B data but reproduces missing master resume export', async () => {
    const exported = (await req('/v1/account/export', tokens[0])).payload.data;
    assert.equal(exported.user.id, users[0].id);
    assert.equal(JSON.stringify(exported).includes('AUDIT_ONLY_B'), false);
    assert.equal('resumeTemplates' in exported, false);
    assert.equal(exported.resumeVersions.length, 1);
  });
  await t.test('untrusted cookie Origin and non-admin access are rejected', async () => {
    assert.equal((await req('/v1/auth/device-codes', undefined, 'POST', {}, { Cookie: `${config.cookieName}=${tokens[0]}`, Origin: 'https://untrusted.example.invalid' })).status, 403);
    assert.equal((await req('/v1/admin/dashboard', tokens[0])).status, 403);
  });
  await t.test('reproduces full profile retained and returned in deletion tombstones', async () => {
    assert.equal((await req(`/v1/resume-templates/${template.id}`, tokens[0], 'DELETE')).status, 200);
    assert.equal((await req(`/v1/resume-templates/${template.id}`, tokens[0])).status, 404);
    const synced = await req('/v1/resume-templates/sync', tokens[0], 'POST', { templates: [] });
    const deleted = synced.payload.data.templates.find(item => item.id === template.id);
    assert.ok(deleted.deletedAt);
    assert.equal(deleted.profile.idNumber, 'AUDIT_ID_NOT_REAL');
  });
  await t.test('account deletion revokes session; reproduces MemoryStore-only leftover templates', async () => {
    assert.equal((await req('/v1/account', tokens[0], 'DELETE', { confirmation: 'DELETE', password: 'audit-only-password' })).status, 200);
    assert.equal((await req('/v1/account/export', tokens[0])).status, 401);
    assert.equal(store.listApplications(users[0].id).length, 0);
    assert.equal(store.listResumeVersions(users[0].id).length, 0);
    assert.equal(store.listResumeTemplates(users[0].id, true).length, 1);
  });
  await t.test('AI mock confirms raw evidence is sent, but structured ID field is not directly sent', async () => {
    const originalFetch = globalThis.fetch;
    let outbound;
    globalThis.fetch = async (_url, init) => {
      outbound = JSON.parse(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
    };
    try {
      const provider = createResumeTailorProvider({ ...config, aiApiKey: 'synthetic-not-a-secret', aiBaseUrl: 'https://example.invalid', aiModel: 'mock' });
      await provider.generate({ company: 'Synthetic', position: 'Synthetic', sourceUrl: '', responsibilities: [], requirements: [] }, profile, { rawText: 'AUDIT_RAW_PRIVATE_SENTINEL' });
      assert.ok(JSON.stringify(outbound).includes('AUDIT_RAW_PRIVATE_SENTINEL'));
      assert.equal(JSON.stringify(outbound).includes('AUDIT_ID_NOT_REAL'), false);
    } finally { globalThis.fetch = originalFetch; }
  });
});
