/**
 * Gaden Hub – Safe rendering helpers
 * ---------------------------------
 * Drop this into the page (or import it once the app is modularised).
 * Use these instead of raw string concatenation / innerHTML with user data.
 *
 * Usage examples:
 *   el.textContent = user.name;                    // best for plain text
 *   el.innerHTML = html`<div>${esc(user.name)}</div>`;  // when you need markup
 *   el.setAttribute('href', safeUrl(user.link));
 *   el.innerHTML = `<img src="${attr(user.photo)}" alt="${attr(user.name)}">`;
 */

(function (global) {
  'use strict';

  /** Escape for HTML text content (the most common case). */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Escape for use inside HTML attribute values. */
  function attr(s) {
    return esc(s).replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
  }

  /**
   * Allow only safe URLs for href/src.
   * Rejects javascript:, data: (except images), vbscript:, etc.
   */
  function safeUrl(u) {
    if (u == null || u === '') return '';
    const s = String(u).trim();
    // Allow relative paths and common safe protocols
    if (/^(\/|#|https?:|mailto:|tel:)/i.test(s)) return s;
    // Allow data:image/* for profile photos that are still data-URIs
    if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(s)) return s;
    // Everything else is rejected
    return '';
  }

  /**
   * Tiny tagged-template helper so you can write:
   *   html`<p>Hello ${user.name}</p>`
   * and every interpolated value is automatically escaped.
   * Static parts of the template are left untouched (you control those).
   */
  function html(strings, ...values) {
    let out = strings[0];
    for (let i = 0; i < values.length; i++) {
      out += esc(values[i]) + strings[i + 1];
    }
    return out;
  }

  /**
   * Prefer this over el.innerHTML = ... when the content is mostly text.
   * Clears the element and appends a text node.
   */
  function setText(el, text) {
    if (!el) return;
    el.textContent = text == null ? '' : String(text);
  }

  /**
   * Safe-ish innerHTML setter that still requires you to escape user data
   * (or use the html`` helper). Kept for gradual migration.
   */
  function setHTML(el, markup) {
    if (!el) return;
    el.innerHTML = markup == null ? '' : String(markup);
  }

  // Expose on window so the existing monolithic code can call them
  global.esc = esc;
  global.attr = attr;
  global.safeUrl = safeUrl;
  global.html = html;
  global.setText = setText;
  global.setHTML = setHTML;

  // Also support module-style usage later
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { esc, attr, safeUrl, html, setText, setHTML };
  }
})(typeof window !== 'undefined' ? window : globalThis);
