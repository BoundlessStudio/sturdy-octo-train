import { agent37, BuilderError, INSTANCE_ID } from './agent37.js';

export const APP_MARKER = 'scrollworks-v1';
export const SANDBOX_NAME = 'Scrollworks build';
export const SANDBOX_TEMPLATE = 'agent37-hermes';
const HOUR = 60 * 60 * 1000;
const SWEEP_LIMIT = 20;

export function sandboxExpiresAt(instance) {
  return Number.isSafeInteger(instance.created) && instance.created > 0
    ? instance.created * 1000 + HOUR
    : null;
}

export async function deleteSandbox(agent, id) {
  try {
    await agent.delete(id);
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}

export async function sweepExpiredSandboxes(env, dryRun = false) {
  const agent = agent37(env);
  const { data } = await agent.list();
  if (!Array.isArray(data)) throw new BuilderError('Agent37 did not return a sandbox list.');
  const now = Date.now();
  const expired = data.filter(instance => {
    const meta = instance.metadata;
    if (!INSTANCE_ID.test(instance.id || '') || instance.status === 'deleted' || instance.name !== SANDBOX_NAME
      || instance.template !== SANDBOX_TEMPLATE || meta?.scrollworks_app !== APP_MARKER
      || !meta.scrollworks_owner || typeof meta.scrollworks_state !== 'string') return false;
    const expiresAt = sandboxExpiresAt(instance);
    return expiresAt !== null && now >= expiresAt;
  });
  const targets = dryRun ? [] : expired.slice(-SWEEP_LIMIT);
  const results = await Promise.allSettled(targets.map(({ id }) => deleteSandbox(agent, id)));
  const failed = results.filter(result => result.status === 'rejected').length;
  return { expired: expired.length, deleted: results.length - failed, failed };
}

function tokensMatch(expected, actual) {
  if (!expected || expected.length !== actual.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return difference === 0;
}

export async function handleSandboxMaintenance(request, env) {
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
  if (!tokensMatch(env.SCROLLWORKS_EXPIRY_TOKEN, request.headers.get('x-scrollworks-expiry-token') || '')) {
    return json({ error: 'Cleanup authorization required.' }, 403);
  }
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
  if (!env.AGENT37_API_KEY) return json({ error: 'Agent37 is not configured.' }, 503);
  try {
    const result = await sweepExpiredSandboxes(env, request.method === 'GET');
    return json(result, result.failed ? 502 : 200);
  } catch (error) {
    return json({ error: error instanceof BuilderError ? error.message : 'Sandbox cleanup failed.' }, 502);
  }
}
