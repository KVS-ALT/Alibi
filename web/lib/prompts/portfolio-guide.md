# Alibi portfolio writing guide

This guide is included in every generation prompt. It sets the standard the portfolio has to meet. The reference portfolio in `web/lib/fixtures.ts` ("Sam Rivera") is the quality bar. A senior engineer reading it should believe a real student built these projects.

## Names and identity

- **Person:** use the name exactly as the speaker said it. Never invent a surname. If no name was said, leave it empty. Do not use placeholders like "Alex" or "Your portfolio".
- **Handle:** lowercase first name plus surname or initial, letters only (for example `jmiller`, `samrivera`).
- **Project names:** keep the speaker's exact spelling and capitalization ("shipit", "StudyMatch"). Speech-to-text may split or merge words; join them back the way a product would be written ("study match" becomes "StudyMatch").
- **Unnamed projects:** if a project has no name, invent a short, brandable one-word name that fits the product (for example "Ledgerly" or "Repwise"). Never use descriptive labels like "Expense tracker app".
- **Separate projects:** only create one when the speaker clearly describes another thing they built. A feature ("it also sends alerts") belongs to the existing project.

## Hero

- **roles:** 2–3 short lowercase labels in the style "cs student", "builder", "ml + infra", "occasional designer". Use the school or company if it was said.
- **bio:** two sentences in the first person. Name the projects and what makes them notable, with specifics. Don't open with clichés like "passionate", "I build small, useful things" or "tech enthusiast".
  - Shape: one sentence naming what you build and who uses it, with one concrete number per project, then one sentence on what you care about. Write it fresh from this speaker's projects.
- **currently:** 2–3 short lowercase items, each concrete: "shipping shipit v2 with monorepo support", "ta for cs 136", "looking for summer 2027 swe internships". Never write "studying computer science" or "building apps".

## Project overview (one card per project)

- **platform:** what the product is. Choose one:
  - `web-app`: a consumer website or web app
  - `mobile-app`: iOS or Android. Only use this when the speaker said iOS, Android, iPhone, phone or mobile. Plain "app" means `web-app`.
  - `cli`: a command-line tool or library
  - `bot`: a Discord, Slack or Telegram bot
  - `extension`: a browser extension
  - `dev-tool`: a dashboard or internal tool for developers
  - `ml`: a model, data or ML platform
  - `hardware`
- **category:** 1–3 uppercase words that match the platform. Examples: `WEB APP`, `IOS APP`, `ANDROID APP`, `DISCORD BOT`, `CLI`, `CHROME EXTENSION`, `DEV TOOL`, `ML`, `IOS · ML`, `HARDWARE`. A web tool is never `IOS APP`.
- **year:** the year it was built. "Last term" or "this summer" means the current year, or the previous one if that season hasn't happened yet this year. Never a year before 2020.
- **tagline:** one line, at most 12 words, saying what it does for whom. No period needed. Don't start with the product name.
  - Good: "Zero-config deploys and branch previews for student club websites."
- **summary:** 2–3 sentences: the problem, then how it works technically, then the result. Mention concrete technologies where they matter.
- **highlights:** exactly 3 engineering bullets, each starting with a past-tense verb and naming a specific technique or library.
  - Good: "Docker layer cache keyed on the lockfile hash cut the median build from 90s to 41s."
  - Bad: "Used AI to analyze documents."
- **metrics:** exactly 3, at student-project scale, with short values ("412", "1.4s", "0.87", "38ms", "6 clubs"). Prefer one adoption metric, one performance metric and one quality metric. Use numbers the speaker said exactly. Never use millions, revenue, or numbers above about 10k users.
- **stack:** 4–6 real technologies that fit the platform. iOS means Swift/SwiftUI; a Discord bot means discord.js, discord.py or DiscordGo; ML means PyTorch or Hugging Face.
- **award:** only if the speaker mentioned one.
- **diagramMermaid:** a `flowchart LR` with 4–6 nodes, using short ids and `[Label]` text. No styling.

## Mock screen (the product UI shown on the card)

- It shows the product's core feature in action, mid-use, with realistic data: real-looking names, course codes, addresses, timestamps, file names and statuses specific to this product. Never use "Item 1", "Lorem" or "Example".
- It matches the platform: a phone app looks like a phone screen, a bot looks like a chat, a CLI looks like a terminal.
- Keep text short so it fits. Use one accent color that suits the product's mood (finance → emerald, food → orange, social → violet or rose, dev tools → sky or indigo).

## Tone

The portfolio reads like a capable student wrote it about their own work: specific, modest and technical. No marketing language ("revolutionary", "seamless", "cutting-edge"). Stay consistent: the same numbers in the summary, the metrics and the mock.

Examples in this guide describe other people's projects. Use them for style only; never copy their names, numbers or wording.
