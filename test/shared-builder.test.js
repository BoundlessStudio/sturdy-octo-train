import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import test from 'node:test';
import { handleBuilder } from '../lib/builder.js';
import { draftPlan } from '../public/plan.js';
import { createSharedBuilder } from '../sandbox/shared-builder.mjs';

test('one instance serves separate owner folders and removes expired previews in the background', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'scrollworks-shared-'));
  const token = 'test-instance-token-at-least-32-characters';
  const firstOwner = 'a'.repeat(64);
  const secondOwner = 'b'.repeat(64);
  const firstIdea = 'Cedar Workshop furniture catalog with a gallery';
  const secondIdea = 'Harbor Light events calendar and contact site';
  let now = Date.now();
  const builder = createSharedBuilder({ directory, token, now: () => now, sweepMs: 20, generate: async (prompt, phase) => {
    const idea = prompt.includes(firstIdea) ? firstIdea : secondIdea;
    if (phase === 'planning') return JSON.stringify(draftPlan(idea));
    return '<!doctype html><html lang="en"><body><main><h1>' + idea + '</h1></main></body></html>';
  } });
  builder.listen(0, '127.0.0.1');
  await once(builder, 'listening');
  t.after(async () => {
    builder.close();
    await once(builder, 'close');
    rmSync(directory, { recursive: true, force: true });
  });

  const origin = 'http://127.0.0.1:' + builder.address().port;
  const env = { AGENT37_API_KEY: 'test-api-key', AGENT37_SHARED_INSTANCE_ID: 'sharedtest',
    SCROLLWORKS_INSTANCE_TOKEN: token, AGENT37_PREVIEW_ORIGIN: origin, AGENT37_API_BASE: 'http://127.0.0.1:1' };
  const api = (owner, path, method = 'GET', body) => handleBuilder(new Request('https://scrollworks.test' + path, {
    method, ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  }), env, owner);
  const events = async response => (await response.text()).trim().split('\n').map(line => JSON.parse(line));
  const start = async (owner, idea) => {
    const log = await events(await api(owner, '/api/builds', 'POST', { idea }));
    assert.equal(log.at(-1).type, 'plan');
    return { id: log.find(event => event.type === 'sandbox').id, plan: log.at(-1).plan };
  };
  assert.equal((await fetch(origin + '/scrollworks/health')).status, 401);
  assert.deepEqual(await (await api(firstOwner, '/api/config')).json(), { live: true });
  const first = await start(firstOwner, firstIdea);
  now += 30_000;
  const second = await start(secondOwner, secondIdea);
  const firstPath = '/api/builds/' + first.id;
  const secondPath = '/api/builds/' + second.id;
  assert.notEqual(first.id, second.id);
  assert.equal((await api(secondOwner, firstPath)).status, 404);
  assert.equal((await api(secondOwner, firstPath, 'DELETE')).status, 404);

  const log = await events(await api(firstOwner, firstPath + '/compile', 'POST', { choices: { [first.plan.features[0].id]: 'keep' } }));
  assert.equal(log.at(-1).type, 'ready');
  assert.equal((await api(secondOwner, firstPath + '/preview/')).status, 404);
  const preview = await api(firstOwner, firstPath + '/preview/');
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /Cedar Workshop/);
  assert.match(preview.headers.get('content-security-policy'), /sandbox allow-scripts/);

  now += 60 * 60_000 - 30_000;
  for (let attempt = 0; attempt < 20 && existsSync(join(directory, first.id)); attempt++) await pause(20);
  assert.equal(existsSync(join(directory, first.id)), false);
  assert.equal((await api(firstOwner, firstPath + '/preview/')).status, 404);
  assert.equal((await api(secondOwner, secondPath)).status, 200);
  assert.equal((await api(secondOwner, secondPath, 'DELETE')).status, 200);
  assert.equal(existsSync(join(directory, second.id)), false);
});
