/**
 * Sentiment analysis for free-text feedback.
 *
 * A deliberately transparent, rule-based scorer — no network call, no model
 * download, no API key. That is a feature, not a shortcut:
 *   - it runs in well under a millisecond, so scoring never slows a submit;
 *   - it is deterministic, so the same review always classifies the same way
 *     (a demo that changes its mind is worse than a simple one);
 *   - it is offline, so feedback keeps working when the AI provider is down;
 *   - every verdict is explainable — we can show the exact words that moved
 *     the score, which is what makes the classification auditable.
 *
 * How it works:
 *   1. Normalise + tokenise.
 *   2. Match multi-word phrases first ("waste of time", "easy to use") and
 *      consume their tokens, so their words can't be scored twice.
 *   3. Score each remaining term from a weighted lexicon.
 *   4. Apply local modifiers — a negator within 3 tokens flips the sign
 *      ("not helpful"), an intensifier/diminisher within 2 scales it
 *      ("very helpful", "slightly slow").
 *   5. Squash the raw sum into [-1, 1] so scores are comparable across short
 *      and long answers.
 *
 * `analyzeRating` covers the numeric half of a form: a 1–5 star answer carries
 * sentiment just as a sentence does, and mixing the two would silently skew a
 * form's overall mood.
 */

/* ---------- Lexicon ---------- */

// weight tiers: 2 = strong, 1.2 = normal, 0.5 = mild
const POSITIVE = {
  // strong
  excellent: 2, outstanding: 2, amazing: 2, fantastic: 2, superb: 2, brilliant: 2,
  perfect: 2, wonderful: 2, exceptional: 2, flawless: 2, love: 2, loved: 2,
  delighted: 2, thrilled: 2, awesome: 2, tremendous: 2, seamless: 2, impressive: 2,
  // normal
  good: 1.5, great: 1.5, helpful: 1.2, useful: 1.2, clear: 1.2, easy: 1.2,
  fast: 1.2, reliable: 1.2, smooth: 1.2, friendly: 1.2, supportive: 1.2,
  responsive: 1.2, intuitive: 1.2, satisfied: 1.2, happy: 1.2, pleased: 1.2,
  recommend: 1.2, recommended: 1.2, efficient: 1.2, professional: 1.2,
  informative: 1.2, valuable: 1.2, well: 1.2, better: 1.2, improved: 1.2,
  improvement: 1, engaged: 1.2, engaging: 1.2, knowledgeable: 1.2, practical: 1.2,
  thorough: 1.2, punctual: 1.2, organised: 1.2, organized: 1.2, clean: 1.2,
  polite: 1.2, timely: 1.2, accurate: 1.2, enjoy: 1.2, enjoyed: 1.2, thanks: 1,
  thank: 1, appreciate: 1.2, appreciated: 1.2, excellent_value: 2,
  // mild
  ok: 0.5, okay: 0.5, fine: 0.5, average: 0.5, decent: 0.5, acceptable: 0.5,
  adequate: 0.5, fair: 0.5, standard: 0.5, normal: 0.5, satisfied_enough: 0.5,
};

const NEGATIVE = {
  // strong
  terrible: -2, awful: -2, horrible: -2, useless: -2, broken: -2, worst: -2,
  unacceptable: -2, disastrous: -2, appalling: -2, garbage: -2, worthless: -2,
  hate: -2, hated: -2, frustrated: -2, frustrating: -2, furious: -2, angry: -2,
  unusable: -2, crash: -2, crashes: -2, crashed: -2, disgusting: -2, pathetic: -2,
  // normal
  bad: -1.5, poor: -1.5, slow: -1.2, confusing: -1.2, confusingly: -1.2,
  unclear: -1.2, difficult: -1.2, hard: -1.2, buggy: -1.2, bug: -1.2, bugs: -1.2,
  error: -1.2, errors: -1.2, problem: -1.2, problems: -1.2, issue: -1.2,
  issues: -1.2, delay: -1.2, delayed: -1.2, late: -1.2, missing: -1.2, wrong: -1.2,
  fail: -1.5, failed: -1.5, failure: -1.5, fails: -1.5, annoying: -1.2,
  annoyed: -1.2, complicated: -1.2, complex: -0.8, clunky: -1.2, messy: -1.2,
  inconsistent: -1.2, disappointed: -1.5, disappointing: -1.5, lacking: -1.2,
  lacks: -1.2, limited: -1.2, expensive: -1.2, overpriced: -1.5, unreliable: -1.5,
  unresponsive: -1.5, outdated: -1.2, tedious: -1.2, boring: -1.2, monotonous: -1.2,
  repetitive: -1.2, rushed: -1.2, biased: -1.2, unfair: -1.5, overcrowded: -1.2,
  disorganised: -1.5, disorganized: -1.5, unorganised: -1.5, unpunctual: -1.2,
  ignored: -1.5, ignore: -1.2, waiting: -1, waited: -1, cancel: -1.2,
  cancelled: -1.2, canceled: -1.2, refund: -0.8, complaint: -1.5, worse: -1.5,
  confusing_ui: -1.2, steep: -0.8, // "steep learning curve"
  // mild
  meh: -0.5, mediocre: -0.5, weak: -0.5, minor: -0.5, slight: -0.5,
  somewhat: -0.5, okayish: -0.5,
};

const LEXICON = Object.assign({}, POSITIVE, NEGATIVE);

// Multi-word phrases are matched first and consume their tokens.
const PHRASES = {
  'value for money': 2,
  'easy to use': 1.5,
  'user friendly': 1.5,
  'well organised': 1.5,
  'well organized': 1.5,
  'on time': 1.2,
  'highly recommend': 2,
  'worth it': 1.5,
  'no issues': 1.5,
  'no problems': 1.5,
  'no complaints': 1.5,
  'works well': 1.5,
  'very good': 1.5,
  'keep it up': 1.5,
  'looking forward': 1,
  'waste of time': -2,
  'hard to use': -1.5,
  'difficult to use': -1.5,
  'not helpful': -1.5,
  'not working': -1.5,
  'does not work': -1.5,
  'did not work': -1.5,
  'could be better': -1,
  'needs improvement': -1,
  'room for improvement': -0.8,
  'poor quality': -2,
  'lack of': -1.2,
  'no support': -1.5,
  'fell short': -1.5,
  'too slow': -1.5,
  'too expensive': -1.5,
  'not satisfied': -1.5,
};

const NEGATORS = new Set([
  'not', 'no', 'never', 'none', 'nobody', 'nothing', 'neither', 'nor',
  'cannot', "can't", 'cant', "don't", 'dont', "doesn't", 'doesnt', "didn't",
  'didnt', "isn't", 'isnt', "aren't", 'arent', "wasn't", 'wasnt', "weren't",
  'werent', "won't", 'wont', "wouldn't", 'wouldnt', "shouldn't", 'shouldnt',
  "couldn't", 'couldnt', 'hardly', 'barely', 'without', 'lacks', 'lacking',
  'fails', 'failed', 'unable',
]);

const INTENSIFIERS = {
  very: 1.5, extremely: 1.8, really: 1.5, highly: 1.6, super: 1.5,
  incredibly: 1.8, absolutely: 1.8, totally: 1.6, completely: 1.6, so: 1.4,
  much: 1.3, too: 1.4, quite: 1.2, deeply: 1.6, seriously: 1.5, truly: 1.4,
};

const DIMINISHERS = {
  slightly: 0.5, somewhat: 0.6, mildly: 0.5, fairly: 0.8, rather: 0.8,
  little: 0.6, bit: 0.6, kinda: 0.6, sorta: 0.6, marginally: 0.5,
};

const POSITIVE_THRESHOLD = 0.18;
const NEGATIVE_THRESHOLD = -0.18;

/* ---------- Helpers ---------- */

function normalise(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Squash an unbounded raw score into a comparable [-1, 1]. */
function squash(raw) {
  if (!Number.isFinite(raw) || raw === 0) return 0;
  return raw / (Math.abs(raw) + 2.5);
}

function labelFor(score) {
  if (score >= POSITIVE_THRESHOLD) return 'POSITIVE';
  if (score <= NEGATIVE_THRESHOLD) return 'NEGATIVE';
  return 'NEUTRAL';
}

function round4(n) {
  return Math.round(Number(n || 0) * 10000) / 10000;
}

/* ---------- Core ---------- */

/**
 * Score a piece of free text.
 * @returns {{label:'POSITIVE'|'NEUTRAL'|'NEGATIVE', score:number,
 *            positive:number, negative:number, terms:string[], words:number}}
 *          Never throws — empty/odd input yields a NEUTRAL zero score.
 */
function analyze(text) {
  const clean = normalise(text);
  if (!clean) {
    return { label: 'NEUTRAL', score: 0, positive: 0, negative: 0, terms: [], words: 0 };
  }

  const tokens = clean.split(' ');
  const used = new Array(tokens.length).fill(false);
  const terms = [];
  let raw = 0;

  // 1. Phrases first — longest first so "not working" beats "working".
  const phraseList = Object.keys(PHRASES).sort(
    (a, b) => b.split(' ').length - a.split(' ').length
  );
  for (const phrase of phraseList) {
    const parts = phrase.split(' ');
    const n = parts.length;
    for (let i = 0; i + n <= tokens.length; i += 1) {
      let match = true;
      for (let k = 0; k < n; k += 1) {
        if (used[i + k] || tokens[i + k] !== parts[k]) { match = false; break; }
      }
      if (!match) continue;
      for (let k = 0; k < n; k += 1) used[i + k] = true;
      const w = PHRASES[phrase];
      raw += w;
      terms.push((w > 0 ? '+' : '') + w + ' "' + phrase + '"');
    }
  }

  // 2. Single terms with local modifiers.
  for (let i = 0; i < tokens.length; i += 1) {
    if (used[i]) continue;
    const tok = tokens[i];
    const base = LEXICON[tok];
    if (base === undefined) continue;

    let weight = base;
    let negated = false;

    // Look back over the previous few tokens for a modifier.
    let scale = 1;
    for (let back = 1; back <= 3; back += 1) {
      const prev = tokens[i - back];
      if (prev === undefined) break;
      if (used[i - back]) continue;
      if (NEGATORS.has(prev)) { negated = true; break; }
      if (INTENSIFIERS[prev] && back <= 2) { scale *= INTENSIFIERS[prev]; break; }
      if (DIMINISHERS[prev] && back <= 2) { scale *= DIMINISHERS[prev]; break; }
    }

    weight *= scale;
    if (negated) weight = -weight * 0.85;

    raw += weight;
    terms.push((weight > 0 ? '+' : '') + round4(weight) + ' "' + tok + '"');
  }

  const score = squash(raw);
  return {
    label: labelFor(score),
    score: round4(score),
    positive: round4(Math.max(0, score)),
    negative: round4(Math.min(0, score)),
    terms,
    words: tokens.length,
  };
}

/**
 * Sentiment implied by a numeric rating (default 1–5).
 * 5,4 → POSITIVE · 3 → NEUTRAL · 2,1 → NEGATIVE, with a graded score so a
 * form's average is meaningful rather than three flat buckets.
 */
function analyzeRating(rating, max = 5) {
  const r = Number(rating);
  const m = Number(max) || 5;
  if (!Number.isFinite(r) || m <= 0) {
    return { label: 'NEUTRAL', score: 0, positive: 0, negative: 0, terms: [], words: 0 };
  }
  const ratio = Math.min(1, Math.max(0, r / m));
  // 0.6 is the neutral pivot: 3/5 → 0, 5/5 → +1, 1/5 → -1.
  let score = (ratio - 0.6) / 0.4;
  score = Math.min(1, Math.max(-1, score));
  return {
    label: labelFor(score),
    score: round4(score),
    positive: round4(Math.max(0, score)),
    negative: round4(Math.min(0, score)),
    terms: ['rating ' + r + '/' + m],
    words: 0,
  };
}

/**
 * Fold per-answer results into one verdict for the whole response.
 * Answers with no signal (empty text, skipped question) are ignored rather
 * than averaged in as neutral, which would drag every form toward the middle.
 * @param {Array<{label:string,score:number}>} parts
 */
function combine(parts = []) {
  const scored = (parts || []).filter(
    (p) => p && typeof p.score === 'number' && Number.isFinite(p.score) && p.label !== 'NEUTRAL'
  );
  if (!scored.length) {
    // Nothing opinionated was said — but if there were answers at all, that is
    // genuinely neutral rather than unknown.
    const any = (parts || []).some((p) => p && typeof p.score === 'number');
    return { label: 'NEUTRAL', score: 0, positive: 0, negative: 0, answered: any };
  }
  const avg = scored.reduce((s, p) => s + p.score, 0) / scored.length;
  return {
    label: labelFor(avg),
    score: round4(avg),
    positive: round4(Math.max(0, avg)),
    negative: round4(Math.min(0, avg)),
    answered: true,
  };
}

module.exports = {
  analyze,
  analyzeRating,
  combine,
  labelFor,
  POSITIVE_THRESHOLD,
  NEGATIVE_THRESHOLD,
  LEXICON_SIZE: Object.keys(LEXICON).length,
  PHRASE_COUNT: Object.keys(PHRASES).length,
};
