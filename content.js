(function () {
  'use strict';

  // Suppress the grab/fist cursor on board elements only (not globally, to avoid repaint pressure)
  const _s = document.createElement('style');
  _s.textContent = 'cg-board, cg-board *, chess-board, chess-board *, wc-chess-board, wc-chess-board * { cursor: default !important; }';
  (document.head || document.documentElement).appendChild(_s);

  // ── Key maps ────────────────────────────────────────────────────────────────
  const PIECE_FROM_KEY = { s: 'king', d: 'rook', f: 'pawn', j: 'knight', k: 'bishop', l: 'queen' };
  const FILE_FROM_KEY  = { a: 'a', s: 'b', d: 'c', f: 'd', j: 'e', k: 'f', l: 'g', ';': 'h' };
  const RANK_FROM_KEY  = { a: 1, s: 2, d: 3, f: 4, j: 5, k: 6, l: 7, ';': 8 };

  const PIECE_KEYS     = new Set(Object.keys(PIECE_FROM_KEY));
  const FILE_RANK_KEYS = new Set(Object.keys(FILE_FROM_KEY));

  const FILE_TO_NUM = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 };
  const NUM_TO_FILE = { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e', 6: 'f', 7: 'g', 8: 'h' };

  // ── State ───────────────────────────────────────────────────────────────────
  let mode             = 'moves';
  let moveBuffer       = '';
  let drawBuffer       = '';
  let drawTimer        = null;
  let busy             = false;
  let gameActive       = false;
  let myMoveJustMade   = false;
  let lastMoveText     = '';
  let lastActiveSAN    = '';   // shared between observer and nav/rewind
  let navigating       = false; // true during puzzle rewind — suppress all announcements
  let navKeyPressed    = false; // true when g/h pressed — use speak (immediate) not speakQueued
  let moveObserver     = null;
  let playerColor      = 'white';
  let pendingDisambig  = null;  // {piece, file, rank, candidates} when move is ambiguous
  let queuedKey        = null;  // 4th key buffered while executeMove was still in flight
  let puzzleComplete   = false; // true after puzzle is solved — suppresses replay announcements

  // ── Messaging helper ────────────────────────────────────────────────────────
  function send(msg) {
    return new Promise(resolve => {
      // 3 s safety-net: if the extension context is invalidated the callback may never fire
      const timer = setTimeout(() => { console.warn('[Blindfold] send timeout'); resolve({}); }, 3000);
      const done  = r => { clearTimeout(timer); resolve(r); };
      try {
        chrome.runtime.sendMessage(msg, response => {
          if (chrome.runtime.lastError) {
            console.warn('[Blindfold]', chrome.runtime.lastError.message);
            done({});
          } else {
            done(response || {});
          }
        });
      } catch (err) {
        console.warn('[Blindfold]', err.message);
        done({});
      }
    });
  }

  // ── TTS ─────────────────────────────────────────────────────────────────────
  let _currentUtterance = null;
  let _queuedText       = null;

  function speak(text) {
    if (!window.speechSynthesis) return;
    _queuedText = null;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.6;
    u.onend = () => {
      if (_currentUtterance === u && _queuedText) {
        const t = _queuedText; _queuedText = null; speak(t);
      }
    };
    _currentUtterance = u;
    window.speechSynthesis.speak(u);
  }

  // Plays text after the current utterance finishes instead of cutting it off.
  function speakQueued(text) {
    if (!window.speechSynthesis) return;
    if (!window.speechSynthesis.speaking) { speak(text); return; }
    _queuedText = text;
  }

  // ── Puzzle audio feedback ────────────────────────────────────────────────────
  let waitingForOpponent = false;
  let puzzleTimeout      = null;

  function playTone(notes, noteDur, type = 'sine') {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const maxEnd = notes.reduce((m, [, d]) => Math.max(m, d + noteDur), 0);
      notes.forEach(([freq, delay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.25, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + noteDur);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + noteDur);
      });
      setTimeout(() => { try { ctx.close(); } catch (e) {} }, (maxEnd + 0.1) * 1000);
    } catch (e) {}
  }

  function playSuccessTone() { playTone([[523, 0], [659, 0.12], [784, 0.24]], 0.25); }
  function playFailureTone() { playTone([[330, 0], [220, 0.15]], 0.3, 'sawtooth'); }

  function isPuzzleWon() {
    return !!(
      document.querySelector('.puzzle__feedback.win') ||
      document.querySelector('.puzzle__feedback--win') ||
      document.querySelector('[class*="feedback"][class*="win"]')
    );
  }

  function startPuzzleWait() {
    if (!isPuzzlePage()) return;
    waitingForOpponent = true;
    clearTimeout(puzzleTimeout);
    // Quick check at 500 ms: lichess shows win feedback almost immediately after the
    // final correct move. Catching it here lets us set puzzleComplete before the
    // solution replay begins and starts announcing those moves.
    const quickTimer = setTimeout(() => {
      if (!waitingForOpponent) return;
      if (isPuzzleWon()) {
        waitingForOpponent = false;
        puzzleComplete = true;
        playSuccessTone();
        clearTimeout(puzzleTimeout);
      }
    }, 500);
    puzzleTimeout = setTimeout(() => {
      clearTimeout(quickTimer);
      if (!waitingForOpponent) return;
      waitingForOpponent = false;
      if (isPuzzleWon()) { puzzleComplete = true; playSuccessTone(); }
      else               { playFailureTone(); speak('wrong'); }
    }, 1500);
  }

  function onOpponentMoved() {
    if (!waitingForOpponent) return;
    waitingForOpponent = false;
    clearTimeout(puzzleTimeout);
    playSuccessTone();
  }

  // ── Puzzle navigation helpers ────────────────────────────────────────────────
  function navKey(arrow) {
    lastActiveSAN = '';   // force re-announce even if same move revisited
    navKeyPressed = true;
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: arrow, code: arrow, bubbles: true, cancelable: true,
    }));
  }

  async function rewindPuzzle() {
    waitingForOpponent = false;
    clearTimeout(puzzleTimeout);
    puzzleComplete = false;
    lastActiveSAN = '';

    // Read the first puzzle move's SAN from .puzzle__moves (text-only, no side effects).
    // Separate from board navigation — ArrowLeft moves the game-context viewer, not this list.
    const puzzleMoves = document.querySelector('.puzzle__moves');
    let firstMoveSAN = null;
    if (puzzleMoves) {
      let firstMove = null;
      for (const idx of puzzleMoves.querySelectorAll('index')) {
        if (idx.textContent.trim() === '1') {
          let sib = idx.nextElementSibling;
          while (sib && sib.tagName.toLowerCase() !== 'move') sib = sib.nextElementSibling;
          firstMove = sib;
          break;
        }
      }
      if (!firstMove) firstMove = puzzleMoves.querySelector('move');
      firstMoveSAN = firstMove?.textContent.trim() || null;
    }

    // Navigate the board back via ArrowLeft. ArrowLeft moves the game-context viewer
    // through the full game (not just puzzle moves), so we need enough presses to
    // clear a typical game (up to ~100 half-moves = 50 full moves).
    navigating = true;
    for (let i = 0; i < 100; i++) {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true, cancelable: true,
      }));
      await new Promise(r => setTimeout(r, 20));
    }
    await new Promise(r => setTimeout(r, 150));
    navigating = false;

    if (firstMoveSAN) speak(readSAN(firstMoveSAN));
  }

  // ── Pseudo-legal move check ─────────────────────────────────────────────────
  function isPathClear(sf, sr, df, dr, pieces) {
    const stepF = sf < df ? 1 : sf > df ? -1 : 0;
    const stepR = sr < dr ? 1 : sr > dr ? -1 : 0;
    let f = sf + stepF, r = sr + stepR;
    while (f !== df || r !== dr) {
      if (pieces[NUM_TO_FILE[f] + r]) return false;
      f += stepF; r += stepR;
    }
    return true;
  }

  function canReach(type, sf, sr, df, dr, color, pieces) {
    const dF = df - sf, dR = dr - sr;
    switch (type) {
      case 'pawn': {
        const dir = color === 'white' ? 1 : -1, startR = color === 'white' ? 2 : 7;
        const dstKey = NUM_TO_FILE[df] + dr;
        if (dF === 0 && dR === dir && !pieces[dstKey]) return true;
        if (dF === 0 && dR === 2*dir && sr === startR &&
            !pieces[NUM_TO_FILE[sf]+(sr+dir)] && !pieces[dstKey]) return true;
        if (Math.abs(dF) === 1 && dR === dir) { const target = pieces[NUM_TO_FILE[df] + dr]; return !!target && target.color !== color; }
        return false;
      }
      case 'knight':
        return (Math.abs(dF)===2 && Math.abs(dR)===1)||(Math.abs(dF)===1 && Math.abs(dR)===2);
      case 'bishop':
        return Math.abs(dF)===Math.abs(dR) && dF!==0 && isPathClear(sf,sr,df,dr,pieces);
      case 'rook':
        return (dF===0||dR===0) && !(dF===0&&dR===0) && isPathClear(sf,sr,df,dr,pieces);
      case 'queen':
        return ((Math.abs(dF)===Math.abs(dR))||dF===0||dR===0) &&
               !(dF===0&&dR===0) && isPathClear(sf,sr,df,dr,pieces);
      case 'king':
        return Math.abs(dF)<=2 && Math.abs(dR)<=1 && !(dF===0&&dR===0);
      default: return false;
    }
  }

  function findSource(pieceType, pieces, dstFile, dstRank) {
    const df = FILE_TO_NUM[dstFile], dr = dstRank;
    return Object.values(pieces).filter(p =>
      p.type === pieceType && p.color === playerColor &&
      canReach(pieceType, FILE_TO_NUM[p.file], p.rank, df, dr, playerColor, pieces)
    );
  }

  function readSAN(san) {
    if (!san) return '';
    san = san.trim().replace(/\s+/g, '');
    if (!san) return '';
    if (san === 'O-O'   || san === '0-0')   return 'kingside castle';
    if (san === 'O-O-O' || san === '0-0-0') return 'queenside castle';

    const NAMES = { N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
    let s = san.replace(/[+#!?]/g, '');
    let piece = 'pawn';
    if (s[0] && NAMES[s[0]]) { piece = NAMES[s[0]]; s = s.slice(1); }

    let promo = '';
    const pi = s.indexOf('=');
    if (pi !== -1) { promo = ' promotes to ' + (NAMES[s[pi + 1]] || s[pi + 1]); s = s.slice(0, pi); }

    const cap  = s.includes('x');
    s          = s.replace('x', '');
    const dest = s.slice(-2);
    const dis  = s.slice(0, -2);

    let out = piece;
    if (dis) out += ' ' + dis;
    if (cap) out += ' takes';
    out += ' ' + dest[0] + ' ' + dest[1];
    out += promo;
    if (san.includes('#')) out += ', checkmate';
    else if (san.includes('+')) out += ', check';
    return out;
  }

  // ── Move execution ──────────────────────────────────────────────────────────
  // disambigKey: optional key press used to narrow down ambiguous candidates.
  // It is matched against the candidate's source file (FILE_FROM_KEY) or rank (RANK_FROM_KEY).
  async function executeMove(pieceType, dstFile, dstRank, candidates, disambigKey) {
    if (busy) return;
    busy = true;
    try {
      if (!candidates) {
        const state  = await send({ type: 'GET_STATE' });
        const pieces = state.pieces || {};
        playerColor  = state.orientation || playerColor;
        candidates   = findSource(pieceType, pieces, dstFile, dstRank);
      }

      console.log('[Blindfold] move:', playerColor, pieceType, '→', dstFile+dstRank,
                  '| candidates:', candidates.map(p => p.file+p.rank));

      if (candidates.length === 0) { speak('no valid move'); return; }

      if (candidates.length > 1 && !disambigKey) {
        if (queuedKey !== null) {
          disambigKey = queuedKey;  // user already pressed the 4th key while we were busy
          queuedKey = null;
        } else {
          pendingDisambig = { piece: pieceType, file: dstFile, rank: dstRank, candidates };
          speak('ambiguous');
          return;
        }
      }

      if (candidates.length > 1 && disambigKey) {
        const origCandidates = candidates;
        const srcFile = FILE_FROM_KEY[disambigKey];
        const srcRank = RANK_FROM_KEY[disambigKey];
        // File takes priority over rank to avoid false matches when both pieces share a rank
        let filtered = srcFile ? candidates.filter(p => p.file === srcFile) : [];
        if (filtered.length === 0) filtered = srcRank ? candidates.filter(p => p.rank === srcRank) : [];
        candidates = filtered;
        if (candidates.length === 0) { speak('no valid move'); return; }
        if (candidates.length > 1) {
          pendingDisambig = { piece: pieceType, file: dstFile, rank: dstRank, candidates: origCandidates };
          speak('still ambiguous'); return;
        }
      }

      const src = candidates[0];
      myMoveJustMade = true;
      startPuzzleWait(); // must be before await so onOpponentMoved() can fire during the send
      speak(pieceType + ' ' + dstFile + ' ' + dstRank);

      const isPromotion = pieceType === 'pawn' &&
        ((playerColor === 'white' && dstRank === 8) ||
         (playerColor === 'black' && dstRank === 1));

      await send({ type: 'CLICK_MOVE',
                   srcFile: src.file, srcRank: src.rank,
                   dstFile, dstRank, isPromotion });
    } finally {
      busy = false;
    }
  }

  // ── Keyboard handling ───────────────────────────────────────────────────────
  function isTypingEl() {
    const el = document.activeElement;
    if (!el) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
  }

  document.addEventListener('keydown', e => {
    if (isTypingEl()) return;

    if (e.key === 'Enter' && isPuzzlePage()) {
      // Only act after puzzle is resolved — .puzzle__feedback buttons appear then.
      // If they're absent the puzzle is still in play; let Enter fall through (lichess uses it for hints).
      const candidates = [
        ...document.querySelectorAll('.puzzle__feedback a, .puzzle__feedback button'),
      ];
      if (candidates.length) {
        const btn = candidates.find(b =>
          !/(practice|computer|again)/i.test(b.textContent + (b.getAttribute('href') || ''))
        ) || candidates[0];
        if (btn) { e.preventDefault(); btn.click(); }
        return;
      }
      return; // puzzle still active — don't intercept
    }

    if (e.key === 'g') {
      e.preventDefault();
      moveBuffer = ''; pendingDisambig = null; queuedKey = null;
      navKey('ArrowLeft');
      return;
    }

    if (e.key === 'h') {
      e.preventDefault();
      moveBuffer = ''; pendingDisambig = null; queuedKey = null;
      navKey('ArrowRight');
      return;
    }

    if (e.key === 'm') {
      e.preventDefault();
      if (drawTimer) { clearTimeout(drawTimer); drawTimer = null; }
      mode = mode === 'moves' ? 'draw' : 'moves';
      moveBuffer = ''; drawBuffer = ''; pendingDisambig = null; queuedKey = null;
      speak(mode === 'draw' ? 'draw mode' : 'move mode');
      return;
    }

    if (e.key === 'c') {
      e.preventDefault();
      if (drawTimer) { clearTimeout(drawTimer); drawTimer = null; }
      drawBuffer = '';
      send({ type: 'CLEAR_DRAWINGS' });
      speak('cleared');
      return;
    }

    if (mode === 'moves') {
      // Disambiguation first — even if busy, this path leads straight to executeMove
      if (pendingDisambig) {
        if (!FILE_RANK_KEYS.has(e.key)) return;
        e.preventDefault();
        const { piece, file, rank, candidates } = pendingDisambig;
        pendingDisambig = null;
        queuedKey = null;
        executeMove(piece, file, rank, candidates, e.key);
        return;
      }

      if (busy) {
        // Buffer one key while the current move resolves — may be the disambiguation key
        if (FILE_RANK_KEYS.has(e.key)) { queuedKey = e.key; e.preventDefault(); }
        return;
      }
      queuedKey = null;

      const valid = moveBuffer.length === 0 ? PIECE_KEYS : FILE_RANK_KEYS;
      if (!valid.has(e.key)) return;
      e.preventDefault();

      moveBuffer += e.key;
      if (moveBuffer.length === 3) {
        const piece = PIECE_FROM_KEY[moveBuffer[0]];
        const file  = FILE_FROM_KEY[moveBuffer[1]];
        const rank  = RANK_FROM_KEY[moveBuffer[2]];
        moveBuffer  = '';
        if (piece && file && rank) executeMove(piece, file, rank, null, null);
      }

    } else {
      if (!FILE_RANK_KEYS.has(e.key)) return;
      e.preventDefault();

      drawBuffer += e.key;

      if (drawBuffer.length === 2) {
        drawTimer = setTimeout(() => {
          const f = FILE_FROM_KEY[drawBuffer[0]], r = RANK_FROM_KEY[drawBuffer[1]];
          if (f && r) { speak(f + ' ' + r); send({ type: 'DRAW_HIGHLIGHT', file: f, rank: r }); }
          drawBuffer = ''; drawTimer = null;
        }, 1200);
      }
      if (drawBuffer.length === 3 && drawTimer) { clearTimeout(drawTimer); drawTimer = null; }
      if (drawBuffer.length === 4) {
        if (drawTimer) { clearTimeout(drawTimer); drawTimer = null; }
        const f1 = FILE_FROM_KEY[drawBuffer[0]], r1 = RANK_FROM_KEY[drawBuffer[1]];
        const f2 = FILE_FROM_KEY[drawBuffer[2]], r2 = RANK_FROM_KEY[drawBuffer[3]];
        if (f1 && r1 && f2 && r2) {
          speak('arrow ' + f1+r1 + ' to ' + f2+r2);
          send({ type: 'DRAW_ARROW', f1, r1, f2, r2 });
        }
        drawBuffer = '';
      }
    }
  }, true);

  // ── Opponent move detection ─────────────────────────────────────────────────
  function getLastSAN(container) {
    // Lichess games: <move><san>e4</san></move>
    const sans = container.querySelectorAll('san');
    if (sans.length) return sans[sans.length - 1].textContent.trim();
    // Lichess puzzles: <move class="...">c6</move> — text directly inside move element
    const moves = container.querySelectorAll('move');
    if (moves.length) return moves[moves.length - 1].textContent.trim();
    // Chess.com
    const sels = ['.node-highlight-content','[data-node-index] .move','.move-text','[class*="move-text"]'];
    for (const sel of sels) {
      const nodes = container.querySelectorAll(sel);
      if (nodes.length) return nodes[nodes.length - 1].textContent.trim().replace(/\s+/g, '');
    }
    return '';
  }

  function initMoveObserver() {
    if (moveObserver) { moveObserver.disconnect(); moveObserver = null; }
    // On puzzle pages prefer .puzzle__moves — rm6/l4x are the full-game context list
    // and would swallow puzzle move events into the wrong observer target.
    const target = isPuzzlePage()
      ? (document.querySelector('.puzzle__moves') ||
         document.querySelector('move')?.closest('div, section'))
      : (document.querySelector('rm6') ||
         document.querySelector('l4x') ||
         document.querySelector('.moves') ||
         document.querySelector('.move-list') ||
         document.querySelector('[data-cy="move-list"]') ||
         document.querySelector('.vertical-move-list') ||
         document.querySelector('[class*="move-list"]'));

    function announceObserved(san) {
      if (navigating || puzzleComplete) return;  // swallow during rewind / post-solve replay
      if (navKeyPressed) {
        navKeyPressed = false;
        speak(readSAN(san));
      } else {
        onOpponentMoved();
        speakQueued(readSAN(san));
      }
    }

    if (target) {
      lastMoveText = target.textContent;
      moveObserver = new MutationObserver(mutations => {
        const text = target.textContent;
        const textChanged = text !== lastMoveText;
        if (textChanged) {
          lastMoveText = text;
          if (myMoveJustMade) { myMoveJustMade = false; return; }
          const san = getLastSAN(target);
          if (san && san !== lastActiveSAN) { lastActiveSAN = san; announceObserved(san); }
          return;
        }
        for (const m of mutations) {
          if (m.type !== 'attributes' || m.target.tagName !== 'MOVE') continue;
          if (!m.target.classList.contains('active')) continue;
          const san = m.target.textContent.trim();
          if (!san || san === lastActiveSAN) continue;
          lastActiveSAN = san;
          if (myMoveJustMade) { myMoveJustMade = false; continue; }
          announceObserved(san);
        }
      });
      moveObserver.observe(target, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['class'],
      });
    } else {
      moveObserver = new MutationObserver(mutations => {
        let newSAN = '';
        for (const m of mutations) {
          if (m.type === 'attributes' && m.target.tagName === 'MOVE' &&
              m.target.classList.contains('active')) {
            newSAN = m.target.textContent.trim();
          } else if (m.type === 'childList') {
            for (const node of m.addedNodes) {
              if (node.nodeType !== 1) continue;
              const els = node.tagName === 'MOVE' ? [node]
                        : [...node.querySelectorAll('move')];
              for (const el of els) {
                if (el.classList.contains('active')) newSAN = el.textContent.trim();
              }
            }
          }
        }
        if (!newSAN || newSAN === lastActiveSAN) return;
        lastActiveSAN = newSAN;
        if (myMoveJustMade) { myMoveJustMade = false; return; }
        announceObserved(newSAN);
      });
      moveObserver.observe(document.documentElement, {
        subtree: true, childList: true,
        attributes: true, attributeFilter: ['class'],
      });
    }
  }

  // ── Game detection ──────────────────────────────────────────────────────────
  function isPuzzlePage() {
    return /\/(training|puzzle)/.test(location.pathname);
  }

  async function onGameStart() {
    if (gameActive) return;
    gameActive = true;
    const state = await send({ type: 'GET_STATE' });
    playerColor = state.orientation || 'white';
    if (isPuzzlePage()) {
      setTimeout(async () => { initMoveObserver(); await rewindPuzzle(); }, 800);
    } else {
      speak('Game started. You are playing as ' + playerColor + '.');
      setTimeout(initMoveObserver, 800);
    }
  }

  function hasBoard() {
    return !!(document.querySelector('cg-board') ||        // lichess
              document.querySelector('chess-board') ||
              document.querySelector('wc-chess-board') ||
              document.querySelector('[class*="chess-board"]'));
  }

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href; gameActive = false; moveBuffer = ''; drawBuffer = '';
      lastMoveText = ''; waitingForOpponent = false; clearTimeout(puzzleTimeout); puzzleComplete = false;
      if (moveObserver) { moveObserver.disconnect(); moveObserver = null; }
      setTimeout(() => { if (hasBoard()) onGameStart(); }, 1200);
    } else {
      if (hasBoard() && !gameActive) onGameStart();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  if (hasBoard()) onGameStart();

})();
