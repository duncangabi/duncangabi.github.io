/**
 * Gaden Hub – Supabase client + connection helpers (Phase 1 extraction)
 * --------------------------------------------------------------------
 * Depends on: js/config.js (must be loaded first) and the Supabase JS SDK.
 *
 * Creates the global `sb` client and a few small utilities the rest of the
 * app already expects (netErr, checkConn, host).
 */
(function (global) {
  'use strict';

  const URL = global.SUPABASE_URL;
  const KEY = global.SUPABASE_KEY;

  if (!URL || !KEY) {
    console.error('[Gaden Hub] js/config.js must be loaded before js/supabase.js');
    return;
  }

  // ---------------------------------------------------------------------------
  // Client
  // ---------------------------------------------------------------------------
  let sb = null;
  try {
    if (global.supabase && !/YOUR_/.test(URL + KEY)) {
      sb = global.supabase.createClient(URL, KEY);
    }
  } catch (e) {
    console.warn('[Gaden Hub] Supabase client creation failed', e);
  }
  global.sb = sb;

  // ---------------------------------------------------------------------------
  // Small helpers used throughout the app
  // ---------------------------------------------------------------------------
  function host() {
    return String(URL || '').replace(/^https?:\/\//, '');
  }

  function netErr(e) {
    const msg = (e && e.message) || String(e || '');
    if (/fetch|network|load failed/i.test(msg)) {
      return 'Cannot reach the server (' + host() + '). Check your internet, or the project address.';
    }
    return msg;
  }

  /**
   * Lightweight health check. Shows a dismissible bar if the project is unreachable.
   * Safe to call on every page load.
   */
  async function checkConn() {
    if (!URL || !KEY) return;
    try {
      const r = await fetch(URL + '/auth/v1/health', {
        headers: { apikey: KEY }
      });
      if (r.status >= 500) throw new Error('down');
      const x = document.getElementById('connbar');
      if (x) x.remove();
    } catch (e) {
      if (document.getElementById('connbar')) return;
      const b = document.createElement('div');
      b.id = 'connbar';
      b.setAttribute('role', 'alert');
      b.style.cssText = 'position:sticky;top:0;z-index:9999;background:#b91c1c;color:#fff;padding:10px 16px;font:600 14px/1.4 system-ui,sans-serif;display:flex;gap:12px;align-items:center;justify-content:center';
      b.innerHTML = '<span>Connection problem: we cannot reach the Gaden Hub server right now. Please check your internet and try again.</span><button type="button" style="background:#fff;color:#b91c1c;border:0;border-radius:6px;padding:6px 12px;font:600 13px system-ui;cursor:pointer">Dismiss</button>';
      b.querySelector('button').onclick = () => b.remove();
      document.body.prepend(b);
    }
  }

  // Expose helpers the rest of the code already calls
  global.host = host;
  global.netErr = netErr;
  global.checkConn = checkConn;

  // Optional: run a background check shortly after load
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { setTimeout(checkConn, 800); });
    } else {
      setTimeout(checkConn, 800);
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sb, host, netErr, checkConn };
  }
})(typeof window !== 'undefined' ? window : globalThis);
