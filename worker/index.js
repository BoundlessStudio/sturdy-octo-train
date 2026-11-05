import assets from 'scrollworks:assets';
import { ASSET_HEADERS } from '../lib/assets.js';
import { handleBuilder } from '../lib/builder.js';

async function siteOwner(request) {
  const id = request.headers.get('oai-authenticated-user-id');
  if (!id) return '';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      return handleBuilder(request, env, await siteOwner(request), context);
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    const path = pathname === '/' ? '/index.html' : pathname;
    if (!Object.hasOwn(assets, path)) return new Response('Page not found', { status: 404 });
    const { type, data, binary } = assets[path];
    const body = request.method === 'HEAD' ? null : binary ? Uint8Array.from(atob(data), character => character.charCodeAt(0)) : data;
    return new Response(body, {
      headers: {
        ...ASSET_HEADERS,
        'content-type': type,
        'cache-control': path === '/index.html' ? 'no-cache' : 'public, max-age=300',
      },
    });
  },
};
