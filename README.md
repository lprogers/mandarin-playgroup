# Mandarin PlayGroup (San Francisco)

Community website for a 60+ family Mandarin playgroup in San Francisco. Live at [mandarinplaygroup.com](https://mandarinplaygroup.com).

Rotating playground meetups around the city so little ones can play together while they chat in Mandarin. All levels welcome, from inspired to learn, to learning, to fluent.

## The problem

The community ran entirely on closed channels: a WhatsApp group (invite-gated, with admin approval as an anti-spam measure) and Partiful event pages (shared link by link). That works for existing members but there was no open front door. A parent who heard about the group at a playground, or searched "Mandarin playgroup San Francisco," had no way to find us or express interest without already knowing someone.

The website solves the top of the funnel: an open, zero-commitment way to discover the group and sign up for updates, feeding the committed community layers (newsletter, then WhatsApp, then playdates).

## What it does

- Presents the group, its positioning, and upcoming playdates on a fast single page
- Newsletter signup that submits directly to a JotForm form, which handles the inbox, autoresponder, and list storage
- Links each playdate to its Partiful event page for RSVPs
- Teases the special events tier (Mandarin-speaking toddler entertainers, story time, holiday celebrations) planned as the community grows
- Provides a partnership contact for brands and venues

## Key decisions

**Manual event curation instead of a Partiful integration.** Partiful has no official public API. Reverse-engineered workarounds exist but depend on auth tokens that expire and undocumented endpoints that break. Since the group runs a small number of events per month, curating event cards by hand costs about 30 seconds per event and never breaks. RSVPs stay on Partiful, where the social proof (guest lists, text reminders) already works.

**Email-only signup.** Every added form field cuts conversion, and the site's job is to make joining as light as possible. Richer member data (kid ages, neighborhoods, Mandarin level) is collected later through a separate member intro form, once someone has already joined and the ask feels natural.

**JotForm as the form backend.** The site keeps its own custom-styled form and posts to JotForm's submit endpoint, so there is no iframe seam and no third-party styling to fight. JotForm provides the submission inbox, email notifications, autoresponder, and Google Sheets sync without any backend code.

**Static single-page site on free infrastructure.** No framework, no build step, no server. The entire site is one HTML file served by Cloudflare Pages, with the domain and email routing also on Cloudflare. Total running cost is the domain registration (about $11/year).

## Stack

- Single static HTML page (vanilla HTML/CSS/JS, no dependencies beyond Google Fonts)
- Cloudflare Registrar (domain) + Cloudflare Pages (hosting, auto-deploys from this repo)
- Cloudflare Email Routing (hello@mandarinplaygroup.com forwards to a managed inbox)
- JotForm (newsletter signups, autoresponder, list storage)
- Partiful (event pages and RSVPs)

## Updating events

Event cards live in `index.html` in the `#events` section. To add a playdate: duplicate a card, update the date badge, title, location, time, description, and the Partiful RSVP link, then push. Cloudflare Pages deploys automatically.

Planned refactor: move events into an `events.json` file rendered by the page, so updates are a data change rather than a markup edit.

## Roadmap

- Photo gallery from past meetups (with parent consent) for recruitment and partner conversations
- Member intro form for planning meetups by age range and neighborhood
- Special events with capped RSVPs
- Playground guides for the spots the group has actually visited, as long-tail local content

## About

Built and maintained by [Leeyen Rogers](https://www.linkedin.com/in/leeyenrogers), organizer of Mandarin PlayGroup (San Francisco) and a senior product manager. Developed iteratively with Claude, from design direction through the JotForm submit integration.

Interested in partnering or bringing Mandarin programming to the community? Reach out: hello@mandarinplaygroup.com
