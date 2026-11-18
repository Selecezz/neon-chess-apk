// ==UserScript==
// @name         Neon Chess Pro Assistant & HUD (ELO Slider + Auto-Gambit)
// @namespace    https://github.com/Selecezz/neon-chess-apk
// @version      1.0.4
// @description  Smart Auto-Gambit, Multi-PV Stockfish 10.0.2 & 400/800/1500/2000/2500 ELO Guide Slider for Chess.com
// @author       Selecezz
// @match        https://www.chess.com/*
// @match        https://chess.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      cdnjs.cloudflare.com
// @connect      cdn.jsdelivr.net
// @run-at       document-idle
// ==/UserScript==

/**
 * Neon Chess Assistant & HUD (Smart Auto-Gambit & Pro Edition)
 * Engine: Stockfish 10.0.2 (MultiPV + FEN-Transposition Auto-Gambit Engine + SAN/Legal Guard)
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

    // --- 1. LIGHTWEIGHT CHESS FEN, LEGAL MOVE & SAN ENGINE ---
    const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const PIECE_ICONS = {
        P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔',
        p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚'
    };

    function sqToRC(sq) {
        return [8 - parseInt(sq[1], 10), sq.charCodeAt(0) - 97];
    }

    function rcToSq(r, c) {
        return String.fromCharCode(97 + c) + (8 - r);
    }

    function parseFen(fen) {
        if (!fen || typeof fen !== 'string') return null;
        const parts = fen.trim().split(/\s+/);
        if (parts.length < 2) return null;
        const rows = parts[0].split('/');
        if (rows.length !== 8) return null;

        const board = Array.from({ length: 8 }, () => Array(8).fill(''));
        for (let r = 0; r < 8; r++) {
            let c = 0;
            for (let i = 0; i < rows[r].length; i++) {
                const ch = rows[r][i];
                if (ch >= '1' && ch <= '8') {
                    c += parseInt(ch, 10);
                } else {
                    if (c >= 8) return null;
                    board[r][c++] = ch;
                }
            }
            if (c !== 8) return null;
        }

        return {
            board,
            turn: parts[1] === 'b' ? 'b' : 'w',
            castling: parts[2] || '-',
            ep: parts[3] || '-',
            halfMove: parseInt(parts[4], 10) || 0,
            fullMove: parseInt(parts[5], 10) || 1
        };
    }

    function serializeState(state) {
        const rows = [];
        for (let r = 0; r < 8; r++) {
            let rowStr = '';
            let empty = 0;
            for (let c = 0; c < 8; c++) {
                const p = state.board[r][c];
                if (!p) {
                    empty++;
                } else {
                    if (empty > 0) {
                        rowStr += empty;
                        empty = 0;
                    }
                    rowStr += p;
                }
            }
            if (empty > 0) rowStr += empty;
            rows.push(rowStr);
        }
        return `${rows.join('/')} ${state.turn} ${state.castling || '-'} ${state.ep || '-'} ${state.halfMove} ${state.fullMove}`;
    }

    function toPosKey(fen) {
        const parts = (fen || '').trim().split(/\s+/);
        if (parts.length < 2) return '';
        return `${parts[0]} ${parts[1]} ${parts[2] || '-'}`;
    }

    function pieceColor(p) {
        if (!p) return '';
        return p >= 'A' && p <= 'Z' ? 'w' : 'b';
    }

    function cloneBoard(b) {
        return b.map(row => row.slice());
    }

    function isSquareAttacked(b, r, c, byColor) {
        // Pawns
        const pawnChar = byColor === 'w' ? 'P' : 'p';
        const pRow = byColor === 'w' ? r + 1 : r - 1;
        if (pRow >= 0 && pRow < 8) {
            if (c - 1 >= 0 && b[pRow][c - 1] === pawnChar) return true;
            if (c + 1 < 8 && b[pRow][c + 1] === pawnChar) return true;
        }

        // Knights
        const knightChar = byColor === 'w' ? 'N' : 'n';
        const kOff = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        for (let i = 0; i < kOff.length; i++) {
            const nr = r + kOff[i][0], nc = c + kOff[i][1];
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr][nc] === knightChar) return true;
        }

        // King
        const kingChar = byColor === 'w' ? 'K' : 'k';
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr][nc] === kingChar) return true;
            }
        }

        // Orthogonal rays (Rook / Queen)
        const rookChar = byColor === 'w' ? 'R' : 'r';
        const queenChar = byColor === 'w' ? 'Q' : 'q';
        const ortho = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let i = 0; i < ortho.length; i++) {
            let nr = r + ortho[i][0], nc = c + ortho[i][1];
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const p = b[nr][nc];
                if (p) {
                    if (p === rookChar || p === queenChar) return true;
                    break;
                }
                nr += ortho[i][0];
                nc += ortho[i][1];
            }
        }

        // Diagonal rays (Bishop / Queen)
        const bishopChar = byColor === 'w' ? 'B' : 'b';
        const diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
        for (let i = 0; i < diag.length; i++) {
            let nr = r + diag[i][0], nc = c + diag[i][1];
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const p = b[nr][nc];
                if (p) {
                    if (p === bishopChar || p === queenChar) return true;
                    break;
                }
                nr += diag[i][0];
                nc += diag[i][1];
            }
        }

        return false;
    }

    function isKingInCheck(b, color) {
        const kingChar = color === 'w' ? 'K' : 'k';
        const opp = color === 'w' ? 'b' : 'w';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (b[r][c] === kingChar) {
                    return isSquareAttacked(b, r, c, opp);
                }
            }
        }
        return false;
    }

    function applyMoveToState(state, move) {
        const b = cloneBoard(state.board);
        const { fr, fc, tr, tc, promo } = move;
        const piece = b[fr][fc];
        if (!piece) return null;
        const color = pieceColor(piece);
        const isPawn = piece === 'P' || piece === 'p';
        const isKing = piece === 'K' || piece === 'k';

        // En passant capture
        if (isPawn && fc !== tc && !b[tr][tc]) {
            b[fr][tc] = '';
        }

        // Castling rook shift
        if (isKing && Math.abs(tc - fc) === 2) {
            if (tc === 6) {
                b[fr][5] = b[fr][7];
                b[fr][7] = '';
            } else if (tc === 2) {
                b[fr][3] = b[fr][0];
                b[fr][0] = '';
            }
        }

        let placed = piece;
        if (isPawn && (tr === 0 || tr === 7)) {
            const pr = promo || 'q';
            placed = color === 'w' ? pr.toUpperCase() : pr.toLowerCase();
        }
        b[tr][tc] = placed;
        b[fr][fc] = '';

        let castling = state.castling === '-' ? '' : state.castling;
        if (piece === 'K') castling = castling.replace(/[KQ]/g, '');
        if (piece === 'k') castling = castling.replace(/[kq]/g, '');
        if ((fr === 7 && fc === 0) || (tr === 7 && tc === 0)) castling = castling.replace('Q', '');
        if ((fr === 7 && fc === 7) || (tr === 7 && tc === 7)) castling = castling.replace('K', '');
        if ((fr === 0 && fc === 0) || (tr === 0 && tc === 0)) castling = castling.replace('q', '');
        if ((fr === 0 && fc === 7) || (tr === 0 && tc === 7)) castling = castling.replace('k', '');
        if (!castling) castling = '-';

        let ep = '-';
        if (isPawn && Math.abs(tr - fr) === 2) {
            ep = rcToSq((fr + tr) / 2, fc);
        }

        return {
            board: b,
            turn: color === 'w' ? 'b' : 'w',
            castling,
            ep,
            halfMove: isPawn || state.board[tr][tc] ? 0 : state.halfMove + 1,
            fullMove: color === 'b' ? state.fullMove + 1 : state.fullMove
        };
    }

    function getLegalMovesFromState(state) {
        const b = state.board;
        const turn = state.turn;
        const opp = turn === 'w' ? 'b' : 'w';
        const pseudo = [];

        const pushMove = (fr, fc, tr, tc, promo = '') => {
            pseudo.push({ fr, fc, tr, tc, promo, uci: rcToSq(fr, fc) + rcToSq(tr, tc) + promo });
        };

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = b[r][c];
                if (!p || pieceColor(p) !== turn) continue;
                const upper = p.toUpperCase();

                if (upper === 'P') {
                    const dir = turn === 'w' ? -1 : 1;
                    const startRow = turn === 'w' ? 6 : 1;
                    const promoRow = turn === 'w' ? 0 : 7;
                    const nr = r + dir;
                    if (nr >= 0 && nr < 8) {
                        if (!b[nr][c]) {
                            if (nr === promoRow) {
                                ['q', 'r', 'b', 'n'].forEach(pr => pushMove(r, c, nr, c, pr));
                            } else {
                                pushMove(r, c, nr, c);
                                const nr2 = r + dir * 2;
                                if (r === startRow && !b[nr2][c]) pushMove(r, c, nr2, c);
                            }
                        }
                        [-1, 1].forEach(dc => {
                            const nc = c + dc;
                            if (nc < 0 || nc >= 8) return;
                            const target = b[nr][nc];
                            const sq = rcToSq(nr, nc);
                            if ((target && pieceColor(target) === opp) || (state.ep && state.ep === sq)) {
                                if (nr === promoRow) {
                                    ['q', 'r', 'b', 'n'].forEach(pr => pushMove(r, c, nr, nc, pr));
                                } else {
                                    pushMove(r, c, nr, nc);
                                }
                            }
                        });
                    }
                } else if (upper === 'N') {
                    const offs = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
                    for (let i = 0; i < offs.length; i++) {
                        const nr = r + offs[i][0], nc = c + offs[i][1];
                        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && pieceColor(b[nr][nc]) !== turn) {
                            pushMove(r, c, nr, nc);
                        }
                    }
                } else if (upper === 'B' || upper === 'R' || upper === 'Q') {
                    const dirs = [];
                    if (upper !== 'R') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
                    if (upper !== 'B') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
                    for (let i = 0; i < dirs.length; i++) {
                        let nr = r + dirs[i][0], nc = c + dirs[i][1];
                        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                            const target = b[nr][nc];
                            if (!target) {
                                pushMove(r, c, nr, nc);
                            } else {
                                if (pieceColor(target) === opp) pushMove(r, c, nr, nc);
                                break;
                            }
                            nr += dirs[i][0];
                            nc += dirs[i][1];
                        }
                    }
                } else if (upper === 'K') {
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const nr = r + dr, nc = c + dc;
                            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && pieceColor(b[nr][nc]) !== turn) {
                                pushMove(r, c, nr, nc);
                            }
                        }
                    }
                    const homeRow = turn === 'w' ? 7 : 0;
                    if (r === homeRow && c === 4 && !isKingInCheck(b, turn)) {
                        const kSide = turn === 'w' ? 'K' : 'k';
                        const qSide = turn === 'w' ? 'Q' : 'q';
                        const rookChar = turn === 'w' ? 'R' : 'r';
                        if (state.castling.includes(kSide) && b[homeRow][7] === rookChar &&
                            !b[homeRow][5] && !b[homeRow][6] &&
                            !isSquareAttacked(b, homeRow, 5, opp) && !isSquareAttacked(b, homeRow, 6, opp)) {
                            pushMove(homeRow, 4, homeRow, 6);
                        }
                        if (state.castling.includes(qSide) && b[homeRow][0] === rookChar &&
                            !b[homeRow][1] && !b[homeRow][2] && !b[homeRow][3] &&
                            !isSquareAttacked(b, homeRow, 3, opp) && !isSquareAttacked(b, homeRow, 2, opp)) {
                            pushMove(homeRow, 4, homeRow, 2);
                        }
                    }
                }
            }
        }

        const legal = [];
        for (let i = 0; i < pseudo.length; i++) {
            const nextState = applyMoveToState(state, pseudo[i]);
            if (nextState && !isKingInCheck(nextState.board, turn)) {
                legal.push({ ...pseudo[i], nextState });
            }
        }
        return legal;
    }

    function applyUciToFen(fen, uci) {
        if (!uci || uci.length < 4) return null;
        const state = parseFen(fen);
        if (!state) return null;
        const [fr, fc] = sqToRC(uci.slice(0, 2));
        const [tr, tc] = sqToRC(uci.slice(2, 4));
        const promo = uci[4] || '';
        const legal = getLegalMovesFromState(state);
        const match = legal.find(m => m.fr === fr && m.fc === fc && m.tr === tr && m.tc === tc && (!m.promo || m.promo === promo || (!promo && m.promo === 'q')));
        if (!match) return null;
        return serializeState(match.nextState);
    }

    function isLegalUci(fen, uci) {
        if (!fen || !uci || uci.length < 4) return false;
        return applyUciToFen(fen, uci) !== null;
    }

    function formatUciWithSan(fen, uci) {
        if (!uci || uci.length < 4) return { san: '...', coords: '', icon: '' };
        const coords = `${uci.slice(0, 2)}→${uci.slice(2, 4)}`;
        const state = parseFen(fen);
        if (!state) return { san: coords, coords: '', icon: '' };

        const [fr, fc] = sqToRC(uci.slice(0, 2));
        const [tr, tc] = sqToRC(uci.slice(2, 4));
        const promo = uci[4] || '';
        const legal = getLegalMovesFromState(state);
        const move = legal.find(m => m.fr === fr && m.fc === fc && m.tr === tr && m.tc === tc && (!m.promo || m.promo === promo || (!promo && m.promo === 'q')));
        if (!move) return { san: coords, coords: '', icon: '' };

        const piece = state.board[fr][fc];
        const upper = piece.toUpperCase();
        const icon = PIECE_ICONS[piece] || '';
        const toSq = uci.slice(2, 4);
        const isCapture = !!state.board[tr][tc] || (upper === 'P' && fc !== tc);

        let san = '';
        if (upper === 'K' && Math.abs(tc - fc) === 2) {
            san = tc === 6 ? 'O-O' : 'O-O-O';
        } else if (upper === 'P') {
            san = isCapture ? `${uci[0]}x${toSq}` : toSq;
            if (move.promo) san += `=${move.promo.toUpperCase()}`;
        } else {
            const others = legal.filter(m =>
                m !== move &&
                m.tr === tr && m.tc === tc &&
                state.board[m.fr][m.fc] === piece
            );
            let disambig = '';
            if (others.length > 0) {
                const sameFile = others.some(m => m.fc === fc);
                const sameRank = others.some(m => m.fr === fr);
                if (!sameFile) disambig = uci[0];
                else if (!sameRank) disambig = uci[1];
                else disambig = uci.slice(0, 2);
            }
            san = `${upper}${disambig}${isCapture ? 'x' : ''}${toSq}`;
        }

        if (isKingInCheck(move.nextState.board, move.nextState.turn)) {
            const oppLegal = getLegalMovesFromState(move.nextState);
            san += oppLegal.length === 0 ? '#' : '+';
        }

        return { san, coords, icon };
    }

    // --- 2. OPENING GAMBIT DATABASE & FEN-TRANSPOSITION BOOK ---
    const GAMBIT_BOOK = {
        queens_gambit: {
            name: "👑 Queen's Gambit",
            color: 'w',
            soundness: 98,
            autoEnabled: true,
            lines: [
                ['d2d4', 'd7d5', 'c2c4', 'd5c4', 'g1f3', 'g8f6', 'e2e3'],
                ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5'],
                ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3'],
                ['d2d4', 'g8f6', 'c2c4']
            ]
        },
        vienna_gambit: {
            name: '⚡ Vienna Gambit',
            color: 'w',
            soundness: 92,
            autoEnabled: true,
            lines: [
                ['e2e4', 'e7e5', 'b1c3', 'g8f6', 'f2f4', 'd7d5', 'f4e5', 'f6e4', 'g1f3'],
                ['e2e4', 'e7e5', 'b1c3', 'g8f6', 'f2f4', 'e5f4', 'e4e5'],
                ['e2e4', 'e7e5', 'b1c3', 'b8c6', 'f2f4', 'e5f4', 'g1f3']
            ]
        },
        scotch_gambit: {
            name: '⚔️ Scotch Gambit',
            color: 'w',
            soundness: 91,
            autoEnabled: true,
            lines: [
                ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4', 'f1c4', 'f8c5', 'c2c3'],
                ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4', 'f1c4', 'g8f6', 'e4e5', 'd7d5', 'c4b5'],
                ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4', 'f1c4', 'f8b4', 'c2c3', 'd4c3', 'e1g1']
            ]
        },
        evans_gambit: {
            name: '🎯 Evans Gambit',
            color: 'w',
            soundness: 90,
            autoEnabled: true,
            lines: [
                ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'b2b4', 'c5b4', 'c2c3', 'b4a5', 'd2d4'],
                ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'b2b4', 'c5b4', 'c2c3', 'b4c5', 'd2d4'],
                ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'b2b4', 'c5b4', 'c2c3', 'b4e7', 'd2d4']
            ]
        },
        smith_morra: {
            name: '🔥 Smith-Morra Gambit',
            color: 'w',
            soundness: 88,
            autoEnabled: true,
            lines: [
                ['e2e4', 'c7c5', 'd2d4', 'c5d4', 'c2c3', 'd4c3', 'b1c3', 'b8c6', 'g1f3', 'd7d6', 'f1c4'],
                ['e2e4', 'c7c5', 'd2d4', 'c5d4', 'c2c3', 'd4c3', 'b1c3', 'e7e6', 'g1f3', 'a7a6', 'f1c4'],
                ['e2e4', 'c7c5', 'd2d4', 'c5d4', 'c2c3', 'g8f6', 'e4e5', 'f6d5', 'c3d4'],
                ['e2e4', 'c7c5', 'd2d4', 'c5d4', 'c2c3', 'd7d5', 'e4d5', 'd8d5', 'c3d4']
            ]
        },
        milner_barry: {
            name: '🇫🇷 Milner-Barry Gambit',
            color: 'w',
            soundness: 86,
            autoEnabled: true,
            lines: [
                ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'e4e5', 'c7c5', 'c2c3', 'b8c6', 'g1f3', 'd8b6', 'f1d3']
            ]
        },
        kings_gambit: {
            name: "⚔️ King's Gambit",
            color: 'w',
            soundness: 78,
            autoEnabled: false,
            lines: [
                ['e2e4', 'e7e5', 'f2f4', 'e5f4', 'g1f3', 'g7g5', 'h2h4'],
                ['e2e4', 'e7e5', 'f2f4', 'e5f4', 'g1f3', 'd7d6', 'f1c4'],
                ['e2e4', 'e7e5', 'f2f4', 'd7d5', 'e4d5', 'e5f4', 'g1f3']
            ]
        },
        danish_gambit: {
            name: '💥 Danish Gambit',
            color: 'w',
            soundness: 74,
            autoEnabled: false,
            lines: [
                ['e2e4', 'e7e5', 'd2d4', 'e5d4', 'c2c3', 'd4c3', 'f1c4', 'c3b2', 'c1b2'],
                ['e2e4', 'e7e5', 'd2d4', 'e5d4', 'c2c3', 'd7d5', 'e4d5', 'd8d5', 'c3d4']
            ]
        },
        benko_gambit: {
            name: '🌋 Benko Gambit',
            color: 'b',
            soundness: 94,
            autoEnabled: true,
            lines: [
                ['d2d4', 'g8f6', 'c2c4', 'c7c5', 'd4d5', 'b7b5', 'c4b5', 'a7a6', 'b5a6', 'c8a6'],
                ['d2d4', 'g8f6', 'c2c4', 'c7c5', 'd4d5', 'b7b5', 'g1f3', 'g7g6']
            ]
        },
        budapest_gambit: {
            name: '🏹 Budapest Gambit',
            color: 'b',
            soundness: 90,
            autoEnabled: true,
            lines: [
                ['d2d4', 'g8f6', 'c2c4', 'e7e5', 'd4e5', 'f6g4', 'c1f4', 'b8c6', 'g1f3', 'f8b4'],
                ['d2d4', 'g8f6', 'c2c4', 'e7e5', 'd4e5', 'f6g4', 'g1f3', 'f8c5', 'e2e3', 'b8c6'],
                ['d2d4', 'g8f6', 'c2c4', 'e7e5', 'd4e5', 'f6g4', 'e2e4', 'g4e5', 'f2f4', 'e5c6']
            ]
        },
        jaenisch_gambit: {
            name: '⚡ Jaenisch Gambit',
            color: 'b',
            soundness: 85,
            autoEnabled: true,
            lines: [
                ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'f7f5', 'b1c3', 'f5e4', 'c3e4', 'd7d5'],
                ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'f7f5', 'd2d3', 'f5e4', 'd3e4', 'g8f6']
            ]
        },
        albin_countergambit: {
            name: '🗡️ Albin Countergambit',
            color: 'b',
            soundness: 84,
            autoEnabled: true,
            lines: [
                ['d2d4', 'd7d5', 'c2c4', 'e7e5', 'd4e5', 'd5d4', 'g1f3', 'b8c6']
            ]
        },
        icelandic_gambit: {
            name: '🦅 Icelandic Gambit',
            color: 'b',
            soundness: 83,
            autoEnabled: true,
            lines: [
                ['e2e4', 'd7d5', 'e4d5', 'g8f6', 'c2c4', 'e7e6', 'd5e6', 'c8e6'],
                ['e2e4', 'd7d5', 'e4d5', 'g8f6', 'd2d4', 'f6d5']
            ]
        },
        rousseau_gambit: {
            name: '🛡️ Rousseau Gambit',
            color: 'b',
            soundness: 76,
            autoEnabled: false,
            lines: [
                ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f7f5', 'd2d3', 'g8f6']
            ]
        },
        stafford_gambit: {
            name: '💀 Stafford Gambit',
            color: 'b',
            soundness: 64,
            autoEnabled: false,
            lines: [
                ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f3e5', 'b8c6', 'e5c6', 'd7c6', 'd2d3', 'f8c5']
            ]
        },
        englund_gambit: {
            name: '🪤 Englund Gambit',
            color: 'b',
            soundness: 58,
            autoEnabled: false,
            lines: [
                ['d2d4', 'e7e5', 'd4e5', 'b8c6', 'g1f3', 'd8e7', 'c1f4', 'e7b4']
            ]
        }
    };

    // Build FEN-keyed lookup table so transpositions work without fragile move-history arrays
    const GAMBIT_POS_INDEX = {};
    (function buildGambitIndex() {
        Object.entries(GAMBIT_BOOK).forEach(([gKey, gambit]) => {
            gambit.lines.forEach(line => {
                let fen = START_FEN;
                for (let ply = 0; ply < line.length; ply++) {
                    const uci = line[ply];
                    const turnColor = ply % 2 === 0 ? 'w' : 'b';
                    if (turnColor === gambit.color) {
                        const posKey = toPosKey(fen);
                        if (!GAMBIT_POS_INDEX[posKey]) GAMBIT_POS_INDEX[posKey] = [];
                        const dup = GAMBIT_POS_INDEX[posKey].some(e => e.gambitKey === gKey && e.uci === uci);
                        if (!dup) {
                            GAMBIT_POS_INDEX[posKey].push({
                                gambitKey: gKey,
                                uci,
                                color: gambit.color,
                                soundness: gambit.soundness,
                                autoEnabled: gambit.autoEnabled,
                                ply
                            });
                        }
                    }
                    const nextFen = applyUciToFen(fen, uci);
                    if (!nextFen) break;
                    fen = nextFen;
                }
            });
        });
    })();

    // --- 3. SYSTEM CONFIGURATION (PERSISTED IN LOCALSTORAGE) ---
    let storage = null;
    try { storage = window.localStorage; } catch (e) {}
    const getStore = (k) => { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } };
    const setStore = (k, v) => { try { if (storage) storage.setItem(k, v); } catch (e) {} };

    let savedGambit = getStore('nc_gambit') || 'auto';
    if (savedGambit !== 'auto' && savedGambit !== 'none' && !GAMBIT_BOOK[savedGambit]) {
        savedGambit = 'auto';
    }

    const ELO_LEVELS = [400, 800, 1500, 2000, 2500];
    const ELO_PROFILES = {
        400:  { skill: 1,  depth: 3,  multiPV: 6, maxBookPly: 0,  targetDropCp: 220, maxDropCp: 420, label: 'BEGINNER' },
        800:  { skill: 5,  depth: 5,  multiPV: 5, maxBookPly: 3,  targetDropCp: 110, maxDropCp: 240, label: 'NOVICE' },
        1500: { skill: 11, depth: 8,  multiPV: 4, maxBookPly: 6,  targetDropCp: 35,  maxDropCp: 90,  label: 'CLUB' },
        2000: { skill: 16, depth: 12, multiPV: 4, maxBookPly: 99, targetDropCp: 0,   maxDropCp: 35,  label: 'EXPERT' },
        2500: { skill: 20, depth: 15, multiPV: 4, maxBookPly: 99, targetDropCp: 0,   maxDropCp: 0,   label: 'GRANDMASTER' }
    };

    const savedElo = parseInt(getStore('nc_elo'), 10);
    const initialElo = ELO_LEVELS.includes(savedElo) ? savedElo : 2500;
    const initialProfile = ELO_PROFILES[initialElo];

    const CONFIG = {
        elo: initialElo,
        depth: parseInt(getStore('nc_depth'), 10) || initialProfile.depth,
        multiPV: initialProfile.multiPV,
        autoMove: getStore('nc_auto') === 'true',
        delayMs: parseInt(getStore('nc_delay'), 10) || 1000,
        selectedTier: parseInt(getStore('nc_tier'), 10) || 1,
        selectedGambit: savedGambit,
        isMinimized: getStore('nc_minimized') === 'true',
        showArrows: getStore('nc_arrows') !== 'false'
    };

    // --- 4. ENGINE & MATCH RUNTIME STATE ---
    let stockfish = null;
    let engineState = 'loading'; // 'loading' | 'ready' | 'thinking' | 'error'
    let lastFen = '';
    let lastFullMove = 999;
    let pvData = {};
    let highestPvDepth = 0;
    let pendingReadyCount = 0;
    let pendingSearchFen = '';
    let ignoringOutput = false;

    let renderPending = false;
    let lastRenderTime = 0;
    let autoMoveTimer = null;
    let autoMoveScheduledFen = '';
    let autoMoveScheduledUci = '';
    let focusListenerAttached = false;
    let boardObserver = null;
    let observedBoardEl = null;
    let observerDebounce = null;
    let matchFirstMoveSeed = Math.random();
    let activeMatchGambitKey = null;

    function createEmptyAnalysis() {
        return {
            good: { move: '-', eval: '0.0', uci: '', rawCp: 0, type: 'cp', mateVal: 0 },
            medium: { move: '-', eval: '0.0', uci: '', rawCp: 0, type: 'cp', mateVal: 0 },
            weak: { move: '-', eval: '0.0', uci: '', rawCp: 0, type: 'cp', mateVal: 0 },
            isBookMove: false,
            gambitCandidate: null,
            gambitRejectedReason: '',
            gambitStatusText: 'Scanning opening...',
            fen: '',
            turnColor: 'w',
            myColor: 'w',
            isGameOver: false
        };
    }

    let currentAnalysis = createEmptyAnalysis();

    // --- 5. BOARD HELPERS & PERSPECTIVE ---
    function getBoardElement() {
        const doc = (typeof unsafeWindow !== 'undefined' && unsafeWindow.document) ? unsafeWindow.document : document;
        return doc.querySelector('wc-chess-board') || doc.querySelector('chess-board');
    }

    function getBoardGame(board) {
        if (!board) return null;
        return board.game || (board.wrappedJSObject && board.wrappedJSObject.game) || null;
    }

    function isBoardFlipped(board) {
        if (!board) return false;
        try {
            const raw = board.wrappedJSObject || board;
            if (board.classList.contains('flipped') || board.hasAttribute('flipped') || raw.flipped === true) {
                return true;
            }
            const game = getBoardGame(board);
            if (game && typeof game.getOptions === 'function') {
                const opts = game.getOptions();
                if (opts && opts.flipped) return true;
            }
        } catch (e) {}
        return false;
    }

    function getMyColor(board) {
        if (!board) return 'w';
        try {
            const game = getBoardGame(board);
            if (game && typeof game.getPlayingAs === 'function') {
                const playingAs = game.getPlayingAs();
                if (playingAs === 1 || playingAs === 'w' || playingAs === 'white') return 'w';
                if (playingAs === 2 || playingAs === 'b' || playingAs === 'black') return 'b';
            }
        } catch (e) {}
        return isBoardFlipped(board) ? 'b' : 'w';
    }

    function getBoardFen(board) {
        if (!board) return null;
        try {
            const game = getBoardGame(board);
            if (game) {
                if (typeof game.getFEN === 'function') return game.getFEN();
                if (typeof game.getFen === 'function') return game.getFen();
            }
            if (typeof board.getAttribute === 'function') {
                const attrFen = board.getAttribute('fen');
                if (attrFen) return attrFen;
            }
        } catch (e) {}
        return null;
    }

    function checkIsGameOver(board, fen) {
        try {
            const game = getBoardGame(board);
            if (game && typeof game.isGameOver === 'function' && game.isGameOver()) {
                return true;
            }
        } catch (e) {}
        const state = parseFen(fen);
        if (state && getLegalMovesFromState(state).length === 0) return true;
        return false;
    }

    // --- 6. HUD STYLES & DOM ---
    function injectStylesAndHUD() {
        if (!document.head || !document.body) return;

        if (!document.getElementById('neon-hud-style')) {
            const style = document.createElement('style');
            style.id = 'neon-hud-style';
            style.innerHTML = `
                #neon-hud-panel {
                    position: fixed;
                    bottom: 14px;
                    left: 14px;
                    width: 274px;
                    max-width: calc(100vw - 24px);
                    box-sizing: border-box;
                    background: #070e17;
                    border: 1.5px solid rgba(0, 240, 255, 0.72);
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.9);
                    border-radius: 10px;
                    padding: 9px 10px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
                    color: #e6fbff;
                    z-index: 2147483647;
                    user-select: none;
                    touch-action: none;
                    will-change: transform;
                    transform: translate3d(0, 0, 0);
                }
                #neon-hud-panel.minimized {
                    width: auto;
                    max-width: calc(100vw - 24px);
                    padding: 6px 10px;
                    border-radius: 999px;
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
                .hud-mini-preview {
                    display: none;
                    font-size: 11px;
                    font-weight: 700;
                    color: #00f0ff;
                    white-space: nowrap;
                }
                #neon-hud-panel.minimized .hud-mini-preview {
                    display: inline-block;
                }
                .hud-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid rgba(0, 240, 255, 0.22);
                    padding-bottom: 6px;
                    margin-bottom: 7px;
                    font-size: 12px;
                    cursor: move;
                }
                .hud-brand {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-weight: 800;
                    letter-spacing: 0.5px;
                }
                .engine-dot {
                    width: 7px;
                    height: 7px;
                    border-radius: 50%;
                    background: #ffaa00;
                    display: inline-block;
                    flex-shrink: 0;
                }
                .engine-dot.ready { background: #00f59b; }
                .engine-dot.thinking { background: #00f0ff; }
                .engine-dot.error { background: #ff3366; }
                .side-pill {
                    font-size: 9px;
                    font-weight: 700;
                    padding: 1px 5px;
                    border-radius: 4px;
                    border: 1px solid rgba(255, 255, 255, 0.28);
                    background: rgba(255, 255, 255, 0.08);
                    color: #dff8ff;
                }
                .side-pill.black {
                    background: #141c24;
                    color: #b7d2e0;
                    border-color: rgba(136, 216, 230, 0.35);
                }
                .header-actions {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .eval-badge {
                    border: 1px solid rgba(0, 240, 255, 0.5);
                    padding: 2px 6px;
                    color: #00f0ff;
                    font-weight: 800;
                    font-size: 11px;
                    font-variant-numeric: tabular-nums;
                    background: rgba(0, 240, 255, 0.1);
                    border-radius: 5px;
                }
                .eval-badge.losing { color: #ff5577; border-color: rgba(255, 51, 102, 0.55); background: rgba(255, 51, 102, 0.12); }
                .eval-badge.winning { color: #00f59b; border-color: rgba(0, 245, 155, 0.55); background: rgba(0, 245, 155, 0.12); }
                .toggle-hud-btn {
                    background: #00f0ff;
                    color: #070e17;
                    border: none;
                    font-weight: 900;
                    font-size: 13px;
                    width: 22px;
                    height: 22px;
                    border-radius: 5px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    line-height: 1;
                }
                .gambit-box, .elo-box {
                    background: rgba(12, 24, 38, 0.9);
                    border: 1px solid rgba(0, 240, 255, 0.25);
                    border-radius: 6px;
                    padding: 5px 6px;
                    margin-bottom: 7px;
                }
                .elo-label-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 9px;
                    letter-spacing: 0.6px;
                    color: #7cc6d6;
                    margin-bottom: 3px;
                    font-weight: 700;
                }
                .elo-val-badge {
                    color: #00f59b;
                    font-weight: 800;
                    font-size: 10px;
                    font-variant-numeric: tabular-nums;
                }
                .elo-slider {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 100%;
                    height: 6px;
                    margin: 4px 0 3px;
                    border-radius: 3px;
                    background: linear-gradient(90deg, #ff5577 0%, #ffaa00 45%, #00f59b 75%, #00f0ff 100%);
                    outline: none;
                    cursor: pointer;
                    touch-action: pan-x;
                }
                .elo-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 15px;
                    height: 15px;
                    border-radius: 50%;
                    background: #070e17;
                    border: 2px solid #00f0ff;
                    box-shadow: 0 0 6px rgba(0, 240, 255, 0.85);
                    cursor: pointer;
                }
                .elo-ticks {
                    display: flex;
                    justify-content: space-between;
                    font-size: 9px;
                    font-weight: 700;
                    color: #6b93a4;
                    font-variant-numeric: tabular-nums;
                }
                .elo-tick {
                    cursor: pointer;
                    padding: 1px 3px;
                    border-radius: 3px;
                }
                .elo-tick.active {
                    color: #00f0ff;
                    background: rgba(0, 240, 255, 0.16);
                    font-weight: 800;
                }
                .gambit-label-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 9px;
                    letter-spacing: 0.6px;
                    color: #7cc6d6;
                    margin-bottom: 4px;
                    font-weight: 700;
                }
                .gambit-mode-tag {
                    color: #ffd166;
                    font-weight: 800;
                }
                .gambit-select {
                    width: 100%;
                    background: #0b1623;
                    color: #00f0ff;
                    border: 1px solid rgba(0, 240, 255, 0.45);
                    padding: 5px 6px;
                    font-size: 11px;
                    font-weight: 700;
                    font-family: inherit;
                    border-radius: 5px;
                    outline: none;
                }
                .gambit-match-pill {
                    margin-top: 4px;
                    font-size: 10px;
                    color: #9ed7e6;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 4px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .gambit-match-pill.matched {
                    color: #ffd166;
                    font-weight: 700;
                }
                .pwr-container {
                    margin-bottom: 7px;
                    font-size: 10px;
                }
                .pwr-labels {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 3px;
                    font-weight: 700;
                    font-variant-numeric: tabular-nums;
                }
                #pwr-win { color: #00f0ff; }
                #pwr-loss { color: #ff6688; }
                #turn-indicator {
                    font-size: 9px;
                    letter-spacing: 0.5px;
                    padding: 1px 6px;
                    border-radius: 4px;
                    background: rgba(255, 255, 255, 0.06);
                    color: #9ad1e0;
                }
                #turn-indicator.my-turn {
                    background: rgba(0, 245, 155, 0.16);
                    color: #00f59b;
                    border: 1px solid rgba(0, 245, 155, 0.4);
                }
                .pwr-bar-bg {
                    position: relative;
                    height: 6px;
                    background: #2b1622;
                    border-radius: 3px;
                    overflow: hidden;
                }
                .pwr-bar-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #00b4ff, #00f0ff);
                    transition: width 0.2s ease-out;
                }
                .pwr-mid-tick {
                    position: absolute;
                    left: 50%;
                    top: 0;
                    width: 1px;
                    height: 100%;
                    background: rgba(255, 255, 255, 0.35);
                }
                .move-row {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 5px 6px;
                    margin-bottom: 4px;
                    background: rgba(255, 255, 255, 0.035);
                    border: 1px solid transparent;
                    border-left: 3px solid transparent;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .move-row.active-tier {
                    background: rgba(0, 240, 255, 0.14);
                    border-color: rgba(0, 240, 255, 0.3);
                }
                .move-row.gambit-active {
                    background: rgba(255, 209, 102, 0.12);
                    border-color: rgba(255, 209, 102, 0.38);
                }
                .tier-good { border-left-color: #00f0ff; }
                .tier-med  { border-left-color: #ffaa00; }
                .tier-weak { border-left-color: #ff3366; }

                .diamond-icon {
                    width: 16px;
                    height: 16px;
                    line-height: 16px;
                    text-align: center;
                    font-size: 9px;
                    font-weight: 800;
                    border-radius: 4px;
                    color: #070e17;
                    flex-shrink: 0;
                }
                .d-good { background: #00f0ff; }
                .d-med  { background: #ffaa00; }
                .d-weak { background: #ff3366; color: #fff; }

                .move-main {
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    align-items: baseline;
                    gap: 5px;
                }
                .move-san {
                    font-weight: 800;
                    color: #ffffff;
                    font-size: 12px;
                    white-space: nowrap;
                }
                .move-coords {
                    font-size: 9px;
                    color: #7ca4b5;
                    white-space: nowrap;
                }
                .move-label {
                    font-size: 8px;
                    font-weight: 800;
                    padding: 1px 4px;
                    border-radius: 3px;
                    background: rgba(255, 255, 255, 0.08);
                    color: #93cde0;
                    letter-spacing: 0.4px;
                }
                .move-label.is-gambit {
                    background: rgba(255, 209, 102, 0.2);
                    color: #ffd166;
                }
                .move-score {
                    font-weight: 800;
                    font-size: 11px;
                    font-variant-numeric: tabular-nums;
                    min-width: 34px;
                    text-align: right;
                }
                .score-good { color: #00f0ff; }
                .score-med  { color: #9eff4a; }
                .score-weak { color: #ff6688; }

                .move-play-btn {
                    background: rgba(0, 240, 255, 0.14);
                    border: 1px solid rgba(0, 240, 255, 0.4);
                    color: #00f0ff;
                    border-radius: 4px;
                    width: 20px;
                    height: 20px;
                    font-size: 9px;
                    line-height: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    flex-shrink: 0;
                    padding: 0;
                }
                .move-play-btn:active {
                    background: rgba(0, 240, 255, 0.4);
                    color: #fff;
                }

                .hud-controls, .hud-controls-bottom {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 4px;
                    margin-top: 5px;
                }
                .hud-btn {
                    background: rgba(0, 240, 255, 0.06);
                    border: 1px solid rgba(0, 240, 255, 0.35);
                    color: #aaddff;
                    padding: 6px 2px;
                    font-size: 10px;
                    font-weight: 700;
                    font-family: inherit;
                    text-align: center;
                    cursor: pointer;
                    border-radius: 5px;
                }
                .hud-btn.active {
                    background: rgba(0, 240, 255, 0.25);
                    color: #ffffff;
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
        }

        if (document.getElementById('neon-hud-panel')) return;

        const whiteOptions = Object.entries(GAMBIT_BOOK)
            .filter(([, g]) => g.color === 'w')
            .map(([k, g]) => `<option value="${k}" ${CONFIG.selectedGambit === k ? 'selected' : ''}>${g.name}</option>`)
            .join('');

        const blackOptions = Object.entries(GAMBIT_BOOK)
            .filter(([, g]) => g.color === 'b')
            .map(([k, g]) => `<option value="${k}" ${CONFIG.selectedGambit === k ? 'selected' : ''}>${g.name}</option>`)
            .join('');

        const hud = document.createElement('div');
        hud.id = 'neon-hud-panel';
        if (CONFIG.isMinimized) hud.classList.add('minimized');

        hud.innerHTML = `
            <div class="hud-header" id="hud-drag-handle">
                <div class="hud-brand">
                    <span class="engine-dot" id="hud-engine-dot" title="Engine Status"></span>
                    <span>⚡ <b id="hud-mode-text">NEON</b></span>
                    <span class="side-pill" id="hud-side-pill">W</span>
                </div>
                <span class="hud-mini-preview" id="hud-mini-preview">...</span>
                <div class="header-actions">
                    <span class="eval-badge" id="hud-main-eval">0.0</span>
                    <button class="toggle-hud-btn" id="btn-minimize" title="Minimize / Expand UI">${CONFIG.isMinimized ? '+' : '—'}</button>
                </div>
            </div>

            <div id="hud-body">
                <div class="elo-box">
                    <div class="elo-label-row">
                        <span>GUIDE STRENGTH (SLIDE ELO)</span>
                        <span class="elo-val-badge" id="elo-val-badge">${CONFIG.elo} ELO · ${(ELO_PROFILES[CONFIG.elo] || ELO_PROFILES[2500]).label}</span>
                    </div>
                    <input type="range" class="elo-slider" id="elo-slider" min="0" max="${ELO_LEVELS.length - 1}" step="1" value="${Math.max(0, ELO_LEVELS.indexOf(CONFIG.elo))}">
                    <div class="elo-ticks" id="elo-ticks">
                        ${ELO_LEVELS.map((e, idx) => `<span class="elo-tick ${CONFIG.elo === e ? 'active' : ''}" data-elo-idx="${idx}">${e}</span>`).join('')}
                    </div>
                </div>

                <div class="gambit-box">
                    <div class="gambit-label-row">
                        <span>CHOOSE GAMBIT</span>
                        <span class="gambit-mode-tag" id="gambit-mode-tag">${CONFIG.selectedGambit === 'auto' ? 'SMART MATCH' : 'MANUAL'}</span>
                    </div>
                    <select class="gambit-select" id="select-gambit">
                        <option value="auto" ${CONFIG.selectedGambit === 'auto' ? 'selected' : ''}>⚡ AUTO GAMBIT (Best for Match)</option>
                        <option value="none" ${CONFIG.selectedGambit === 'none' ? 'selected' : ''}>🧠 Stockfish Engine Only</option>
                        <optgroup label="White Repertoire">
                            ${whiteOptions}
                        </optgroup>
                        <optgroup label="Black Repertoire">
                            ${blackOptions}
                        </optgroup>
                    </select>
                    <div class="gambit-match-pill" id="gambit-match-pill">Scanning board for best gambit...</div>
                </div>

                <div class="pwr-container">
                    <div class="pwr-labels">
                        <span id="pwr-win">YOU 50%</span>
                        <span id="turn-indicator">WAITING</span>
                        <span id="pwr-loss">50% OPP</span>
                    </div>
                    <div class="pwr-bar-bg">
                        <div class="pwr-bar-fill" id="pwr-bar" style="width: 50%;"></div>
                        <div class="pwr-mid-tick"></div>
                    </div>
                </div>

                <div class="move-row tier-good ${CONFIG.selectedTier === 1 ? 'active-tier' : ''}" data-tier="1" id="row-tier-1">
                    <div class="diamond-icon d-good">1</div>
                    <div class="move-main">
                        <span class="move-san" id="move-1-san">...</span>
                        <span class="move-coords" id="move-1-coords"></span>
                    </div>
                    <span class="move-label" id="move-1-label">BEST</span>
                    <span class="move-score score-good" id="move-1-eval">0.0</span>
                    <button class="move-play-btn" data-play-tier="1" title="Play Move 1">▶</button>
                </div>

                <div class="move-row tier-med ${CONFIG.selectedTier === 2 ? 'active-tier' : ''}" data-tier="2" id="row-tier-2">
                    <div class="diamond-icon d-med">2</div>
                    <div class="move-main">
                        <span class="move-san" id="move-2-san">...</span>
                        <span class="move-coords" id="move-2-coords"></span>
                    </div>
                    <span class="move-label">MED</span>
                    <span class="move-score score-med" id="move-2-eval">0.0</span>
                    <button class="move-play-btn" data-play-tier="2" title="Play Move 2">▶</button>
                </div>

                <div class="move-row tier-weak ${CONFIG.selectedTier === 3 ? 'active-tier' : ''}" data-tier="3" id="row-tier-3">
                    <div class="diamond-icon d-weak">3</div>
                    <div class="move-main">
                        <span class="move-san" id="move-3-san">...</span>
                        <span class="move-coords" id="move-3-coords"></span>
                    </div>
                    <span class="move-label">SAFE</span>
                    <span class="move-score score-weak" id="move-3-eval">0.0</span>
                    <button class="move-play-btn" data-play-tier="3" title="Play Move 3">▶</button>
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

    window.__neonEnsureHUD = function () {
        injectStylesAndHUD();
        analyzeCurrentBoard(true);
    };

    // --- 7. HUD INTERACTIONS & VIEWPORT-CLAMPED DRAG ---
    function setupHUDInteractions(hud) {
        const tierNames = ['BEST', 'MED', 'SAFE'];

        [1, 2, 3].forEach(t => {
            const row = document.getElementById(`row-tier-${t}`);
            if (row) {
                row.addEventListener('click', () => {
                    selectTier(t, tierNames[t - 1]);
                });
            }
            const playBtn = hud.querySelector(`[data-play-tier="${t}"]`);
            if (playBtn) {
                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectTier(t, tierNames[t - 1]);
                    executeMoveForTier(t);
                });
            }
        });

        document.getElementById('btn-rank').addEventListener('click', () => {
            const nextTier = (CONFIG.selectedTier % 3) + 1;
            selectTier(nextTier, tierNames[nextTier - 1]);
        });

        function selectTier(tier, name) {
            CONFIG.selectedTier = tier;
            setStore('nc_tier', tier);
            hud.querySelectorAll('.move-row').forEach(el => el.classList.remove('active-tier'));
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
            clampHudPosition();
        });

        // ELO Slider & Tick Selection
        const eloSlider = document.getElementById('elo-slider');
        const applyEloByIndex = (rawIdx) => {
            const idx = Math.max(0, Math.min(ELO_LEVELS.length - 1, parseInt(rawIdx, 10) || 0));
            const newElo = ELO_LEVELS[idx];
            const profile = ELO_PROFILES[newElo] || ELO_PROFILES[2500];
            CONFIG.elo = newElo;
            CONFIG.depth = profile.depth;
            CONFIG.multiPV = profile.multiPV;
            setStore('nc_elo', newElo);
            setStore('nc_depth', CONFIG.depth);

            if (eloSlider) eloSlider.value = String(idx);
            const badge = document.getElementById('elo-val-badge');
            if (badge) badge.innerText = `${newElo} ELO · ${profile.label}`;
            const depthBtn = document.getElementById('btn-depth');
            if (depthBtn) depthBtn.innerText = `D:${CONFIG.depth}`;
            hud.querySelectorAll('.elo-tick').forEach((el, i) => el.classList.toggle('active', i === idx));

            if (stockfish) {
                stockfish.postMessage(`setoption name Skill Level value ${profile.skill}`);
                stockfish.postMessage(`setoption name MultiPV value ${profile.multiPV}`);
            }
            analyzeCurrentBoard(true);
        };

        if (eloSlider) {
            eloSlider.addEventListener('input', (e) => applyEloByIndex(e.target.value));
            eloSlider.addEventListener('change', (e) => applyEloByIndex(e.target.value));
        }
        hud.querySelectorAll('.elo-tick').forEach((tickEl) => {
            tickEl.addEventListener('click', () => applyEloByIndex(tickEl.getAttribute('data-elo-idx')));
        });

        // Gambit Selection
        document.getElementById('select-gambit').addEventListener('change', (e) => {
            CONFIG.selectedGambit = e.target.value;
            setStore('nc_gambit', CONFIG.selectedGambit);
            activeMatchGambitKey = null;
            const modeTag = document.getElementById('gambit-mode-tag');
            if (modeTag) {
                modeTag.innerText = CONFIG.selectedGambit === 'auto' ? 'SMART MATCH' : (CONFIG.selectedGambit === 'none' ? 'ENGINE' : 'MANUAL');
            }
            analyzeCurrentBoard(true);
        });

        // Auto Move Toggle
        document.getElementById('btn-auto').addEventListener('click', (e) => {
            CONFIG.autoMove = !CONFIG.autoMove;
            setStore('nc_auto', CONFIG.autoMove);
            e.target.innerText = `AUTO: ${CONFIG.autoMove ? 'ON' : 'OFF'}`;
            e.target.classList.toggle('active', CONFIG.autoMove);
            if (CONFIG.autoMove) {
                triggerAutoMoveIfMyTurn();
            } else {
                clearAutoMoveTimer();
            }
        });

        // Delay Toggle
        document.getElementById('btn-delay').addEventListener('click', (e) => {
            const delays = [300, 600, 1000, 1500, 2500];
            const curIdx = delays.indexOf(CONFIG.delayMs);
            const nextIdx = curIdx === -1 ? 2 : (curIdx + 1) % delays.length;
            CONFIG.delayMs = delays[nextIdx];
            setStore('nc_delay', CONFIG.delayMs);
            e.target.innerText = `${(CONFIG.delayMs / 1000).toFixed(1)}S`;
        });

        // Depth Toggle
        document.getElementById('btn-depth').addEventListener('click', (e) => {
            const depths = [8, 10, 13, 16];
            const curIdx = depths.indexOf(CONFIG.depth);
            const nextIdx = curIdx === -1 ? 1 : (curIdx + 1) % depths.length;
            CONFIG.depth = depths[nextIdx];
            setStore('nc_depth', CONFIG.depth);
            e.target.innerText = `D:${CONFIG.depth}`;
            analyzeCurrentBoard(true);
        });

        // Arrow Toggle
        document.getElementById('btn-arrows').addEventListener('click', (e) => {
            CONFIG.showArrows = !CONFIG.showArrows;
            setStore('nc_arrows', CONFIG.showArrows);
            e.target.classList.toggle('active', CONFIG.showArrows);
            scheduleRender(true);
        });

        // Scan / Retry Engine if needed
        document.getElementById('btn-force').addEventListener('click', () => {
            if (engineState === 'error' || !stockfish) {
                initStockfish();
            }
            analyzeCurrentBoard(true);
        });

        // Auto-minimize when focusing on external email/password inputs (ignore inputs inside HUD)
        if (!focusListenerAttached) {
            focusListenerAttached = true;
            document.addEventListener('focusin', (e) => {
                const panel = document.getElementById('neon-hud-panel');
                const btn = document.getElementById('btn-minimize');
                if (panel && e.target && !panel.contains(e.target) && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                    panel.classList.add('minimized');
                    if (btn) btn.innerText = '+';
                }
            });
        }

        // Viewport-Clamped GPU Dragging
        const handle = document.getElementById('hud-drag-handle');
        let isDragging = false, startX = 0, startY = 0;
        let offsetX = parseFloat(getStore('nc_hud_x')) || 0;
        let offsetY = parseFloat(getStore('nc_hud_y')) || 0;

        function clampOffset(x, y) {
            const rect = hud.getBoundingClientRect();
            const baseLeft = 14;
            const baseBottom = 14;
            const minX = -baseLeft + 4;
            const maxX = Math.max(minX, window.innerWidth - rect.width - baseLeft - 4);
            const maxY = baseBottom - 4;
            const minY = Math.min(maxY, -(window.innerHeight - rect.height - baseBottom - 4));
            return {
                x: Math.min(maxX, Math.max(minX, x)),
                y: Math.min(maxY, Math.max(minY, y))
            };
        }

        function clampHudPosition() {
            const clamped = clampOffset(offsetX, offsetY);
            offsetX = clamped.x;
            offsetY = clamped.y;
            hud.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
        }

        clampHudPosition();
        window.addEventListener('resize', clampHudPosition, { passive: true });

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
            const clamped = clampOffset(touch.clientX - startX, touch.clientY - startY);
            offsetX = clamped.x;
            offsetY = clamped.y;
            hud.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
        };

        const stopDrag = () => {
            if (!isDragging) return;
            isDragging = false;
            setStore('nc_hud_x', offsetX);
            setStore('nc_hud_y', offsetY);
        };

        handle.addEventListener('mousedown', startDrag);
        window.addEventListener('mousemove', onDrag, { passive: true });
        window.addEventListener('mouseup', stopDrag);

        handle.addEventListener('touchstart', startDrag, { passive: true });
        window.addEventListener('touchmove', onDrag, { passive: true });
        window.addEventListener('touchend', stopDrag);
    }

    // --- 8. STOCKFISH ENGINE (SYNCED VIA READYOK BARRIER + FALLBACK CDN) ---
    function setEngineStatus(state) {
        engineState = state;
        const dot = document.getElementById('hud-engine-dot');
        if (!dot) return;
        dot.classList.remove('ready', 'thinking', 'error');
        if (state === 'ready' || state === 'thinking' || state === 'error') {
            dot.classList.add(state);
        }
    }

    async function initStockfish() {
        setEngineStatus('loading');
        const urls = [
            'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js',
            'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js'
        ];

        let scriptText = '';
        for (let i = 0; i < urls.length; i++) {
            try {
                const res = await fetch(urls[i]);
                if (res.ok) {
                    scriptText = await res.text();
                    if (scriptText && scriptText.length > 1000) break;
                }
            } catch (e) {}
            if (!scriptText && typeof GM_xmlhttpRequest === 'function') {
                try {
                    scriptText = await new Promise((resolve) => {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: urls[i],
                            onload: (r) => resolve(r && r.status === 200 ? r.responseText : ''),
                            onerror: () => resolve('')
                        });
                    });
                    if (scriptText && scriptText.length > 1000) break;
                } catch (e) {}
            }
        }

        if (!scriptText) {
            setEngineStatus('error');
            return;
        }

        try {
            if (stockfish) {
                try { stockfish.terminate(); } catch (e) {}
            }
            const blob = new Blob([scriptText], { type: 'application/javascript' });
            stockfish = new Worker(URL.createObjectURL(blob));

            stockfish.onmessage = function (event) {
                const line = event.data;
                if (!line || typeof line !== 'string') return;

                if (line === 'readyok') {
                    if (pendingReadyCount > 0) pendingReadyCount--;
                    if (pendingReadyCount === 0 && pendingSearchFen) {
                        ignoringOutput = false;
                        setEngineStatus('thinking');
                        stockfish.postMessage(`position fen ${pendingSearchFen}`);
                        stockfish.postMessage(`go depth ${CONFIG.depth}`);
                    } else if (pendingReadyCount === 0) {
                        setEngineStatus('ready');
                    }
                    return;
                }

                if (ignoringOutput) return;

                if (line.startsWith('info depth') && line.includes(' multipv ')) {
                    const depthMatch = line.match(/info depth (\d+)/);
                    const multipvMatch = line.match(/multipv (\d+)/);
                    const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
                    const pvMatch = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);

                    if (depthMatch && multipvMatch && scoreMatch && pvMatch) {
                        const d = parseInt(depthMatch[1], 10);
                        const rank = parseInt(multipvMatch[1], 10);
                        const type = scoreMatch[1];
                        const val = parseInt(scoreMatch[2], 10);
                        const uciMove = pvMatch[1];

                        if (d > highestPvDepth) highestPvDepth = d;

                        pvData[rank] = {
                            depth: d,
                            uci: uciMove,
                            type,
                            mateVal: type === 'mate' ? val : 0,
                            rawCp: type === 'mate' ? (val > 0 ? 1200 : -1200) : val
                        };

                        // Fast trigger for Auto-Gambit book validation once depth >= 6
                        if (d >= 6 && rank === 1 && currentAnalysis.gambitCandidate) {
                            evaluateAndApplyAnalysis(false);
                            if (CONFIG.autoMove && currentAnalysis.isBookMove) {
                                triggerAutoMoveIfMyTurn();
                            }
                        } else {
                            scheduleRender();
                        }
                    }
                } else if (line.startsWith('bestmove')) {
                    setEngineStatus('ready');
                    evaluateAndApplyAnalysis(true);
                    scheduleRender(true);
                    if (CONFIG.autoMove) triggerAutoMoveIfMyTurn();
                }
            };

            const curProfile = ELO_PROFILES[CONFIG.elo] || ELO_PROFILES[2500];
            stockfish.postMessage('uci');
            stockfish.postMessage('setoption name Hash value 32');
            stockfish.postMessage(`setoption name Skill Level value ${curProfile.skill}`);
            stockfish.postMessage(`setoption name MultiPV value ${CONFIG.multiPV}`);
            stockfish.postMessage('isready');
            setEngineStatus('ready');

            if (lastFen) analyzeCurrentBoard(true);
        } catch (err) {
            setEngineStatus('error');
            console.error('Failed to start Stockfish:', err);
        }
    }

    function startStockfishSearch(fen) {
        if (!stockfish) return;
        pendingSearchFen = fen;
        pendingReadyCount++;
        ignoringOutput = true;
        setEngineStatus('thinking');
        stockfish.postMessage('stop');
        stockfish.postMessage('isready');
    }

    // --- 9. SMART AUTO-GAMBIT SELECTION & ENGINE EVALUATION ---
    function findBestGambitCandidate(fen, myColor) {
        if (CONFIG.selectedGambit === 'none') return null;

        const posKey = toPosKey(fen);
        const candidates = GAMBIT_POS_INDEX[posKey];
        if (!candidates || candidates.length === 0) return null;

        // Filter candidates belonging to our color and strictly legal on this FEN
        const legalCandidates = candidates.filter(c => c.color === myColor && isLegalUci(fen, c.uci));
        if (legalCandidates.length === 0) return null;

        // Manual mode: honor exact chosen gambit
        if (CONFIG.selectedGambit !== 'auto') {
            const match = legalCandidates.find(c => c.gambitKey === CONFIG.selectedGambit);
            return match ? { ...match, gambit: GAMBIT_BOOK[match.gambitKey] } : null;
        }

        // AUTO MODE: only use sound, match-worthy gambits within the active ELO profile's book depth
        const eloProfile = ELO_PROFILES[CONFIG.elo] || ELO_PROFILES[2500];
        const soundCandidates = legalCandidates.filter(c => c.autoEnabled && c.ply < eloProfile.maxBookPly);
        if (soundCandidates.length === 0) return null;

        // If a gambit line was already locked earlier in this match and stays available, prefer consistency
        if (activeMatchGambitKey) {
            const sticky = soundCandidates.find(c => c.gambitKey === activeMatchGambitKey);
            if (sticky) return { ...sticky, gambit: GAMBIT_BOOK[sticky.gambitKey] };
        }

        // At move 1 as White, rotate cleanly between 1.e4 lines and 1.d4 Queen's Gambit per game
        if (toPosKey(START_FEN) === posKey && myColor === 'w') {
            const preferE4 = matchFirstMoveSeed >= 0.4;
            const preferred = soundCandidates.filter(c => (preferE4 ? c.uci === 'e2e4' : c.uci === 'd2d4'));
            if (preferred.length > 0) {
                preferred.sort((a, b) => b.soundness - a.soundness);
                return { ...preferred[0], gambit: GAMBIT_BOOK[preferred[0].gambitKey] };
            }
        }

        // Otherwise pick highest soundness gambit fitting the board
        soundCandidates.sort((a, b) => b.soundness - a.soundness);
        const best = soundCandidates[0];
        activeMatchGambitKey = best.gambitKey;
        return { ...best, gambit: GAMBIT_BOOK[best.gambitKey] };
    }

    function formatPerspectiveEval(pvItem, turnColor, myColor) {
        if (!pvItem) return { text: '0.0', myCp: 0, winPct: 50 };
        const sign = turnColor === myColor ? 1 : -1;
        const myCp = pvItem.rawCp * sign;

        let text = '0.0';
        let winPct = 50;
        if (pvItem.type === 'mate') {
            const m = pvItem.mateVal * sign;
            text = m > 0 ? `+M${m}` : `-M${Math.abs(m)}`;
            winPct = m > 0 ? 100 : 0;
        } else {
            const pawns = myCp / 100;
            text = myCp >= 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1);
            winPct = Math.min(99, Math.max(1, Math.round(50 + 50 * (2 / (1 + Math.exp(-0.00368208 * myCp)) - 1))));
        }

        return { text, myCp, winPct };
    }

    function evaluateAndApplyAnalysis(isFinal) {
        const fen = currentAnalysis.fen;
        if (!fen) return;

        const turnColor = currentAnalysis.turnColor;
        const myColor = currentAnalysis.myColor;
        const cand = currentAnalysis.gambitCandidate;

        // Collect recent-depth PV lines (ignore stale lower-depth orphan lines)
        const pvList = [];
        for (let r = 1; r <= CONFIG.multiPV; r++) {
            if (pvData[r] && pvData[r].depth >= Math.max(1, highestPvDepth - 1)) {
                pvList.push({ rank: r, ...pvData[r] });
            }
        }

        const topPv = pvList[0] || pvData[1] || null;
        const topFormatted = formatPerspectiveEval(topPv, turnColor, myColor);

        // Decide whether the Gambit candidate is valid & good for the match
        let useGambit = false;
        let rejectedReason = '';

        if (cand) {
            if (CONFIG.selectedGambit === 'auto') {
                if (!topPv) {
                    // Stockfish still warming up: preview gambit immediately
                    useGambit = true;
                } else {
                    const topMyCp = topFormatted.myCp;
                    const pvMatch = pvList.find(p => p.uci === cand.uci);

                    if (topMyCp >= 180) {
                        // Already winning cleanly (+1.8+): consolidate instead of giving away material
                        useGambit = false;
                        rejectedReason = `Winning (+${(topMyCp / 100).toFixed(1)}) → Engine Best`;
                    } else if (pvMatch) {
                        const drop = topPv.rawCp - pvMatch.rawCp;
                        if (drop <= 130 && (pvMatch.rawCp * (turnColor === myColor ? 1 : -1)) > -130) {
                            useGambit = true;
                        } else {
                            useGambit = false;
                            rejectedReason = `Unsafe line (-${(drop / 100).toFixed(1)}) → Engine Best`;
                        }
                    } else if (topPv.depth >= 6 && pvList.length >= 3) {
                        // Gambit not even in top 3-4 moves at depth >= 6: check worst PV vs top
                        const lastPv = pvList[pvList.length - 1];
                        const minDelta = topPv.rawCp - lastPv.rawCp;
                        // Only drop if top move is clearly winning or forcing (> +140cp over #3/#4)
                        if (minDelta > 140 || topMyCp < -120) {
                            useGambit = false;
                            rejectedReason = 'Better tactical reply → Engine';
                        } else {
                            useGambit = true;
                        }
                    } else {
                        useGambit = true;
                    }
                }
            } else {
                // Manual gambit always takes priority while in book
                useGambit = true;
            }
        }

        currentAnalysis.isBookMove = useGambit;
        currentAnalysis.gambitRejectedReason = rejectedReason;

        if (useGambit && cand) {
            const pvMatch = pvList.find(p => p.uci === cand.uci);
            const gPv = pvMatch || topPv;
            const gFmt = gPv ? formatPerspectiveEval(gPv, turnColor, myColor) : { text: 'BOOK', myCp: 35, winPct: 54 };

            currentAnalysis.good = {
                uci: cand.uci,
                eval: gPv ? gFmt.text : 'BOOK',
                myCp: gFmt.myCp,
                winPct: gFmt.winPct,
                isGambit: true
            };
            currentAnalysis.gambitStatusText = `${CONFIG.selectedGambit === 'auto' ? 'MATCHED' : 'MANUAL'}: ${cand.gambit.name}`;

            // Fill Tier 2 & Tier 3 with non-duplicate engine alternatives
            const altMoves = pvList.filter(p => p.uci !== cand.uci);
            const m2 = altMoves[0] || topPv;
            const m3 = altMoves[1] || m2;
            if (m2) {
                const f2 = formatPerspectiveEval(m2, turnColor, myColor);
                currentAnalysis.medium = { uci: m2.uci, eval: f2.text, myCp: f2.myCp, winPct: f2.winPct };
            } else {
                currentAnalysis.medium = { ...currentAnalysis.good };
            }
            if (m3) {
                const f3 = formatPerspectiveEval(m3, turnColor, myColor);
                currentAnalysis.weak = { uci: m3.uci, eval: f3.text, myCp: f3.myCp, winPct: f3.winPct };
            } else {
                currentAnalysis.weak = { ...currentAnalysis.medium };
            }
        } else if (topPv) {
            const eloProfile = ELO_PROFILES[CONFIG.elo] || ELO_PROFILES[2500];
            let primarySrc = topPv;

            if (eloProfile.targetDropCp > 0 && pvList.length > 1) {
                let bestDiff = Infinity;
                for (let idx = 0; idx < pvList.length; idx++) {
                    const c = pvList[idx];
                    const drop = topPv.rawCp - c.rawCp;
                    const safeFromForcedMate = !(c.type === 'mate' && c.mateVal < 0 && topPv.rawCp > -400);
                    if (safeFromForcedMate && drop <= eloProfile.maxDropCp) {
                        const diff = Math.abs(drop - eloProfile.targetDropCp);
                        if (diff < bestDiff) {
                            bestDiff = diff;
                            primarySrc = c;
                        }
                    }
                }
            }

            const f1 = formatPerspectiveEval(primarySrc, turnColor, myColor);
            currentAnalysis.good = {
                uci: primarySrc.uci,
                eval: f1.text,
                myCp: f1.myCp,
                winPct: f1.winPct,
                isGambit: false
            };

            const remainingPvs = pvList.filter(c => c.uci !== primarySrc.uci);
            // Smart Blunder Guard for Tier 2 & Tier 3
            const medCandidate = remainingPvs[0] || pvList[1];
            const medMaxDrop = Math.max(140, eloProfile.maxDropCp + 60);
            const medSafe = medCandidate &&
                (topPv.rawCp - medCandidate.rawCp <= medMaxDrop) &&
                !(topPv.type === 'mate' && topPv.mateVal > 0 && medCandidate.rawCp < 200) &&
                !(medCandidate.type === 'mate' && medCandidate.mateVal < 0 && topPv.rawCp > -400);

            const medSrc = medSafe ? medCandidate : primarySrc;
            const f2 = formatPerspectiveEval(medSrc, turnColor, myColor);
            currentAnalysis.medium = { uci: medSrc.uci, eval: f2.text, myCp: f2.myCp, winPct: f2.winPct };

            let weakSrc = medSrc;
            const weakMaxDrop = Math.max(260, eloProfile.maxDropCp + 160);
            for (let idx = remainingPvs.length - 1; idx >= 0; idx--) {
                const c = remainingPvs[idx];
                if (c.uci === medSrc.uci) continue;
                const ok = (topPv.rawCp - c.rawCp <= weakMaxDrop) &&
                    !(topPv.type === 'mate' && topPv.mateVal > 0 && c.rawCp < 150) &&
                    !(c.type === 'mate' && c.mateVal < 0 && topPv.rawCp > -400);
                if (ok) {
                    weakSrc = c;
                    break;
                }
            }
            const f3 = formatPerspectiveEval(weakSrc, turnColor, myColor);
            currentAnalysis.weak = { uci: weakSrc.uci, eval: f3.text, myCp: f3.myCp, winPct: f3.winPct };

            if (rejectedReason) {
                currentAnalysis.gambitStatusText = `🛡 ${rejectedReason}`;
            } else if (CONFIG.selectedGambit === 'none') {
                currentAnalysis.gambitStatusText = `🧠 Guide ${CONFIG.elo} ELO (D:${CONFIG.depth})`;
            } else {
                const waitingMsg = (CONFIG.selectedGambit === 'auto' && activeMatchGambitKey && GAMBIT_BOOK[activeMatchGambitKey])
                    ? `⏳ Tracking: ${GAMBIT_BOOK[activeMatchGambitKey].name}`
                    : `⏳ Waiting for opponent...`;
                currentAnalysis.gambitStatusText = turnColor === myColor
                    ? `🧠 Guide ${CONFIG.elo} ELO (D:${CONFIG.depth})`
                    : waitingMsg;
            }
        } else if (isFinal) {
            currentAnalysis.gambitStatusText = '🧠 Analyzing position...';
        }

        scheduleRender(true);
    }

    // --- 10. THROTTLED RENDERER ---
    function scheduleRender(forceImmediate = false) {
        const now = performance.now();
        if (!forceImmediate && (renderPending || now - lastRenderTime < 100)) return;
        renderPending = true;

        requestAnimationFrame(() => {
            renderPending = false;
            lastRenderTime = performance.now();
            updateHUDUI();
            drawBoardArrows();
        });
    }

    function updateHUDUI() {
        const move1SanEl = document.getElementById('move-1-san');
        if (!move1SanEl) return;

        const fen = currentAnalysis.fen;
        const myColor = currentAnalysis.myColor;
        const turnColor = currentAnalysis.turnColor;
        const isMyTurn = myColor === turnColor && !currentAnalysis.isGameOver;

        // Side badge
        const sidePill = document.getElementById('hud-side-pill');
        if (sidePill) {
            sidePill.innerText = myColor === 'b' ? 'B' : 'W';
            sidePill.classList.toggle('black', myColor === 'b');
        }

        // Turn pill
        const turnEl = document.getElementById('turn-indicator');
        if (turnEl) {
            if (currentAnalysis.isGameOver) {
                turnEl.innerText = 'GAME OVER';
                turnEl.classList.remove('my-turn');
            } else if (!fen) {
                turnEl.innerText = 'NO BOARD';
                turnEl.classList.remove('my-turn');
            } else if (isMyTurn) {
                turnEl.innerText = 'YOUR TURN';
                turnEl.classList.add('my-turn');
            } else {
                turnEl.innerText = 'OPP TURN';
                turnEl.classList.remove('my-turn');
            }
        }

        // Gambit Match Pill
        const gambitPill = document.getElementById('gambit-match-pill');
        if (gambitPill) {
            gambitPill.innerText = currentAnalysis.gambitStatusText || 'Scanning...';
            gambitPill.classList.toggle('matched', !!currentAnalysis.isBookMove);
        }

        // Tier 1 row + Eval badge + Power bar + Mini pill
        const g = currentAnalysis.good;
        const f1 = formatUciWithSan(fen, g.uci);
        move1SanEl.innerText = f1.icon ? `${f1.icon} ${f1.san}` : f1.san;
        document.getElementById('move-1-coords').innerText = f1.coords;
        const label1 = document.getElementById('move-1-label');
        label1.innerText = currentAnalysis.isBookMove ? 'GAMBIT' : 'BEST';
        label1.classList.toggle('is-gambit', !!currentAnalysis.isBookMove);
        document.getElementById('move-1-eval').innerText = g.eval || '0.0';
        document.getElementById('row-tier-1').classList.toggle('gambit-active', !!currentAnalysis.isBookMove);

        const mainEvalEl = document.getElementById('hud-main-eval');
        mainEvalEl.innerText = g.eval || '0.0';
        mainEvalEl.classList.remove('winning', 'losing');
        if (typeof g.myCp === 'number') {
            if (g.myCp >= 80) mainEvalEl.classList.add('winning');
            else if (g.myCp <= -80) mainEvalEl.classList.add('losing');
        }

        const winPct = typeof g.winPct === 'number' ? g.winPct : 50;
        document.getElementById('pwr-win').innerText = `YOU ${winPct}%`;
        document.getElementById('pwr-loss').innerText = `${100 - winPct}% OPP`;
        document.getElementById('pwr-bar').style.width = `${winPct}%`;

        // Minimized compact preview
        const miniEl = document.getElementById('hud-mini-preview');
        if (miniEl) {
            miniEl.innerText = g.uci ? `${f1.san} (${g.eval})` : '...';
        }

        // Tier 2 & Tier 3
        const m2 = currentAnalysis.medium;
        const f2 = formatUciWithSan(fen, m2.uci);
        document.getElementById('move-2-san').innerText = f2.icon ? `${f2.icon} ${f2.san}` : f2.san;
        document.getElementById('move-2-coords').innerText = f2.coords;
        document.getElementById('move-2-eval').innerText = m2.eval || '0.0';

        const m3 = currentAnalysis.weak;
        const f3 = formatUciWithSan(fen, m3.uci);
        document.getElementById('move-3-san').innerText = f3.icon ? `${f3.icon} ${f3.san}` : f3.san;
        document.getElementById('move-3-coords').innerText = f3.coords;
        document.getElementById('move-3-eval').innerText = m3.eval || '0.0';
    }

    // --- 11. BOARD DETECTION, OBSERVER & AUTO-MOVE ---
    function attachBoardObserver(board) {
        if (!board || observedBoardEl === board) return;
        if (boardObserver) {
            try { boardObserver.disconnect(); } catch (e) {}
        }
        observedBoardEl = board;
        boardObserver = new MutationObserver(() => {
            if (observerDebounce) return;
            observerDebounce = requestAnimationFrame(() => {
                observerDebounce = null;
                analyzeCurrentBoard(false);
            });
        });
        boardObserver.observe(board, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'flipped', 'fen']
        });
    }

    function analyzeCurrentBoard(force = false) {
        if (!document.getElementById('neon-hud-panel')) {
            injectStylesAndHUD();
        }

        const board = getBoardElement();
        if (!board || !getBoardGame(board)) return;

        attachBoardObserver(board);

        const currentFen = getBoardFen(board);
        if (!currentFen) return;
        if (!force && currentFen === lastFen) return;

        // Detect new game reset -> clear sticky gambit & reset Stockfish hash
        const parsed = parseFen(currentFen);
        const fullMove = parsed ? parsed.fullMove : 1;
        if (toPosKey(currentFen) === toPosKey(START_FEN) || fullMove < lastFullMove) {
            activeMatchGambitKey = null;
            matchFirstMoveSeed = Math.random();
            if (stockfish) stockfish.postMessage('ucinewgame');
        }
        lastFullMove = fullMove;
        lastFen = currentFen;

        clearAutoMoveTimer();

        pvData = {};
        highestPvDepth = 0;

        const turnColor = parsed ? parsed.turn : 'w';
        const myColor = getMyColor(board);
        const isGameOver = checkIsGameOver(board, currentFen);

        currentAnalysis = createEmptyAnalysis();
        currentAnalysis.fen = currentFen;
        currentAnalysis.turnColor = turnColor;
        currentAnalysis.myColor = myColor;
        currentAnalysis.isGameOver = isGameOver;

        if (isGameOver) {
            currentAnalysis.gambitStatusText = '🏁 Match finished';
            scheduleRender(true);
            return;
        }

        // 1. Check Smart Auto-Gambit / Manual Gambit candidate
        const cand = findBestGambitCandidate(currentFen, myColor);
        currentAnalysis.gambitCandidate = cand;

        if (cand) {
            evaluateAndApplyAnalysis(false);
        } else {
            const waitingMsg = (CONFIG.selectedGambit === 'auto' && activeMatchGambitKey && GAMBIT_BOOK[activeMatchGambitKey])
                ? `⏳ Tracking: ${GAMBIT_BOOK[activeMatchGambitKey].name}`
                : '⏳ Waiting for opponent...';
            currentAnalysis.gambitStatusText = CONFIG.selectedGambit === 'none'
                ? `🧠 Engine Mode (D:${CONFIG.depth})`
                : (turnColor === myColor ? '🧠 Engine Mode (Out of Book)' : waitingMsg);
            scheduleRender(true);
        }

        // 2. Always run Stockfish in parallel so eval bar, alternatives, & Auto-Gambit verification stay live
        if (stockfish) {
            startStockfishSearch(currentFen);
        } else if (cand && CONFIG.autoMove) {
            triggerAutoMoveIfMyTurn();
        }
    }

    function getSelectedMoveUci(tier = CONFIG.selectedTier) {
        if (tier === 2) return currentAnalysis.medium.uci;
        if (tier === 3) return currentAnalysis.weak.uci;
        return currentAnalysis.good.uci;
    }

    function executeMoveOnBoard(board, uci, expectedFen) {
        const game = getBoardGame(board);
        if (!board || !game || !uci || uci.length < 4) return false;
        const liveFen = getBoardFen(board);
        if (expectedFen && liveFen !== expectedFen) return false;
        if (!isLegalUci(liveFen, uci)) return false;

        try {
            if (typeof game.move === 'function') {
                const payload = {
                    from: uci.slice(0, 2),
                    to: uci.slice(2, 4),
                    animate: true,
                    userGenerated: true
                };
                if (uci.length > 4) payload.promotion = uci[4];
                game.move(payload);
                return true;
            }
        } catch (e) {}
        return false;
    }

    function executeMoveForTier(tier) {
        const board = getBoardElement();
        if (!board || !getBoardGame(board)) return;
        const liveFen = getBoardFen(board);
        if (!liveFen || checkIsGameOver(board, liveFen)) return;
        const parsed = parseFen(liveFen);
        const myColor = getMyColor(board);
        if (!parsed || parsed.turn !== myColor) return;

        const uci = getSelectedMoveUci(tier);
        executeMoveOnBoard(board, uci, liveFen);
    }

    function clearAutoMoveTimer() {
        clearTimeout(autoMoveTimer);
        autoMoveTimer = null;
        autoMoveScheduledFen = '';
        autoMoveScheduledUci = '';
    }

    function triggerAutoMoveIfMyTurn() {
        if (!CONFIG.autoMove) return;
        const board = getBoardElement();
        if (!board || !getBoardGame(board)) return;

        const liveFen = getBoardFen(board);
        if (!liveFen || liveFen !== currentAnalysis.fen || checkIsGameOver(board, liveFen)) return;

        const parsed = parseFen(liveFen);
        const myColor = getMyColor(board);
        if (!parsed || parsed.turn !== myColor) return;

        const uci = getSelectedMoveUci();
        if (!uci || uci.length < 4 || !isLegalUci(liveFen, uci)) return;

        if (autoMoveTimer && autoMoveScheduledFen === liveFen && autoMoveScheduledUci === uci) {
            return;
        }

        clearAutoMoveTimer();
        autoMoveScheduledFen = liveFen;
        autoMoveScheduledUci = uci;
        const targetFen = liveFen;
        autoMoveTimer = setTimeout(() => {
            clearAutoMoveTimer();
            if (!CONFIG.autoMove) return;
            executeMoveOnBoard(getBoardElement(), uci, targetFen);
        }, CONFIG.delayMs);
    }

    // --- 12. CRISP SVG VECTOR ARROWS (ZERO BLUR LAG) ---
    function drawBoardArrows() {
        const board = getBoardElement();
        if (!board) return;

        let svg = document.getElementById('neon-svg-overlay');
        if (svg && svg.parentElement !== board) {
            svg.remove();
            svg = null;
        }
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = 'neon-svg-overlay';
            svg.setAttribute('viewBox', '0 0 100 100');
            if (getComputedStyle(board).position === 'static') {
                board.style.position = 'relative';
            }
            board.appendChild(svg);
        }

        if (!CONFIG.showArrows || currentAnalysis.isGameOver) {
            svg.innerHTML = '';
            return;
        }

        const isFlipped = isBoardFlipped(board);
        let html = '';

        const movesToDraw = [
            { data: currentAnalysis.weak, color: '#ff3366', tier: 3 },
            { data: currentAnalysis.medium, color: '#ffaa00', tier: 2 },
            { data: currentAnalysis.good, color: currentAnalysis.isBookMove ? '#ffd166' : '#00f0ff', tier: 1 }
        ];

        const drawnUcis = new Set();

        movesToDraw.forEach(item => {
            if (!item.data || !item.data.uci || item.data.uci.length < 4) return;
            const uci = item.data.uci;
            const isSelected = CONFIG.selectedTier === item.tier;
            if (!isSelected && drawnUcis.has(uci)) return;
            drawnUcis.add(uci);

            const fromSq = uciToCoords(uci.slice(0, 2), isFlipped);
            const toSq = uciToCoords(uci.slice(2, 4), isFlipped);
            const dx = toSq.x - fromSq.x;
            const dy = toSq.y - fromSq.y;
            const len = Math.hypot(dx, dy);
            if (len < 1) return;

            const ux = dx / len;
            const uy = dy / len;
            const headLen = isSelected ? 4.3 : 3.0;
            const headHalfW = isSelected ? 2.4 : 1.65;
            const sx = fromSq.x + ux * 1.4;
            const sy = fromSq.y + uy * 1.4;
            const ex = toSq.x - ux * (headLen * 0.8);
            const ey = toSq.y - uy * (headLen * 0.8);
            const bx = toSq.x - ux * headLen;
            const by = toSq.y - uy * headLen;

            const p1x = (bx - uy * headHalfW).toFixed(2);
            const p1y = (by + ux * headHalfW).toFixed(2);
            const p2x = (bx + uy * headHalfW).toFixed(2);
            const p2y = (by - ux * headHalfW).toFixed(2);

            const opacity = isSelected ? '0.94' : '0.34';
            const strokeW = isSelected ? '2.1' : '1.1';

            if (isSelected) {
                html += `
                    <rect x="${(fromSq.x - 6.25).toFixed(2)}" y="${(fromSq.y - 6.25).toFixed(2)}"
                          width="12.5" height="12.5" fill="${item.color}" fill-opacity="0.14"
                          stroke="${item.color}" stroke-width="0.7" opacity="0.85" />
                    <rect x="${(toSq.x - 6.25).toFixed(2)}" y="${(toSq.y - 6.25).toFixed(2)}"
                          width="12.5" height="12.5" fill="${item.color}" fill-opacity="0.12" />
                `;
            }

            html += `
                <line x1="${sx.toFixed(2)}" y1="${sy.toFixed(2)}" x2="${ex.toFixed(2)}" y2="${ey.toFixed(2)}"
                      stroke="${item.color}" stroke-width="${strokeW}" stroke-linecap="round" opacity="${opacity}" />
                <polygon points="${toSq.x.toFixed(2)},${toSq.y.toFixed(2)} ${p1x},${p1y} ${p2x},${p2y}"
                         fill="${item.color}" opacity="${opacity}" />
            `;
        });

        svg.innerHTML = html;
    }

    function uciToCoords(sq, isFlipped) {
        const file = sq.charCodeAt(0) - 97;
        const rank = parseInt(sq[1], 10) - 1;
        const col = isFlipped ? 7 - file : file;
        const row = isFlipped ? rank : 7 - rank;
        return {
            x: col * 12.5 + 6.25,
            y: row * 12.5 + 6.25
        };
    }

    // --- 13. INITIALIZE ---
    function startHelper() {
        injectStylesAndHUD();
        initStockfish();
        setInterval(() => analyzeCurrentBoard(false), 500);
        analyzeCurrentBoard(true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(startHelper, 250));
    } else {
        setTimeout(startHelper, 250);
    }
}

window.initNeonChessHelper = initNeonChessHelper;
if (typeof window !== 'undefined' && window.location && /chess\.com/i.test(window.location.hostname)) {
    initNeonChessHelper();
}
