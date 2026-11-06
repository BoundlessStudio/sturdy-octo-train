// The Express entry point is based on Agent37's site-builder starter.
import 'dotenv/config';
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { ASSET_HEADERS, TYPES, VENDOR_FILES, appDocument } from './lib/assets.js';
import { handleBuilder } from './lib/builder.js';
import { sweepExpiredSandboxes } from './lib/sandbox-expiry.js';

const env = process.env;
const host = env.HOST || '127.0.0.1';
const port = Number(env.PORT || 3000);
const access = env.BUILDER_ACCESS_TOKEN;
const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
const root = fileURLToPath(new URL('.', import.meta.url));
if (!local && (!access || !env.BUILDER_ORIGIN)) {
  throw new Error('Set BUILDER_ACCESS_TOKEN and BUILDER_ORIGIN before binding the builder to a non-loopback address.');
}

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (local && !['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname)) {
    return res.status(400).send('Use the builder’s loopback URL.');
  }
  if (access) {
    const supplied = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from('Basic ' + Buffer.from('scrollworks:' + access).toString('base64'));
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      res.set('www-authenticate', 'Basic realm="Customware"');
      return res.status(401).send('Customware sign-in is required.');
    }
  }
  res.set(ASSET_HEADERS);
  next();
});

app.all('/api/*', async (req, res) => {
  try {
    const origin = env.BUILDER_ORIGIN ? new URL(env.BUILDER_ORIGIN).origin : 'http://' + req.headers.host;
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const request = new Request(origin + req.originalUrl, {
      method: req.method,
      headers: req.headers,
      ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
    });
    const response = await handleBuilder(request, env, 'local-scrollworks');
    res.status(response.status);
    for (const [name, value] of response.headers) res.set(name, value);
    if (!response.body) return res.end();
    res.flushHeaders();
    await pipeline(Readable.fromWeb(response.body), res);
  } catch {
    if (!res.headersSent) res.status(500).json({ error: 'The build connection was interrupted.' });
    else res.end();
  }
});

for (const [url, path] of Object.entries(VENDOR_FILES)) {
  app.get(url, (_req, res) => res.set('content-type', TYPES[extname(path)]).sendFile(join(root, 'node_modules', path)));
}
app.get('/vendor/licenses.txt', (_req, res) => {
  const licenses = ['three', '@fontsource-variable/inter', '@fontsource-variable/space-grotesk']
    .map(name => name + '\n' + readFileSync(join(root, 'node_modules', name, 'LICENSE'), 'utf8'));
  res.type('text').send(licenses.join('\n\n'));
});
app.get(['/', '/index.html'], (_req, res) => {
  const page = appDocument(readFileSync(join(root, 'public', 'index.html'), 'utf8'));
  res.set(page.headers).type('html').send(page.markup);
});
app.use('/highlights', express.static(join(root, 'media', 'highlights'), { maxAge: '1h' }));
app.use(express.static(join(root, 'public')));

const server = app.listen(port, host, () => {
  const address = host.includes(':') ? '[' + host + ']' : host;
  console.log('Customware (' + (env.AGENT37_API_KEY ? 'Agent37' : 'demo') + ') at http://' + address + ':' + server.address().port);
});

if (env.AGENT37_API_KEY) {
  let sweeping = false;
  async function sweep() {
    if (sweeping) return;
    sweeping = true;
    try {
      const { failed } = await sweepExpiredSandboxes(env);
      if (failed) console.warn('Some expired Scrollworks sandboxes will be retried on the next cleanup.');
    } catch {
      console.warn('Scrollworks sandbox cleanup will be retried.');
    } finally {
      sweeping = false;
    }
  }
  void sweep();
  const timer = setInterval(sweep, 60_000).unref();
  server.on('close', () => clearInterval(timer));
}
