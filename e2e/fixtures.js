// @ts-check
const { test: base, expect } = require('@playwright/test')

const API = 'http://localhost:9001'

// ── Test PGNs ──────────────────────────────────────────────────────────────

/** Scholar's Mate — 4 moves, fast to analyze */
const SCHOLAR_MATE_PGN = `[Event "Test"]
[Site "?"]
[Date "2024.01.01"]
[White "White"]
[Black "Black"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`

/** Ruy Lopez opening — shared first moves for opening tree tests */
const RUY_LOPEZ_PGN = `[Event "Test"]
[Site "?"]
[Date "2024.01.01"]
[White "Player"]
[Black "Opponent"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *`

/** A short 10-ply game with a checkmate */
const CHECKMATE_PGN = `[Event "E2E Test"]
[Site "?"]
[Date "2024.01.01"]
[White "Tester"]
[Black "Opponent"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`

// ── API helpers ────────────────────────────────────────────────────────────

/** POST a game directly to the API (bypasses UI). Returns the game id. */
async function seedGame(request, overrides = {}) {
  const game = {
    title: overrides.title || 'E2E Seed Game',
    pgn: overrides.pgn || SCHOLAR_MATE_PGN,
    metadata: {
      white: overrides.white || '?',
      black: overrides.black || '?',
      result: overrides.result || '1-0',
      date: overrides.date || '2024-01-01',
      event: 'Test',
    },
    moves: [
      {
        ply: 1, san: 'e4', uci: 'e2e4', moveNumber: 1, color: 'w',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        evaluation: { value: 20 },
        annotations: { cpl: 0, isBlunder: false, phase: 'opening' },
        engine: { bestMove: 'e4', pv: ['e4', 'e5'] },
      },
      {
        ply: 2, san: 'e5', uci: 'e7e5', moveNumber: 1, color: 'b',
        fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
        evaluation: { value: -15 },
        annotations: { cpl: 35, isBlunder: false, phase: 'opening' },
        engine: { bestMove: 'e5', pv: ['e5'] },
      },
    ],
    analysis: overrides.analysis || [
      { move_number: 1, label: '1w', san: 'e4',  evaluation:  20, cpl: 0,   is_blunder: false, phase: 'opening' },
      { move_number: 2, label: '1b', san: 'e5',  evaluation: -15, cpl: 35,  is_blunder: false, phase: 'opening' },
      { move_number: 3, label: '2w', san: 'Bc4', evaluation:  30, cpl: 0,   is_blunder: false, phase: 'opening' },
      { move_number: 4, label: '2b', san: 'Nc6', evaluation: -20, cpl: 10,  is_blunder: false, phase: 'opening' },
      { move_number: 5, label: '3w', san: 'Qh5', evaluation: 250, cpl: 0,   is_blunder: false, phase: 'opening' },
      { move_number: 6, label: '3b', san: 'Nf6', evaluation: 900, cpl: 650, is_blunder: true,  phase: 'opening' },
      { move_number: 7, label: '4w', san: 'Qxf7#', evaluation: 0, cpl: 0,  is_blunder: false, phase: 'opening' },
    ],
    ...('uuid' in overrides ? { uuid: overrides.uuid } : {}),
  }

  const resp = await request.post(`${API}/api/db/games`, { data: game })
  const body = await resp.json()
  return body.id
}

/** Delete all seeded games that match a title substring. */
async function cleanupGames(request, titleSubstring = 'E2E') {
  const resp = await request.get(`${API}/api/db/games`)
  const games = await resp.json()
  for (const g of games) {
    if (g.title && g.title.includes(titleSubstring)) {
      await request.delete(`${API}/api/db/games/${g.id}`)
    }
  }
}

// ── Extended test fixture ──────────────────────────────────────────────────

const test = base.extend({
  /** Automatically clean up E2E-seeded games before and after each test. */
  cleanDb: [async ({ request }, use) => {
    await cleanupGames(request, 'E2E')
    await use()
    await cleanupGames(request, 'E2E')
  }, { auto: true }],
})

module.exports = {
  test,
  expect,
  seedGame,
  cleanupGames,
  SCHOLAR_MATE_PGN,
  RUY_LOPEZ_PGN,
  CHECKMATE_PGN,
  API,
}
