---
name: desloper
description: Score how generic and AI-made a landing page or README looks, against eight design principles, then fix it in the current codebase. `/desloper readme` does the README of the current repo. Renders the page in a headless browser at 1440px and 390px (localhost dev servers included), runs deterministic detectors, has you act as the judge, and builds a fix prompt that you then apply to the repo. Use whenever the user wants to deslop, de-AI, audit, critique, score, review or "make less generic" a landing page, homepage, marketing page, hero section or README, asks "does this look AI-generated?", or mentions Desloper or a slop score, in any repo.
---

# Desloper

Desloper reads a landing page and scores it from 0 (specific, hand-made) to
100 (indistinguishable from a template), against the eight principles in its
doctrine. The web app uses a model judge. Here, you are the judge, and because
you are already in the page's codebase, you also apply the fix.

The CLI lives in the Desloper repo, two levels up from this skill's real path:

```bash
DESLOPER="$(cd "$(dirname "$(readlink -f ~/.claude/skills/desloper/SKILL.md)")/../.." && pwd)/bin/desloper"
"$DESLOPER" --help
```

If it fails with a missing module or browser, set it up once in that repo:
`yarn` then `npx playwright install chromium`.

If the argument is `readme`, or a Markdown file, or the user asks about a
README, follow "README mode" at the end instead of steps 1 to 5.

## 1. Find the page

- Use the URL the user gave. Bare hosts work (`localhost:3000`, `example.com`).
- Otherwise analyze the current repo's landing page on its running dev server,
  usually `http://localhost:3000`. Check it answers with
  `curl -sI http://localhost:3000`. Do not start a dev server; if nothing
  answers, ask the user to start it or give a URL.
- A static `.html` file also works, but it renders without JavaScript and
  without local CSS or images, so prefer the dev server.
- Find the files that render that route (for example `app/page.tsx`,
  `src/pages/index.astro`, `index.html`). You will edit them in step 5.

## 2. Analyze

```bash
"$DESLOPER" analyze http://localhost:3000
```

It prints a detector-only score, the metrics and every finding with its id,
then the run directory (under the system temp dir; pass `--out <dir>` to pick
one). The run directory holds:

- `mobile-first.png`, `desktop-first.png`: the first screen at 390px and 1440px.
- `mobile.jpg|png`, `desktop.jpg|png`: full-page screenshots.
- `context.md`: what the model judge would see (first-screen text, headings,
  fonts, colors, CTAs, detector findings, page text).
- `page.txt`: the visible text, the only valid source of quotes.

If the user only wants a quick score, stop here and report it, noting that it
is detectors only.

## 3. Judge

Do the five-second test first, before reading any page text: look only at
`mobile-first.png` and answer what it is, who it is for and what to do next,
in under 20 words each, from what is visible. Write "Unclear: ..." when it is.

Then read the doctrine (`"$DESLOPER" doctrine`), `context.md` and the
screenshots, and write `judgement.json` in the run directory:

```json
{
  "tenetScores": {
    "pain": { "slop": 80, "reason": "One sentence." },
    "show": { "slop": 0, "reason": "" },
    "action": { "slop": 0, "reason": "" },
    "specificity": { "slop": 0, "reason": "" },
    "voice": { "slop": 0, "reason": "" },
    "economy": { "slop": 0, "reason": "" },
    "identity": { "slop": 0, "reason": "" },
    "speed": { "slop": 0, "reason": "" }
  },
  "findings": [
    {
      "tenet": "specificity",
      "severity": "high",
      "title": "Short and specific, under 70 characters",
      "detail": "One plain sentence on why this hurts the page.",
      "evidence": ["copied character for character from page.txt"]
    }
  ],
  "uniqueness": [
    {
      "title": "What is theirs",
      "evidence": "\"a verbatim quote\" or Visual: a description"
    }
  ],
  "productFacts": [
    "Concrete facts only: name, what it does, prices, numbers, customers"
  ],
  "fiveSecond": {
    "whatIsIt": "",
    "whoIsItFor": "",
    "whatDoIDoNext": "",
    "matchesPage": false,
    "note": "One sentence on the gap between first impression and the page."
  }
}
```

The rules the web judge follows apply to you:

- Score every tenet, 0 exemplary to 100 interchangeable template. Most
  AI-generated pages land between 55 and 90. Be calibrated, not cruel.
- 4 to 10 findings, only ones the detectors missed. Tenet is one of the eight
  ids or `markers` for verbal or visual AI tics.
- Every evidence quote must appear verbatim in `page.txt` and be at least three
  words. Unverifiable findings are dropped, except purely visual ones (`show`,
  `identity`, `speed`, `markers`) with empty evidence.
- Uniqueness is what is genuinely theirs and must survive the fix. Empty is fine.
- Never invent product facts.

## 4. Score and choose

```bash
"$DESLOPER" finish <run-dir> --judgement <run-dir>/judgement.json
```

It reports how many judge findings it dropped for unverified quotes, prints the
blended score (detectors 60%, judge 40%, plus the AI-markers penalty) and writes
`fix-prompt.md` and `report.json`.

Show the user the score, grade, the five-second read and the findings grouped
by principle. Then ask, in one question, whether to apply all findings, skip
some (by id), or stop at the report. Offer the optional "make it yours"
questions too (why they built it, the pain in a customer's words, who it is
for, the one action they want); answers sharpen the copy. Write any answers to
`answers.json` with keys `story`, `pain`, `customer`, `action`, `culture`,
`games`, `hobbies`, `place`, `hate`, then re-run `finish` with
`--skip id,id` and `--answers <run-dir>/answers.json` as needed.

## 5. Fix

Read `fix-prompt.md` and carry it out in this repo as if the user had pasted
it: keep the stack, keep every product fact and uniqueness signal, leave
`TODO(owner):` instead of inventing facts, and meet every hard constraint. Run
the repo's formatter and checks afterwards.

Then re-run `analyze` on the same URL (the dev server hot-reloads). That score
is detectors only, so compare it with the first run's detector-only score, or
judge the new run too before comparing blended scores. Report before and after: the score, the findings that cleared, any that remain and
why, the files changed, and every `TODO(owner):` left for the user.

## README mode

A README is judged on the writing, not the layout: no folds, buttons, fonts or
paint times. Six principles count (the opening, showing it work, one path to a
first run, specificity, voice, economy), plus the AI-markers penalty, and four
README-only checks: no example, no install path, a badge wall, a template
outline.

1. From the repo root, run `"$DESLOPER" analyze readme` (or pass the path of
   another Markdown file). It renders the Markdown and prints a detector-only
   score and findings, as in step 2.
2. Judge it as in step 3, with two changes. Use `"$DESLOPER" doctrine --readme`
   as the doctrine and only score its tenets (`pain`, `show`, `action`,
   `specificity`, `voice`, `economy`). Read the README source itself as well as
   `page.txt`, but quote from `page.txt`: rendered text, not Markdown syntax.
   Leave out `fiveSecond`. `productFacts` are the project's real facts:
   commands, versions, platforms, limits.
3. Run `finish` as in step 4. The optional questions for a README are only
   `pain` (the problem, in a user's words), `customer`, `story` (why they built
   it) and `hate`.
4. Apply `fix-prompt.md` to the README. Check every command you touch against
   the code (package.json scripts, CLI flags) before changing it. Re-run
   `analyze readme` and report before and after, plus every `TODO(owner):`.
