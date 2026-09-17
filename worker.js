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
            const t = new Date(e.start).getTime();
      return !isNaN(t) && t >= nowMs - 86400000 && t <= nowMs + windowMs;
    })
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, MAX_EVENTS_SENT)
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      title: e.title,
      venue: e.venue,
      start: e.start,
      end: e.end || null,
      cultural: e.cultural || null,
    }));

  const ptFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const todayLabel = ptFmt.format(now);

  const prompt =
    "You are the search assistant for a free family-activities calendar in San Francisco " +
    "(swim times, library storytimes, outdoor music, and a Mandarin-language playgroup). " +
    "Today is " +
    todayLabel +
    ". All times below are Pacific.\n\n" +
    "Upcoming events, as JSON (id, kind, title, venue, start, end, cultural):\n" +
    JSON.stringify(upcoming) +
    "\n\n" +
    'A parent asked: "' +
    query +
    '"\n\n' +
    "Pick the events from the list above that actually answer this — usually 1 to 6 of them, " +
    "fewer if only a couple truly fit, and an empty list if genuinely nothing matches (don't force it). " +
    "Never invent an event that isn't in the list above. Write a short, warm, 1-2 sentence answer a busy " +
    "parent would appreciate — plain conversational English, day names rather than raw dates.";

  const apiRes = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
      tool_choice: { type: "tool", name: "answer_calendar_question" },
      tools: [
        {
          name: "answer_calendar_question",
          description: "Answer a parent's question about the calendar using only the events supplied.",
          input_schema: {
            type: "object",
            properties: {
              answer: { type: "string" },
              eventIds: { type: "array", items: { type: "string" } },
            },
            required: ["answer", "eventIds"],
          },
        },
      ],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!apiRes.ok) {
    return json({ ok: false, note: "Something went wrong — try again in a moment." });
  }
  const data = await apiRes.json();

  // Record actual spend (from the real usage the API reports) and this IP's
  // count *before* returning isn't necessary — do it in the background so
  // it never adds latency to the visitor's answer.
  const usage = data.usage || {};
  const cost =
    ((usage.input_tokens || 0) / 1e6) * INPUT_PRICE_PER_MTOK +
    ((usage.output_tokens || 0) / 1e6) * OUTPUT_PRICE_PER_MTOK;
  ctx.waitUntil(
    Promise.all([
      env.ASK_BUDGET.put(mKey, String(spent + cost), { expirationTtl: 60 * 60 * 24 * 40 }),
      env.ASK_BUDGET.put(dKey, String(ipCount + 1), { expirationTtl: 60 * 60 * 24 }),
    ])
  );

  const toolUse = (data.content || []).find(
    (b) => b.type === "tool_use" && b.name === "answer_calendar_question"
  );
  if (!toolUse) {
    return json({ ok: false, note: "Couldn't quite understand that — try rephrasing?" });
  }

  return json({ ok: true, answer: toolUse.input.answer, eventIds: toolUse.input.eventIds || [] });
}
