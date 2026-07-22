# Mandarin PlayGroup (San Francisco)

Platform for a rapidly growing, 60+ family Mandarin playgroup community in San Francisco. Live at [mandarinplaygroup.com](https://mandarinplaygroup.com).

Where families connect and kids hear Mandarin naturally. All levels welcome, from inspired to learn, to learning, to fluent.

## The problem

Many bilingual families want their children to develop stronger Mandarin skills, but creating natural opportunities to use Mandarin can be challenging.

When bilingual children meet at playgrounds or social settings, they often default to speaking English — the language they use most frequently in their daily lives. While children may understand Mandarin, they have fewer opportunities to actively practice speaking it with peers.

Mandarin Playgroup creates environments where children are encouraged to speak Mandarin with each other through play, helping them:

- Build confidence using Mandarin naturally
- Strengthen their spoken language skills
- Develop positive associations with the language

The goal is not structured language instruction — it is creating opportunities for children to experience Mandarin through play, connection, and community.

## What it does

- Introduces Mandarin Playgroup’s mission, positioning, and community value proposition
- Helps families discover upcoming Mandarin playdates and community events
- Captures parent interest through a newsletter signup powered by Jotform, which manages submissions, automated responses, and subscriber lists
- Connects families directly to event RSVP pages for seamless registration
- Creates a channel for brand and venue partnerships that provide meaningful value to bilingual families
- Establishes the foundation for future tools that help parents discover local Mandarin-friendly events and kid-focused activities

## Key decisions

**Keep the community free for families.**
The mission is to make Mandarin exposure more accessible and remove barriers for families who want to create bilingual environments for their children.

Future monetization will only come from partnerships that provide meaningful value to the community, such as family discounts, educational resources, or experiences that support bilingual development.

**Manual event curation instead of a Partiful integration.** Partiful has no official public API. Reverse-engineered workarounds exist but depend on auth tokens that expire and undocumented endpoints that break. Since the group runs a small number of events per month, curating event cards by hand costs about 30 seconds per event and never breaks. RSVPs stay on Partiful, where the social proof (guest lists, text reminders) already works.

**Email-only signup.** Every added form field cuts conversion, and the site's job is to make joining as light as possible which is important for this early-stage platform.

**JotForm as the form backend.** The site keeps its own custom-styled form and posts to JotForm's submit endpoint, so there is no iframe seam and no third-party styling to fight. JotForm provides the submission inbox, email notifications, autoresponder, and Google Sheets sync without any backend code.

**Static single-page site on free infrastructure.** No framework, no build step, no server. The entire site is one HTML file served by Cloudflare Pages, with the domain and email routing also on Cloudflare. Total running cost is the domain registration (about $11/year).

## Stack

- Single static HTML page (vanilla HTML/CSS/JS, no dependencies beyond Google Fonts)
- Cloudflare Registrar (domain) + Cloudflare Pages (hosting, auto-deploys from this repo)
- Cloudflare Email Routing (hello@mandarinplaygroup.com forwards to a managed inbox)
- JotForm (newsletter signups, autoresponder, list storage)
- Partiful (event pages and RSVPs)

## Roadmap

- Local family activity discovery — helping parents find kid-friendly events, activities, and experiences in their area
- Partnerships with brands and organizations — creating value for bilingual families through relevant resources, discounts, and experiences

The long-term vision is to build the infrastructure that helps families create Mandarin-speaking communities wherever they live.
  
## About

Built and maintained by [Leeyen Rogers](https://www.linkedin.com/in/leeyenrogers), founder of Mandarin Playgroup (San Francisco) and an AI-Native Senior Technical Product Manager.

Designed, built, and launched using AI-assisted product development workflows, including Claude Code and GitHub to accelerate prototyping and implementation, Jotform to quickly create and validate user flows, and Cloudflare infrastructure to support reliable web delivery, security, and domain management.

This project reflects a modern product approach: combining customer insight, product strategy, and AI-powered execution to move from idea to shipped product faster.

Interested in partnering or bringing Mandarin programming to the community? Reach out: hello@mandarinplaygroup.com
