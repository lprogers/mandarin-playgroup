/**
 * Worker entry point for mandarinplaygroup.com.
 *
 * Two jobs:
 *
 *  1. POST /api/ask — natural-language search over the calendar, answered
 *     by Claude Haiku. This is the one thing on the site that costs real
 *     money per use, so it is hard-capped: once actual Anthropic spend for
 *     the current calendar month reaches MONTHLY_BUDGET_USD, every further
 *     request short-circuits to a friendly "try again next month" message
 *     *before* calling the API — so the cap holds even under a traffic
 *     spike (bots, a sudden wave of visitors, etc.), not just under normal
 *     use. A light per-IP daily count on top of that stops a single
 *     visitor (or script) from burning the whole month's budget alone.
 *
 *     Two simplifications worth knowing about, both fine at this site's
 *     traffic level:
 *       - Cloudflare KV is eventually consistent (writes can take up to
 *         ~60s to show up at every edge location) and this does a plain
 *         read-then-write rather than an atomic increment, so under truly
 *         concurrent requests the count could lag slightly. At a handful
 *         of requests a day this never matters in practice.
 *       - The budget check happens *before* each call, using the running
 *         total from before that call. So actual spend can overshoot
 *         MONTHLY_BUDGET_USD by up to the cost of one query (~1 cent) —
 *         it stops AT the cap, not one query short of it.
 *
 *  2. Everything else — served as-is from the static site (env.ASSETS),
 *     completely unchanged from before this file existed.
 *
 * Requires, set up once in the Cloudflare dashboard (see SETUP.md):
 *   - ANTHROPIC_API_KEY   — Worker secret. NOTE: this is separate from the
 *                           GitHub Actions secret of the same name used by
 *                           refresh-calendar.yml — that one lives in GitHub
 *                           and is invisible to this Worker. Same key value
 *                           is fine, but it has to be added again, here.
 *   - ASK_BUDGET          — KV namespace binding, used for both the budget
 *                           counter and the per-IP daily counter.
 */

const MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// --- Cost controls. Tune these here if the budget or limits ever change. ---
const MONTHLY_BUDGET_USD = 3.0;
// Claude Haiku 4.5 published API rate, Sept 2026: $1/MTok in, $5/MTok out.
// If Anthropic's pricing changes, update these two lines.
const INPUT_PRICE_PER_MTOK = 1.0;
const OUTPUT_PRICE_PER_MTOK = 5.0;
const MAX_OUTPUT_TOKENS = 300;
// Only send events in this forward window — keeps the prompt (and so the
// cost) roughly constant as the calendar accumulates more months of data,
// and matches what "this weekend / this month / next week" questions
// actually need.
const MAX_EVENTS_WINDOW_DAYS = 45;
const MAX_EVENTS_SENT = 140;
// Generous for a real parent asking a few questions, tight enough that a
// single visitor can't eat the whole month's budget alone.
const PER_IP_DAILY_CAP = 8;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ask") {
      if (request.method !== "POST") {
        return json({ ok: false, note: "Method not allowed." }, 405);
      }
      try {
        return await handleAsk(request, env, ctx, url);
      } catch (err) {
        return json(
          { ok: false, note: "Something went wrong on our end — try again in a moment." },
          200
        );
      }
    }

    return env.ASSETS.fetch(request);
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" },
  });
}

function monthKey(d) {
  return "budget:" + d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}

async function handleAsk(request, env, ctx, url) {
  if (!env.ASK_BUDGET) {
    // KV binding not wired up yet — fail closed with a clear message
    // rather than silently skipping the budget cap.
    return json({ ok: false, note: "This feature isn't fully set up yet — check back soon." });
  }
  if (!env.ANTHROPIC_API_KEY) {
    return json({ ok: false, note: "This feature isn't fully set up yet — check back soon." });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, note: "Ask me something first!" });
  }
  const query = (body && typeof body.query === "string" ? body.query : "").trim().slice(0, 300);
  if (!query) return json({ ok: false, note: "Ask me something first!" });

  const now = new Date();
  const mKey = monthKey(now);
  const spent = parseFloat((await env.ASK_BUDGET.get(mKey)) || "0");
  if (spent >= MONTHLY_BUDGET_USD) {
    return json({
      ok: false,
      limited: true,
      note:
        "This feature has reached its usage budget for this month — it resets on the 1st. The calendar below is always up to date in the meantime.",
    });
  }

  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
  const dKey = "rl:" + ip + ":" + now.toISOString().slice(0, 10);
  const ipCount = parseInt((await env.ASK_BUDGET.get(dKey)) || "0", 10);
  if (ipCount >= PER_IP_DAILY_CAP) {
    return json({
      ok: false,
      limited: true,
      note: "You've hit today's limit for this feature (resets tomorrow) — the calendar below still works as usual.",
    });
  }

  const eventsRes = await env.ASSETS.fetch(new URL("/events.json", url).toString());
  if (!eventsRes.ok) {
    return json({ ok: false, note: "Couldn't load the calendar data — try again in a moment." });
  }
  const rawData = await eventsRes.json();
  const list = Array.isArray(rawData) ? rawData : rawData.events || [];

  const nowMs = now.getTime();
  const windowMs = MAX_EVENTS_WINDOW_DAYS * 86400000;
  const upcoming = list
    .filter((e) => {
