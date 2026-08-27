'use strict';

// ── Presets ──────────────────────────────────────────────────────────────────
const PRESETS = {
  homerow: {
    pieceKeys: { king:'s', queen:'l', rook:'d', bishop:'k', knight:'j', pawn:'f' },
    fileKeys:  { a:'a', b:'s', c:'d', d:'f', e:'j', f:'k', g:'l', h:';' },
    rankKeys:  { '1':'a','2':'s','3':'d','4':'f','5':'j','6':'k','7':'l','8':';' },
  },
  standard: {
    pieceKeys: { king:'k', queen:'q', rook:'r', bishop:'b', knight:'n', pawn:'p' },
    fileKeys:  { a:'a', b:'b', c:'c', d:'d', e:'e', f:'f', g:'g', h:'h' },
    rankKeys:  { '1':'1','2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8' },
  },
};

// ── Toggle checkboxes ─────────────────────────────────────────────────────────
const TOGGLE_KEYS = ['moveNarration', 'drawNarration', 'puzzleSounds', 'seqInput'];
const TOGGLE_DEFAULTS = { moveNarration:true, drawNarration:true, puzzleSounds:true, seqInput:true };

chrome.storage.sync.get(TOGGLE_DEFAULTS, vals => {
  for (const k of TOGGLE_KEYS) document.getElementById(k).checked = vals[k];
});
for (const k of TOGGLE_KEYS) {
  document.getElementById(k).addEventListener('change', e => {
    chrome.storage.sync.set({ [k]: e.target.checked });
  });
}

// ── Key layout ────────────────────────────────────────────────────────────────
const LAYOUT_DEFAULTS = { ...PRESETS.homerow };

// Input element descriptors
const PIECE_IDS = ['king','queen','rook','bishop','knight','pawn'];
const FILE_IDS  = ['a','b','c','d','e','f','g','h'];
const RANK_IDS  = ['1','2','3','4','5','6','7','8'];

function readInputs() {
  const pieceKeys = {}, fileKeys = {}, rankKeys = {};
  for (const p of PIECE_IDS) pieceKeys[p] = document.getElementById('pk-'+p).value;
  for (const f of FILE_IDS)  fileKeys[f]  = document.getElementById('fk-'+f).value;
  for (const r of RANK_IDS)  rankKeys[r]  = document.getElementById('rk-'+r).value;
  return { pieceKeys, fileKeys, rankKeys };
}

function applyToInputs(pieceKeys, fileKeys, rankKeys) {
  for (const p of PIECE_IDS) document.getElementById('pk-'+p).value = pieceKeys[p] ?? '';
  for (const f of FILE_IDS)  document.getElementById('fk-'+f).value = fileKeys[f]  ?? '';
  for (const r of RANK_IDS)  document.getElementById('rk-'+r).value = rankKeys[r]  ?? '';
  updateCastlingDisplay(pieceKeys, fileKeys, rankKeys);
  highlightActivePreset(pieceKeys, fileKeys, rankKeys);
}

function updateCastlingDisplay(pieceKeys, fileKeys, rankKeys) {
  const k = (key) => key ? `<kbd>${key}</kbd>` : '<kbd>?</kbd>';
  const pk = pieceKeys.king ?? '?';
  const g  = fileKeys.g    ?? '?';
  const c  = fileKeys.c    ?? '?';
  const r1 = rankKeys['1'] ?? '?';
  const r8 = rankKeys['8'] ?? '?';
  document.getElementById('castle-ks').innerHTML = k(pk)+k(g)+k(r1);
  document.getElementById('castle-qs').innerHTML = k(pk)+k(c)+k(r1);
}

function presetsMatch(a, b) {
  const eq = (x, y) => Object.keys(x).every(k => x[k] === y[k]);
  return eq(a.pieceKeys, b.pieceKeys) && eq(a.fileKeys, b.fileKeys) && eq(a.rankKeys, b.rankKeys);
}

function highlightActivePreset(pieceKeys, fileKeys, rankKeys) {
  const cur = { pieceKeys, fileKeys, rankKeys };
  document.getElementById('preset-homerow').classList.toggle('active', presetsMatch(cur, PRESETS.homerow));
  document.getElementById('preset-standard').classList.toggle('active', presetsMatch(cur, PRESETS.standard));
}

// Validate: no duplicate keys within the same group; highlight errors
function validate(pieceKeys, fileKeys, rankKeys) {
  let ok = true;
  const check = (ids, prefix, map) => {
    const seen = {};
    for (const id of ids) {
      const el  = document.getElementById(prefix + id);
      const val = map[id];
      const dup = val && seen[val];
      el.classList.toggle('err', !val || dup);
      if (!val || dup) ok = false;
      if (val) seen[val] = true;
    }
  };
  check(PIECE_IDS, 'pk-', pieceKeys);
  check(FILE_IDS,  'fk-', fileKeys);
  check(RANK_IDS,  'rk-', rankKeys);
  return ok;
}

function saveLayout() {
  const { pieceKeys, fileKeys, rankKeys } = readInputs();
  if (!validate(pieceKeys, fileKeys, rankKeys)) return;
  chrome.storage.sync.set({ pieceKeys, fileKeys, rankKeys });
  updateCastlingDisplay(pieceKeys, fileKeys, rankKeys);
  highlightActivePreset(pieceKeys, fileKeys, rankKeys);
}

// Load on open
chrome.storage.sync.get(LAYOUT_DEFAULTS, vals => {
  applyToInputs(vals.pieceKeys, vals.fileKeys, vals.rankKeys);
});

// Single-char enforcement + save on each input change
for (const p of PIECE_IDS) {
  document.getElementById('pk-'+p).addEventListener('input', function() {
    this.value = this.value.slice(-1).toLowerCase();
    saveLayout();
  });
}
for (const f of FILE_IDS) {
  document.getElementById('fk-'+f).addEventListener('input', function() {
    this.value = this.value.slice(-1).toLowerCase();
    saveLayout();
  });
}
for (const r of RANK_IDS) {
  document.getElementById('rk-'+r).addEventListener('input', function() {
    this.value = this.value.slice(-1).toLowerCase();
    saveLayout();
  });
}

// Preset buttons
document.getElementById('preset-homerow').addEventListener('click', () => {
  const p = PRESETS.homerow;
  chrome.storage.sync.set({ pieceKeys: p.pieceKeys, fileKeys: p.fileKeys, rankKeys: p.rankKeys });
  applyToInputs(p.pieceKeys, p.fileKeys, p.rankKeys);
});
document.getElementById('preset-standard').addEventListener('click', () => {
  const p = PRESETS.standard;
  chrome.storage.sync.set({ pieceKeys: p.pieceKeys, fileKeys: p.fileKeys, rankKeys: p.rankKeys });
  applyToInputs(p.pieceKeys, p.fileKeys, p.rankKeys);
});
