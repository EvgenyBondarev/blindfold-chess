'use strict';
const KEYS = ['moveNarration', 'drawNarration', 'puzzleSounds', 'seqInput'];
const DEFAULTS = { moveNarration: true, drawNarration: true, puzzleSounds: true, seqInput: true };

chrome.storage.sync.get(DEFAULTS, vals => {
  for (const k of KEYS) document.getElementById(k).checked = vals[k];
});

for (const k of KEYS) {
  document.getElementById(k).addEventListener('change', e => {
    chrome.storage.sync.set({ [k]: e.target.checked });
  });
}
