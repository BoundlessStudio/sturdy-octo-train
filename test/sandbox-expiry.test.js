import assert from 'node:assert/strict';
import test from 'node:test';
import { handleBuilder } from '../lib/builder.js';
import { sweepExpiredSandboxes } from '../lib/sandbox-expiry.js';

const env = { AGENT37_API_KEY: 'test-key' };
const now = 1_794_000_000;
const metadata = {
  scrollworks_app: 'scrollworks-v1',
  scrollworks_owner: 'owner',
  scrollworks_state: JSON.stringify({ stage: 'ready', updatedAt: now * 1000 }),
};

function instance(id, overrides = {}) {
  return { id, name: 'Scrollworks build', template: 'agent37-hermes', status: 'sleeping', created: now - 3600, metadata, ...overrides };
}

test('local cleanup deletes only Scrollworks sandboxes at least one hour old', async t => {
  t.mock.method(Date, 'now', () => now * 1000);
  const deleted = [];
  const expired = instance('expired001');
  const gone = instance('expired002', { status: 'running' });
  const data = [
    instance('current001', { created: now - 3599 }),
    instance('outside001', { metadata: { ...metadata, scrollworks_app: 'another-app' } }),
    instance('outside002', { name: 'Another workspace app' }),
    instance('noage00001', { created: null }),
    expired,
    gone,
  ];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method === 'GET') return Response.json({ data });
    assert.equal(options.method, 'DELETE');
    const id = new URL(url).pathname.split('/').at(-1);
    deleted.push(id);
    return new Response(null, { status: id === gone.id ? 404 : 204 });
  });

  assert.deepEqual(await sweepExpiredSandboxes(env), { expired: 2, deleted: 2, failed: 0 });
  assert.deepEqual(deleted.sort(), [expired.id, gone.id]);
});

test('expired previews are rejected at the deadline before waking the instance', async t => {
  t.mock.method(Date, 'now', () => now * 1000);
  const expired = instance('expired001');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.agent37.com/v1/instances/' + expired.id);
    calls.push(options.method);
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json(expired);
  });
  const request = new Request('https://scroll.rgbknights.com/api/builds/' + expired.id + '/preview/');
  assert.equal((await handleBuilder(request, env, 'someone-else')).status, 404);
  assert.deepEqual(calls, ['GET']);
  assert.equal((await handleBuilder(request, env, 'owner')).status, 410);
  assert.deepEqual(calls, ['GET', 'GET', 'DELETE']);
});

test('local cleanup reports failures so the next pass can retry', async t => {
  t.mock.method(Date, 'now', () => now * 1000);
  t.mock.method(globalThis, 'fetch', async (_url, options) => options.method === 'GET'
    ? Response.json({ data: [instance('expired001')] })
    : Response.json({ error: { code: 'try_again' } }, { status: 409 }));
  assert.deepEqual(await sweepExpiredSandboxes(env), { expired: 1, deleted: 0, failed: 1 });
});
