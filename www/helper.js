(function () {
    'use strict';

    // --- 1. KONFIGURASI SISTEM ---
    const CONFIG = {
        depth: 10,          // Kedalaman kiraan (D:10 seperti dalam gambar)
        multiPV: 5,         // Kira 5 langkah terbaik untuk tapis Good, Sederhana, Lemah
        autoMove: false,    // Status Auto Move
        delaySeconds: 1,    // Jeda masa analisis
        selectedTier: 1     // 1 = Good, 2 = Sederhana, 3 = Lemah
    };

    let stockfish = null;
    let lastFen = "";
    let currentAnalysis = {
        good: { move: "-", eval: "0.0", uci: "" },
        medium: { move: "-", eval: "0.0", uci: "" },
        weak: { move: "-", eval: "0.0", uci: "" }
    };

    // --- 2. BINA ANTARAMUKA HUD & OVERLAY PAPAN (CSS + HTML) ---
    function injectStylesAndHUD() {
        const style = document.createElement('style');
        style.innerHTML = `
            #neon-hud-panel {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                width: 260px;
                background: rgba(8, 15, 22, 0.94);
                border: 1.5px solid #00f0ff;
                box-shadow: 0 0 15px rgba(0, 240, 255, 0.35), inset 0 0 10px rgba(0, 240, 255, 0.15);
                border-radius: 6px;
                padding: 12px;
                font-family: 'Courier New', Courier, monospace;
                color: #e0faff;
                z-index: 999999;
                user-select: none;
                backdrop-filter: blur(6px);
            }
            .hud-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid rgba(0, 240, 255, 0.3);
                padding-bottom: 8px;
                margin-bottom: 8px;
                font-size: 12px;
                letter-spacing: 1px;
                cursor: move;
            }
            .eval-badge {
                border: 1px solid #00f0ff;
                padding: 2px 8px;
                color: #ffaa00;
                font-weight: bold;
                font-size: 14px;
                background: rgba(0, 240, 255, 0.08);
            }
            .pwr-container {
                margin-bottom: 10px;
                font-size: 11px;
            }
            .pwr-labels {
                display: flex;
                justify-content: space-between;
                margin-bottom: 4px;
                color: #88d8e6;
            }
            .pwr-bar-bg {
                height: 6px;
                background: #1a2c38;
                border-radius: 2px;
                overflow: hidden;
                display: flex;
            }
            .pwr-bar-fill {
                height: 100%;
                background: repeating-linear-gradient(
                    90deg,
                    #00f0ff,
                    #00f0ff 4px,
                    transparent 4px,
                    transparent 6px
                );
                transition: width 0.3s ease;
            }
            .move-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 8px;
                margin-bottom: 5px;
                background: rgba(255, 255, 255, 0.03);
                border-left: 3px solid transparent;
                cursor: pointer;
                font-size: 13px;
                transition: 0.2s;
            }
            .move-row:hover {
                background: rgba(0, 240, 255, 0.12);
            }
            .move-row.active-tier {
                background: rgba(0, 240, 255, 0.18);
                box-shadow: inset 0 0 8px rgba(0, 240, 255, 0.25);
            }
            .tier-good { border-left-color: #00f0ff; }
            .tier-med  { border-left-color: #ffaa00; }
            .tier-weak { border-left-color: #ff3366; }

            .diamond-icon {
                display: inline-block;
                width: 16px;
                height: 16px;
                line-height: 16px;
                text-align: center;
                font-size: 10px;
                font-weight: bold;
                transform: rotate(45deg);
                margin-right: 10px;
                color: #000;
            }
            .diamond-icon span {
                display: inline-block;
                transform: rotate(-45deg);
            }
            .d-good { background: #00f0ff; }
            .d-med  { background: #ffaa00; }
            .d-weak { background: #ff3366; color: #fff; }

            .move-san { font-weight: bold; color: #fff; flex-grow: 1; }
            .move-label { font-size: 10px; color: #88c0d0; margin-right: 8px; }
            .move-score { font-weight: bold; font-size: 12px; }
            .score-good { color: #00f0ff; }
            .score-med  { color: #7cfc00; }
            .score-weak { color: #ff5555; }

            .hud-controls {
                display: grid;
                grid-template-columns: 1.2fr 0.8fr 1fr;
                gap: 5px;
                margin-top: 8px;
            }
            .hud-controls-bottom {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 5px;
                margin-top: 5px;
            }
            .hud-btn {
                background: rgba(0, 240, 255, 0.05);
                border: 1px solid rgba(0, 240, 255, 0.4);
                color: #aaddff;
                padding: 5px 4px;
                font-size: 10px;
                font-family: inherit;
                text-align: center;
                cursor: pointer;
                border-radius: 3px;
            }
            .hud-btn:active, .hud-btn.active {
                background: rgba(0, 240, 255, 0.25);
                color: #fff;
                border-color: #00f0ff;
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

        const hud = document.createElement('div');
        hud.id = 'neon-hud-panel';
        hud.innerHTML = `
            <div class="hud-header" id="hud-drag-handle">
                <span>♟ MODE: <b id="hud-mode-text">GOOD</b></span>
                <span class="eval-badge" id="hud-main-eval">+0.0</span>
            </div>
            <div class="pwr-container">
                <div class="pwr-labels">
                    <span id="pwr-win">50</span>
                    <span>PWR</span>
                    <span id="pwr-loss">50</span>
                </div>
                <div class="pwr-bar-bg">
                    <div class="pwr-bar-fill" id="pwr-bar" style="width: 50%;"></div>
                </div>
            </div>

            <!-- 3 PILIHAN LANGKAH: GOOD, SEDERHANA, LEMAH -->
            <div class="move-row tier-good active-tier" data-tier="1" id="row-tier-1">
                <div class="diamond-icon d-good"><span>1</span></div>
                <span class="move-san" id="move-1-san">...</span>
                <span class="move-label">GOOD</span>
                <span class="move-score score-good" id="move-1-eval">0.0</span>
            </div>

            <div class="move-row tier-med" data-tier="2" id="row-tier-2">
                <div class="diamond-icon d-med"><span>2</span></div>
                <span class="move-san" id="move-2-san">...</span>
                <span class="move-label">SEDERHANA</span>
                <span class="move-score score-med" id="move-2-eval">0.0</span>
            </div>

            <div class="move-row tier-weak" data-tier="3" id="row-tier-3">
                <div class="diamond-icon d-weak"><span>3</span></div>
                <span class="move-san" id="move-3-san">...</span>
                <span class="move-label">LEMAH</span>
                <span class="move-score score-weak" id="move-3-eval">0.0</span>
            </div>

            <div class="hud-controls">
                <button class="hud-btn" id="btn-auto">AUTO: OFF</button>
                <button class="hud-btn" id="btn-delay">1S</button>
                <button class="hud-btn" id="btn-rank">TIER: 1</button>
            </div>
            <div class="hud-controls-bottom">
                <button class="hud-btn" id="btn-force">FORCE SCAN</button>
                <button class="hud-btn" id="btn-depth">D:10</button>
            </div>
        `;
        document.body.appendChild(hud);

        setupHUDInteractions(hud);
    }

    // --- 3. INTERAKSI BUTANG & DRAG HUD (UNTUK SKRIN SENTUH TELEFON) ---
    function setupHUDInteractions(hud) {
        const tiers = [1, 2, 3];
        const tierNames = ["GOOD", "SEDERHANA", "LEMAH"];

        tiers.forEach(t => {
            document.getElementById(`row-tier-${t}`).addEventListener('click', () => {
                selectTier(t, tierNames[t - 1]);
            });
        });

        document.getElementById('btn-rank').addEventListener('click', () => {
            let nextTier = (CONFIG.selectedTier % 3) + 1;
            selectTier(nextTier, tierNames[nextTier - 1]);
        });

        function selectTier(tier, name) {
            CONFIG.selectedTier = tier;
            document.querySelectorAll('.move-row').forEach(el => el.classList.remove('active-tier'));
            document.getElementById(`row-tier-${tier}`).classList.add('active-tier');
            document.getElementById('btn-rank').innerText = `TIER: ${tier}`;
            document.getElementById('hud-mode-text').innerText = name;
            drawBoardArrows();
        }

        document.getElementById('btn-auto').addEventListener('click', (e) => {
            CONFIG.autoMove = !CONFIG.autoMove;
            e.target.innerText = `AUTO: ${CONFIG.autoMove ? 'ON' : 'OFF'}`;
            e.target.classList.toggle('active', CONFIG.autoMove);
        });

        document.getElementById('btn-depth').addEventListener('click', (e) => {
            const depths = [8, 10, 14, 18];
            let idx = (depths.indexOf(CONFIG.depth) + 1) % depths.length;
            CONFIG.depth = depths[idx];
            e.target.innerText = `D:${CONFIG.depth}`;
            analyzeCurrentBoard(true);
        });

        document.getElementById('btn-force').addEventListener('click', () => {
            analyzeCurrentBoard(true);
        });

        // Fungsi heret (Drag) mesra skrin sentuh (Touchscreen)
        const handle = document.getElementById('hud-drag-handle');
        let isDragging = false, startX, startY, initialLeft, initialTop;

        const startDrag = (e) => {
            isDragging = true;
            const touch = e.touches ? e.touches[0] : e;
            startX = touch.clientX;
            startY = touch.clientY;
            const rect = hud.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            hud.style.transform = 'none';
            hud.style.bottom = 'auto';
        };

        const onDrag = (e) => {
            if (!isDragging) return;
            const touch = e.touches ? e.touches[0] : e;
            hud.style.left = `${initialLeft + (touch.clientX - startX)}px`;
            hud.style.top = `${initialTop + (touch.clientY - startY)}px`;
        };

        const stopDrag = () => { isDragging = false; };

        handle.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', stopDrag);

        handle.addEventListener('touchstart', startDrag, { passive: true });
        document.addEventListener('touchmove', onDrag, { passive: true });
        document.addEventListener('touchend', stopDrag);
    }

    // --- 4. ENJIN STOCKFISH (WEB WORKER) ---
    async function initStockfish() {
        const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';
        const response = await fetch(workerUrl);
        const scriptBlob = await response.blob();
        stockfish = new Worker(URL.createObjectURL(scriptBlob));

        let pvData = {};

        stockfish.onmessage = function (event) {
            const line = event.data;

            if (line.startsWith('info depth') && line.includes(' multipv ')) {
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

                    updateAnalysisTiers(pvData);
                }
            }
        };

        stockfish.postMessage('uci');
        stockfish.postMessage(`setoption name MultiPV value ${CONFIG.multiPV}`);
        stockfish.postMessage('isready');
    }

    // --- 5. PEMBAHAGIAN 3 TAHAP: GOOD, SEDERHANA, LEMAH ---
    function updateAnalysisTiers(pvData) {
        // Tier 1 (Good): Langkah terbaik (Rank 1)
        if (pvData[1]) {
            currentAnalysis.good = pvData[1];
            document.getElementById('move-1-san').innerText = formatUciToReadable(pvData[1].uci);
            document.getElementById('move-1-eval').innerText = pvData[1].eval;
            document.getElementById('hud-main-eval').innerText = pvData[1].eval;

            // Kemas kini bar PWR
            let winPct = Math.min(95, Math.max(5, Math.round(50 + (pvData[1].rawCp / 15))));
            document.getElementById('pwr-win').innerText = winPct;
            document.getElementById('pwr-loss').innerText = 100 - winPct;
            document.getElementById('pwr-bar').style.width = `${winPct}%`;
        }

        // Tier 2 (Sederhana): Langkah kedua atau ketiga terbaik (Rank 2/3)
        const medSource = pvData[2] || pvData[1];
        if (medSource) {
            currentAnalysis.medium = medSource;
            document.getElementById('move-2-san').innerText = formatUciToReadable(medSource.uci);
            document.getElementById('move-2-eval').innerText = medSource.eval;
        }

        // Tier 3 (Lemah / Sub-optimal): Langkah ke-4 atau ke-5 (tidak blunder teruk tetapi kurang tepat)
        const weakSource = pvData[4] || pvData[3] || pvData[2];
        if (weakSource) {
            currentAnalysis.weak = weakSource;
            document.getElementById('move-3-san').innerText = formatUciToReadable(weakSource.uci);
            document.getElementById('move-3-eval').innerText = weakSource.eval;
        }

        drawBoardArrows();
    }

    function formatUciToReadable(uci) {
        if (!uci || uci.length < 4) return "...";
        return `${uci.substring(0, 2)} → ${uci.substring(2, 4)}`;
    }

    // --- 6. EKSTRAK FEN DARI PAPAN CHESS.COM ---
    function getBoardElement() {
        return document.querySelector('wc-chess-board') || document.querySelector('chess-board');
    }

    function analyzeCurrentBoard(force = false) {
        const board = getBoardElement();
        if (!board || !board.game) return;

        const currentFen = board.game.getFEN ? board.game.getFEN() : null;
        if (!currentFen || (!force && currentFen === lastFen)) return;

        lastFen = currentFen;
        stockfish.postMessage('stop');
        stockfish.postMessage(`setoption name MultiPV value ${CONFIG.multiPV}`);
        stockfish.postMessage(`position fen ${currentFen}`);
        stockfish.postMessage(`go depth ${CONFIG.depth}`);
    }

    // --- 7. LUKIS ANAK PANAH NEON DI ATAS PAPAN ---
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

        const isFlipped = board.classList.contains('flipped');
        svg.innerHTML = `
            <defs>
                <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.2" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>
        `;

        const movesToDraw = [
            { data: currentAnalysis.weak, color: '#ff3366', tier: 3 },
            { data: currentAnalysis.medium, color: '#ffaa00', tier: 2 },
            { data: currentAnalysis.good, color: '#00f0ff', tier: 1 }
        ];

        movesToDraw.forEach(item => {
            if (!item.data || !item.data.uci || item.data.uci.length < 4) return;
            const isSelected = CONFIG.selectedTier === item.tier;
            const opacity = isSelected ? '0.95' : '0.35';
            const strokeWidth = isSelected ? '1.8' : '1.0';

            const fromSq = uciToCoords(item.data.uci.substring(0, 2), isFlipped);
            const toSq = uciToCoords(item.data.uci.substring(2, 4), isFlipped);

            // Kotak Asal
            svg.innerHTML += `
                <rect x="${fromSq.x - 6.25}" y="${fromSq.y - 6.25}" width="12.5" height="12.5"
                      fill="none" stroke="${item.color}" stroke-width="0.7" opacity="${opacity}" filter="url(#neon-glow)" />
            `;

            // Garisan Anak Panah
            svg.innerHTML += `
                <line x1="${fromSq.x}" y1="${fromSq.y}" x2="${toSq.x}" y2="${toSq.y}"
                      stroke="${item.color}" stroke-width="${strokeWidth}" stroke-linecap="round"
                      opacity="${opacity}" filter="url(#neon-glow)" />
            `;

            // Bulatan Sasaran (Bintang pada pilihan aktif)
            if (isSelected) {
                svg.innerHTML += `
                    <circle cx="${toSq.x}" cy="${toSq.y}" r="3.2" fill="#08141e" stroke="${item.color}" stroke-width="1.2" filter="url(#neon-glow)" />
                    <text x="${toSq.x}" y="${toSq.y + 1.2}" font-size="3.8" text-anchor="middle" fill="${item.color}">★</text>
                `;
            }
        });
    }

    function uciToCoords(sq, isFlipped) {
        const file = sq.charCodeAt(0) - 97; // 'a' -> 0
        const rank = parseInt(sq[1]) - 1;   // '1' -> 0

        const col = isFlipped ? 7 - file : file;
        const row = isFlipped ? rank : 7 - rank;

        return {
            x: col * 12.5 + 6.25,
            y: row * 12.5 + 6.25
        };
    }

    // --- 8. MULAKAN SISTEM ---
    window.addEventListener('load', () => {
        setTimeout(() => {
            injectStylesAndHUD();
            initStockfish();
            setInterval(() => analyzeCurrentBoard(false), 6
