import assets from 'scrollworks:assets';
import { ASSET_HEADERS, appDocument } from '../lib/assets.js';
import { handleBuilder } from '../lib/builder.js';
import { identifyVisitor } from '../lib/visitor.js';

export default {
  async fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      const issue = pathname === '/api/config' && request.method === 'GET';
      const { owner, cookie } = await identifyVisitor(request, env.SCROLLWORKS_INSTANCE_TOKEN, issue);
      const response = await handleBuilder(request, env, owner, context);
      if (cookie) response.headers.append('set-cookie', cookie);
      return response;
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    const path = pathname === '/' ? '/index.html' : pathname;
    if (!Object.hasOwn(assets, path)) return new Response('Page not found', { status: 404 });
    const { type, data, binary } = assets[path];
    if (path === '/index.html') {
      const page = appDocument(data);
      return new Response(request.method === 'HEAD' ? null : page.markup, {
        headers: { ...page.headers, 'content-type': type },
      });
    }
    const body = request.method === 'HEAD' ? null : binary ? Uint8Array.from(atob(data), character => character.charCodeAt(0)) : data;
    return new Response(body, {
      headers: {
        ...ASSET_HEADERS,
        'content-type': type,
        'cache-control': path.startsWith('/vendor/') ? 'public, max-age=300' : 'no-cache',
      },
    });
  },
};
