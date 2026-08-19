#!/usr/bin/env node
/**
 * Regenerates events.json.
 *
 * Design rule: a source that fails must never silently shrink the calendar.
 * Parents plan around this. An empty Saturday that should have three events is
 * worse than a stale Saturday, because "nothing listed" reads as fact.
 *
 * So: each source either succeeds or is quarantined. A quarantined source's
 * events are carried over from the previous events.json, and the run exits
 * non-zero so the GitHub Action emails you. The file on disk is always
 * complete and always valid.
 *
 *   node scripts/generate-events.mjs              # write events.json
 *   node scripts/generate-events.mjs --dry-run    # print a summary, write nothing
 *
 * Env:
 *   PARTIFUL_MODE=auto|manual   default auto; manual skips the fetcher
 *   HORIZON_DAYS=120            how far ahead to generate
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expand } from './lib/recurrence.mjs';
import { fetchPlaygroups } from './sources/partiful.mjs';
import { fetchSfplEvents } from './sources/sfpl.mjs';
import { renderList, renderJsonLd, injectBetween } from './lib/prerender.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'events.json');
const DRY = process.argv.includes('--dry-run');
const HORIZON = Number(process.env.HORIZON_DAYS || 120);
const PARTIFUL_MODE = process.env.PARTIFUL_MODE || 'auto';

const log = (m) => console.log(m);
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

/** Previous output, used to carry over any source that fails this run. */
function loadPrevious() {
  if (!existsSync(OUT)) return null;
  try {
    const doc = JSON.parse(readFileSync(OUT, 'utf8'));
    return Array.isArray(doc.events) ? doc : null;
  } catch {
    return null;
  }
}

function validate(events) {
  const problems = [];
  const ids = new Set();
  for (const e of events) {
    const where = e.id || e.title || '(unidentified)';
    if (!e.id) problems.push(`missing id: ${e.title}`);
    else if (ids.has(e.id)) problems.push(`duplicate id: ${e.id}`);
    else ids.add(e.id);
    if (!e.title) problems.push(`missing title: ${where}`);
    if (!e.start || isNaN(new Date(e.start))) problems.push(`bad start: ${where}`);
    if (e.end && isNaN(new Date(e.end))) problems.push(`bad end: ${where}`);
    if (e.url && !/^https?:\/\//i.test(e.url)) problems.push(`non-http url: ${where}`);
    if (!['playgroup', 'library', 'swim', 'music'].includes(e.kind)) {
      problems.push(`unknown kind "${e.kind}": ${where}`);
    }
  }
  return problems;
}

async function main() {
  const previous = loadPrevious();
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + HORIZON);

  const collected = [];
  const quarantined = [];

  // ── Recurring rules ────────────────────────────────────────────────────
  // Pure computation, no network. If this throws, something is wrong with the
  // rules file itself and the run should stop outright.
  const { rules } = readJson('data/recurring.json');
  const recurring = expand(rules, today, horizon);
  collected.push(...recurring);
  log(`recurring    ${String(recurring.length).padStart(4)} events from ${rules.length} rules`);

  /* Hand-maintained schedules go stale. Rather than trusting anyone to
     remember a date, surface it: rules expiring within two weeks are reported
     every run, and the Action's failure email is the reminder. */
  const expiring = [];
  for (const r of rules) {
    if (!r.until) continue;
    const [uy, um, ud] = r.until.split('-').map(Number);
    const daysLeft = Math.round((new Date(uy, um - 1, ud) - today) / 86400000);
    if (daysLeft <= 14) expiring.push({ id: r.id, until: r.until, daysLeft });
  }
  if (expiring.length) {
    const soonest = Math.min(...expiring.map((e) => e.daysLeft));
    const venues = [...new Set(expiring.map((e) => e.id.split('-')[0]))].join(', ');
    log(`\n⚠  ${expiring.length} rule(s) expire in ${soonest} day(s): ${venues}`);
    log(`   After that they stop appearing. Update data/recurring.json.`);
    quarantined.push({
      source: 'recurring-rules',
      reason: `${expiring.length} rule(s) expire within ${soonest} day(s) (${venues}) — refresh the schedule and update the "until" dates in data/recurring.json.`,
    });
  }

  // ── Playgroups ─────────────────────────────────────────────────────────
  if (PARTIFUL_MODE === 'manual') {
    const manual = readJson('data/playgroups.json').events.map((e) => ({
      ...e, kind: 'playgroup', cultural: 'mandarin', source: 'manual',
    }));
    collected.push(...manual);
    log(`playgroups   ${String(manual.length).padStart(4)} events (manual mode)`);
  } else {
    try {
      const pg = await fetchPlaygroups({ log });
      collected.push(...pg);
      log(`playgroups   ${String(pg.length).padStart(4)} events from Partiful`);
    } catch (err) {
      quarantined.push({ source: 'partiful', reason: err.message });
      const carried = (previous?.events || []).filter(
        (e) => e.kind === 'playgroup' && new Date(e.start) >= today
      );
      if (carried.length) {
        collected.push(...carried);
        log(`playgroups   ${String(carried.length).padStart(4)} events CARRIED OVER — Partiful failed`);
      } else {
        const manual = readJson('data/playgroups.json').events
          .filter((e) => new Date(e.start) >= today)
          .map((e) => ({ ...e, kind: 'playgroup', cultural: 'mandarin', source: 'manual-fallback' }));
        collected.push(...manual);
        log(`playgroups   ${String(manual.length).padStart(4)} events from manual fallback — Partiful failed`);
      }
    }
  }

  // ── SFPL storytimes ────────────────────────────────────────────────────
  try {
    const sfpl = await fetchSfplEvents({ log });
    collected.push(...sfpl);
    log(`sfpl         ${String(sfpl.length).padStart(4)} events`);
  } catch (err) {
    quarantined.push({ source: 'sfpl', reason: err.message });
    const carried = (previous?.events || []).filter(
      (e) => e.source === 'sfpl' && new Date(e.start) >= today
    );
    collected.push(...carried);
    log(`sfpl         ${String(carried.length).padStart(4)} events CARRIED OVER — fetch failed`);
  }

  // ── Family swim ────────────────────────────────────────────────────────
  // Not implemented. SF Rec & Park publishes pool schedules as per-pool PDFs
  // in DocumentCenter, with document IDs that change on every repost and
  // validity windows as short as two weeks. There is no feed to read. The
  // realistic options are recurrence rules in data/recurring.json, reviewed
  // when schedules turn over, or nothing. Not a stub — deliberately absent.

  // ── Validate ───────────────────────────────────────────────────────────
  const problems = validate(collected);
  if (problems.length) {
    console.error('\nValidation failed — events.json NOT written:');
    for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
    if (problems.length > 20) console.error(`  …and ${problems.length - 20} more`);
    process.exit(1);
  }

  collected.sort((a, b) => new Date(a.start) - new Date(b.start));

  // ── Shrink guard ───────────────────────────────────────────────────────
  // A large drop usually means a source broke rather than a real schedule
  // change. Refuse to overwrite and let a human look.
  if (previous && previous.events.length > 0) {
    const ratio = collected.length / previous.events.length;
    if (ratio < 0.5) {
      console.error(
        `\nRefusing to write: event count fell from ${previous.events.length} to ` +
        `${collected.length} (${Math.round(ratio * 100)}%). That's a suspicious drop. ` +
        `Previous events.json left in place. Re-run with --force if the drop is real.`
      );
      if (!process.argv.includes('--force')) process.exit(1);
    }
  }

  const byKind = collected.reduce((a, e) => ({ ...a, [e.kind]: (a[e.kind] || 0) + 1 }), {});
  log(`\ntotal        ${collected.length} events through ${horizon.toISOString().slice(0, 10)}`);
  log(`by kind      ${Object.entries(byKind).map(([k, v]) => `${k}:${v}`).join('  ')}`);
  log(`linked       ${collected.filter((e) => e.url).length}/${collected.length}`);

  if (DRY) {
    log('\n--dry-run: nothing written.');
    return quarantined.length ? process.exit(1) : undefined;
  }

  writeFileSync(OUT, JSON.stringify({
    generated: new Date().toISOString(),
    note: 'Generated by scripts/generate-events.mjs — do not edit by hand. ' +
          'Edit data/recurring.json for recurring events; playgroups come from Partiful.',
    quarantined: quarantined.length ? quarantined : undefined,
    events: collected,
  }, null, 2) + '\n');
  log(`\nwrote ${OUT}`);

  // Pre-render the page so search engines see events as text, not as an empty
  // grid waiting on JavaScript.
  const PAGE = resolve(ROOT, 'calendar.html');
  if (existsSync(PAGE)) {
    let html = readFileSync(PAGE, 'utf8');
    html = injectBetween(html, 'EVENTS', renderList(collected, today, 21));
    html = injectBetween(html, 'JSONLD', renderJsonLd(collected, today, 60));
    writeFileSync(PAGE, html);
    log(`wrote ${PAGE}`);
  } else {
    log('calendar.html not found — skipped pre-render.');
  }

  if (quarantined.length) {
    console.error('\nSources quarantined this run (previous data carried over):');
    for (const q of quarantined) console.error(`  ${q.source}: ${q.reason}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nGenerator failed:', err.message);
  process.exit(1);
});
