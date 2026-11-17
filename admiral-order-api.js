(function (root) {
  'use strict';
  const slot = 'admiral.pending-order.v1';
  let memory = null;
  let client = null;
  let sending = false;
  function readPending() {
    try { return JSON.parse(root.sessionStorage.getItem(slot)) || memory; }
    catch (_) { return memory; }
  }
  function savePending(value) {
    memory = value;
    try {
      if (value) root.sessionStorage.setItem(slot, JSON.stringify(value));
      else root.sessionStorage.removeItem(slot);
    } catch (_) { /* Memory still protects retries if storage is unavailable. */ }
  }
  async function send(payload, suppliedClient) {
    if (sending) throw new Error('A request is already being sent.');
    sending = true;
    try {
      const cfg = root.ADMIRAL_SUPABASE_CONFIG || {};
      if (!cfg.url || !cfg.publishableKey) throw new Error('Service unavailable.');
      if (!suppliedClient && !client && root.supabase) {
        client = root.supabase.createClient(cfg.url, cfg.publishableKey);
      }
      const db = suppliedClient || client;
      if (!db) throw new Error('Service unavailable. Please reload this page.');
      const sessionResult = await db.auth.getSession();
      if (sessionResult.error) throw new Error('Please sign in again.');
      const session = sessionResult.data.session;
      // Store only a request UUID and digest, never contacts or an access token.
      const bytes = new TextEncoder().encode(JSON.stringify({payload, user: session?.user?.id || null}));
      const digest = await root.crypto.subtle.digest('SHA-256', bytes);
      const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      let pending = readPending();
      if (!pending || pending.hash !== hash || !/^[0-9a-f-]{36}$/i.test(pending.key || '')) {
        pending = {hash, key: root.crypto.randomUUID()};
        savePending(pending);
      }
      const response = await root.fetch(cfg.url.replace(/\/$/, '') + '/functions/v1/admiral-submit-order', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', apikey: cfg.publishableKey,
          ...(session?.access_token ? {Authorization: 'Bearer ' + session.access_token} : {})},
        body: JSON.stringify({...payload, request_key: pending.key})
      });
      if (response.ok) {
        const result = await response.clone().json().catch(() => null);
        if (!result?.ok || !result.order_id) throw new Error('Could not confirm your request. Please retry.');
        savePending(null);
      }
      return response;
    } finally { sending = false; }
  }
  root.AdmiralOrderApi = Object.freeze({send});
})(typeof window !== 'undefined' ? window : globalThis);
