import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { identifyVisitor } from '../lib/visitor.js';

const token = 'test-instance-token-at-least-32-characters';
const request = (headers = {}) => new Request('https://scrollworks.test/api/config', { headers });

test('a guest can resume only a session signed by Scrollworks', async () => {
  const first = await identifyVisitor(request(), token, true);
  const second = await identifyVisitor(request(), token, true);
  assert.match(first.owner, /^guest:[a-f0-9]{32}$/);
  assert.notEqual(first.owner, second.owner);
  assert.match(first.cookie, /; Path=\/; Secure; HttpOnly; SameSite=Strict$/);

  const cookie = first.cookie.split(';')[0];
  assert.deepEqual(await identifyVisitor(request({ cookie }), token, false), { owner: first.owner });
  assert.deepEqual(await identifyVisitor(request(), token, false), { owner: '' });
  const tampered = cookie.slice(0, -1) + (cookie.endsWith('0') ? '1' : '0');
  assert.deepEqual(await identifyVisitor(request({ cookie: tampered }), token, false), { owner: '' });
});

test('a signed-in visitor keeps the same build owner', async () => {
  const guest = await identifyVisitor(request(), token, true);
  const account = 'test-sites-account';
  const headers = { cookie: guest.cookie.split(';')[0], 'oai-authenticated-user-id': account };
  assert.deepEqual(await identifyVisitor(request(headers), token, true), {
    owner: createHash('sha256').update(account).digest('hex'),
  });
});
