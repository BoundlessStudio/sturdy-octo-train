// The control-plane and data-plane split comes from Agent37's site-builder example.
export const SITE_PORT = 8788;
export const INSTANCE_ID = /^[a-z0-9]{10}$/;
export const SHARED_BUILD_ID = /^[a-f0-9]{32}$/;
const RESPONSE_ID = /^[a-z0-9_-]{1,80}$/i;
const SECOND = 1000;

export class BuilderError extends Error {
  constructor(message, status = 502, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function agent37(env) {
  const base = (env.AGENT37_API_BASE || 'https://api.agent37.com').replace(/\/$/, '');
  const domain = env.AGENT37_APP_DOMAIN || 'agent37.app';
  const key = env.AGENT37_API_KEY;
  const controlHeaders = { authorization: 'Bearer ' + key };
  const gatewayHeaders = { 'x-agent37-key': key };
  const instanceOrigin = id => env.AGENT37_GATEWAY
    ? env.AGENT37_GATEWAY.replace('{id}', id).replace(/\/$/, '')
    : 'https://' + id + '.' + domain;
  const siteOrigin = id => env.AGENT37_PREVIEW_ORIGIN
    ? env.AGENT37_PREVIEW_ORIGIN.replace('{id}', id).replace(/\/$/, '')
    : 'https://' + id + '-' + SITE_PORT + '.' + domain;

  async function request(url, headers, { method = 'GET', body, seconds = 25, stream = false } = {}) {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          ...headers,
          accept: stream ? 'text/event-stream' : 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        // Inspect redirects without forwarding workspace credentials to another host.
        redirect: 'manual',
        signal: AbortSignal.timeout(seconds * SECOND),
      });
    } catch {
      throw new BuilderError('Agent37 could not be reached in time. Check the workspace and try again.');
    }
    if (response.ok) {
      if (stream && response.headers.get('content-type')?.includes('text/event-stream')) return response;
      if (response.status === 204) return {};
      try {
        return await response.json();
      } catch {
        throw new BuilderError('Agent37 returned an incomplete response. Try again.');
      }
    }
    const data = await response.json().catch(() => null);
    const code = data?.error?.code || data?.error || '';
    const message = response.status === 402
      ? 'The Agent37 workspace needs available compute and model credits.'
      : response.status === 401 || response.status === 403
        ? 'Agent37 rejected the workspace key or its permissions.'
        : response.status === 404
          ? 'This Agent37 sandbox or resource is no longer available.'
          : 'Agent37 could not complete the request (HTTP ' + response.status + ').';
    throw new BuilderError(message, [404, 409, 429].includes(response.status) ? response.status : 502, code);
  }

  const control = (path, options) => request(base + '/v1/instances' + path, controlHeaders, options);
  const gateway = (id, path, options) => request(instanceOrigin(id) + '/v1' + path, gatewayHeaders, options);

  async function waitUntilReady(id) {
    const deadline = Date.now() + 180 * SECOND;
    while (Date.now() < deadline) {
      try {
        const health = await gateway(id, '/health?agent=hermes', { seconds: 8 });
        if (health.healthy === true || (health.healthy === undefined && health.hermes === true)) return;
      } catch {
        // The instance can be reachable before the gateway starts.
      }
      await new Promise(resolve => setTimeout(resolve, 3500));
    }
    throw new BuilderError('The sandbox started, but Hermes did not become ready in time.');
  }

  async function turn(id, input, sessionId, seconds, onEvent) {
    let responseId;
    let turnSession = sessionId;
    let settled;
    async function consume(response) {
      if (!(response instanceof Response)) {
        if (response.status !== 'completed') throw new BuilderError('Hermes could not complete this turn.');
        return response;
      }
      for await (const event of events(response.body)) {
        if (event.name === 'response.created') {
          responseId = event.data.id;
          turnSession = event.data.session_id || turnSession;
        }
        await onEvent(event);
        if (event.name === 'response.completed') return { ...event.data, id: responseId, session_id: turnSession };
        if (event.name === 'response.failed') throw new BuilderError('Hermes could not complete this turn. Check your Agent37 model credits.', 502, 'turn_failed');
      }
      return undefined;
    }
    try {
      const response = await gateway(id, '/responses', {
        method: 'POST',
        body: { input, stream: true, ...(sessionId ? { session_id: sessionId } : {}) },
        stream: true,
        seconds,
      });
      settled = await consume(response);
    } catch (error) {
      if (!RESPONSE_ID.test(responseId || '') || error.code === 'turn_failed') throw error;
    }
    if (settled) return settled;
    if (RESPONSE_ID.test(responseId || '')) {
      settled = await consume(await gateway(id, '/responses/' + responseId + '/stream', { stream: true, seconds }));
      if (settled) return settled;
    }
    throw new BuilderError('The Hermes connection ended before the turn finished.');
  }

  async function verifySite(id) {
    const check = await control('/' + id + '/exec', {
      method: 'POST',
      body: { command: serveCommand },
      seconds: 45,
    });
    if (check.exit_code !== 0) {
      throw new BuilderError('The sandbox could not serve a complete index page. Revise the scope and retry.');
    }
    let response;
    try {
      response = await readSite(id, '/', '', 'GET', 18);
      const type = response.headers.get('content-type');
      await response.body?.cancel();
      if (response.ok && type?.includes('text/html')) return;
    } catch {
      // A running local process still needs to be reachable through the preview edge.
    }
    throw new BuilderError('The site started in its sandbox, but its HTTPS preview did not respond.');
  }

  async function siteFetch(id, path, search, { method, seconds = 120, headers, body }) {
    const target = new URL(siteOrigin(id));
    target.pathname = path;
    target.search = search;
    try {
      return await fetch(target, {
        method,
        headers: { ...gatewayHeaders, ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(seconds * SECOND),
      });
    } catch {
      throw new BuilderError('The private preview did not respond. Reload the preview to try again.');
    }
  }

  const readSite = (id, path, search, method, seconds) => siteFetch(id, path, search, { method, seconds });

  function shared(owner) {
    const id = env.AGENT37_SHARED_INSTANCE_ID;
    const token = env.SCROLLWORKS_INSTANCE_TOKEN;
    if (!INSTANCE_ID.test(id || '') || !token || token.length < 32) return null;
    const headers = { authorization: 'Bearer ' + token, 'x-scrollworks-owner': owner };
    async function call(path, method = 'GET', body) {
      const response = await siteFetch(id, '/scrollworks/builds' + path, '', { method, headers, body, seconds: 18 });
      const data = await response.json().catch(() => null);
      if (response.ok && data) return data;
      const status = response.status;
      if ([400, 404, 409, 410, 429].includes(status)) {
        throw new BuilderError(data?.error || 'This build is unavailable.', status);
      }
      throw new BuilderError('The shared Agent37 builder is unavailable. Try again.');
    }
    return {
      create: idea => call('', 'POST', { idea }),
      state: build => call('/' + build),
      compile: (build, choices) => call('/' + build + '/compile', 'POST', { choices }),
      delete: build => call('/' + build, 'DELETE'),
      readSite: (build, path, search, method, seconds) => siteFetch(id, '/scrollworks/builds/' + build + '/preview' + path,
        search, { method, seconds, headers }),
    };
  }

  return {
    list: () => control(''),
    create: body => control('', { method: 'POST', body, seconds: 810 }),
    exec: (id, command) => control('/' + id + '/exec', { method: 'POST', body: { command }, seconds: 60 }),
    restart: id => control('/' + id + '/restart', { method: 'POST', seconds: 180 }),
    instance: id => control('/' + id),
    save: (id, metadata) => control('/' + id, { method: 'PATCH', body: { metadata } }),
    delete: id => control('/' + id, { method: 'DELETE', seconds: 60 }),
    waitUntilReady,
    turn,
    response: (id, responseId) => gateway(id, '/responses/' + encodeURIComponent(responseId)),
    verifySite,
    readSite,
    shared,
  };
}

async function* events(body) {
  let buffer = '';
  for await (const chunk of body.pipeThrough(new TextDecoderStream())) {
    buffer += chunk;
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop();
    for (const frame of frames) {
      let name = '';
      const data = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (name && data.length) yield { name, data: JSON.parse(data.join('\n')) };
    }
  }
}

// The agent writes the site. The server owns the known preview port and restart hook.
const serveCommand = `set -eu
site="$HOME/site"
test -d "$site" && test ! -L "$site" && test -s "$site/index.html"
test -z "$(find "$site" -type l -print -quit)"
mkdir -p "$HOME/.agent37/hooks"
cat > "$HOME/.scrollworks-serve.sh" <<'SCROLLWORKS'
#!/bin/sh
curl -fsS --max-time 2 http://127.0.0.1:8788/ >/dev/null 2>&1 && exit 0
nohup python3 -m http.server 8788 --bind 0.0.0.0 --directory "$HOME/site" >"$HOME/.scrollworks-site.log" 2>&1 </dev/null &
SCROLLWORKS
hook="$HOME/.agent37/hooks/post-restart.sh"
touch "$hook"
line='sh "$HOME/.scrollworks-serve.sh"'
grep -qxF "$line" "$hook" || printf '\n%s\n' "$line" >> "$hook"
chmod +x "$hook"
sh "$HOME/.scrollworks-serve.sh"
for attempt in 1 2 3 4 5; do
  curl -fsS --max-time 2 http://127.0.0.1:8788/ >/dev/null && exit 0
  sleep 1
done
exit 1`;
