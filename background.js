'use strict';

// ── GET_STATE (runs in MAIN world via executeScript) ─────────────────────────
function getPageState() {
  // ── Lichess (chessground) ──────────────────────────────────────────────────
  var cgBoard = document.querySelector('cg-board');
  if (cgBoard) {
    var cgRect = cgBoard.getBoundingClientRect();
    var sq = cgRect.width / 8;
    // clientWidth matches what chessground uses internally for transforms; prefer it
    var sqCss = (cgBoard.clientWidth / 8) || sq;
    if (!sqCss) return { pieces: {}, orientation: 'white', count: 0, site: 'lichess' };
    if (!sq) sq = sqCss;

    // ── Orientation detection (2 methods) ─────────────────────────────────────
    var oriented = 'white';
    var orientationFromDOM = false;
    // Method 1: walk parent elements for an orientation class or data attribute
    var scanEl = cgBoard.parentElement;
    while (scanEl && scanEl !== document.body) {
      if (/\borientation-black\b/.test(scanEl.className || '') ||
          scanEl.getAttribute('data-orientation') === 'black') {
        oriented = 'black'; orientationFromDOM = true; break;
      }
      scanEl = scanEl.parentElement;
    }
    // Method 2: rank coord labels — find '1' and check if it's visually at top or bottom
    if (!orientationFromDOM) {
      var ranksEl = document.querySelector('coords.ranks');
      if (ranksEl) {
        var coord1 = Array.from(ranksEl.querySelectorAll('coord')).find(function(c) {
          return c.textContent.trim() === '1';
        });
        if (coord1) {
          var r1 = coord1.getBoundingClientRect();
          // If rank '1' label is in the top half of the board, the board is flipped
          if (r1.top < cgRect.top + cgRect.height / 2) { oriented = 'black'; orientationFromDOM = true; }
        }
      }
    }

    var LN2F = {1:'a',2:'b',3:'c',4:'d',5:'e',6:'f',7:'g',8:'h'};

    function parseLichessPieces(ori) {
      var result = {};
      var pEls = Array.from(cgBoard.querySelectorAll('piece'));
      if (!pEls.length) pEls = Array.from(cgBoard.querySelectorAll('[class~="king"],[class~="queen"],[class~="rook"],[class~="bishop"],[class~="knight"],[class~="pawn"]'));
      pEls.forEach(function(p) {
        var cls = p.className || '';
        var cm = cls.match(/\b(white|black)\b/);
        var tm = cls.match(/\b(king|queen|rook|bishop|knight|pawn)\b/);
        if (!cm || !tm) return;
        var col = -1, row = -1;
        // Primary: read chessground's inline transform (translate(Xpx, Ypx))
        var tf = p.style.transform || '';
        var tfM = tf.match(/translate\(\s*([-\d.]+)px[^,]*,\s*([-\d.]+)px/) ||
                  tf.match(/translate3d\(\s*([-\d.]+)px[^,]*,\s*([-\d.]+)px/);
        if (tfM) {
          col = Math.round(parseFloat(tfM[1]) / sqCss);
          row = Math.round(parseFloat(tfM[2]) / sqCss);
        }
        // Fallback: getBoundingClientRect
        if (col < 0 || col > 7 || row < 0 || row > 7) {
          var pr = p.getBoundingClientRect();
          col = Math.round((pr.left - cgRect.left) / sq);
          row = Math.round((pr.top  - cgRect.top)  / sq);
        }
        var file, rank;
        if (ori === 'white') { file = LN2F[col + 1]; rank = 8 - row; }
        else                 { file = LN2F[8 - col];  rank = row + 1; }
        console.log('[Blindfold] piece', cm[1], tm[1], '→', file + rank,
                    '| tf:', tf || 'none', '| col:', col, 'row:', row);
        if (file && rank >= 1 && rank <= 8)
          result[file + rank] = { file: file, rank: rank, color: cm[1], type: tm[1] };
      });
      return result;
    }

    // Try chessground API getFen() — logical position, immune to mid-animation transforms
    var cgApi = (function() {
      // Check element properties first (fastest path)
      var propNames = ['cg', '__cg', 'chessground', 'api', '__api', '_chessground'];
      var elements = [cgBoard, cgBoard.parentElement, cgBoard.closest('.cg-wrap')];
      for (var ei = 0; ei < elements.length; ei++) {
        if (!elements[ei]) continue;
        for (var pi = 0; pi < propNames.length; pi++) {
          var cand = elements[ei][propNames[pi]];
          if (cand && typeof cand.getFen === 'function') return cand;
        }
      }
      // Try well-known Lichess global paths
      try {
        var lc = window.lichess;
        if (lc) {
          var subs = ['puzzle', 'analysis', 'round', 'board'];
          for (var si = 0; si < subs.length; si++) {
            var sub = lc[subs[si]];
            if (!sub) continue;
            if (typeof sub.getFen === 'function') return sub;
            for (var pi2 = 0; pi2 < propNames.length; pi2++) {
              var cand2 = sub[propNames[pi2]];
              if (cand2 && typeof cand2.getFen === 'function') return cand2;
            }
          }
        }
      } catch(e) {}
      // Bounded window search (depth 5, up to 30 keys per object)
      var seen = new Set();
      function search(obj, d) {
        if (d > 5 || !obj || seen.has(obj)) return null;
        var tp = typeof obj;
        if (tp !== 'object' && tp !== 'function') return null;
        seen.add(obj);
        try {
          if (typeof obj.setShapes === 'function' && typeof obj.getFen === 'function') return obj;
          var ks = Object.keys(obj);
          for (var i = 0; i < Math.min(ks.length, 30); i++) {
            try { var r = search(obj[ks[i]], d + 1); if (r) return r; } catch(e) {}
          }
        } catch(e) {}
        return null;
      }
      return search(window, 0);
    })();

    var pieces;
    if (cgApi && typeof cgApi.getFen === 'function') {
      var FEN_TYPES = {p:'pawn',r:'rook',n:'knight',b:'bishop',q:'queen',k:'king'};
      var fenStr = cgApi.getFen();
      var fenRows = fenStr.split('/');
      var fenPieces = {};
      for (var fi = 0; fi < fenRows.length; fi++) {
        var fenRank = 8 - fi;
        var fenCol = 0;
        for (var fj = 0; fj < fenRows[fi].length; fj++) {
          var fc = fenRows[fi][fj];
          if (fc >= '1' && fc <= '8') { fenCol += +fc; continue; }
          var fcolor = fc === fc.toUpperCase() ? 'white' : 'black';
          var ftype = FEN_TYPES[fc.toLowerCase()];
          var ffile = LN2F[fenCol + 1];
          if (ffile && ftype) fenPieces[ffile + fenRank] = { file: ffile, rank: fenRank, color: fcolor, type: ftype };
          fenCol++;
        }
      }
      if (Object.keys(fenPieces).length > 0) {
        console.log('[Blindfold] FEN:', fenStr, '| pieces:', Object.keys(fenPieces).length);
        pieces = fenPieces;
      }
    }
    if (!pieces) pieces = parseLichessPieces(oriented);

    // Orientation correction.
    // FEN path: piece ranks are always correct so rank-based heuristics don't apply
    // (e.g. a king at h7/f8 would falsely trigger them). Instead, compare a king's
    // CSS transform column against the column its FEN file predicts for each orientation.
    // CSS path: fall back to rank heuristic (wrong orientation makes kings appear at rank 1/8).
    if (typeof fenPieces !== 'undefined' && pieces === fenPieces) {
      var F2N_c = {a:1,b:2,c:3,d:4,e:5,f:6,g:7,h:8};
      var ck = Object.values(fenPieces).find(function(p) { return p.type === 'king'; });
      if (ck) {
        var ckEl = Array.from(cgBoard.querySelectorAll('piece')).find(function(el) {
          var c = el.className || ''; return c.indexOf(ck.color) !== -1 && c.indexOf('king') !== -1;
        });
        if (ckEl) {
          var ckTf = ckEl.style.transform || '';
          var ckM = ckTf.match(/translate\(\s*([-\d.]+)px[^,]*,\s*([-\d.]+)px/) ||
                    ckTf.match(/translate3d\(\s*([-\d.]+)px[^,]*,\s*([-\d.]+)px/);
          if (ckM) {
            var ckCol = Math.round(parseFloat(ckM[1]) / sqCss);
            oriented = (ckCol === 8 - F2N_c[ck.file]) ? 'black' : 'white';
          }
        }
      }
    } else if (!orientationFromDOM) {
      // CSS rank heuristic — only runs when neither DOM method gave an answer,
      // because a legitimate piece position (e.g. white king at h7) would otherwise
      // wrongly flip a correctly-detected orientation.
      if (oriented === 'white') {
        var bk = Object.values(pieces).find(function(p) { return p.color === 'black' && p.type === 'king'; });
        if (bk && bk.rank <= 2) { oriented = 'black'; if (!cgApi) pieces = parseLichessPieces('black'); }
      } else {
        var wk = Object.values(pieces).find(function(p) { return p.color === 'white' && p.type === 'king'; });
        if (wk && wk.rank >= 7) { oriented = 'white'; if (!cgApi) pieces = parseLichessPieces('white'); }
      }
    }

    console.log('[Blindfold] lichess orientation:', oriented, 'pieces:', Object.keys(pieces).length);
    return { pieces: pieces, orientation: oriented, count: Object.keys(pieces).length, site: 'lichess' };
  }

  // ── Chess.com ──────────────────────────────────────────────────────────────
  function qAll(sel, root) {
    var res = [];
    try { res.push.apply(res, root.querySelectorAll(sel)); } catch(e) {}
    try {
      root.querySelectorAll('*').forEach(function(el) {
        if (el.shadowRoot) res.push.apply(res, qAll(sel, el.shadowRoot));
      });
    } catch(e) {}
    return res;
  }

  var NUM_FILE = {1:'a',2:'b',3:'c',4:'d',5:'e',6:'f',7:'g',8:'h'};
  var CSS_TYPE = {p:'pawn',r:'rook',n:'knight',b:'bishop',q:'queen',k:'king'};

  function hasClass(el, name) {
    return (' '+(el.className||'')+' ').includes(' '+name+' ');
  }
  function parseEl(el) {
    var cls = el.className || '';
    var sqM = cls.match(/square-(\d)(\d)/);
    if (!sqM) return null;
    var file = NUM_FILE[+sqM[1]], rank = +sqM[2];
    if (!file || !rank) return null;
    for (var ci=0; ci<2; ci++) {
      var c = ['w','b'][ci];
      for (var ti=0; ti<6; ti++) {
        var t = ['p','r','n','b','q','k'][ti];
        if (hasClass(el, c+t))
          return {file:file, rank:rank, color:c==='w'?'white':'black', type:CSS_TYPE[t]};
      }
    }
    var style = el.getAttribute('style') || '';
    var m = style.match(/\/([wb])([prnbqk])\.(png|svg)/i);
    if (m) return {file:file, rank:rank, color:m[1].toLowerCase()==='w'?'white':'black', type:CSS_TYPE[m[2].toLowerCase()]};
    return null;
  }

  var pieceEls = qAll('.piece', document);
  if (!pieceEls.length) pieceEls = qAll('[class*="piece"][class*="square"]', document);

  var pieces = {};
  pieceEls.forEach(function(el) { var p=parseEl(el); if(p) pieces[p.file+p.rank]=p; });

  var board = null;
  if (pieceEls.length) {
    var rootNode = pieceEls[0].getRootNode();
    board = (rootNode instanceof ShadowRoot) ? rootNode.host
          : (pieceEls[0].closest('[class*="board"]') || pieceEls[0].parentElement);
  }
  var orientation = 'white';
  if (board) {
    if (board.getAttribute('board-orientation') === 'black' ||
        board.getAttribute('data-orientation')  === 'black' ||
        board.classList.contains('flipped')) orientation = 'black';
  }

  return { pieces: pieces, orientation: orientation, count: Object.keys(pieces).length, site: 'chesscom' };
}

// ── OVERLAY_ARROWS (runs in MAIN world via executeScript) ────────────────────
// Draws a fixed-position SVG overlay on top of the board.
// Uses pixel coordinates from getBoardRect, so it works on both Lichess and
// Chess.com without needing to find chessground's internal SVG structure.
// Arrowheads are polygon elements (no <marker>) to avoid url(#id) base-href issues.
function overlayArrows(shapes, board) {
  var NS  = 'http://www.w3.org/2000/svg';
  var ID  = 'bf-arrow-overlay';
  var old = document.getElementById(ID);
  if (old) old.remove();
  if (!shapes || !shapes.length) return true;

  var size  = board.width;
  var sq    = size / 8;
  var FN    = {a:1,b:2,c:3,d:4,e:5,f:6,g:7,h:8};
  var color = '#15781B';
  var lw    = sq * 0.15;

  function xy(file, rank) {
    var col = board.flipped ? 8 - FN[file] : FN[file] - 1;
    var row = board.flipped ? rank - 1      : 8 - rank;
    return { x: col*sq + sq/2, y: row*sq + sq/2 };
  }

  var svg = document.createElementNS(NS, 'svg');
  svg.id = ID;
  svg.style.cssText = 'position:fixed;left:' + board.left + 'px;top:' + board.top + 'px;' +
    'width:' + size + 'px;height:' + size + 'px;pointer-events:none;z-index:9999;overflow:visible;';
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);

  shapes.forEach(function(shape) {
    var f1 = shape.orig[0], r1 = parseInt(shape.orig[1]);
    var f2 = shape.dest[0], r2 = parseInt(shape.dest[1]);
    if (!FN[f1] || !FN[f2] || !r1 || !r2) return;
    var src = xy(f1, r1), dst = xy(f2, r2);

    if (f1 === f2 && r1 === r2) {
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', src.x); c.setAttribute('cy', src.y);
      c.setAttribute('r', lw * 3.5);
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke', color);
      c.setAttribute('stroke-width', lw);
      c.setAttribute('opacity', '0.6');
      svg.appendChild(c);
    } else {
      var dx = dst.x - src.x, dy = dst.y - src.y;
      var len = Math.sqrt(dx*dx + dy*dy);
      if (!len) return;
      var ux = dx/len, uy = dy/len;
      var nx = -uy, ny = ux;       // unit perpendicular
      var aw = lw * 2.5, al = lw * 5;  // arrowhead half-width, full length
      var baseX = dst.x - ux*al, baseY = dst.y - uy*al;

      var line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', src.x); line.setAttribute('y1', src.y);
      line.setAttribute('x2', baseX); line.setAttribute('y2', baseY);
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', lw);
      svg.appendChild(line);

      var poly = document.createElementNS(NS, 'polygon');
      poly.setAttribute('points',
        dst.x+','+dst.y+' '+
        (baseX+nx*aw)+','+(baseY+ny*aw)+' '+
        (baseX-nx*aw)+','+(baseY-ny*aw));
      poly.setAttribute('fill', color);
      svg.appendChild(poly);
    }
  });

  document.body.appendChild(svg);
  console.log('[Blindfold] overlay: drew', shapes.length, 'shape(s) at board',
    Math.round(board.left), Math.round(board.top), Math.round(size));
  return true;
}

// ── CLEAR_DRAWINGS (runs in MAIN world via executeScript) ────────────────────
// shapesToClear: [{orig:'a1', dest:'c3'}, ...] — used to toggle each shape off
// when the chessground API can't be found (synthetic events are additive/toggle).
function clearPageDrawings(shapesToClear, flipped) {
  var cg = document.querySelector('cg-board');
  if (cg) {
    // Fast path: some integrations store the API on .cg-wrap
    var wrap = cg.closest('.cg-wrap') || cg.parentElement;
    if (wrap) {
      var direct = wrap.cg || wrap.__cg || wrap.chessground;
      if (direct && typeof direct.setShapes === 'function') { direct.setShapes([]); return true; }
    }
    // Bounded window search (depth 4, up to 25 keys per object)
    var seen = new Set();
    function find(obj, d) {
      if (d > 4 || !obj || seen.has(obj)) return null;
      var tp = typeof obj;
      if (tp !== 'object' && tp !== 'function') return null;
      seen.add(obj);
      try {
        if (typeof obj.setShapes === 'function' && typeof obj.getFen === 'function') return obj;
        var ks = Object.keys(obj);
        for (var i = 0; i < Math.min(ks.length, 25); i++) {
          try { var r = find(obj[ks[i]], d + 1); if (r) return r; } catch(e) {}
        }
      } catch(e) {}
      return null;
    }
    var api = find(window, 0);
    if (api) { api.setShapes([]); return true; }
    // API not found: remove our directly-injected SVG elements
    var cgSvgs = Array.from(document.querySelectorAll('.cg-wrap svg'))
                      .concat(Array.from(document.querySelectorAll('cg-board > svg')));
    cgSvgs.forEach(function(s) {
      s.querySelectorAll('[data-bf]').forEach(function(el) { el.remove(); });
    });
    return true;
  }
  // Chess.com: handled by Escape fallback in background
  return false;
}

// ── GET_BOARD_RECT (runs in MAIN world via executeScript) ────────────────────
function getBoardRect() {
  // ── Lichess ────────────────────────────────────────────────────────────────
  // Use cg-board: pieces are translated relative to it, so its rect gives exact coordinates.
  var cg = document.querySelector('cg-board');
  if (cg) {
    var r = cg.getBoundingClientRect();
    if (!r.width) return null;
    var flipped = false;
    // Method 1: parent element orientation class
    var scanEl = cg.parentElement;
    while (scanEl && scanEl !== document.body) {
      if (/\borientation-black\b/.test(scanEl.className || '') ||
          scanEl.getAttribute('data-orientation') === 'black') { flipped = true; break; }
      scanEl = scanEl.parentElement;
    }
    // Method 2: rank coord labels — find '1' and check if it's visually at top or bottom
    if (!flipped) {
      var ranksEl = document.querySelector('coords.ranks');
      if (ranksEl) {
        var coord1 = Array.from(ranksEl.querySelectorAll('coord')).find(function(c) {
          return c.textContent.trim() === '1';
        });
        if (coord1) {
          var r1 = coord1.getBoundingClientRect();
          if (r1.top < r.top + r.height / 2) flipped = true;
        }
      }
    }
    // Method 3: black king position — if it's in the bottom half, board is flipped
    if (!flipped) {
      var bkEl = Array.from(cg.querySelectorAll('piece')).find(function(p) {
        var c = p.className || ''; return c.includes('black') && c.includes('king');
      });
      if (bkEl) {
        var bkR = bkEl.getBoundingClientRect();
        if ((bkR.top - r.top) / (r.width / 8) > 3.5) flipped = true;
      }
    }
    return { left: r.left, top: r.top, width: r.width, flipped: flipped, site: 'lichess' };
  }

  // ── Chess.com ──────────────────────────────────────────────────────────────
  var board = document.querySelector('wc-chess-board')
           || document.querySelector('[class*="chess-board"]');
  if (!board) return null;
  var r = board.getBoundingClientRect();
  if (!r.width) return null;
  var flipped = board.getAttribute('board-orientation') === 'black'
             || board.getAttribute('data-orientation')  === 'black'
             || board.classList.contains('flipped');
  return { left: r.left, top: r.top, width: r.width, flipped: flipped, site: 'chesscom' };
}

// ── SET_SHAPES (runs in MAIN world via executeScript) ────────────────────────
function setPageShapes(shapes) {
  var cg = document.querySelector('cg-board');
  if (!cg) return false;
  function callApi(api) {
    if (api.state && api.state.drawable) api.state.drawable.enabled = true;
    api.setShapes(shapes);
    console.log('[Blindfold] setShapes OK, count:', shapes.length);
    return true;
  }
  var wrap = cg.closest('.cg-wrap') || cg.parentElement;
  if (wrap) {
    var direct = wrap.cg || wrap.__cg || wrap.chessground;
    if (direct && typeof direct.setShapes === 'function') return callApi(direct);
  }
  var seen = new Set();
  function find(obj, d) {
    if (d > 4 || !obj || seen.has(obj)) return null;
    var tp = typeof obj;
    if (tp !== 'object' && tp !== 'function') return null;
    seen.add(obj);
    try {
      if (typeof obj.setShapes === 'function' && typeof obj.getFen === 'function') return obj;
      var ks = Object.keys(obj);
      for (var i = 0; i < Math.min(ks.length, 25); i++) {
        try { var r = find(obj[ks[i]], d + 1); if (r) return r; } catch(e) {}
      }
    } catch(e) {}
    return null;
  }
  var api = find(window, 0);
  if (api) return callApi(api);
  console.log('[Blindfold] setShapes: API not found, falling back to CDP');
  return false;
}

// ── Chrome Debugger Protocol helpers ─────────────────────────────────────────
// Keep the debugger attached for the whole game (banner appears once, not per move).
const debuggedTabs = new Set();

function dbgCmd(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params || {}, result => {
      chrome.runtime.lastError
        ? reject(new Error(chrome.runtime.lastError.message))
        : resolve(result);
    });
  });
}

function ensureAttached(tabId) {
  if (debuggedTabs.has(tabId)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        const m = chrome.runtime.lastError.message || '';
        if (m.includes('already attached')) { debuggedTabs.add(tabId); resolve(); }
        else reject(new Error(m));
      } else { debuggedTabs.add(tabId); resolve(); }
    });
  });
}

// Detach when the tab navigates away or closes
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && debuggedTabs.has(tabId)) {
    chrome.debugger.detach({ tabId }, () => chrome.runtime.lastError);
    debuggedTabs.delete(tabId);
  }
});
chrome.tabs.onRemoved.addListener(tabId => {
  if (debuggedTabs.has(tabId)) {
    chrome.debugger.detach({ tabId }, () => chrome.runtime.lastError);
    debuggedTabs.delete(tabId);
  }
});

// ── Coordinate helpers ────────────────────────────────────────────────────────
const FILE_NUM = { a:1, b:2, c:3, d:4, e:5, f:6, g:7, h:8 };

function squareXY(rect, file, rank) {
  const size = rect.width / 8;
  const col  = rect.flipped ? (8 - FILE_NUM[file]) : (FILE_NUM[file] - 1);
  const row  = rect.flipped ? (rank - 1)           : (8 - rank);
  return {
    x: Math.round(rect.left + col * size + size / 2),
    y: Math.round(rect.top  + row * size + size / 2),
  };
}

async function getRect(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: getBoardRect,
    world: 'MAIN',
  }).catch(() => []);
  return results.find(r => r.result?.width > 0)?.result ?? null;
}

// ── Message router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!sender.tab) return;
  const tabId = sender.tab.id;

  if (msg.type === 'SPEAK_STOP') { chrome.tts.stop(); return false; }

  // SPEAK / SPEAK_QUEUED — routed through background to bypass page autoplay restrictions
  if (msg.type === 'SPEAK') {
    chrome.tts.speak(msg.text, { voiceName: 'Microsoft David - English (United States)', rate: msg.rate || 1.6, enqueue: false });
    return false;
  }
  if (msg.type === 'SPEAK_QUEUED') {
    chrome.tts.speak(msg.text, { voiceName: 'Microsoft David - English (United States)', rate: msg.rate || 1.6, enqueue: true });
    return false;
  }

  // GET_STATE — polls until two consecutive reads give the same position (animation settled)
  if (msg.type === 'GET_STATE') {
    (async () => {
      const read = () => chrome.scripting.executeScript({
        target: { tabId, allFrames: true }, func: getPageState, world: 'MAIN',
      }).then(results => {
        const hit = results.find(r => r.result?.count > 0);
        return hit?.result ?? { pieces: {}, orientation: 'white', count: 0, site: 'unknown' };
      });
      const plist = r => Object.entries(r.pieces || {})
        .map(([k, v]) => v.color[0] + v.type[0] + '@' + k).sort().join(' ');

      let prev = null, result = null;
      for (let i = 0; i < 4; i++) {
        result = await read();
        const pl = plist(result);
        if (pl === prev && pl !== '') break;
        prev = pl;
        if (i < 3) await new Promise(r => setTimeout(r, 80));
      }

      const pl = Object.entries(result.pieces || {}).map(([k,v]) => v.color[0]+v.type[0]+'@'+k).join(' ');
      console.log('[Blindfold BG] GET_STATE', result.site, result.orientation, result.count+'p |', pl);
      sendResponse(result);
    })().catch(err => { console.error('[BG]', err.message); sendResponse({ pieces: {}, orientation: 'white' }); });
    return true;
  }

  // CLICK_MOVE — lichess uses click-click (no fist), chess.com uses drag
  if (msg.type === 'CLICK_MOVE') {
    (async () => {
      const rect = await getRect(tabId);
      if (!rect) { sendResponse({ done: false }); return; }
      if (msg.orientation) rect.flipped = (msg.orientation === 'black');

      const src = squareXY(rect, msg.srcFile, msg.srcRank);
      const dst = squareXY(rect, msg.dstFile, msg.dstRank);

      console.log('[Blindfold BG] CLICK_MOVE', msg.srcFile+msg.srcRank, '→', msg.dstFile+msg.dstRank,
                  '| src:', src.x, src.y, '| dst:', dst.x, dst.y, '| site:', rect.site);

      await ensureAttached(tabId);

      if (rect.site === 'lichess') {
        // Hover → click src, wait for chessground to register selection, hover → click dst
        await dbgCmd(tabId, 'Input.dispatchMouseEvent',
          { type: 'mouseMoved',    x: src.x, y: src.y, button: 'none',  buttons: 0, pointerType: 'mouse' });
        await dbgCmd(tabId, 'Input.dispatchMouseEvent',
          { type: 'mousePressed',  x: src.x, y: src.y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
        await dbgCmd(tabId, 'Input.dispatchMouseEvent',
          { type: 'mouseReleased', x: src.x, y: src.y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
        await new Promise(r => setTimeout(r, 150));
        await dbgCmd(tabId, 'Input.dispatchMouseEvent',
          { type: 'mouseMoved',    x: dst.x, y: dst.y, button: 'none',  buttons: 0, pointerType: 'mouse' });
        await dbgCmd(tabId, 'Input.dispatchMouseEvent',
          { type: 'mousePressed',  x: dst.x, y: dst.y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
        await dbgCmd(tabId, 'Input.dispatchMouseEvent',
          { type: 'mouseReleased', x: dst.x, y: dst.y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
      } else {
        // Chess.com: drag (hover → press → move → release)
        await dbgCmd(tabId, 'Input.dispatchMouseEvent',
          { type: 'mouseMoved',    x: src.x, y: src.y, button: 'none',  buttons: 0, pointerType: 'mouse' });
        await dbgCmd(tabId, 'Input.dispatchMouseEvent',
          { type: 'mousePressed',  x: src.x, y: src.y, button: 'left',  buttons: 1, clickCount: 1, pointerType: 'mouse' });
        await dbgCmd(tabId, 'Input.dispatchMouseEvent',
          { type: 'mouseMoved',    x: dst.x, y: dst.y, button: 'left',  buttons: 1, pointerType: 'mouse' });
        await dbgCmd(tabId, 'Input.dispatchMouseEvent',
          { type: 'mouseReleased', x: dst.x, y: dst.y, button: 'left',  buttons: 0, clickCount: 1, pointerType: 'mouse' });
      }

      // Pawn promotion: click the queen option (appears at the destination square on both sites)
      if (msg.isPromotion) {
        await new Promise(r => setTimeout(r, 200));
        await dbgCmd(tabId, 'Input.dispatchMouseEvent',
          { type: 'mousePressed',  x: dst.x, y: dst.y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
        await dbgCmd(tabId, 'Input.dispatchMouseEvent',
          { type: 'mouseReleased', x: dst.x, y: dst.y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
      }

      sendResponse({ done: true });
    })().catch(err => {
      console.error('[BG CLICK_MOVE]', err.message);
      sendResponse({ done: false });
    });
    return true;
  }

  // DRAW_HIGHLIGHT — right-click a square via CDP (works on both sites)
  if (msg.type === 'DRAW_HIGHLIGHT') {
    (async () => {
      const rect = await getRect(tabId);
      if (!rect) { sendResponse({}); return; }
      const { x, y } = squareXY(rect, msg.file, msg.rank);
      await ensureAttached(tabId);
      await dbgCmd(tabId, 'Input.dispatchMouseEvent',
        { type: 'mousePressed',  x, y, button: 'right', buttons: 2, clickCount: 1, pointerType: 'mouse' });
      await dbgCmd(tabId, 'Input.dispatchMouseEvent',
        { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1, pointerType: 'mouse' });
      sendResponse({});
    })().catch(() => sendResponse({}));
    return true;
  }

  // CLEAR_DRAWINGS — remove overlay, then try chessground setShapes([])
  if (msg.type === 'CLEAR_DRAWINGS') {
    (async () => {
      // Always remove our overlay (fast path)
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: false },
        func: () => { var el = document.getElementById('bf-arrow-overlay'); if (el) el.remove(); },
        world: 'MAIN',
      }).catch(() => {});
      // Also clear via chessground API if it was the one drawing (Lichess)
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: false },
        func: clearPageDrawings,
        args: [msg.shapes || [], msg.orientation === 'black'],
        world: 'MAIN',
      }).catch(() => []);
      const handled = results.some(r => r.result === true);
      if (!handled) {
        // Chess.com fallback: send Escape key via CDP
        await ensureAttached(tabId);
        await dbgCmd(tabId, 'Input.dispatchKeyEvent',
          { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await dbgCmd(tabId, 'Input.dispatchKeyEvent',
          { type: 'keyUp',   key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      }
      sendResponse({});
    })().catch(() => sendResponse({}));
    return true;
  }

  // DRAW_ARROW — setShapes API (best); fixed overlay SVG fallback (works on both sites)
  if (msg.type === 'DRAW_ARROW') {
    (async () => {
      const flipped = msg.orientation === 'black';
      const shapes  = msg.shapes || [{ orig: msg.f1 + msg.r1, dest: msg.f2 + msg.r2, brush: 'green' }];

      // 1. Try chessground setShapes API (Lichess, atomically replaces all shapes)
      const apiOk = await chrome.scripting.executeScript({
        target: { tabId, allFrames: false },
        func: setPageShapes,
        args: [shapes],
        world: 'MAIN',
      }).then(r => r.some(x => x.result === true)).catch(() => false);

      if (!apiOk) {
        // 2. Fixed overlay SVG positioned over the board using getBoundingClientRect coords
        const rect = await getRect(tabId);
        if (rect) {
          if (msg.orientation) rect.flipped = flipped;
          await chrome.scripting.executeScript({
            target: { tabId, allFrames: false },
            func: overlayArrows,
            args: [shapes, { left: rect.left, top: rect.top, width: rect.width, flipped: rect.flipped }],
            world: 'MAIN',
          }).catch(() => {});
        }
      }

      console.log('[Blindfold BG] DRAW_ARROW', msg.f1+msg.r1, '→', msg.f2+msg.r2, '| api:', apiOk);
      sendResponse({});
    })().catch(() => sendResponse({}));
    return true;
  }
});
