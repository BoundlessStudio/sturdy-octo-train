import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { agent37, INSTANCE_ID, SITE_PORT } from '../lib/agent37.js';

const NAME = 'Scrollworks shared builder';
const MARKER = 'scrollworks-shared-v1';
const TEMPLATE = 'agent37-base';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function credentials() {
  const { AGENT37_API_KEY, SCROLLWORKS_INSTANCE_TOKEN } = process.env;
  if (AGENT37_API_KEY && SCROLLWORKS_INSTANCE_TOKEN) return { AGENT37_API_KEY, SCROLLWORKS_INSTANCE_TOKEN };
  const input = process.stdin;
  if (!input.isTTY) throw new Error('Set AGENT37_API_KEY and SCROLLWORKS_INSTANCE_TOKEN.');
  console.log('Ready for setup credentials as JSON on stdin (input is hidden).');
  input.setRawMode(true);
  input.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let buffer = '';
    input.on('data', function receive(chunk) {
      buffer += chunk;
      const end = buffer.search(/[\r\n\u0003]/);
      if (end < 0) return;
      input.off('data', receive);
      input.setRawMode(false);
      input.pause();
      if (buffer[end] === '\u0003') return reject(new Error('Setup cancelled.'));
      try { resolve(JSON.parse(buffer.slice(0, end))); }
      catch { reject(new Error('Invalid setup credentials.')); }
    });
    input.resume();
  });
}

async function installCommand(firstBoot) {
  const [builder, plan] = await Promise.all([
    readFile(new URL('../sandbox/shared-builder.mjs', import.meta.url), 'base64'),
    readFile(new URL('../public/plan.js', import.meta.url), 'base64'),
  ]);
  return `set -eu
umask 077
root="$HOME/.scrollworks"
mkdir -p "$root/service/sandbox" "$root/service/public" "$HOME/.agent37/hooks"
printf '%s' '${builder}' | base64 -d > "$root/service/sandbox/shared-builder.mjs"
printf '%s' '${plan}' | base64 -d > "$root/service/public/plan.js"
printf '%s\n' '{"type":"module"}' > "$root/service/package.json"
cat > "$root/start.sh" <<'SCROLLWORKS'
#!/bin/sh
umask 077
nohup node "$HOME/.scrollworks/service/sandbox/shared-builder.mjs" >> "$HOME/.scrollworks/builder.log" 2>&1 </dev/null &
SCROLLWORKS
hook="$HOME/.agent37/hooks/post-restart.sh"
touch "$hook"
line='sh "$HOME/.scrollworks/start.sh"'
grep -Fxq "$line" "$hook" || printf '\n%s\n' "$line" >> "$hook"
chmod +x "$hook"
${firstBoot ? 'sh "$root/start.sh"' : ':'}`;
}

async function verify(id, env) {
  const url = `https://${id}-${SITE_PORT}.agent37.app/scrollworks/health`;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'x-agent37-key': env.AGENT37_API_KEY, authorization: 'Bearer ' + env.SCROLLWORKS_INSTANCE_TOKEN },
        redirect: 'error', signal: AbortSignal.timeout(5000),
      });
      if (response.ok && (await response.json()).ready === true) return;
      await response.body?.cancel().catch(() => {});
    } catch { /* The instance may still be booting. */ }
    await pause(2000);
  }
  throw new Error('The shared builder did not answer on its private port. Check ~/.scrollworks/builder.log on the instance.');
}

async function main() {
  const env = await credentials();
  const token = env.SCROLLWORKS_INSTANCE_TOKEN;
  if (!env.AGENT37_API_KEY || typeof token !== 'string' || token.length < 32) {
    throw new Error('Provide an Agent37 workspace key and a service token of at least 32 characters.');
  }
  const agent = agent37(env);
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data } = await agent.list();
  if (!Array.isArray(data)) throw new Error('Agent37 did not return a valid instance list.');
  const matching = data.filter(instance => instance.status !== 'deleted' && instance.metadata?.scrollworks_app === MARKER);
  if (matching.length > 1) throw new Error('More than one shared builder exists. Choose the active instance before setup.');
  let instance = matching[0];
  const firstBoot = !instance;
  if (instance && (instance.template !== TEMPLATE || instance.metadata.scrollworks_token_sha256 !== tokenHash)) {
    throw new Error('Setup found an existing shared builder. Use its original service token.');
  }
  if (firstBoot) {
    const budget = Math.max(100_000, Math.min(10_000_000, Math.floor(Number(process.env.AGENT37_BUDGET_MICROS) || 1_000_000)));
    instance = await agent.create({
      template: TEMPLATE, name: NAME, auto_sleep: false, resources: { cpu: 2, memory: 4, disk: 2 },
      budget: { monthly_cap_micros: budget }, env: { SCROLLWORKS_INSTANCE_TOKEN: token },
      metadata: { scrollworks_app: MARKER, scrollworks_token_sha256: tokenHash },
    });
  }
  if (!INSTANCE_ID.test(instance.id || '')) throw new Error('Agent37 did not return a valid shared instance ID.');
  console.log(`AGENT37_SHARED_INSTANCE_ID=${instance.id}`);
  const installed = await agent.exec(instance.id, await installCommand(firstBoot));
  if (installed.exit_code !== 0) throw new Error('Agent37 could not install the shared builder.');
  if (!firstBoot) await agent.restart(instance.id);
  await verify(instance.id, env);
  console.log('Shared builder ready on its private port.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
