import { copyFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import { TYPES, VENDOR_FILES } from '../lib/assets.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const assets = {};

async function addAsset(url, filename) {
  const extension = extname(filename);
  const binary = extension === '.woff2';
  let data = await readFile(filename, binary ? 'base64' : 'utf8');
  if (url.startsWith('/vendor/') && extension === '.js') {
    data = (await transform(data, { minify: true, legalComments: 'inline', loader: 'js' })).code;
  }
  assets[url] = { type: TYPES[extension], data, binary };
}

await Promise.all((await readdir(join(root, 'public'))).map(name => addAsset('/' + name, join(root, 'public', name))));
await Promise.all(Object.entries(VENDOR_FILES).map(([url, filename]) => addAsset(url, join(root, 'node_modules', filename))));
const licenses = await Promise.all(['three', '@fontsource-variable/inter', '@fontsource-variable/space-grotesk'].map(async name =>
  name + '\n' + await readFile(join(root, 'node_modules', name, 'LICENSE'), 'utf8')
));
assets['/vendor/licenses.txt'] = { type: TYPES['.txt'], data: licenses.join('\n\n'), binary: false };

await build({
  entryPoints: [join(root, 'worker', 'index.js')],
  outfile: join(dist, 'server', 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  plugins: [{
    name: 'scrollworks-assets',
    setup(builder) {
      builder.onResolve({ filter: /^scrollworks:assets$/ }, () => ({ path: 'assets', namespace: 'scrollworks' }));
      builder.onLoad({ filter: /^assets$/, namespace: 'scrollworks' }, () => ({
        contents: 'export default ' + JSON.stringify(assets),
        loader: 'js',
      }));
    },
  }],
});
await mkdir(join(dist, '.openai'), { recursive: true });
await copyFile(join(root, '.openai', 'hosting.json'), join(dist, '.openai', 'hosting.json'));
console.log('Built the Scrollworks Worker in dist/server/index.js');
