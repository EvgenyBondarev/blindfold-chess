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
const TOGGLE_KEYS = ['moveNarration', 'drawNarration', 'positionNarration', 'puzzleSounds', 'seqInput'];
const TOGGLE_DEFAULTS = { moveNarration:true, drawNarration:true, positionNarration:false, puzzleSounds:true, seqInput:true };

chrome.storage.sync.get(TOGGLE_DEFAULTS, vals => {
  for (const k of TOGGLE_KEYS) document.getElementById(k).checked = vals[k];
});
for (const k of TOGGLE_KEYS) {
  document.getElementById(k).addEventListener('change', e => {
    chrome.storage.sync.set({ [k]: e.target.checked });
  });
}

// ── Narration speed ───────────────────────────────────────────────────────────
(function () {
  const slider = document.getElementById('narrationRate');
  const label  = document.getElementById('narrationRateVal');
  chrome.storage.sync.get({ narrationRate: 1.6 }, vals => {
    slider.value = vals.narrationRate;
    label.textContent = parseFloat(vals.narrationRate).toFixed(1) + '×';
  });
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    label.textContent = v.toFixed(1) + '×';
    chrome.storage.sync.set({ narrationRate: v });
  });
})();

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
  highlightActivePreset(pieceKeys, fileKeys, rankKeys);
}

function loadCastleInputs() {
  chrome.storage.sync.get({ castleKeys: { kingside: '', queenside: '' } }, vals => {
    document.getElementById('ck-ks').value = vals.castleKeys?.kingside  ?? '';
    document.getElementById('ck-qs').value = vals.castleKeys?.queenside ?? '';
  });
}

function presetsMatch(a, b) {
  const eq = (x, y) => Object.keys(x).every(k => x[k] === y[k]);
  return eq(a.pieceKeys, b.pieceKeys) && eq(a.fileKeys, b.fileKeys) && eq(a.rankKeys, b.rankKeys);
}

function highlightActivePreset(pieceKeys, fileKeys, rankKeys) {
  const cur = { pieceKeys, fileKeys, rankKeys };
  const isHomerow  = presetsMatch(cur, PRESETS.homerow);
  const isStandard = presetsMatch(cur, PRESETS.standard);
  document.getElementById('preset-homerow').classList.toggle('active', isHomerow);
  document.getElementById('preset-standard').classList.toggle('active', isStandard);
  document.getElementById('preset-custom').classList.toggle('active', !isHomerow && !isStandard);
  document.getElementById('castle-standard-view').style.display = isStandard ? '' : 'none';
  document.getElementById('castle-input-view').style.display    = isStandard ? 'none' : '';
  updateDisambigExample(pieceKeys, fileKeys, rankKeys);
}

function updateDisambigExample(pieceKeys, fileKeys, rankKeys) {
  const nk = pieceKeys.knight ?? '?';
  const dk = fileKeys.d ?? '?';
  const ek = fileKeys.e ?? '?';
  const tk = rankKeys['2'] ?? '?';
  const bk = fileKeys.b ?? '?';
  const k  = key => `<kbd>${key}</kbd>`;
  const el = document.getElementById('disambig-example');
  if (el) el.innerHTML =
    `e.g. ${k(nk)}${k(dk)}${k(tk)} → ambiguous → press ${k(bk)} (b-file) for Nbd2, or ${k(ek)} (e-file) for Ned2`;
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
  highlightActivePreset(pieceKeys, fileKeys, rankKeys);
}

// Load on open
chrome.storage.sync.get(LAYOUT_DEFAULTS, vals => {
  applyToInputs(vals.pieceKeys, vals.fileKeys, vals.rankKeys);
});
loadCastleInputs();

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
document.getElementById('preset-custom').addEventListener('click', () => {
  const empty = key => Object.fromEntries(Object.keys(PRESETS.homerow[key]).map(k => [k, '']));
  const pieceKeys  = empty('pieceKeys');
  const fileKeys   = empty('fileKeys');
  const rankKeys   = empty('rankKeys');
  const castleKeys = { kingside: '', queenside: '' };
  chrome.storage.sync.set({ pieceKeys, fileKeys, rankKeys, castleKeys }, loadCastleInputs);
  applyToInputs(pieceKeys, fileKeys, rankKeys);
});

// Custom castle key inputs — saved independently from the layout
function saveCastleKeys() {
  const castleKeys = {
    kingside:  document.getElementById('ck-ks').value,
    queenside: document.getElementById('ck-qs').value,
  };
  chrome.storage.sync.set({ castleKeys });
}
document.getElementById('ck-ks').addEventListener('input', function() {
  this.value = this.value.slice(-1).toLowerCase();
  saveCastleKeys();
});
document.getElementById('ck-qs').addEventListener('input', function() {
  this.value = this.value.slice(-1).toLowerCase();
  saveCastleKeys();
});

// ── Blindfold puzzle ──────────────────────────────────────────────────────────
(function () {
  const DEFAULT_URL = 'https://lichess.org/training/pawnEndgame/qJ3i1';
  const urlInput = document.getElementById('bp-url');
  const checkbox = document.getElementById('bp-activate');

  chrome.storage.sync.get({ blindfoldPuzzleUrl: DEFAULT_URL }, v => {
    urlInput.value = v.blindfoldPuzzleUrl;
  });

  urlInput.addEventListener('change', function () {
    chrome.storage.sync.set({ blindfoldPuzzleUrl: this.value.trim() });
  });

  checkbox.addEventListener('change', function () {
    if (!this.checked) return;
    this.checked = false;
    const url = urlInput.value.trim();
    if (!url) return;
    chrome.storage.sync.set({ blindfoldPuzzleUrl: url });
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]) chrome.tabs.update(tabs[0].id, { url });
    });
  });
})();

// ── Playlist ──────────────────────────────────────────────────────────────────
(function () {
  const statusEl = document.getElementById('pl-status');

  function updateUI() {
    chrome.storage.local.get({ playlistItems: [], playlistIndex: 0, playlistActive: false }, v => {
      const total = v.playlistItems.length;
      if (!total) { statusEl.textContent = 'No puzzles loaded'; return; }
      const rating = v.playlistItems[v.playlistIndex]?.[1] ?? '?';
      statusEl.style.color = v.playlistActive ? '#58a6ff' : '#888';
      statusEl.textContent = (v.playlistActive ? '▶ Active' : '■ Paused') +
                             ` — puzzle ${v.playlistIndex + 1} / ${total}  (rating ${rating})`;
    });
  }

  fetch(chrome.runtime.getURL('rl_puzzles.json'))
    .then(r => r.json())
    .then(ids => {
      chrome.storage.local.get({ playlistItems: [] }, v => {
        if (!v.playlistItems.length) chrome.storage.local.set({ playlistItems: ids });
        updateUI();
      });
    })
    .catch(() => { statusEl.textContent = 'Puzzle list not loaded'; });

  document.getElementById('pl-start').addEventListener('click', () => {
    chrome.storage.local.get({ playlistItems: [], playlistIndex: 0 }, v => {
      if (!v.playlistItems.length) return;
      chrome.storage.local.set({ playlistActive: true }, updateUI);
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]) chrome.tabs.update(tabs[0].id, {
          url: 'https://lichess.org/training/' + v.playlistItems[v.playlistIndex][0],
        });
      });
    });
  });

  document.getElementById('pl-stop').addEventListener('click', () => {
    chrome.storage.local.set({ playlistActive: false }, updateUI);
  });

  document.getElementById('pl-restart').addEventListener('click', () => {
    chrome.storage.local.get({ playlistItems: [], playlistActive: false }, v => {
      if (!v.playlistItems.length) return;
      chrome.storage.local.set({ playlistIndex: 0 }, updateUI);
      if (v.playlistActive) {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]) chrome.tabs.update(tabs[0].id, {
            url: 'https://lichess.org/training/' + v.playlistItems[0][0],
          });
        });
      }
    });
  });
})();
