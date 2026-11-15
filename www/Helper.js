/**
 * Neon Chess Assistant & HUD (Optimized QoL & Gambit Edition)
 * Engine: Stockfish 10.0.2 (MultiPV evaluation + Opening Gambit Book)
 */

function initNeonChessHelper() {
    'use strict';

    if (window.__neonChessHelperActive) {
        if (typeof window.__neonEnsureHUD === 'function') {
            window.__neonEnsureHUD();
        }
        return;
    }
    window.__neonChessHelperActive = true;

    // --- 1. OPENING GAMBIT DATABASE (UCI MOVES) ---
    const GAMBIT_BOOK = {
        "none": { name: "Stockfish Engine Only", color: "both", moves: [] },
        "queens_gambit": { name: "👑 Queen's Gambit (White)", color: "w", moves: ["d2d4", "d7d5", "c2c4"] },
        "kings_gambit": { name: "⚔️ King's Gambit (White)", color: "w", moves: ["e2e4", "e7e5", "f2f4"] },
        "danish_gambit": { name: "💥 Danish Gambit (White)", color: "w", moves: ["e2e4", "e7e5", "d2d4", "e5d4", "c2c3", "d4c3", "f1c4"] },
        "evans_gambit": { name: "🎯 Evans Gambit (White)", color: "w", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "b2b4"] },
        "vienna_gambit": { name: "⚡ Vienna Gambit (White)", color: "w", moves: ["e2e4", "e7e5", "b1c3", "g8f6", "f2f4"] },
        "smith_morra": { name: "🔥 Smith-Morra vs Sicilian (White)", color: "w", moves: ["e2e4", "c7c5", "d2d4", "c5d4", "c2c3"] },
        "stafford_gambit": { name: "💀 Stafford Gambit (Black)", color: "b", moves: ["e2e4", "e7e5", "g1f3", "g8f6", "f3e5", "b8c6", "e5c6", "d7c6"] },
        "englund_gambit": { name: "🪤 Englund Gambit (Black)", color: "b", moves: ["d2d4", "e7e5", "d4e5", "b8c6", "g1f3", "d8e7"] },
        "budapest_gambit": { name: "🏹 Budapest Gambit (Black)", color: "b", moves: ["d2d4", "g8f6", "c2c4", "e7e5"] },
        "rousseau_gambit": { name: "🛡️ Rousseau Gambit (Black)", color: "b", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f7f5"] }
    };

    // --- 2. SYSTEM CONFIGURATION (PERSISTED IN LOCALSTORAGE) ---
    let storage = null;
    try { storage = window.localStorage; } catch (e) {}
    const getStore = (k) => { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } };
    const setStore = (k, v) => { try { if (storage) storage.setItem(k, v); } catch (e) {} };

    const CONFIG = {
        depth: parseInt(getStore('nc_depth')) || 10,
        multiPV: 4,
        autoMove: getStore('nc_auto') === 'true',
        delayMs: parseInt(getStore('nc_delay')) || 1000,
        selectedTier: parseInt(getStore('nc_tier')) || 1,
        selectedGambit: getStore('nc_gambit') || 'none',
        isMinimized: getStore('nc_minimized') === 'true',
        showArrows: getStore('nc_arrows') !== 'false'
    };

    let stockfish = null;
    let lastFen = "";
    let pvData = {};
    let renderPending = false;
    let lastRenderTime = 0;
    let autoMoveTimer = null;
    let focusListenerAttached = false;

    let currentAnalysis = {
        good: { move: "-", eval: "0.0", uci: "" },
        medium: { move: "-", eval: "0.0", uci: "" },
        weak: { move: "-", eval: "0.0", uci: "" },
        isBookMove: false
    };

    // --- 3. INJECT OPTIMIZED HUD STYLES & DOM ---
    function injectStylesAndHUD() {
        if (!document.head || !document.body) return;

        if (!document.getElementById('neon-hud-style')) {
            const style = document.createElement('style');
            style.id = 'neon-hud-style';
            style.innerHTML = `
                #neon-hud-panel {
                    position: fixed;
                    bottom: 16px;
                    left: 16px;
                    width: 255px;
                    max-width: calc(100vw - 32px);
                    box-sizing: border-box;
                    background: #080f16;
                    border: 1.5px solid #00f0ff;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.85);
                    border-radius: 8px;
                    padding: 10px;
                    font-family: 'Courier New', Courier, monospace;
                    color: #e0faff;
                    z-index: 2147483647;
                    user-select: none;
                    touch-action: none;
                    will-change: transform;
                    transform: translate3d(0, 0, 0);
                }
                #neon-hud-panel.minimized {
                    width: auto;
                    padding: 6px 10px;
                    border-radius: 20px;
                }
                #neon-hud-panel.minimized #hud-body {
                    display: none !important;
                }
                #neon-hud-panel.minimized .hud-header {
                    border-bottom: none;
                    padding-bottom: 0;
                    margin-bottom: 0;
                    gap: 8px;
                }
                .hud-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid rgba(0, 240, 255, 0.3);
                    padding-bottom: 6px;
                    margin-bottom: 8px;
                    font-size: 12px;
                    cursor: move;
                }
                .header-actions {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .eval-badge {
                    border: 1px solid #00f0ff;
                    padding: 1px 6px;
                    color: #ffaa00;
                    font-weight: bold;
                    font-size: 12px;
                    background: rgba(0, 240, 255, 0.1);
                    border-radius: 3px;
                }
                .toggle-hud-btn {
                    background: #00f0ff;
                    color: #080f16;
                    border: none;
                    font-weight: bold;
                    font-size: 12px;
                    width: 22px;
                    height: 22px;
                    border-radius: 4px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .gambit-select {
                    width: 100%;
                    background: #0f1c29;
                    color: #00f0ff;
                    border: 1px solid rgba(0, 240, 255, 0.45);
                    padding: 5px;
                    font-size: 11px;
                    font-family: inherit;
                    border-radius: 4px;
                    margin-bottom: 8px;
                    outline: none;
                }
                .pwr-container {
                    margin-bottom: 8px;
                    font-size: 10px;
                }
                .pwr-labels {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 3px;
                    color: #88d8e6;
                }
                .pwr-bar-bg {
                    height: 5px;
                    background: #1a2c38;
                    border-radius: 2px;
                    overflow: hidden;
                }
                .pwr-bar-fill {
                    height: 100%;
                    background: #00f0ff;
                    transition: width 0.2s linear;
                }
                .move-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 5px 7px;
                    margin-bottom: 4px;
                    background: rgba(255, 255, 255, 0.04);
                    border-left: 3px solid transparent;
                    cursor: pointer;
                    font-size: 12px;
                }
                .move-row.active-tier {
                    background: rgba(0, 240, 255, 0.18);
                }
                .tier-good { border-left-color: #00f0ff; }
                .tier-med  { border-left-color: #ffaa00; }
                .tier-weak { border-left-color: #ff3366; }

                .diamond-icon {
                    display: inline-block;
                    width: 14px;
                    height: 14px;
                    line-height: 14px;
                    text-align: center;
                    font-size: 9px;
                    font-weight: bold;
                    margin-right: 8px;
                    border-radius: 2px;
                    color: #000;
                }
                .d-good { background: #00f0ff; }
                .d-med  { background: #ffaa00; }
                .d-weak { background: #ff3366; color: #fff; }

                .move-san { font-weight: bold; color: #fff; flex-grow: 1; }
                .move-label { font-size: 9px; color: #88c0d0; margin-right: 6px; }
                .move-score { font-weight: bold; font-size: 11px; }
                .score-good { color: #00f0ff; }
                .score-med  { color: #7cfc00; }
                .score-weak { color: #ff5555; }

                .hud-controls {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 4px;
                    margin-top: 6px;
                }
                .hud-controls-bottom {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 4px;
                    margin-top: 4px;
                }
                .hud-btn {
                    background: rgba(0, 240, 255, 0.06);
                    border: 1px solid rgba(0, 240, 255, 0.4);
                    color: #aaddff;
                    padding: 5px 2px;
                    font-size: 10px;
                    font-family: inherit;
                    text-align: center;
                    cursor: pointer;
                    border-radius: 3px;
                }
                .hud-btn.active {
                    background: rgba(0, 240, 255, 0.28);
                    color: #fff;
                    border-color: #00f0ff;
                    font-weight: bold;
                }
                #neon-svg-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: 100;
                }
            `;
            document.head.appendChild(style);
        }

        if (document.getElementById('neon-hud-panel')) return;

        const gambitOptionsHtml = Object.entries(GAMBIT_BOOK).map(([key, item]) =>
            `<option value="${key}" ${CONFIG.selectedGambit === key ? 'selected' : ''}>${item.name}</option>`
        ).join('');

        const hud = document.createElement('div');
        hud.id = 'neon-hud-panel';
        if (CONFIG.isMinimized) hud.classList.add('minimized');

        hud.innerHTML = `
            <div class="hud-header" id="hud-drag-handle">
                <span>⚡ <b id="hud-mode-text">NEON</b></span>
                <div class="header-actions">
                    <span class="eval-badge" id="hud-main-eval">0.0</span>
                    <button class="toggle-hud-btn" id="btn-minimize" title="Minimize / Expand UI">${CONFIG.isMinimized ? '+' : '—'}</button>
                </div>
            </div>

            <div id="hud-body">
                <select class="gambit-select" id="select-gambit">
                    ${gambitOptionsHtml}
                </select>

                <div class="pwr-container">
                    <div class="pwr-labels">
                        <span id="pwr-win">50%</span>
                        <span id="turn-indicator">WAITING FOR BOARD</span>
                        <span id="pwr-loss">50%</span>
                    </div>
                    <div class="pwr-bar-bg">
                        <div class="pwr-bar-fill" id="pwr-bar" style="width: 50%;"></div>
                    </div>
                </div>

                <div class="move-row tier-good ${CONFIG.selectedTier === 1 ? 'active-tier' : ''}" data-tier="1" id="row-tier-1">
                    <div class="diamond-icon d-good">1</div>
                    <span class="move-san" id="move-1-san">...</span>
                    <span class="move-label" id="move-1-label">GOOD</span>
                    <span class="move-score score-good" id="move-1-eval">0.0</span>
                </div>

                <div class="move-row tier-med ${CONFIG.selectedTier === 2 ? 'active-tier' : ''}" data-tier="2" id="row-tier-2">
                    <div class="diamond-icon d-med">2</div>
                    <span class="move-san" id="move-2-san">...</span>
                    <span class="move-label">MED</span>
                    <span class="move-score score-med" id="move-2-eval">0.0</span>
                </div>

                <div class="move-row tier-weak ${CONFIG.selectedTier === 3 ? 'active-tier' : ''}" data-tier="3" id="row-tier-3">
                    <div class="diamond-icon d-weak">3</div>
                    <span class="move-san" id="move-3-san">...</span>
                    <span class="move-label">WEAK</span>
                    <span class="move-score score-weak" id="move-3-eval">0.0</span>
                </div>

                <div class="hud-controls">
                    <button class="hud-btn ${CONFIG.autoMove ? 'active' : ''}" id="btn-auto">AUTO: ${CONFIG.autoMove ? 'ON' : 'OFF'}</button>
                    <button class="hud-btn" id="btn-delay">${(CONFIG.delayMs / 1000).toFixed(1)}S</button>
                    <button class="hud-btn" id="btn-rank">TIER: ${CONFIG.selectedTier}</button>
                </div>
                <div class="hud-controls-bottom">
                    <button class="hud-btn" id="btn-force">SCAN</button>
                    <button class="hud-btn" id="btn-depth">D:${CONFIG.depth}</button>
                    <button class="hud-btn ${CONFIG.showArrows ? 'active' : ''}" id="btn-arrows">ARROW</button>
                </div>
            </div>
        `;
        document.body.appendChild(hud);

        setupHUDInteractions(hud);
        scheduleRender(true);
    }

    window.__neonEnsureHUD = injectStylesAndHUD;

    // --- 4. HUD INTERACTIONS & GPU-ACCELERATED DRAG ---
    function setupHUDInteractions(hud) {
        const tierNames = ["GOOD", "MED", "WEAK"];

        [1, 2, 3].forEach(t => {
            const row = document.getElementById(`row-tier-${t}`);
            if (row) {
                row.addEventListener('click', () => {
                    selectTier(t, tierNames[t - 1]);
                });
            }
        });

        document.getElementById('btn-rank').addEventListener('click', () => {
            let nextTier = (CONFIG.selectedTier % 3) + 1;
            selectTier(nextTier, tierNames[nextTier - 1]);
        });

        function selectTier(tier, name) {
            CONFIG.selectedTier = tier;
            setStore('nc_tier', tier);
            document.querySelectorAll('.move-row').forEach(el => el.classList.remove('active-tier'));
            const activeRow = document.getElementById(`row-tier-${tier}`);
            if (activeRow) activeRow.classList.add('active-tier');
            document.getElementById('btn-rank').innerText = `TIER: ${tier}`;
            document.getElementById('hud-mode-text').innerText = name;
            scheduleRender(true);
        }

        // Toggle Minimize / Expand UI
        const minBtn = document.getElementById('btn-minimize');
        minBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            CONFIG.isMinimized = !CONFIG.isMinimized;
            setStore('nc_minimized', CONFIG.isMinimized);
            hud.classList.toggle('minimized', CONFIG.isMinimized);
            minBtn.innerText = CONFIG.isMinimized ? '+' : '—';
        });

        // Gambit Selection
        document.getElementById('select-gambit').addEventListener('change', (e) => {
            CONFIG.selectedGambit = e.target.value;
            setStore('nc_gambit', CONFIG.selectedGambit);
            analyzeCurrentBoard(true);
        });

        // Auto Move Toggle
        document.getElementById('btn-auto').addEventListener('click', (e) => {
            CONFIG.autoMove = !CONFIG.autoMove;
            setStore('nc_auto', CONFIG.autoMove);
            e.target.innerText = `AUTO: ${CONFIG.autoMove ? 'ON' : 'OFF'}`;
            e.target.classList.toggle('active', CONFIG.autoMove);
            if (CONFIG.autoMove) triggerAutoMoveIfMyTurn();
        });

        // Delay Toggle (QoL)
        document.getElementById('btn-delay').addEventListener('click', (e) => {
            const delays = [300, 800, 1500, 2500];
            let idx = (delays.indexOf(CONFIG.delayMs) + 1) % delays.length;
            CONFIG.delayMs = delays[idx];
            setStore('nc_delay', CONFIG.delayMs);
            e.target.innerText = `${(CONFIG.delayMs / 1000).toFixed(1)}S`;
        });

        // Depth Toggle
        document.getElementById('btn-depth').addEventListener('click', (e) => {
            const depths = [8, 10, 13, 16];
            let idx = (depths.indexOf(CONFIG.depth) + 1) % depths.length;
            CONFIG.depth = depths[idx];
            setStore('nc_depth', CONFIG.depth);
            e.target.innerText = `D:${CONFIG.depth}`;
            analyzeCurrentBoard(true);
        });

        // Arrow Toggle (QoL)
        document.getElementById('btn-arrows').addEventListener('click', (e) => {
            CONFIG.showArrows = !CONFIG.showArrows;
            setStore('nc_arrows', CONFIG.showArrows);
            e.target.classList.toggle('active', CONFIG.showArrows);
            scheduleRender(true);
        });

        document.getElementById('btn-force').addEventListener('click', () => {
            analyzeCurrentBoard(true);
        });

        // Auto-minimize when focusing on email/password inputs so the keyboard isn't blocked
        if (!focusListenerAttached) {
            focusListenerAttached = true;
            document.addEventListener('focusin', (e) => {
                const panel = document.getElementById('neon-hud-panel');
                const btn = document.getElementById('btn-minimize');
                if (panel && e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                    panel.classList.add('minimized');
                    if (btn) btn.innerText = '+';
                }
            });
        }

        // GPU-Accelerated Dragging (No Layout Thrashing)
        const handle = document.getElementById('hud-drag-handle');
        let isDragging = false, startX = 0, startY = 0, currentX = 0, currentY = 0, offsetX = 0, offsetY = 0;

        const startDrag = (e) => {
            if (e.target === minBtn) return;
            isDragging = true;
            const touch = e.touches ? e.touches[0] : e;
            startX = touch.clientX - offsetX;
            startY = touch.clientY - offsetY;
        };

        const onDrag = (e) => {
            if (!isDragging) return;
            const touch = e.touches ? e.touches[0] : e;
            currentX = touch.clientX - startX;
            currentY = touch.clientY - startY;
            offsetX = currentX;
            offsetY = currentY;
            hud.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        };

        const stopDrag = () => { isDragging = false; };

        handle.addEventListener('mousedown', startDrag);
        window.addEventListener('mousemove', onDrag, { passive: true });
        window.addEventListener('mouseup', stopDrag);

        handle.addEventListener('touchstart', startDrag, { passive: true });
        window.addEventListener('touchmove', onDrag, { passive: true });
        window.addEventListener('touchend', stopDrag);
    }

    // --- 5. STOCKFISH ENGINE & THROTTLED RENDERER ---
    async function initStockfish() {
        try {
            const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';
            const response = await fetch(workerUrl);
            const scriptText = await response.text();
            const scriptBlob = new Blob([scriptText], { type: 'application/javascript' });
            stockfish = new Worker(URL.createObjectURL(scriptBlob));

            stockfish.onmessage = function (event) {
                const line = event.data;
                if (!line) return;

                if (line.startsWith('info depth') && line.includes(' multipv ')) {
                    if (currentAnalysis.isBookMove) return; // Ignore if currently using a Gambit book move

                    const multipvMatch = line.match(/multipv (\d+)/);
                    const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
                    const pvMatch = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);

                    if (multipvMatch && scoreMatch && pvMatch) {
                        const rank = parseInt(multipvMatch[1]);
                        const type = scoreMatch[1];
                        const val = parseInt(scoreMatch[2]);
                        const uciMove = pvMatch[1];

                        let formattedScore = type === 'mate'
                            ? `M${Math.abs(val)}`
                            : (val >= 0 ? `+${(val / 100).toFixed(1)}` : (val / 100).toFixed(1));

                        pvData[rank] = {
                            uci: uciMove,
                            eval: formattedScore,
                            rawCp: type === 'mate' ? (val > 0 ? 1000 : -1000) : val
                        };

                        scheduleRender();
                    }
                } else if (line.startsWith('bestmove')) {
                    scheduleRender(true);
                    if (CONFIG.autoMove) triggerAutoMoveIfMyTurn();
                }
            };

            stockfish.postMessage('uci');
            stockfish.postMessage(`setoption name MultiPV value ${CONFIG.multiPV}`);
            stockfish.postMessage('isready');
        } catch (err) {
            console.error('Failed to load Stockfish:', err);
        }
    }

    // Prevent UI lag by throttling DOM updates to at most once every 120ms
    function scheduleRender(forceImmediate = false) {
        const now = performance.now();
        if (!forceImmediate && (renderPending || now - lastRenderTime < 120)) return;
        renderPending = true;

        requestAnimationFrame(() => {
            renderPending = false;
            lastRenderTime = performance.now();
            updateAnalysisTiers();
            drawBoardArrows();
        });
    }

    function updateAnalysisTiers() {
        const move1San = document.getElementById('move-1-san');
        if (!move1San) return;

        if (!currentAnalysis.isBookMove) {
            if (pvData[1]) {
                currentAnalysis.good = pvData[1];
                move1San.innerText = formatUciToReadable(pvData[1].uci);
                document.getElementById('move-1-label').innerText = 'GOOD';
                document.getElementById('move-1-eval').innerText = pvData[1].eval;
                document.getElementById('hud-main-eval').innerText = pvData[1].eval;

                let winPct = Math.min(95, Math.max(5, Math.round(50 + (pvData[1].rawCp / 15))));
                document.getElementById('pwr-win').innerText = `${winPct}%`;
                document.getElementById('pwr-loss').innerText = `${100 - winPct}%`;
                document.getElementById('pwr-bar').style.width = `${winPct}%`;
            }

            const medSource = pvData[2] || pvData[1];
            if (medSource) {
                currentAnalysis.medium = medSource;
                document.getElementById('move-2-san').innerText = formatUciToReadable(medSource.uci);
                document.getElementById('move-2-eval').innerText = medSource.eval;
            }

            const weakSource = pvData[4] || pvData[3] || pvData[2];
            if (weakSource) {
                currentAnalysis.weak = weakSource;
                document.getElementById('move-3-san').innerText = formatUciToReadable(weakSource.uci);
                document.getElementById('move-3-eval').innerText = weakSource.eval;
            }
        } else {
            move1San.innerText = formatUciToReadable(currentAnalysis.good.uci);
            document.getElementById('move-1-label').innerText = 'GAMBIT';
            document.getElementById('move-1-eval').innerText = 'BOOK';
            document.getElementById('hud-main-eval').innerText = 'BOOK';
        }
    }

    function formatUciToReadable(uci) {
        if (!uci || uci.length < 4) return "...";
        return `${uci.substring(0, 2)} → ${uci.substring(2, 4)}`;
    }

    // --- 6. BOARD DETECTION, GAMBIT CHECK & AUTO-MOVE ---
    function getBoardElement() {
        return document.querySelector('wc-chess-board') || document.querySelector('chess-board');
    }

    function getMoveHistoryUci(board) {
        try {
            if (board.game && typeof board.game.getMoveHistory === 'function') {
                const hist = board.game.getMoveHistory();
                return hist.map(m => (m.from && m.to) ? `${m.from}${m.to}` : '');
            }
        } catch (e) {}
        return [];
    }

    function checkGambitMove(board, currentFen) {
        const gambit = GAMBIT_BOOK[CONFIG.selectedGambit];
        if (!gambit || CONFIG.selectedGambit === 'none' || gambit.moves.length === 0) return null;

        const fenParts = currentFen.split(' ');
        const activeColor = fenParts[1] || 'w';
        const fullMoveNum = parseInt(fenParts[5]) || 1;
        const halfMoveIndex = (fullMoveNum - 1) * 2 + (activeColor === 'b' ? 1 : 0);

        if (halfMoveIndex >= gambit.moves.length) return null;

        // Check move history if available to ensure opponent follows the opening line
        const historyUci = getMoveHistoryUci(board);
        if (historyUci.length === halfMoveIndex) {
            for (let i = 0; i < historyUci.length; i++) {
                if (historyUci[i] && historyUci[i] !== gambit.moves[i]) {
                    return null; // Opponent deviated, switch to Stockfish
                }
            }
        }

        return gambit.moves[halfMoveIndex];
    }

    function analyzeCurrentBoard(force = false) {
        if (!document.getElementById('neon-hud-panel')) {
            injectStylesAndHUD();
        }

        const board = getBoardElement();
        if (!board || !board.game) return;

        const currentFen = board.game.getFEN ? board.game.getFEN() : null;
        if (!currentFen || (!force && currentFen === lastFen)) return;

        lastFen = currentFen;
        pvData = {};

        // Update turn indicator
        const turnColor = currentFen.split(' ')[1] === 'b' ? 'BLACK' : 'WHITE';
        const turnEl = document.getElementById('turn-indicator');
        if (turnEl) turnEl.innerText = `TURN: ${turnColor}`;

        // 1. Check if move is in the Gambit book
        const gambitUci = checkGambitMove(board, currentFen);
        if (gambitUci) {
            currentAnalysis.isBookMove = true;
            currentAnalysis.good = { uci: gambitUci, eval: "BOOK", rawCp: 50 };
            currentAnalysis.medium = { uci: gambitUci, eval: "BOOK", rawCp: 50 };
            currentAnalysis.weak = { uci: gambitUci, eval: "BOOK", rawCp: 50 };
            scheduleRender(true);
            if (CONFIG.autoMove) triggerAutoMoveIfMyTurn();
            return;
        }

        // 2. If out of book, use Stockfish
        currentAnalysis.isBookMove = false;
        if (stockfish) {
            stockfish.postMessage('stop');
            stockfish.postMessage(`position fen ${currentFen}`);
            stockfish.postMessage(`go depth ${CONFIG.depth}`);
        }
    }

    function getSelectedMoveUci() {
        if (CONFIG.selectedTier === 2) return currentAnalysis.medium.uci;
        if (CONFIG.selectedTier === 3) return currentAnalysis.weak.uci;
        return currentAnalysis.good.uci;
    }

    function triggerAutoMoveIfMyTurn() {
        if (!CONFIG.autoMove) return;
        const board = getBoardElement();
        if (!board || !board.game) return;

        const isFlipped = board.classList.contains('flipped');
        const myColor = isFlipped ? 'b' : 'w';
        const currentFen = board.game.getFEN ? board.game.getFEN() : "";
        const turnColor = currentFen.split(' ')[1] || 'w';

        if (myColor !== turnColor) return;

        const uci = getSelectedMoveUci();
        if (!uci || uci.length < 4) return;

        clearTimeout(autoMoveTimer);
        autoMoveTimer = setTimeout(() => {
            try {
                if (typeof board.game.move === 'function') {
                    board.game.move({
                        from: uci.substring(0, 2),
                        to: uci.substring(2, 4),
                        promotion: uci.length > 4 ? uci[4] : 'q',
                        animate: true,
                        userGenerated: true
                    });
                }
            } catch (e) {}
        }, CONFIG.delayMs);
    }

    // --- 7. LIGHTWEIGHT SVG OVERLAY (NO GAUSSIAN BLUR LAG) ---
    function drawBoardArrows() {
        const board = getBoardElement();
        if (!board) return;

        let svg = document.getElementById('neon-svg-overlay');
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = 'neon-svg-overlay';
            svg.setAttribute('viewBox', '0 0 100 100');
            board.style.position = 'relative';
            board.appendChild(svg);
        }

        if (!CONFIG.showArrows) {
            svg.innerHTML = '';
            return;
        }

        const isFlipped = board.classList.contains('flipped');
        let html = '';

        const movesToDraw = [
            { data: currentAnalysis.weak, color: '#ff3366', tier: 3 },
            { data: currentAnalysis.medium, color: '#ffaa00', tier: 2 },
            { data: currentAnalysis.good, color: '#00f0ff', tier: 1 }
        ];

        movesToDraw.forEach(item => {
            if (!item.data || !item.data.uci || item.data.uci.length < 4) return;
            const isSelected = CONFIG.selectedTier === item.tier;
            if (currentAnalysis.isBookMove && item.tier !== 1) return;

            const opacity = isSelected ? '0.95' : '0.3';
            const strokeWidth = isSelected ? '2.0' : '1.0';

            const fromSq = uciToCoords(item.data.uci.substring(0, 2), isFlipped);
            const toSq = uciToCoords(item.data.uci.substring(2, 4), isFlipped);

            html += `
                <rect x="${fromSq.x - 6.25}" y="${fromSq.y - 6.25}" width="12.5" height="12.5"
                      fill="none" stroke="${item.color}" stroke-width="0.8" opacity="${opacity}" />
                <line x1="${fromSq.x}" y1="${fromSq.y}" x2="${toSq.x}" y2="${toSq.y}"
                      stroke="${item.color}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="${opacity}" />
            `;

            if (isSelected) {
                html += `
                    <circle cx="${toSq.x}" cy="${toSq.y}" r="2.8" fill="#08141e" stroke="${item.color}" stroke-width="1.2" />
                `;
            }
        });

        svg.innerHTML = html;
    }

    function uciToCoords(sq, isFlipped) {
        const file = sq.charCodeAt(0) - 97;
        const rank = parseInt(sq[1]) - 1;
        const col = isFlipped ? 7 - file : file;
        const row = isFlipped ? rank : 7 - rank;
        return {
            x: col * 12.5 + 6.25,
            y: row * 12.5 + 6.25
        };
    }

    // --- 8. INITIALIZE ---
    function startHelper() {
        injectStylesAndHUD();
        initStockfish();
        setInterval(() => analyzeCurrentBoard(false), 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(startHelper, 300));
    } else {
        setTimeout(startHelper, 300);
    }
}

window.initNeonChessHelper = initNeonChessHelper;
if (typeof window !== 'undefined' && window.location && /chess\.com/i.test(window.location.hostname)) {
    initNeonChessHelper();
}
