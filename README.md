# Blindfold Chess

A Chrome extension for playing blindfold chess on [chess.com](https://www.chess.com) and [lichess.org](https://lichess.org) — no board required.

Every move is entered on the keyboard and announced aloud via text-to-speech. The board stays hidden so you train your ability to visualise the position entirely in your head.

---

## Features

- **Keyboard-driven moves** — type piece + file + rank to move; no mouse needed
- **Text-to-speech narration** — your moves are read back immediately; opponent moves are announced automatically
- **Ambiguous move resolution** — if two pieces can reach the same square you are prompted to add a disambiguating file or rank
- **Castling shortcuts** — king to g1/g8 for kingside, king to c1/c8 for queenside
- **Puzzle support** — works on lichess puzzle pages; success/failure are signalled with distinct audio tones
- **Puzzle replay** — press `g` / `h` to step backward and forward through any puzzle
- **Draw mode** — press `m` to toggle a helper mode for highlighting squares and drawing arrows

---

## Keyboard Layout

### Pieces

| Key | Piece  |
|-----|--------|
| `s` | King   |
| `d` | Rook   |
| `f` | Pawn   |
| `j` | Knight |
| `k` | Bishop |
| `l` | Queen  |

### Files and Ranks (same mapping)

| Key | File / Rank |
|-----|-------------|
| `a` | a / 1       |
| `s` | b / 2       |
| `d` | c / 3       |
| `f` | d / 4       |
| `j` | e / 5       |
| `k` | f / 6       |
| `l` | g / 7       |
| `;` | h / 8       |

### Example moves

| Intention          | Keys typed          |
|--------------------|---------------------|
| Pawn to e4         | `f` `j` `f`         |
| Knight to f3       | `j` `k` `d`         |
| Kingside castling  | `s` `l` `a`         |
| Queenside castling | `s` `d` `a`         |

### Ambiguous moves

If two pieces can reach the same square you will hear *"ambiguous"*. Type a 4th key for the source file or rank to disambiguate.

**Example:** two rooks can go to d1 — type `d` `f` `d` `a` (rook → d1, from file a).

### Other keys

| Key     | Action                          |
|---------|---------------------------------|
| `g`     | Previous move (puzzle replay)   |
| `h`     | Next move (puzzle replay)       |
| `m`     | Toggle draw mode                |
| `c`     | Clear all drawings              |
| `Enter` | Continue training (after puzzle)|

---

## Installation

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the extension folder.
5. Navigate to a chess.com or lichess.org game — the extension activates automatically.

---

## Privacy

This extension does not collect, transmit, or store any personal data. See [privacy-policy.md](privacy-policy.md) for full details.

---

## License

MIT
