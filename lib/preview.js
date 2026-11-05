import { parse, parseFragment, serialize } from 'parse5';
import { BuilderError } from './agent37.js';

const VIRTUAL_ORIGIN = 'https://generated-site.invalid';
const TOTAL_LIMIT = 8 * 1024 * 1024;
const FILE_LIMIT = 3 * 1024 * 1024;
const ASSET_LIMIT = 32;
const NONCE = '__SCROLLWORKS_PREVIEW_NONCE__';
const FRAME_POLICY = [
  "default-src 'none'",
  "script-src 'nonce-" + NONCE + "'",
  "style-src 'unsafe-inline' data:",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
const LOCAL_ANCHORS = [
  "document.addEventListener('click', function (event) {",
  "  const link = event.target.closest?.('a[href^=\"#\"]');",
  '  if (!link || event.defaultPrevented) return;',
  "  const hash = link.getAttribute('href').slice(1);",
  '  let target;',
  '  try { target = document.getElementById(decodeURIComponent(hash)); } catch {}',
  '  if (hash && !target) return;',
  '  event.preventDefault();',
  '  if (target) target.scrollIntoView();',
  '  else window.scrollTo(0, 0);',
  '});',
].join('\n');
const cssReference = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]+))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')/gi;
const embeddedAttributes = {
  audio: ['src'], img: ['src'], image: ['href'], input: ['src'],
  script: ['src'], source: ['src'], track: ['src'], video: ['src', 'poster'],
};

async function readBytes(response, limit) {
  const reader = response.body?.getReader();
  const chunks = [];
  let size = 0;
  if (!reader) return new Uint8Array();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) return null;
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function dataUrl(bytes, type) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return 'data:' + type + ';base64,' + btoa(binary);
}

function localResource(value, path) {
  const reference = value.trim();
  if (!reference || reference.startsWith('#')) return null;
  try {
    const target = new URL(reference, VIRTUAL_ORIGIN + path);
    return target.origin === VIRTUAL_ORIGIN ? target : null;
  } catch {
    return null;
  }
}

// A sandboxed iframe has an opaque origin. Bundling static files into its
// document lets them load without sending the owner's session cookie.
export async function packPreview(response, path, readAsset) {
  const html = await readBytes(response, FILE_LIMIT);
  if (!html) throw new BuilderError('The generated HTML exceeds the inline preview size limit.');
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const document = parse(decoder.decode(html));
  const cache = new Map();
  let remaining = TOTAL_LIMIT - html.length;
  let inlineBudget = TOTAL_LIMIT * 2 - html.length;

  async function resource(value, base, kind, ancestors) {
    const target = localResource(value, base);
    if (!target) return value;
    const path = target.pathname + target.search;
    if (ancestors.includes(path)) return value;
    const key = kind + ':' + path;
    if (!cache.has(key)) {
      if (cache.size >= ASSET_LIMIT || remaining <= 0) return value;
      cache.set(key, null);
      try {
        const asset = await readAsset(target.pathname, target.search);
        if (!asset.ok) {
          await asset.body?.cancel();
          return value;
        }
        let bytes = await readBytes(asset, Math.min(FILE_LIMIT, remaining));
        if (!bytes) return value;
        remaining -= bytes.length;
        const mime = asset.headers.get('content-type')?.match(/^[\w.+-]+\/[\w.+-]+/)?.[0];
        const type = kind === 'script' ? 'text/javascript' : kind === 'style' ? 'text/css'
          : mime || 'application/octet-stream';
        if (type === 'text/css') {
          bytes = encoder.encode(await styles(decoder.decode(bytes), target.pathname, [...ancestors, path]));
        }
        cache.set(key, dataUrl(bytes, type));
      } catch {
        // A missing asset should leave the rest of the site viewable.
      }
    }
    const packed = cache.get(key);
    if (!packed || packed.length > inlineBudget) return value;
    inlineBudget -= packed.length;
    return packed + target.hash;
  }

  async function styles(source, base, ancestors = []) {
    let result = '';
    let offset = 0;
    for (const match of source.matchAll(cssReference)) {
      const [, doubleUrl, singleUrl, unquotedUrl, doubleImport, singleImport] = match;
      const imported = doubleImport ?? singleImport;
      const value = imported ?? doubleUrl ?? singleUrl ?? unquotedUrl;
      const replacement = await resource(value, base, imported !== undefined ? 'style' : '', ancestors);
      result += source.slice(offset, match.index);
      result += replacement === value ? match[0] : (imported !== undefined ? '@import ' : '') + 'url("' + replacement + '")';
      offset = match.index + match[0].length;
    }
    return result + source.slice(offset);
  }

  async function visit(node) {
    const attribute = name => node.attrs?.find(entry => entry.name === name);
    if (node.tagName === 'script') {
      const nonce = attribute('nonce');
      if (nonce) nonce.value = NONCE;
      else node.attrs.push({ name: 'nonce', value: NONCE });
    }
    const rel = attribute('rel')?.value.toLowerCase().split(/\s+/) || [];
    const linkedStyle = node.tagName === 'link' && rel.includes('stylesheet');
    const linkedIcon = node.tagName === 'link' && rel.includes('icon');
    const refs = linkedStyle || linkedIcon ? ['href'] : embeddedAttributes[node.tagName] || [];
    for (const name of refs) {
      const attr = attribute(name);
      if (attr) attr.value = await resource(attr.value, path, linkedStyle ? 'style' : node.tagName === 'script' ? 'script' : '', []);
    }
    const srcset = attribute('srcset');
    if (srcset && !srcset.value.includes('data:')) {
      const sources = [];
      for (const source of srcset.value.split(',')) {
        const [url, ...descriptor] = source.trim().split(/\s+/);
        sources.push([await resource(url, path, '', []), ...descriptor].join(' '));
      }
      srcset.value = sources.join(', ');
    }
    const inlineStyle = attribute('style');
    if (inlineStyle) inlineStyle.value = await styles(inlineStyle.value, path);
    if (node.tagName === 'style' && node.childNodes[0]?.nodeName === '#text') {
      node.childNodes[0].value = await styles(node.childNodes[0].value, path);
    }
    for (const child of node.childNodes || []) await visit(child);
    if (node.content) await visit(node.content);
  }

  await visit(document);
  const root = document.childNodes.find(node => node.tagName === 'html');
  const head = root.childNodes.find(node => node.tagName === 'head');
  const body = root.childNodes.find(node => node.tagName === 'body');
  head.childNodes.unshift(...parseFragment('<meta http-equiv="Content-Security-Policy" content="' + FRAME_POLICY + '">').childNodes);
  body.childNodes.push(...parseFragment('<script nonce="' + NONCE + '">' + LOCAL_ANCHORS + '</script>').childNodes);
  return serialize(document);
}
