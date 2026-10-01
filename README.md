# Mandarin PlayGroup 

**A community platform connecting 140+ Bay Area families so kids can hear and use Mandarin naturally through play.**

Live at [mandarinplaygroup.com](https://mandarinplaygroup.com/)

Where families connect and kids hear Mandarin naturally. All levels welcome, from inspired to learn, to learning, to fluent.

Built from 0→1 by **[Leeyen Rogers](https://www.linkedin.com/in/leeyenrogers/)**, an AI-native Senior Technical Product Manager.

---

## The problem

Many bilingual families want their children to develop stronger Mandarin skills, but creating natural opportunities to use Mandarin can be challenging.

When bilingual children meet at playgrounds or social settings, they typically default to English. While children may understand Mandarin, they have fewer opportunities to actively practice speaking it with peers.

Mandarin Playgroup takes a community-first approach: **create more opportunities for children to experience and use Mandarin through play, connection, and community.**

The goal is not structured language instruction. It is to create environments where children are encouraged to speak Mandarin with each other, helping them:

- Build confidence using Mandarin naturally
- Strengthen their spoken language skills
- Develop positive associations with the language

The long-term vision is to build the infrastructure that helps families create **Mandarin-speaking communities wherever they live.**

---

## From idea to community

I started Mandarin Playgroup because I was looking for weekend opportunities for my son to hear and speak Mandarin with other kids. I couldn't find what I was looking for, so I built it. 

As the community grew, I looked for ways to expand what families could experience together. A community member hosted a Mandarin storytime, and I partnered with Music Together to bring its first Mandarin music class to our community - creating additional opportunities for families to experience Mandarin together beyond the playground.

The community grew to **140+ Bay Area families**, with playdates and activities across San Francisco, the East Bay, the Peninsula, and the South Bay.

That initial community became the foundation for a broader product: helping families not only **find each other**, but also **find things to do together.**

---

## Product evolution

### 1. Start with the community

The initial product focused on the simplest way to solve the core problem: help families find one another and make it easy to participate.

The platform:

- Introduces the community's mission and value proposition
- Helps families discover upcoming Mandarin playdates
- Connects families to event RSVP pages
- Captures interest through a newsletter and signup flow
- Organizes the community geographically so families can find relevant local groups
- Creates a channel for partnerships with organizations that can provide value to bilingual families

### 2. Solve the discovery problem

As the community grew, another problem became apparent: **families still had to search multiple places to figure out what to do with their kids.**

Busy parents shouldn't have to visit different library websites, park pages, community calendars, and email newsletters just to answer:

> "What's happening with kids this weekend?"

I expanded the product into a unified **Bay Area family activity calendar**, aggregating relevant activities alongside Mandarin Playgroup events.

The calendar includes:

- Library storytimes
- Outdoor music
- Family swim
- Playgroups
- Cultural events
- Mandarin-language activities
- Other family-friendly programming

It currently aggregates **70+ events from 10+ sources** and refreshes automatically twice a day.

The goal isn't simply to aggregate event listings. It is to **turn fragmented information into something parents can actually use.**

For example, San Francisco's public pool information included family swim hours in a PDF rather than an easy-to-use calendar. I transformed that information into structured events so parents could discover heated family swim at North Beach Pool alongside other family activities.

### 3. Make discovery conversational

Traditional filters assume parents already know what they are looking for.

Parents often don't.

**Ask the Calendar** lets families ask questions in plain language—or use voice input—to find relevant activities.

For example:

> "What's happening this Saturday morning in the East Bay?"

The assistant retrieves relevant events from the Mandarin Playgroup calendar and presents them in a conversational response.

It is built with **Claude Haiku** and uses forced tool-calling to retrieve current calendar data before generating an answer.

This creates an important product principle:

**The AI should answer from the product's data, not invent an answer from its own knowledge.**

That matters particularly for event discovery. If a parent gets in the car with a toddler and arrives at an event that was cancelled, moved, or never existed, the product loses trust.

Grounding responses in current event data minimizes that failure mode.

---

## Automate the work behind the product

Event discovery is an ongoing problem. Mandarin and Chinese cultural events are scattered across many organizations, so manually researching and entering them would quickly become a bottleneck.

I built an **LLM-powered event discovery agent** that autonomously searches for relevant Mandarin and Chinese cultural events, evaluates them against defined criteria, validates the information, and publishes qualified events to the calendar.

### Automated workflow

**Discover → Evaluate → Validate → Publish**

The agent:

- Searches multiple sources for relevant events
- Identifies and extracts event information
- Evaluates candidates against relevance and quality criteria
- Validates event details
- Publishes qualified events directly to the calendar
- Runs automatically on a recurring schedule

There is no recurring manual research step. The product's rules and validation logic encode the quality bar that the automated workflow needs to meet.

This turns event discovery from a recurring operational task into a **scalable product capability.**

---

## Make the product discoverable to AI

As people increasingly use AI assistants to discover information, simply being indexed by traditional search engines is not enough.

I added an AI discoverability layer including:

- `llms.txt` describing the site and its content
- Explicit AI crawler access
- `schema.org` structured data
- Clear, machine-readable event information

The goal is to make Mandarin Playgroup **findable, understandable, and citable by AI systems**, not just indexed by traditional search.

The product has also achieved the **#1 Google result across branded and high-intent searches** including but not limited to:

- "mandarin playgroup"
- "mandarin playgroup san francisco"
- "mandarin playgroup bay area"
- "mandarin playgroup peninsula"
- "mandarin playgroup south bay"
- "mandarin families community sf"

---

## Product decisions

### The community will always be free for families

The mission is to make Mandarin exposure more accessible and remove financial barriers for families who want to create bilingual environments for their children.

Future monetization is designed around **value creation for the community**, such as family discounts, educational resources, relevant partnerships, and experiences that support bilingual development—not monetizing family data or attention.

### Choose reliability over unnecessary integrations

For event RSVPs, I considered integrating directly with Partiful. Partiful does not provide an official public API, while reverse-engineered approaches depend on undocumented endpoints and expiring authentication tokens.

The community runs a relatively small number of playdates each month, so manually curating event cards takes roughly **30 seconds per event** and avoids an integration that could break.

RSVPs remain on Partiful, where guest lists and text reminders already provide useful social and operational functionality.

**Decision:** accept a small amount of manual work where it is cheaper and more reliable than building and maintaining an integration.

### Add friction where it protects the community

Signup is intentionally not fully automated.

A few additional fields plus manual review of submissions help mitigate spam and maintain community quality before sending a WhatsApp invitation.

At the current scale, review takes roughly a minute per submission. Full automation is technically straightforward, but the product does not need it yet.

**Decision:** don't automate a workflow simply because it can be automated. Automate when the operational cost justifies it.

### Use a lightweight backend

The site uses a custom-styled form that posts directly to JotForm's submission endpoint rather than embedding a third-party form.

JotForm handles:

- Submission storage
- Email notifications
- Autoresponders
- Subscriber lists
- Google Sheets synchronization

This provides the operational functionality needed without introducing a custom backend.

### Keep infrastructure inexpensive

The core site is a static single-page application with no framework, build step, or server.

It runs on Cloudflare Pages, with the domain and email routing also handled by Cloudflare.

The original product ran at approximately **$11/year—the cost of domain registration.**

As AI capabilities were added, I also introduced explicit **AI call and spending caps** so usage costs remain predictable while validating demand.

The broader principle is simple:

**Use the simplest infrastructure that can reliably solve the problem, and scale complexity only when the product earns it.**

---

## AI-native product development

AI is part of the product in two distinct ways.

### AI as a development multiplier

I used **Claude Code** and GitHub to accelerate prototyping, implementation, debugging, and iteration.

This made it possible to move from idea to shipped product quickly without building a large engineering stack.

### AI as a product capability

I then incorporated AI directly into the product:

- Conversational calendar search
- Voice-enabled event discovery
- Autonomous Mandarin event discovery
- AI-grounded responses using live product data
- AI-oriented content and structured data for discoverability

The distinction matters:

**AI wasn't just used to build the product faster. It became part of the product's value proposition and operating model.**

---

## Traction

- **140+ Bay Area families** joined within two months of launch
- **#1 Google result across branded and high-intent searches** for queries including "mandarin playgroup," "mandarin playgroup san francisco," "mandarin playgroup bay area," "mandarin playgroup peninsula," "mandarin playgroup south bay," and "mandarin families community sf"
- **70+ family events** aggregated from **10+ sources**
- Calendar data refreshed automatically **twice daily**
- Recurring community-led playdates across **San Francisco, East Bay, Peninsula, and South Bay**

---

## Product principles

### Start with the user problem

Technology is secondary to the problem being solved. Each feature exists to reduce a specific source of friction: finding people, finding activities, or deciding what to do.

### AI where it creates leverage

AI should either make the product significantly better or make the operation significantly more scalable. It shouldn't be added simply because it is available.

### Ground AI in real data

When accuracy matters, retrieve current product data rather than relying on model knowledge alone.

### Automate the workflow, not the sake of automation

Automation should remove meaningful recurring work. If a manual step is cheaper, more reliable, and doesn't yet create meaningful operational drag, keep it manual.

### Keep the product simple

A lightweight technical architecture makes it possible to iterate quickly, keep costs low, and avoid premature complexity.

### Build for the community, not around it

The community is the product's purpose. Growth and monetization should reinforce the value delivered to families.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Hosting / CI/CD | Cloudflare Pages, GitHub |
| AI | Claude Haiku, Anthropic API |
| AI development | Claude Code |
| Forms / automation | JotForm |
| Events / RSVPs | Partiful |
| Domain / email routing | Cloudflare |
| Structured data | Schema.org |

---

## Roadmap

### Expand local family discovery

Continue expanding the activity calendar and make it easier for parents to discover kid-friendly events, activities, and experiences based on location, timing, and interests.

### Grow the community

Make it easier for families to discover and initiate community-led playdates, while expanding coverage across the Bay Area.

### Build partnerships

Partner with brands, schools, venues, and organizations that can provide meaningful value to bilingual families through resources, discounts, programming, and experiences.

### Scale the underlying model

The long-term vision is not simply a larger playgroup.

It is to build **infrastructure that helps families create Mandarin-speaking communities wherever they live.**

---

## About

**Mandarin Playgroup was founded, designed, built, and launched end-to-end by [Leeyen Rogers](https://www.linkedin.com/in/leeyenrogers/), an AI-native Senior Technical Product Manager.**

The project demonstrates a modern **0→1 product workflow**:

**Identify a real user problem → define the product thesis → validate demand → ship quickly → learn from real users → incorporate AI where it creates leverage → automate recurring work → iterate**

The project combines customer insight, product strategy, AI-native development, lightweight technical architecture, automation, and community growth to move from an idea to a shipped product with real users.

Interested in partnering or bringing Mandarin programming to the community?

Reach out at [hello@mandarinplaygroup.com](mailto:hello@mandarinplaygroup.com).
Interested in partnering or bringing Mandarin programming to the community? Reach out: hello@mandarinplaygroup.com
