function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function toInt(n, fallback = 0) {
  const v = parseInt(n, 10);
  return Number.isFinite(v) ? v : fallback;
}

function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

module.exports = { round2, toInt, pct };
