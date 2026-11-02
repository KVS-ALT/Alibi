# Alibi

We built this at LarpHacks 2026. The theme was "build something that helps you LARP as someone you're not."

You're at a networking event and someone asks what you've built. You make something up. Alibi listens to the conversation and builds a portfolio site for the projects you just invented, while you're still talking. By the time they ask for a link, there's one.

![Alibi demo](docs/images/demo.gif)

## How it works

- Speech is transcribed live with Speechmatics, which also tells the speakers apart. Whoever says "I built…" is the one larping, so only their claims end up on the site.
- An LLM (Qwen 2.5 7B on Featherless) pulls out your name and projects, then writes each project's card and fills in a fake product screenshot. Projects are built in parallel and show up on the page as soon as they're done.
- The screenshots aren't generated images. They're six hand-made UI layouts (dashboard, web app, phone app, terminal, Discord bot, browser extension) that the model fills with data, so they always look clean.

![Capture screen](docs/images/capture.png)

![Portfolio](docs/images/portfolio.png)

![Mock product screens](docs/images/kits.png)

## Running it

You need Node 20+ and API keys for [Featherless](https://featherless.ai) and [Speechmatics](https://www.speechmatics.com).

```bash
npm install
cp web/.env.example web/.env.local   # add your two API keys
npm run build:web
npm run start:web
```

Open http://localhost:3000 in Chrome, click the mic and start talking. Something like: "I'm John, I'm a CS student. Last term I built a web app called LeaseLens that flags sketchy clauses in lease PDFs…"

`/p/demo-backup` has a finished example portfolio, and `/preview` shows all the templates.

## Built with

Next.js, TypeScript, Tailwind, Speechmatics, Featherless, zod.

Made by [Keith Singh](https://github.com/KVS-ALT) and [GreenKeewi](https://github.com/GreenKeewi).
