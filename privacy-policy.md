# Privacy Policy — Blindfold Chess

**Last updated: 2026-08-26**

## Overview

Blindfold Chess is a Chrome extension that helps users play blindfold chess on chess.com and lichess.org using keyboard input and text-to-speech narration.

## Data Collection

This extension does **not** collect, store, transmit, or share any personal data. Specifically:

- No user accounts or profiles are created.
- No browsing history, move history, or game data is recorded.
- No personally identifiable information (PII) is gathered.
- No analytics or telemetry is sent to any server.

## Permissions Used

| Permission | Purpose |
|---|---|
| `scripting` | Inject the content script that intercepts keyboard input and announces moves |
| `debugger` | Send synthesised mouse-click events to chess.com (required to submit moves programmatically) |
| Host permissions for chess.com and lichess.org | Restrict extension activity to these two sites only |

The `debugger` API is used solely to dispatch click events on the chess board so that keyboard-entered moves are submitted without mouse interaction. No debugging data, network traffic, or page content is inspected or recorded.

## Third-Party Services

This extension communicates only with chess.com and lichess.org — the same sites the user navigates to voluntarily. No data is sent to any third-party server by the extension itself.

## Text-to-Speech

Move announcements use the browser's built-in Web Speech API (`speechSynthesis`). Audio is generated locally on the user's device; no text is transmitted externally.

## Changes to This Policy

If this policy changes, the updated version will be published in this repository with a new *Last updated* date.

## Contact

Questions or concerns can be raised via the [GitHub repository](https://github.com/EvgenyBondarev/blindfold-chess/issues).
