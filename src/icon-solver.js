const mergeByIdx = (plates, singles) => {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < plates.length || j < singles.length) {
    if (j >= singles.length || (i < plates.length && plates[i].idx <= singles[j].idx)) out.push(plates[i++]);
    else out.push(singles[j++]);
  }
  return out;
};

const lessSeq = (a, b) => {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return a.length < b.length;
};

const better = (a, b) => {
  if (!b) return true;
  if (a.cost !== b.cost) return a.cost < b.cost;
  if (a.disp !== b.disp) return a.disp < b.disp;
  return lessSeq(a.seq, b.seq);
};

const solveWithRows = (plates, singles, cols, rowCount, total) => {
  const span = (it) => Math.min(Math.max(1, it.n), cols);
  const P = plates.length;
  const S = singles.length;
  const plateSpan = [0];
  plates.forEach((it) => plateSpan.push(plateSpan[plateSpan.length - 1] + span(it)));
  const singleSpan = [0];
  singles.forEach((it) => singleSpan.push(singleSpan[singleSpan.length - 1] + span(it)));
  const scale = rowCount * rowCount;
  const memo = new Map();

  const walk = (p, s, r, prevW, big, lone) => {
    if (r === rowCount) return p === P && s === S ? { cost: 0, disp: 0, seq: [], rows: [] } : null;
    if (p === P && s === S) return null;
    const key = `${p}|${s}|${r}|${prevW}|${big ? 1 : 0}${lone ? 1 : 0}`;
    if (memo.has(key)) return memo.get(key);
    const restSpan = plateSpan[P] - plateSpan[p] + singleSpan[S] - singleSpan[s];
    let best = null;
    for (let a = 0; p + a <= P; a++) {
      const aSpan = plateSpan[p + a] - plateSpan[p];
      if (aSpan > cols) break;
      for (let b = 0; s + b <= S; b++) {
        if (a + b === 0) continue;
        const rowSpan = aSpan + singleSpan[s + b] - singleSpan[s];
        if (rowSpan > cols) break;
        if (restSpan - rowSpan > (rowCount - r - 1) * cols) continue;
        const members = mergeByIdx(plates.slice(p, p + a), singles.slice(s, s + b));
        let disp = 0;
        let adjacent = 0;
        members.forEach((it, k) => {
          disp += Math.abs(p + s + k - it.idx);
          if (k > 0 && members[k - 1].n > 1 && it.n > 1) adjacent += 1;
        });
        const nextBig = big || members.length >= 4;
        const nextLone = lone || members.length === 1;
        const orphan = nextBig && nextLone && !(big && lone) ? 20 : 0;
        const balance = 10 * (rowSpan * rowCount - total) ** 2;
        const shape = prevW > 0 && rowSpan > prevW ? 3 : 0;
        const rowCost = balance + (adjacent * 4 + shape + orphan + disp) * scale;
        const rest = walk(p + a, s + b, r + 1, rowSpan, nextBig, nextLone);
        if (!rest) continue;
        const cand = {
          cost: rowCost + rest.cost,
          disp: disp + rest.disp,
          seq: members.map((it) => it.idx).concat(rest.seq),
          rows: [members].concat(rest.rows)
        };
        if (better(cand, best)) best = cand;
      }
    }
    memo.set(key, best);
    return best;
  };

  return walk(0, 0, 0, 0, false, false);
};

export const solveIconRows = (items, cols) => {
  if (!items.length) return [];
  const plates = items.filter((it) => it.n > 1);
  const singles = items.filter((it) => !(it.n > 1));
  const total = items.reduce((sum, it) => sum + Math.min(Math.max(1, it.n), cols), 0);
  for (let rows = Math.max(1, Math.ceil(total / cols)); rows <= items.length; rows++) {
    const found = solveWithRows(plates, singles, cols, rows, total);
    if (found) return found.rows;
  }
  return items.map((it) => [it]);
};
