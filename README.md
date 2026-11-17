# NEON CHESS PRO

Cyberpunk Chess Assistant & Smart Auto-Gambit Trainer for Android

Neon Chess Pro is a lightweight Android WebView wrapper injected with a hardware-accelerated HUD overlay. Powered by a multi-threaded Stockfish WebWorker, a built-in FEN/SAN legal-move engine, and a Smart Auto-Gambit Book, it provides real-time position evaluation, blunder-guarded multi-tier candidates, and crisp SVG board arrows without dropping frames.

## Key Features

### 1. Smart Auto-Gambit (Default Match Mode)
- **`⚡ AUTO GAMBIT (Best for Match)`**: Selected by default in the **Choose Gambit** selector. Automatically detects whether you are playing White or Black, tracks the opponent's replies via FEN-transposition matching, and verifies candidate gambits against Stockfish so it only plays sound lines (and switches to engine consolidation when you are already winning or if a line drops too much eval).
- **Manual Override**: You can also choose **`🧠 Stockfish Engine Only`** or lock a specific White/Black opening line:
  - **White Repertoire**: Queen's Gambit, Vienna Gambit, Scotch Gambit, Evans Gambit, Smith-Morra Gambit, Milner-Barry Gambit, King's Gambit, Danish Gambit.
  - **Black Repertoire**: Benko Gambit, Budapest Gambit, Jaenisch Gambit, Albin Countergambit, Icelandic Gambit, Rousseau Gambit, Stafford Gambit, Englund Gambit.

### 2. 3-Tier Engine Analysis (Multi-PV + Blunder Guard)
Uses the Stockfish WebWorker engine (`readyok`-synchronized) to compute top candidate moves simultaneously in clean SAN + coordinate notation:
- **TIER 1 (`BEST` / `GAMBIT` - Cyan / Gold)**: The optimal engine line or verified match gambit.
- **TIER 2 (`MED` - Amber)**: A natural 2nd-best alternative protected by a centipawn blunder guard.
- **TIER 3 (`SAFE` - Crimson)**: A lower-pressure alternative that still avoids blunders and mate traps.

### 3. Performance & Quality of Life (QoL)
- **GPU-Accelerated & Viewport-Clamped Dragging**: Uses `transform: translate3d` dragging clamped inside the screen bounds and persisted across sessions.
- **Instant Board Observer**: Uses a `MutationObserver` on the chessboard (with 500ms fallback) plus `requestAnimationFrame` throttling for near-instant reaction.
- **1-Tap Execution (`▶`) & Stabilized Win Bar**: Tap `▶` on any move row to play it immediately on your turn; the `YOU vs OPP` bar stays oriented to your color using a chess WDL sigmoid curve.
- **Collapsible Compact Pill (`[—]` / `[+]`)**: Minimizes into a floating pill displaying the top move and eval; auto-collapses when typing into input fields.
- **Persistent Settings**: Saves Depth, Tier, Auto-Move, Delay, Arrow visibility, HUD position, and Gambit selection via `localStorage`.

## HUD Controls & Layout

```
+----------------------------------------------+
| ● ⚡ NEON [W]              [ +0.4 ]  [ — ]   |  <-- Drag Handle / Status / Minimize
+----------------------------------------------+
| CHOOSE GAMBIT                   SMART MATCH  |
| [ ⚡ AUTO GAMBIT (Best for Match)        ▼ ] |  <-- Auto / Engine / Manual Gambit
| MATCHED: 👑 Queen's Gambit                   |  <-- Live Gambit Match Banner
| YOU 55%        [ YOUR TURN ]         45% OPP |
| [█████████████████████░░░░░░░░░░░░░░░░░░░░░] |  <-- Stabilized Win Probability Bar
|                                              |
| [1] ♙ c4    c2→c4       GAMBIT  +0.4    [▶] |  <-- Tap row for Tier, ▶ to play
| [2] ♘ Nf3   g1→f3       MED     +0.3    [▶] |
| [3] ♙ e3    e2→e3       SAFE    +0.1    [▶] |
|                                              |
| [ AUTO: OFF ]   [  1.0S  ]   [  TIER: 1  ]   |
| [   SCAN    ]   [  D:10  ]   [   ARROW   ]   |
+----------------------------------------------+
```

| Control | Description |
| :--- | :--- |
| `[ — ] / [ + ]` | Minimize to a compact move-preview pill or expand the HUD panel. |
| `CHOOSE GAMBIT` | Defaults to `⚡ AUTO GAMBIT (Best for Match)`; also supports Engine Only or manual lines. |
| `▶` (Row Button) | Immediately plays that candidate move on your turn. |
| `AUTO: ON/OFF` | Automatically executes the selected Tier or verified Gambit move on your turn. |
| `0.3S - 2.5S` | Cycles the delay (`0.3s`, `0.6s`, `1.0s`, `1.5s`, `2.5s`) before auto-move execution. |
| `TIER: 1/2/3` | Switches the primary target arrow and Auto-Move between Best, Med, or Safe. |
| `SCAN` | Forces an immediate re-scan (and retries loading Stockfish if offline). |
| `D:8 - D:16` | Cycles the Stockfish search depth (Depth 8, 10, 13, 16). |
| `ARROW` | Toggles the crisp SVG trajectory arrows on the chessboard. |

## Project Structure

```
neon-chess-apk/
├── .github/
│   └── workflows/
│       └── build.yml       # Automated GitHub Actions APK build pipeline
├── www/
│   ├── index.html          # Launcher (Live Chess, Home, vs Computer, & Email Login)
│   └── Helper.js           # Stockfish Worker, FEN/SAN Engine, Auto-Gambit & HUD Overlay
├── config.xml              # Cordova config & Custom Chrome User-Agent
└── README.md               # Documentation
```

## Build Instructions

### Automated Build (GitHub Actions)
1. Fork or push this repository to your GitHub account.
2. Open the **Actions** tab in your repository.
3. Select **Build Android APK** and click **Run workflow** (or push a commit to `main`).
4. Download the `NeonChessHelper-APK` archive from the **Artifacts** section once the build completes.

### Local CLI Build
Requires Node.js (v22+), JDK 17, and Android SDK (API 34).

```bash
# Install Cordova globally
npm install -g cordova

# Add Android platform & InAppBrowser plugin
cordova platform add android@13.0.0
cordova plugin add cordova-plugin-inappbrowser

# Compile Debug APK
cordova build android --debug -- --packageType=apk
```

The output APK will be located at:
`platforms/android/app/build/outputs/apk/debug/app-debug.apk`

## Disclaimer
This project is intended strictly for educational purposes, WebWorker engine integration testing, and opening repertoire practice. Using real-time engine assistance during rated online games violates platform Fair Play policies. Use responsibly in offline or computer training modes.
