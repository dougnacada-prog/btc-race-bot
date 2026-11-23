// btc-race bot: Donchian breakout + slow-EMA trend filter + percentage
// trailing stop.
//
// Protocol: agent-fun/bars-replay/v1. The harness sends hello once, then one
// batch per 1-minute bar; every batch gets exactly one reply with orders.
// Orders decided on a bar fill at the next bar's open, so every signal is
// judged on closes only and every exit is decided one bar late by design.
//
// Design (original, written for this competition):
//   * Long only, at most one position, full size on entry. A full-size round
//     trip costs ~26 bps (4 bps fee + 2 bps slippage + ~7 bps impact per
//     side), so entries must catch moves clearly bigger than that, and
//     exits must be wide: a tight stop on 1-minute noise just pays the
//     round-trip cost over and over (v1 did exactly that: 38 trades, -$54).
//   * Entry: close breaks above the highest close of the previous 60 bars
//     AND price sits above its 2-hour EMA (trend filter), so we only chase
//     breakouts that run with the trend instead of buying every blip.
//   * Exit: whichever comes first — a 3% trailing stop below the peak
//     close since entry, a close back under the slow EMA, or a 2.5% hard
//     stop under the entry price. Winners ride; losers are cut, but only
//     after a move big enough to matter.
//   * A short cooldown after any exit stops the bot re-buying the same
//     whipsaw, and no new entries are opened in the final hour of the
//     window (a fill there would be flattened almost at once).
//   * Deterministic: no clock, no network, no randomness; all state is
//     derived from the bars the harness sends.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Strategy parameters (few, round numbers, chosen for robustness not fit).
const SLOW_EMA = 120; // slow trend filter, in bars (2 hours)
const BREAKOUT_BARS = 60; // entry: beat the highest close of the last N bars
const TRAIL_PCT = 0.97; // trailing stop: exit if close falls 3% below the peak close
const HARD_STOP_PCT = 0.975; // hard stop: 2.5% under the entry close
const COOLDOWN_BARS = 30; // bars to wait after an exit before re-entering
const LAST_ENTRY_SEQ = 1380; // no new entries after this batch seq
const MAX_SLIPPAGE_BPS = 100; // 1%: fills sit ~13 bps from the close, so this is slack

interface BotState {
  closes: number[];
  emaSlow: number | null;
  prevClose: number | null;
  inPosition: boolean;
  entryClose: number;
  peakClose: number;
  lastExitSeq: number;
}

function freshState(): BotState {
  return {
    closes: [],
    emaSlow: null,
    prevClose: null,
    inPosition: false,
    entryClose: 0,
    peakClose: 0,
    lastExitSeq: -1000,
  };
}

function updateIndicators(s: BotState, close: number): void {
  const kSlow = 2 / (SLOW_EMA + 1);
  if (s.emaSlow === null) {
    s.emaSlow = close;
  } else {
    s.emaSlow = close * kSlow + s.emaSlow * (1 - kSlow);
  }
  s.prevClose = close;
  s.closes.push(close);
}

function highestClose(s: BotState, n: number): number {
  let best = -Infinity;
  const start = Math.max(0, s.closes.length - 1 - n);
  for (let i = start; i < s.closes.length - 1; i++) {
    if (s.closes[i] > best) best = s.closes[i];
  }
  return best;
}

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    const st: BotState = (state as unknown as { __bot?: BotState }).__bot ??
      ((state as unknown as { __bot?: BotState }).__bot = freshState());
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    // Prices arrive as integers at the symbol's price_scale; ratios are
    // scale-free, so raw integers work for every comparison below.
    const close = Number(bar.c);
    updateIndicators(st, close);

    const pos = state.positions.get(SYMBOL);
    const heldQty = pos?.qty ?? 0n;
    const emaSlow = st.emaSlow ?? close;

    // --- exits first: if we hold, decide whether this bar closes the trade.
    // Only wide exits: a 3% trailing stop and a 2.5% hard stop. (An earlier
    // version also exited on a close under the slow EMA; on 1-minute bars
    // that fired on every small pullback and the re-entries paid the
    // round-trip cost again and again: 7 losing round trips, -$32.)
    if (heldQty > 0n) {
      st.inPosition = true;
      if (close > st.peakClose) st.peakClose = close;
      const trailStop = st.peakClose * TRAIL_PCT;
      const hardStop = close < st.entryClose * HARD_STOP_PCT;
      if (close < trailStop || hardStop) {
        st.inPosition = false;
        st.lastExitSeq = state.seq;
        return [{ side: 'sell', symbol: SYMBOL, qty: heldQty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // --- entries: flat, trend up, fresh breakout, past cooldown, not too late.
    st.inPosition = false;
    if (state.seq < SLOW_EMA) return [];
    if (state.seq > LAST_ENTRY_SEQ) return [];
    if (state.seq - st.lastExitSeq < COOLDOWN_BARS) return [];
    if (state.cash < 1_000_000n) return []; // below the $1 minimum notional
    const breakout = highestClose(st, BREAKOUT_BARS);
    const trendUp = close > emaSlow;
    const breakingOut = close > breakout;
    if (trendUp && breakingOut) {
      st.entryClose = close;
      st.peakClose = close;
      st.inPosition = true;
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
