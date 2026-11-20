export const LAYOUTS = {
  3: [['1/3', '1/3'], ['3/5', '1/3'], ['1/5', '3/4']],
  4: [['1/3', '1/2'], ['3/5', '1/2'], ['1/3', '2/4'], ['3/5', '2/4']],
  5: [['1/3', '1/2'], ['3/5', '1/2'], ['1/2', '2/4'], ['2/4', '2/4'], ['4/5', '2/4']],
  6: [['1/3', '1/2'], ['3/5', '1/2'], ['1/2', '2/4'], ['2/4', '2/3'], ['4/5', '2/4'], ['2/4', '3/4']],
  7: [['1/2', '1/2'], ['2/4', '1/2'], ['4/5', '1/2'], ['1/3', '2/3'], ['3/4', '2/3'], ['4/5', '2/3'], ['1/5', '3/4']]
};

const spanOf = (track) => {
  if (!track) return 1;
  const [a, b] = track.split('/').map(Number);
  return b - a;
};

export const variantFor = (colTrack) => {
  const span = spanOf(colTrack);
  if (span >= 4) return 'card-hero';
  if (span >= 2) return 'card-wide';
  return null;
};

export const BentoSolver = (() => {
  const COLS = 12;
  const MAX_ROWS = 4;

  const MAX_PER_ROW = 4;
  const EXTRA_ROW_COST = 4;
  const U = COLS / 4;
  const WIDE_CYCLE = [1, 0, 2];
  const cache = new Map();

  const rowCost = (k, last, only, prev) => {
    let c;
    if (k === 3) c = 0;
    else if (k === 4) c = 1.2;
    else if (k === 2) c = only ? 0 : last ? 1 : 2.5;
    else c = only ? 0 : last ? 1 : Infinity;
    if (prev && k > prev) c += 1.5;
    return c;
  };

  const plan = (n) => {
    let best = null, bestScore = Infinity;
    const ks = [];
    const walk = (left, score) => {
      if (score >= bestScore) return;
      if (left === 0) {
        const rows = ks.length;
        const total = score + Math.max(0, rows - 3) * EXTRA_ROW_COST;
        if (total < bestScore) { bestScore = total; best = ks.slice(); }
        return;
      }
      if (ks.length === MAX_ROWS || left > (MAX_ROWS - ks.length) * MAX_PER_ROW) return;
      for (let k = Math.min(MAX_PER_ROW, left); k >= 1; k--) {
        const i = ks.length;
        const last = left === k;
        const c = rowCost(k, last, last && i === 0, ks[i - 1]);
        if (c === Infinity) continue;
        ks.push(k);
        walk(left - k, score + c);
        ks.pop();
      }
    };
    walk(n, 0);
    return best;
  };

  const rowWidths = (k, wideAt) => {
    if (k === 1) return [4 * U];
    if (k === 2) return [2 * U, 2 * U];
    if (k === 4) return [U, U, U, U];
    const w = [U, U, U];
    w[wideAt] = 2 * U;
    return w;
  };

  const generate = (n) => {
    if (!Number.isInteger(n) || n <= 0 || n > MAX_ROWS * MAX_PER_ROW) return null;
    if (cache.has(n)) return cache.get(n);
    const ks = plan(n);
    let result = null;
    if (ks) {
      const items = [];
      let triads = 0;
      ks.forEach((k, rowIndex) => {
        const wideAt = k === 3 ? WIDE_CYCLE[triads++ % WIDE_CYCLE.length] : 0;
        rowWidths(k, wideAt).forEach((col) => items.push({ col, row: 1, rowIndex }));
      });
      result = { rows: ks.length, items };
    }
    cache.set(n, result);
    return result;
  };

  return { generate, COLS };
})();

export const variantForSpan = (col, row) => {
  if (row >= 2) return 'card-tall';
  if (col >= 12) return 'card-hero';
  if (col >= 6) return 'card-wide';
  return null;
};
