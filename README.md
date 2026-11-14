NEON CHESS PRO

Cyberpunk Chess Assistant & Opening Gambit Trainer for Android

Neon Chess Pro is a lightweight Android WebView wrapper injected with a hardware-accelerated HUD overlay. Powered by a multi-threaded Stockfish WebWorker and a built-in Opening Gambit Book, it provides real-time position evaluation, multi-tier move candidates, and SVG board trajectories without dropping frames.

Key Features

1. 3-Tier Engine Analysis (Multi-PV)

Uses the Stockfish WebWorker engine to compute top candidate moves simultaneously and categorizes them into three distinct playstyles:

TIER 1 (GOOD - Cyan): The optimal engine line.

TIER 2 (MED - Amber): The 2nd or 3rd best candidate move for more natural play.

TIER 3 (WEAK - Crimson): Solid, lower-pressure alternatives that still avoid blunders.

2. Built-In Opening Gambit Book

Select opening lines directly from the HUD dropdown menu. The script tracks move history and opponent responses, feeding book moves before seamlessly handing control back to Stockfish once out of book:

White Repertoire: Queen's Gambit, King's Gambit, Danish Gambit, Evans Gambit, Vienna Gambit, Smith-Morra Gambit.

Black Repertoire: Stafford Gambit, Englund Gambit, Budapest Gambit, Rousseau Gambit.

3. Performance & Quality of Life (QoL)

GPU-Accelerated Rendering: Built with transform: translate3d dragging and requestAnimationFrame throttling (120ms cap) to eliminate UI lag and layout thrashing.

Collapsible Interface ([—] / [+]): Minimize the HUD into a compact floating pill at any time. Automatically collapses when typing into input fields so your keyboard is never obstructed.

Email & Session Login Support: Configured with a custom Chrome Mobile OverrideUserAgent and persistent DOM storage/cookies to prevent WebView login blocks.

Persistent Settings: Saves your preferred Depth, Tier, Auto-Move, Delay, and Gambit choices across sessions via localStorage.

HUD Controls & Layout

+------------------------------------------+
| NEON                     [+1.4]  [ — ]   |  <-- Drag Handle / Minimize UI
+------------------------------------------+
| [ Queen's Gambit (White)             ▼ ] |  <-- Opening Gambit Selector
| 65%           TURN: WHITE            35% |
| [████████████████████░░░░░░░░░░░░░░░░░░] |  <-- Live Win Probability Bar
|                                          |
| [1] e2 -> e4            GOOD       +1.4  |  <-- Tap row to switch active Tier
| [2] d2 -> d4            MED        +0.9  |
| [3] g1 -> f3            WEAK       +0.3  |
|                                          |
| [ AUTO: OFF ]  [  1.0S  ]  [  TIER: 1  ] |
| [   SCAN    ]  [  D:10  ]  [   ARROW   ] |
+------------------------------------------+


Control

Description

[ — ] / [ + ]

Minimize or expand the main HUD panel.

AUTO: ON/OFF

Automatically executes the selected Tier or Gambit move on your turn.

0.3S - 2.5S

Cycles the delay timer before an automatic move is executed.

TIER: 1/2/3

Switches the primary target arrow and Auto-Move between Good, Med, or Weak.

SCAN

Forces an immediate re-scan and evaluation of the current board position.

D:8 - D:16

Cycles the Stockfish search depth (Depth 8, 10, 13, 16).

ARROW

Toggles the SVG trajectory arrows on the chessboard.

Project Structure

neon-chess-apk/
├── .github/
│   └── workflows/
│       └── build.yml       # Automated GitHub Actions APK build pipeline
├── www/
│   ├── index.html          # Launcher (Online Home, vs Computer, & Email Login)
│   └── helper.js           # Stockfish Worker, Gambit Book & HUD Overlay
├── config.xml              # Cordova config & Custom Chrome User-Agent
└── README.md               # Documentation


Build Instructions

Automated Build (GitHub Actions)

Fork or push this repository to your GitHub account.

Open the Actions tab in your repository.

Select Build Android APK and click Run workflow (or push a commit to main).

Download the NeonChessHelper-APK archive from the Artifacts section once the build completes.

Local CLI Build

Requires Node.js (v22+), JDK 17, and Android SDK (API 34).

# Install Cordova globally
npm install -g cordova

# Add Android platform & InAppBrowser plugin
cordova platform add android@13.0.0
cordova plugin add cordova-plugin-inappbrowser

# Compile Debug APK
cordova build android --debug -- --packageType=apk


The output APK will be located at:
platforms/android/app/build/outputs/apk/debug/app-debug.apk

Disclaimer

This project is intended strictly for educational purposes, WebWorker engine integration testing, and opening repertoire practice. Using real-time engine assistance during rated online games violates platform Fair Play policies. Use responsibly in offline or computer training modes.
