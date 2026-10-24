# Desloper

Most landing pages written with AI look like each other: a purple gradient, a headline that starts with "Unlock", three feature cards with emoji, six different buttons, and nobody on the page.

Desloper reads your landing page, scores how generic it is, asks you about the person behind the product, and rebuilds the page around your answers. The before and after sit side by side.

```
91  F  "🚀 The AI-Powered Platform to Supercharge Your Workflow and Unlock Your Team's Full Potential"
       CTA 1.1 screens down · 20 emoji, 4 of them rockets · 12.7 screens tall on mobile
 0  A  the hand-made fixture
```

Both are test fixtures in `lib/analyze/__fixtures__`. The test suite checks that the sloppy page scores above 65 and the hand-made page below 35.

## How it works

1. **Read.** Paste a URL. A headless browser renders the page at 1440px and 390px, measures layout shift and paint time, and freezes a script-free snapshot. The status feed shows what it finds as it finds it, for example "Page is 14.5 screens tall on mobile", "18 different button labels" or "Fonts: Inter, Inter, and Inter".
2. **Score.** Deterministic detectors and a model judge both score the page against eight principles. The detectors count 60% and the judge 40%. Emoji, em dashes and other tics add a separate penalty. 0 is clean and 100 is slop.
3. **Listen.** While the judge finishes, you answer up to nine short questions: why you built it, the pain in a customer's words, who they are, the one action you want, and what you read, watch, play and do on weekends. Every question can be skipped.
4. **Choose.** Every finding is a toggle. You pick which ones to fix and choose one of three themes drawn from your answers.
5. **Rebuild.** The new page streams in next to the original, section by section. When it's done, the same detectors score it again. If the new page still scores above 30, a silent revision pass runs before the final score lands. On a phone, a button flips between the before and after pages.

## The doctrine

Scoring and generation both run on the same eight principles, written out in [`lib/doctrine.ts`](lib/doctrine.ts):

1. **Name the pain in the first screen, in the customer's words.**
2. **Show the product, don't decorate around it.**
3. **One reader, one job, one primary action.**
4. **Specificity is the whole game.**
5. **A human made this.**
6. **Every section earns its scroll.**
7. **Identity through restraint.**
8. **Speed and stability are design.**

If you disagree with how a page is judged, change that file. The judge and the generator both read their instructions from it, so the scoring and the rebuilt page change together.

## Stack

- **Next.js 16** (App Router) on Vercel. Every API route runs on Node.
- **AI SDK 7** through Vercel AI Gateway. The model names live in `lib/ai.ts`.
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

You only need `AI_GATEWAY_API_KEY`. Without Supabase settings, reports are kept in memory and accounts are turned off.

To persist reports, create a Supabase project, fill in the Supabase variables in `.env.local`, then:

```bash
npx supabase link --project-ref <ref>
npx supabase db push --linked
```

## Checks

```bash
yarn test        # detectors, scoring, the egress guard, rate limits
yarn typecheck
yarn lint
CAPTURE_E2E=1 yarn test   # also drives a real browser
```

## Layout

```
app/page.tsx            the whole flow, one staged screen
app/api/analyze         capture → detectors → judge, streamed as server-sent events
app/api/generate        streams the new page, then re-scores it
lib/analyze/            capture, snapshot, egress guard, detectors, judge, score
lib/generate/           interview, themes, page prompt
lib/doctrine.ts         what a good page is
supabase/migrations/    schema, row-level security, storage bucket
```

## Known limits

- Some sites block headless browsers and return 403. Desloper reports that rather than guessing.
- The built-in rate limit is held in memory per instance. A Vercel Firewall rule is still needed for a real per-IP cap in production.
