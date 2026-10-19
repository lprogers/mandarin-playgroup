/**
 * Cross-source deduplication.
 *
 * Each source already drops repeats within its own results. What none of them
 * can see is the same real-world event arriving from two different sources —
 * most likely a Mandarin storytime listed both on sfpl.org and on a cultural
 * org's own page, which end up with unrelated ids (`sfpl-…` vs `culture-…`).
 *
 * Two events from different sources are treated as the same event when:
 *   - their start times are within WINDOW_MIN minutes of each other, and
 *   - their titles share most of their meaningful words, and
 *   - their venues don't clearly disagree.
 *
 * The venue check matters: SFPL runs the same "Storytime: For Families" at many
 * branches at the same hour, and those are genuinely different events.
 *
 * When two match, the one from the more authoritative source is kept, and any
 * field it's missing (end time, link) is filled in from the one dropped.
 */

const WINDOW_MIN = 15;
const TITLE_MIN = 0.6;
const VENUE_MIN = 0.34;

// Lower = more authoritative. Playgroups are first-party; SFPL is the venue's
// own live listing (reflects cancellations); recurring rules are hand-kept and
// can go stale; culture events are LLM-extracted, so least trusted.
const PRIORITY = {
  partiful: 0,
  manual: 0,
  'manual-fallback': 0,
  extra: 0,
  sfpl: 1,
  recurring: 2,
  'chinese-culture': 3,
};
const rank = (e) => PRIORITY[e.source] ?? 9;

const TITLE_STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'of', 'at', 'in', 'on', 'to',
  'by', 'kids', 'children', 'family', 'families', 'free',
]);
const VENUE_STOP = new Set([
  'the', 'of', 'at', 'and', 'branch', 'library', 'sfpl', 'public', 'sf',
  'san', 'francisco', 'ca', 'united', 'states', 'usa', 'street', 'st', 'ave',
  'avenue', 'center', 'centre',
]);

function tokens(s, stop) {
  return new Set(
    String(s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9一-鿿]+/)
      .filter((t) => t && !stop.has(t) && !/^\d+$/.test(t))
  );
}

/** Share of the smaller set that appears in the larger one (0..1). */
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let hit = 0;
  for (const t of small) if (big.has(t)) hit++;
  return hit / small.size;
}

export function isSameEvent(a, b) {
  if (a.source === b.source) return false; // in-source dedupe is the source's job
  const dt = Math.abs(new Date(a.start) - new Date(b.start)) / 60000;
  if (!(dt <= WINDOW_MIN)) return false;

  if (overlap(tokens(a.title, TITLE_STOP), tokens(b.title, TITLE_STOP)) < TITLE_MIN) return false;

  const va = tokens(a.venue, VENUE_STOP);
  const vb = tokens(b.venue, VENUE_STOP);
  if (va.size && vb.size && overlap(va, vb) < VENUE_MIN) return false;

  return true;
}

/**
 * Returns { events, merged } — events with cross-source duplicates removed
 * (input order not preserved; sorted by start), and a list of
 * { kept, dropped } pairs for logging.
 */
export function dedupeAcrossSources(events) {
  const sorted = [...events].sort((a, b) => new Date(a.start) - new Date(b.start));
  const dropped = new Set();
  const merged = [];

  for (let i = 0; i < sorted.length; i++) {
    if (dropped.has(i)) continue;
    const ti = new Date(sorted[i].start).getTime();

    for (let j = i + 1; j < sorted.length; j++) {
      if ((new Date(sorted[j].start).getTime() - ti) / 60000 > WINDOW_MIN) break;
      if (dropped.has(j) || !isSameEvent(sorted[i], sorted[j])) continue;

      // Keep the more authoritative of the two in slot i.
      let [keep, drop] = [i, j];
      if (rank(sorted[j]) < rank(sorted[i])) [keep, drop] = [j, i];
      const k = sorted[keep];
      const d = sorted[drop];
      sorted[keep] = { ...k, end: k.end || d.end, url: k.url || d.url, cultural: k.cultural || d.cultural };
      merged.push({ kept: sorted[keep], dropped: d });
      dropped.add(drop);
      if (drop === i) break; // slot i is gone; j carries on as the survivor
    }
  }

  return { events: sorted.filter((_, i) => !dropped.has(i)), merged };
}
