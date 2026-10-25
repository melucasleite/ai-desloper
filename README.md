# Desloper

Most landing pages written with AI look like each other: a purple gradient, a headline that starts with "Unlock", three feature cards with emoji, six different buttons, and nobody on the page.

Desloper reads your landing page, scores how generic it is, and shows you every finding. Then it hands you a prompt to paste into your own AI coding tool, so the fix happens in your codebase, on your stack.

```
91  F  "🚀 The AI-Powered Platform to Supercharge Your Workflow and Unlock Your Team's Full Potential"
       CTA 1.1 screens down · 20 emoji, 4 of them rockets · 12.7 screens tall on mobile
 0  A  the hand-made fixture
```

Both are test fixtures in `lib/analyze/__fixtures__`. The test suite checks that the sloppy page scores above 65 and the hand-made page below 35.

## How it works

1. **Read.** Paste a URL. A headless browser renders the page at 1440px and 390px, measures layout shift and paint time, and freezes a script-free snapshot. The status feed shows what it finds as it finds it, for example "Page is 14.5 screens tall on mobile", "18 different button labels" or "Fonts: Inter, Inter, and Inter".
2. **Score.** Deterministic detectors and a model judge both score the page against eight principles. The detectors count 60% and the judge 40%. Emoji, em dashes and other tics add a separate penalty. 0 is clean and 100 is slop. If the judge is unavailable, the detectors score the page alone and the results still show.
3. **Review.** The results list every finding under the principle it breaks, with the quoted evidence and a crop of the screenshot. Each finding is a toggle, and all of them start on. A five-second test and a list of what is already distinctive about the page sit alongside.
4. **Prompt.** The next screen is a Markdown prompt built from the findings you kept, with no model call. It names the page, the product facts and distinctive parts to keep, each finding with its evidence and the principle behind it, and a set of hard constraints: headline and primary action inside the first 390px screen, reserved space for every image and video, a secondary contact path, a mobile length at most 60% of today's, and no emoji or generic marketing words. It tells your tool to keep your stack and not invent claims. Copy it or download it as a `.md` file.
5. **Make it yours.** Beside the prompt, up to nine optional questions: why you built it, the pain in a customer's words, who it is for, the one action you want, and what you read, watch, play and do on weekends. Answers go into the prompt as you type, as the source for the story and the voice. One button skips the lot and builds the prompt from the findings alone.

## The doctrine

Scoring and the fix prompt both run on the same eight principles, written out in [`lib/doctrine.ts`](lib/doctrine.ts):

1. **Name the pain in the first screen, in the customer's words.**
2. **Show the product, don't decorate around it.**
3. **One reader, one job, one primary action.**
4. **Specificity is the whole game.**
5. **A human made this.**
6. **Every section earns its scroll.**
7. **Identity through restraint.**
8. **Speed and stability are design.**

If you disagree with how a page is judged, change that file. The judge reads its instructions from it and the fix prompt quotes it, so the scoring and the instructions change together.

## Stack

- **Next.js 16** (App Router) on Vercel. Every API route runs on Node.
- **AI SDK 7** through Vercel AI Gateway, for the judge only. The model names live in `lib/ai.ts`.
- **Playwright** for capture: `@sparticuz/chromium` on Vercel, regular Chromium locally. Every request the browser makes goes through a small egress proxy that refuses private and loopback addresses, including after redirects and DNS changes.
- **Supabase** for Postgres, Auth and Storage. Row-level security is on for every table. Anonymous reports carry a claim token, so you can save one to your account later.
- **Motion** for the transitions and **Vitest** for the tests.

## Run it locally

```bash
yarn
npx playwright install chromium
cp .env.example .env.local   # add AI_GATEWAY_API_KEY
yarn dev
```

`AI_GATEWAY_API_KEY` turns on the model judge. Without it, the detectors score the page alone. Without Supabase settings, reports are kept in memory and accounts are turned off.

To persist reports, create a Supabase project, fill in the Supabase variables in `.env.local`, then:

```bash
npx supabase link --project-ref <ref>
npx supabase db push --linked
```

## Checks

```bash
yarn test        # detectors, scoring, the fix prompt, the egress guard, persistence
yarn typecheck
yarn lint
CAPTURE_E2E=1 yarn test   # also drives a real browser
```

## Layout

```
app/page.tsx            the whole flow, one staged screen
app/r/[id]               a saved report, reopened on its results
app/api/analyze         capture → detectors → judge, streamed as server-sent events
app/api/interview       saves the optional answers for the report's author
lib/analyze/            capture, snapshot, egress guard, detectors, judge, score
lib/fix-prompt.ts       builds the fix prompt, deterministically
lib/generate/           interview questions, request schemas
lib/doctrine.ts         what a good page is
supabase/migrations/    schema, row-level security, storage bucket
```

## Known limits

- Some sites block headless browsers and return 403. Desloper reports that rather than guessing.
- The built-in rate limit is held in memory per instance. A Vercel Firewall rule is still needed for a real per-IP cap in production.
