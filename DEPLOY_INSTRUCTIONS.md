# Making Mandarin Playgroup agent-discoverable — deploy guide

Five files, in order of effort (low → high):

## 1. `robots.txt` → site root

Drop this at the root of your static output (same folder as `favicon.ico` — for most static-site setups that's a `public/` or `static/` folder that gets published as-is). After deploy it must be reachable at:
`https://www.mandarinplaygroup.com/robots.txt`

Currently that URL falls through to your homepage, which means there's no file there yet — this will be new, not an overwrite. If you later add an XML sitemap, uncomment the `Sitemap:` line at the bottom and point it there.

## 2. `llms.txt` → site root

Same folder as `robots.txt`. After deploy:
`https://www.mandarinplaygroup.com/llms.txt`

I used only URLs I confirmed are real on your live site right now (`/calendar` is a distinct page; `/#events`, `/#newsletter`, `/#about`, `/#contact` are anchors on the homepage — your nav already uses these). If you rename any of these sections, update this file to match.

## 3. `organization.jsonld.html` → shared `<head>`

This is a one-time, sitewide addition — paste the `<script type="application/ld+json">` block into your shared layout's `<head>` (or just the homepage `<head>` if you don't have a shared layout) so it's present on every page. **Fill in the `logo` field with a real hosted image URL first**, or delete that line entirely — a broken logo URL is worse than no logo field.

## 4. `event-jsonld-example.html` → `/calendar` page (manual, to start)

Paste this `<script>` block into the `/calendar` page to validate the approach end-to-end before automating it (see step 5). It's a real, filled-in example for the Sept 5 West Portal event — update or replace it once you've validated, since it will go stale as soon as that event passes.

## 5. `generate-event-jsonld.js` → wire into your existing refresh job

This is the real fix, and it's a natural extension of what you've already built: your calendar refresh already runs twice a day and already has structured event data (title, time, location, source) for everything it aggregates — it just isn't exposed as JSON-LD yet. `toCalendarPageJsonLd()` takes that same event list and returns one `@graph` object covering every event currently on the page; stringify it into a single `<script type="application/ld+json">` tag that gets regenerated on each refresh, same as the visible list.

Two field-mapping details worth getting right:
- `organizerName` should be **"Mandarin Playgroup"** only for your own events — for aggregated events (SF Rec & Park, Chase Center, Salesforce Park, etc.) use their real name, so agents attribute correctly rather than crediting you for someone else's event.
- `rsvpUrl` is the Partiful link for your events, or the source page for aggregated ones.

## Verifying after deploy

1. Load `https://www.mandarinplaygroup.com/robots.txt` and `/llms.txt` directly in a browser — both should show plain text, not your homepage.
2. Run the homepage and `/calendar` page through Google's Rich Results Test (`search.google.com/test/rich-results`) or the schema.org validator (`validator.schema.org`) — paste the live URL in and confirm the Organization and Event objects are detected with no errors.
3. Optional gut-check: ask an AI assistant with web access something like "what Mandarin-language kids events are happening in San Francisco this week" and see whether Mandarin Playgroup surfaces with correct details.

## For the resume

Once this is actually live (not before), this becomes a true, specific bullet for the AI-Native Product Building section — e.g. *"Implemented agent-discoverability standards (llms.txt, schema.org Event/Organization structured data) so AI assistants and local-events crawlers can directly find, cite, and promote Mandarin Playgroup's events."* That's a much stronger, more direct match to this Cloudflare team's actual work than the search-ranking detail was — happy to fold it into the tailored resume as soon as it's shipped.
