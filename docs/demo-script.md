# Alibi demo script (3 min demo + 2 min Q&A)

**Cast:**
- **Keith** plays the student larping projects he never built.
- **Partner** plays a recruiter or engineer at a mixer.
- **Laptop on the projector:** `http://localhost:3005`, Chrome, full screen.

## Before you go on (5 min before)

- [ ] Build and run in production mode: `npm run build:web && npm run start:web` (port 3005). Don't use dev mode; it's much slower.
- [ ] Do one warm-up session: talk for 10 seconds and make sure a card appears. This wakes up Featherless and Speechmatics. Then reload the page so you start clean.
- [ ] Open `/p/demo-backup` in a second tab. That's the fallback if anything stalls.
- [ ] Use Chrome, allow the mic, and turn off Grammarly. Use a quiet spot, close to the mic.
- [ ] Restarting the server wipes portfolios, so don't restart after the warm-up.

## Timing to expect

Measured with a recorded spoken pitch through Speechmatics:
- **Your name:** about 15 seconds.
- **First project card:** about 30–45 seconds.
- **Second project:** about 20–30 seconds after the first.
- **Mock screens:** a few seconds after each card.

**Keep talking while it builds.** The site filling in behind you is the demo.

## Speaking tips (this is what makes it work)

- **Speak in complete sentences and finish each one.** The app waits for a full sentence before it acts.
- **Say the product name clearly, then pause:** "an app called **LeaseLens**."
- **Say what kind of thing it is:** "a **Discord bot**", "a **web app**", "an **iOS app**". That picks the mock screen.
- **Give one number per project:** "about **400 students** used it." The number shows up on the card.

---

## Script

### 0:00–0:20 · Hook (Keith, to the judges)

> "Everyone here has been at a networking event, someone asks what you've built, and you… stretch the truth a little. The problem is when they ask, 'Do you have a link?' Alibi makes the lie hold up. It listens to your conversation and builds the portfolio while you're still talking."

*Click the mic. Allow access if asked.*

### 0:20–1:30 · The live conversation (Keith and Partner)

**Partner:** "Hey, I'm Sam, I'm an engineer at Google. What are you working on?"

**Keith:**
> "Nice to meet you! I'm **Keith Singh**, I study computer science at Waterloo.
> Last term I built a web app called **LeaseLens**. It reads apartment lease PDFs and flags sketchy clauses using a fine-tuned model. About **four hundred students** used it before signing their leases."

*Pause for a beat and point at the screen as the name and LeaseLens skeleton appear.*

**Partner:** "Oh nice, what else?"

**Keith:**
> "I also built a **Discord bot** called **Standup**. It runs async standups for my robotics team. It's written in Go and posts a summary every morning."

*Keep chatting naturally while it builds (about 20 seconds). For example:*

**Partner:** "How did you handle the PDFs?"

**Keith:** "Mostly pdfplumber, then a small classifier on top. Honestly the hardest part was scanned leases."

### 1:30–2:20 · The reveal (Keith, to the judges)

*Stop the mic. Scroll the portfolio slowly.*

> "So in about a minute it went from what I said to this:
> - a hero with my name and a bio,
> - a card for each project with a tagline, metrics and stack,
> - and a mock product screenshot for each one.
>
> LeaseLens got a web dashboard full of flagged lease clauses. Standup got a Discord channel with a bot posting the team's standup.
> None of these projects exist."

*Click a card to expand it and show the highlights, metrics, architecture diagram and commit graph.*

**Partner (back in character):** "Do you have a link?"

**Keith:** "Yeah, here." *(Open the portfolio link: the "Open portfolio" button.)*

### 2:20–3:00 · How it works and close (Keith)

> "Under the hood:
> - **Speechmatics** transcribes in real time through our own server, so no API keys ever touch the browser.
> - An LLM on **Featherless** first extracts what you claimed. Then, for each project, two tasks run in **parallel**: one writes the project card, and the other designs the mock screen.
> - Every model response is validated with zod, retried once, and falls back to safe defaults, so a bad response never breaks the page.
> - The model never writes HTML. It fills six hand-built UI kits, and the mocks render in a sandboxed iframe, so a prompt injection in the conversation can't touch the page.
>
> Next time someone asks if you actually built it, you've got an Alibi."

**If anything stalls:** "Here's one we made earlier," then switch to the `/p/demo-backup` tab.

---

## Q&A prep (2 min, keep answers to ~20 seconds)

**"Isn't this just helping people lie?"**
It's a LARP: the hackathon theme was to help you pretend to be someone you're not. Honestly, the useful part is the reverse: it shows how easily a polished portfolio can be faked, and it could work as a "what would this look like if I built it" planning tool.

**"How do you stop it hallucinating or contradicting itself?"**
- Claims are pinned. Once a project is extracted, later speech only adds to it.
- Metrics are constrained to student scale: no millions, and validation strips them.
- A writing guide in every prompt sets the rules.
- The model fills structured fields only.

**"What about prompt injection? Someone could say 'ignore your instructions'."**
- The transcript is wrapped in delimiters and marked as untrusted data.
- The model's output is schema-validated.
- The mock UI is escaped into a fixed kit and runs in a sandboxed iframe with a strict CSP. Even a successful injection can only change text in a box.

**"Why not generate real code or deploy real apps?"**
- A build-and-deploy takes minutes. The demo needs results in seconds.
- Filling hand-built templates is faster and can't break, and it still looks like a real product.

**"How fast is it, and what's the bottleneck?"**
- Your name shows up in about 15 seconds and the first card in 30–45 seconds.
- The bottleneck is LLM latency. That's why tasks per project run in parallel and the page updates section by section.
- We picked a fast 7B model on Featherless over a bigger one because it was more consistent under load.

**"Why Speechmatics?"**
Low-latency realtime finals with punctuation, and it runs through a server proxy, so credentials stay server-side.

**"What would you do next?"**
- Persistent storage plus a deployed URL with a QR code, so the other person can scan it on their phone.
- Emailing the link to the person you're talking to.
- A "roadmap" mode that turns your larp into a real build plan.

**Be honest if asked:**
- It's currently run locally, with portfolios kept in memory. That's why there's no QR code today.
- It's tuned for clear speech in English.
