/**
 * Gaden Hub – Configuration (Phase 1 extraction)
 * ---------------------------------------------
 * All tunable constants live here so the giant index.html can gradually
 * stop owning them. Load this file before js/supabase.js and the main app.
 *
 * Keep values in sync with whatever is still hard-coded in index.html until
 * the old declarations are removed.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Core site + backend
  // ---------------------------------------------------------------------------
  const SUPPORT_EMAIL = 'gadenhub@gmail.com';
  const SUPABASE_URL  = 'https://bbcchmeiazqaacnjloqe.supabase.co';
  const SUPABASE_KEY  = 'sb_publishable_TrElhXUH1SfBqGNQbDhk2g_ULwYl9kD';

  // Canonical origin used for auth redirects and absolute links
  const CLEAN = /^https?:$/.test(location.protocol);
  const SITE_URL = CLEAN
    ? location.origin + '/'
    : location.origin + location.pathname;

  // ---------------------------------------------------------------------------
  // Papua New Guinea provinces (official list used across the app)
  // ---------------------------------------------------------------------------
  const PROV = [
    'Central', 'Chimbu', 'East New Britain', 'East Sepik', 'Eastern Highlands',
    'Enga', 'Gulf', 'Hela', 'Jiwaka', 'Madang', 'Manus', 'Milne Bay', 'Morobe',
    'New Ireland', 'Northern (Oro)', 'Southern Highlands', 'West New Britain',
    'West Sepik', 'Western', 'Western Highlands', 'Bougainville', 'NCD'
  ];

  // ---------------------------------------------------------------------------
  // Social links – leave empty string to hide the icon in the footer
  // ---------------------------------------------------------------------------
  const SOCIAL = {
    facebook: '',
    twitter:  '',
    instagram: '',
    youtube:  '',
    whatsapp: ''
  };

  // ---------------------------------------------------------------------------
  // Marketplace section definitions (categories, units, colours)
  // Kept here so pages can import them later without scraping the monolith.
  // ---------------------------------------------------------------------------
  const SEC = {
    fresh: {
      n: 'Garden produce', s: 'Garden produce', e: '🥬', c: '#2e9d57',
      d: 'Fresh vegetables, fruit, root crops and betel nut',
      cats: ['Vegetables', 'Root crops (taro, kaukau)', 'Fruits', 'Betel nut', 'Other fresh produce'],
      units: ['kg', 'bundle', 'bag', 'heap', 'dozen', 'each'],
      q: 'Quantity available', qp: '200 kg', x: 'Variety / grade'
    },
    live: {
      n: 'Livestock, poultry & fish', s: 'Livestock & poultry', e: '🐖', c: '#d9822b',
      d: 'Pigs, chickens, eggs, goats, cattle and fish',
      cats: ['Piggery', 'Poultry', 'Fisheries', 'Other livestock'],
      units: ['each', 'kg live weight', 'kg', 'dozen eggs', 'tray of eggs', 'carton'],
      q: 'Number available', qp: '12 piglets', x: 'Breed, age or weight'
    },
    cash: {
      n: 'Cocoa, coffee & cash crops', s: 'Cocoa, coffee & cash crops', e: '☕', c: '#8a5a2b',
      d: 'Cocoa, coffee, vanilla, oil palm and copra',
      cats: ['Cocoa', 'Coffee', 'Vanilla', 'Oil palm', 'Copra/Coconut'],
      units: ['kg', 'tonne', 'bag', 'litre'],
      q: 'Quantity available', qp: '2 tonnes', x: 'Form & grade (wet, dry, fermented)'
    },
    serv: {
      n: 'Farm services', s: 'Farm services', e: '🛻', c: '#7c3aed',
      d: 'Ploughing, transport, labour, vet, processing and storage',
      cats: ['Ploughing & land preparation', 'Transport & freight', 'Farm labour', 'Veterinary services', 'Processing & milling', 'Storage & warehousing', 'Other services'],
      units: ['day', 'hour', 'trip', 'job', 'hectare'],
      q: 'Capacity or rate', qp: 'Available weekdays', x: 'Coverage area'
    },
    mach: {
      n: 'Tools & machinery', s: 'Tools & machinery', e: '🛠️', c: '#0e7490',
      d: 'Tools, equipment, spare parts and hire',
      cats: ['Hand tools', 'Power tools', 'Machinery for hire', 'Spare parts', 'Other equipment'],
      units: ['each', 'set', 'day hire', 'week hire'],
      q: 'Number available', qp: '3 units', x: 'Condition / brand'
    }
  };

  const CROPS = [].concat(...Object.keys(SEC).map(k => SEC[k].cats), ['Other']);

  // ---------------------------------------------------------------------------
  // Expose everything on window so the existing monolithic code can see it
  // (and so we can later switch to ES modules without a big-bang rewrite).
  // ---------------------------------------------------------------------------
  const cfg = {
    SUPPORT_EMAIL,
    SUPABASE_URL,
    SUPABASE_KEY,
    SITE_URL,
    CLEAN,
    PROV,
    SOCIAL,
    SEC,
    CROPS
  };

  // Attach individual names for drop-in compatibility with current code
  Object.keys(cfg).forEach(k => { global[k] = cfg[k]; });
  global.GH_CONFIG = cfg;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = cfg;
  }
})(typeof window !== 'undefined' ? window : globalThis);
