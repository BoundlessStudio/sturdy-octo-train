export const ASSET_HEADERS = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' data:; img-src 'self' data: blob:; font-src 'self' data:; media-src data: blob:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

export function appDocument(markup) {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  return {
    markup: markup.replace('id="app-entry"', 'id="app-entry" nonce="' + nonce + '"'),
    headers: {
      ...ASSET_HEADERS,
      'content-security-policy': ASSET_HEADERS['content-security-policy']
        .replace("script-src 'self'", "script-src 'self' 'nonce-" + nonce + "'"),
      'cache-control': 'no-store',
    },
  };
}

export const VENDOR_FILES = {
  '/vendor/three.module.js': 'three/build/three.module.js',
  '/vendor/three.core.js': 'three/build/three.core.js',
  '/vendor/space-grotesk.woff2': '@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2',
  '/vendor/inter.woff2': '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
};

export const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
