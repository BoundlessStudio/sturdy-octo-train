const CLEANUP_URL = 'https://scroll.rgbknights.com/api/maintenance/sandboxes';

export default {
  fetch() {
    return new Response('Not found', { status: 404 });
  },

  async scheduled(_event, env) {
    const { siteToken, expiryToken } = JSON.parse(env.SCROLLWORKS_EXPIRY_CREDENTIALS);
    const response = await fetch(CLEANUP_URL, {
      method: 'POST',
      headers: {
        'OAI-Sites-Authorization': 'Bearer ' + siteToken,
        'X-Scrollworks-Expiry-Token': expiryToken,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error('Scrollworks cleanup returned HTTP ' + response.status);
    const { expired, deleted, failed } = await response.json();
    console.log('Scrollworks sandbox cleanup', { expired, deleted, failed });
  },
};
