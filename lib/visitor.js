const COOKIE = '__Host-scrollworks-visitor';
const visitorCookie = /(?:^|;\s*)__Host-scrollworks-visitor=([a-f0-9]{32})\.([a-f0-9]{64})(?:;|$)/;
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');

export async function identifyVisitor(request, token, issue) {
  const account = request.headers.get('oai-authenticated-user-id');
  if (account) return { owner: hex(await crypto.subtle.digest('SHA-256', encoder.encode(account))) };

  if (typeof token !== 'string' || token.length < 32) return { owner: '' };
  const match = visitorCookie.exec(request.headers.get('cookie') || '');
  if (!match && !issue) return { owner: '' };

  const key = await crypto.subtle.importKey('raw', encoder.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  // Scope cookie signatures separately from the private Agent37 service credential.
  const message = id => encoder.encode('scrollworks visitor v1:' + id);
  if (match) {
    const [, id, signature] = match;
    const bytes = Uint8Array.from(signature.match(/../g), byte => Number.parseInt(byte, 16));
    if (await crypto.subtle.verify('HMAC', key, bytes, message(id))) return { owner: 'guest:' + id };
  }

  if (!issue) return { owner: '' };
  const id = crypto.randomUUID().replaceAll('-', '');
  const signature = hex(await crypto.subtle.sign('HMAC', key, message(id)));
  return {
    owner: 'guest:' + id,
    cookie: `${COOKIE}=${id}.${signature}; Path=/; Secure; HttpOnly; SameSite=Strict`,
  };
}
