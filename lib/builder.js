import { agent37, BuilderError, SHARED_BUILD_ID } from './agent37.js';
import { packPreview } from './preview.js';
import { APP_MARKER, deleteSandbox, sandboxExpiresAt } from './sandbox-expiry.js';
import { MAX_IDEA, parseAgentPlan, scopeFor } from '../public/plan.js';

const ENCODER = new TextEncoder();
const MINUTE = 60_000;
const pathPattern = /^\/api\/builds\/([a-z0-9]{10}|[a-f0-9]{32})(?:\/(compile|preview))?(\/.*)?$/;

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function problem(error) {
  return error instanceof BuilderError ? error : new BuilderError('Something interrupted the build. Try again.');
}

function progress(work, context) {
  const pipe = new TransformStream();
  const writer = pipe.writable.getWriter();
  let open = true;
  writer.closed.catch(() => { open = false; });
  async function emit(event) {
    if (!open) return;
    try {
      await writer.write(ENCODER.encode(JSON.stringify(event) + '\n'));
    } catch {
      open = false;
    }
  }
  const heartbeat = setInterval(() => { void emit({ type: 'heartbeat' }); }, 20_000);
  const task = (async () => {
    try {
      await work(emit);
    } catch (error) {
      await emit({ type: 'error', message: problem(error).message });
    } finally {
      clearInterval(heartbeat);
      if (open) await writer.close().catch(() => {});
    }
  })();
  context?.waitUntil(task);
  return new Response(pipe.readable, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
      'x-content-type-options': 'nosniff',
    },
  });
}

function buildBrief(plan, scope) {
  const list = features => features.map(feature => ({ feature: feature.title, description: feature.detail }));
  return [
    'Build the website from the earlier idea in this session using the approved scope below.',
    'Implement Keep features and the basic site shell. Omit Later and Never features even if the original idea mentions them.',
    'Create a complete responsive static website with HTML, CSS, and browser JavaScript in "$HOME/site" and place the entry page at "$HOME/site/index.html". Use relative paths for local assets and keep them all in that directory. Use original sample content and accessible interactive controls.',
    'The preview is one page in a private sandboxed iframe. Use in-page anchors for navigation and inline JavaScript with addEventListener for interactions. Keep it functional without external network access. Use relative URLs for any separate CSS or visual assets.',
    'The Scrollworks server handles startup and preview on port 8788. Write and check files locally. Keep secrets, symlinks, server processes, third-party deployments, and public tunnels out of the result.',
    'If retrying, replace old files or remove any old feature no longer in Keep. Finish with a short summary after you have written the files.',
    JSON.stringify({
      title: plan.title, layout: plan.layout, screens: plan.screens || plan.surfaces,
      keep: list(scope.keep), later: list(scope.later), never: list(scope.never),
    }),
  ].join('\n');
}

function metadata(owner, state) {
  return { scrollworks_app: APP_MARKER, scrollworks_owner: owner, scrollworks_state: JSON.stringify(state) };
}

async function getState(agent, id, owner, allowExpired, context) {
  const instance = await agent.instance(id);
  const { metadata: meta } = instance;
  if (meta?.scrollworks_app !== APP_MARKER || meta.scrollworks_owner !== owner) {
    throw new BuilderError('This build could not be found.', 404);
  }
  if (!allowExpired) {
    const expiresAt = sandboxExpiresAt(instance);
    if (expiresAt === null) throw new BuilderError('Could not verify when this sandbox was created.');
    if (Date.now() >= expiresAt) {
      const removal = deleteSandbox(agent, id).catch(() => {});
      if (context) context.waitUntil(removal);
      else await removal;
      throw new BuilderError('This sandbox reached its one-hour limit. Start a new build to continue.', 410);
    }
  }
  try {
    const state = JSON.parse(meta.scrollworks_state);
    if (state.stage) return state;
  } catch {
    // Invalid or missing state is treated as an unavailable build.
  }
  throw new BuilderError('This build could not be read.', 409);
}

async function saveState(agent, id, owner, state) {
  state.updatedAt = Date.now();
  await agent.save(id, metadata(owner, state));
}

async function markFailed(agent, id, owner, state, error) {
  state.stage = 'error';
  state.error = problem(error).message;
  await saveState(agent, id, owner, state).catch(() => {});
}

async function finishPlan(agent, id, owner, state, turn) {
  if (!turn?.session_id || !turn.output_text?.trim()) {
    throw new BuilderError('Hermes returned an empty plan. Check your Agent37 model credits.');
  }
  state.plan = parseAgentPlan(turn.output_text, state.idea);
  state.sessionId = turn.session_id;
  state.stage = 'scoping';
  delete state.idea;
  delete state.responseId;
  await saveState(agent, id, owner, state);
}

async function finishBuild(agent, id, owner, state) {
  await agent.verifySite(id);
  state.stage = 'ready';
  delete state.responseId;
  await saveState(agent, id, owner, state);
}

function followSharedBuild(shared, id, phase, context) {
  return progress(async emit => {
    const planning = phase === 'planning';
    if (planning) {
      await emit({ type: 'sandbox', id });
      await emit({ type: 'status', message: 'Opened a build folder on the shared Agent37 instance.' });
    }
    await emit({ type: 'status', message: planning
      ? 'Turning the brief into a blueprint in your build folder.'
      : 'Building the features you kept in your build folder.' });
    const deadline = Date.now() + 200_000;
    while (Date.now() < deadline) {
      const state = await shared.state(id);
      if (state.stage === 'error') throw new BuilderError(state.error || 'The build was interrupted.');
      if (planning && state.stage === 'scoping') return emit({ type: 'plan', plan: state.plan });
      if (!planning && state.stage === 'ready') {
        await emit({ type: 'status', message: 'Checking the private preview.' });
        const preview = await shared.readSite(id, '/', '', 'HEAD', 18);
        if (!preview.ok || !preview.headers.get('content-type')?.includes('text/html')) {
          throw new BuilderError('The shared builder could not serve the generated page.');
        }
        await emit({ type: 'status', message: 'Preview verified.' });
        return emit({ type: 'ready' });
      }
      await new Promise(resolve => setTimeout(resolve, 1800));
    }
    throw new BuilderError('The shared builder has not reported a result yet.');
  }, context);
}

function startBuild(agent, id, owner, state, choices, context) {
  return progress(async emit => {
    const status = message => emit({ type: 'status', message });
    const scope = scopeFor(state.plan, choices);
    const sent = new Set();
    state.stage = 'building';
    state.choices = Object.fromEntries(Object.entries(scope).flatMap(([choice, features]) =>
      features.map(feature => [feature.id, choice])));
    delete state.responseId;
    delete state.error;
    try {
      await saveState(agent, id, owner, state);
      await status('Sent your feature choices to Hermes.');
      await agent.waitUntilReady(id);
      await status('Hermes is building the site in its sandbox.');
      await agent.turn(id, buildBrief(state.plan, scope), state.sessionId, 720, async event => {
        if (event.name === 'response.created') {
          state.responseId = event.data.id;
          await saveState(agent, id, owner, state);
        }
        if (event.name !== 'response.tool_call.started') return;
        const tool = String(event.data.tool || '');
        const message = /write|edit|patch/i.test(tool) ? 'Hermes is writing site files.'
          : /terminal|exec|shell/i.test(tool) ? 'Hermes is running commands in the sandbox.'
          : '';
        if (message && !sent.has(message)) {
          sent.add(message);
          await status(message);
        }
      });
      await status('Checking the index page and private HTTPS preview.');
      await finishBuild(agent, id, owner, state);
      await status('Preview verified.');
      await emit({ type: 'ready' });
    } catch (error) {
      // Hermes serializes turns on one session. A concurrent request can follow the running turn.
      if (error.status === 409) return;
      await markFailed(agent, id, owner, state, error);
      throw error;
    }
  }, context);
}

async function refreshState(agent, id, owner, state) {
  const planning = state.stage === 'planning';
  if (!planning && state.stage !== 'building') return state;
  const age = Date.now() - state.updatedAt;
  if (age < 25_000) return state;
  if (state.responseId) {
    const turn = await agent.response(id, state.responseId);
    if (turn.status === 'completed') {
      try {
        if (planning) await finishPlan(agent, id, owner, state, turn);
        else await finishBuild(agent, id, owner, state);
      } catch (error) {
        await markFailed(agent, id, owner, state, error);
      }
      return state;
    }
    if (turn.status === 'failed' || turn.status === 'cancelled') {
      await markFailed(agent, id, owner, state, new BuilderError('The Hermes turn ended before the build was ready.'));
      return state;
    }
  }
  if (age > (state.responseId ? 15 : 6) * MINUTE) {
    await markFailed(agent, id, owner, state, new BuilderError('The sandbox run timed out. You can restart the build.'));
  }
  return state;
}

async function readJson(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new BuilderError('Send the build details as JSON.', 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new BuilderError('The build details are missing.', 400);
  let size = 0;
  let raw = '';
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) {
      void reader.cancel();
      throw new BuilderError('The build details are too large.', 413);
    }
    raw += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(raw + decoder.decode());
  } catch {
    throw new BuilderError('The build details could not be read.', 400);
  }
}

async function showPreview(agent, id, url, path, method) {
  const prefix = '/api/builds/' + id + '/preview/';
  if (!path) return new Response(null, { status: 308, headers: { location: prefix, 'cache-control': 'no-store' } });
  const upstream = await agent.readSite(id, path, url.search, method);
  if (!upstream.ok) {
    await upstream.body?.cancel();
    throw new BuilderError('This preview resource is unavailable.', upstream.status === 404 ? 404 : 502);
  }
  // The frame has an opaque origin. Generated scripts may use their own assets,
  // but cannot read the parent app, its cookies, or unrelated API routes.
  const assets = url.origin + prefix;
  const policy = [
    "sandbox allow-scripts",
    "default-src 'none'",
    "script-src 'unsafe-inline' data: " + assets,
    "style-src 'unsafe-inline' data: " + assets,
    "img-src data: blob: " + assets,
    "font-src data: " + assets,
    "media-src data: blob: " + assets,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  const body = method === 'GET' && contentType.toLowerCase().startsWith('text/html')
    ? await packPreview(upstream, path, (asset, search) => agent.readSite(id, asset, search, 'GET', 18))
    : upstream.body;
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': contentType,
      'content-security-policy': policy,
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function handleBuilder(request, env, owner, context) {
  const url = new URL(request.url);
  const agent = env.AGENT37_API_KEY && owner ? agent37(env) : null;
  const shared = agent?.shared(owner);
  if (url.pathname === '/api/config' && request.method === 'GET') return json({ live: Boolean(shared) });
  if (!agent) return json({ error: 'Live builds need a server-side Agent37 workspace key and authenticated access.' }, 503);
  const origin = request.headers.get('origin');
  if (request.method !== 'GET' && origin && origin !== url.origin) {
    return json({ error: 'This build request must come from Scrollworks.' }, 403);
  }
  try {
    if (url.pathname === '/api/builds' && request.method === 'POST') {
      if (!shared) throw new BuilderError('The shared Agent37 builder is not configured.', 503);
      const payload = await readJson(request);
      const idea = typeof payload?.idea === 'string' ? payload.idea.trim() : '';
      if (idea.length < 8 || idea.length > MAX_IDEA) {
        throw new BuilderError('Describe the website in 8 to ' + MAX_IDEA + ' characters.', 400);
      }
      const { id } = await shared.create(idea);
      if (!SHARED_BUILD_ID.test(id || '')) throw new BuilderError('The shared builder returned an invalid build ID.');
      return followSharedBuild(shared, id, 'planning', context);
    }
    const match = pathPattern.exec(url.pathname);
    if (!match) return json({ error: 'Build route not found.' }, 404);
    const [, id, action, asset] = match;
    if (asset && action !== 'preview') return json({ error: 'Build route not found.' }, 404);
    const deleting = !action && request.method === 'DELETE';
    if (SHARED_BUILD_ID.test(id)) {
      if (!shared) throw new BuilderError('The shared Agent37 builder is not configured.', 503);
      if (!action && request.method === 'GET') return json(await shared.state(id));
      if (deleting) return json(await shared.delete(id));
      if (action === 'compile' && request.method === 'POST') {
        const payload = await readJson(request);
        await shared.compile(id, payload?.choices);
        return followSharedBuild(shared, id, 'building', context);
      }
      if (action === 'preview' && ['GET', 'HEAD'].includes(request.method)) {
        const state = await shared.state(id);
        if (state.stage !== 'ready') throw new BuilderError('The preview is still being prepared.', 409);
        return await showPreview(shared, id, url, asset, request.method);
      }
      return json({ error: 'Build route not found.' }, 404);
    }

    // Existing per-instance builds can still be opened until their original cutoff.
    const state = await getState(agent, id, owner, deleting, context);
    if (!action && request.method === 'GET') {
      const current = await refreshState(agent, id, owner, state);
      const { stage, plan, choices, error } = current;
      return json({ stage, plan, choices, error });
    }
    if (deleting) {
      await deleteSandbox(agent, id);
      return json({ deleted: true });
    }
    if (action === 'compile' && request.method === 'POST') {
      if (!state.plan || !state.sessionId || !['scoping', 'error'].includes(state.stage)) {
        throw new BuilderError('This sandbox is already building or is no longer waiting for scope.', 409);
      }
      const payload = await readJson(request);
      return startBuild(agent, id, owner, state, payload?.choices, context);
    }
    if (action === 'preview' && ['GET', 'HEAD'].includes(request.method)) {
      if (state.stage !== 'ready') throw new BuilderError('The preview is still being prepared.', 409);
      return await showPreview(agent, id, url, asset, request.method);
    }
    return json({ error: 'Build route not found.' }, 404);
  } catch (error) {
    const known = problem(error);
    return json({ error: known.message }, known.status);
  }
}
