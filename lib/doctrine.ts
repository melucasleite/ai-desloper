import type { TenetId } from "@/lib/types";

/**
 * The product's opinion of what makes a great landing page.
 * The judge scores against it and the fix prompt quotes it,
 * so this one text drives both sides of the app.
 */
export const DOCTRINE: {
  id: TenetId;
  title: string;
  principle: string;
  checks: string[];
}[] = [
  {
    id: "pain",
    title: "Name the pain in the first screen, in the customer's words",
    principle:
      "A visitor on a 390px phone should know what this is, who it is for and why it matters within five seconds. The headline is the problem or the outcome, never the category: nobody wakes up wanting an AI-powered platform, they want their invoices to stop bouncing. The subhead says how, in one plain sentence. If the first screen is a badge, a slogan and a gradient, the page has already lost the reader.",
    checks: [
      "Headline and primary action both sit inside the first 390px viewport.",
      "Headline names a problem or an outcome a customer would actually say out loud, not a product category.",
      "No category-speak openers: 'The AI-powered…', 'All-in-one…', 'The future of…', 'Next-gen…'.",
      "Headline is short enough to read in one glance (about 12 words or fewer).",
      "Subhead explains the mechanism in a single sentence, not a list of virtues.",
    ],
  },
  {
    id: "show",
    title: "Show the product, don't decorate around it",
    principle:
      "Every visual should explain something: the real interface, a before and after, a six-second loop of the core action, a diagram of the one mechanism that makes it work. Abstract 3D shapes, gradient blobs, floating orbs and stock illustrations of people high-fiving explain nothing and signal that there is nothing to show. Reserve each visual's space up front with fixed dimensions or an aspect ratio so nothing jumps while it loads.",
    checks: [
      "At least one visual shows the actual product or its output.",
      "Decorative imagery (blobs, abstract shapes, stock art) is the exception, not the rule.",
      "No stock photography standing in for customers or the team.",
      "Every image and video has explicit width/height or an aspect ratio.",
    ],
  },
  {
    id: "action",
    title: "One reader, one job, one primary action",
    principle:
      "Decide the single thing a visitor should do and say it as what they get: 'See your score', not 'Get started'. Repeat that same action at the natural decision points, word for word, instead of inventing a new button every section. Five different CTAs is not choice, it is indecision outsourced to the reader. A human contact path, a real email address or a short form, is always reachable and always styled as secondary.",
    checks: [
      "One primary action, phrased as the outcome the visitor receives.",
      "No generic labels: 'Get started', 'Learn more', 'Sign up', 'Try for free', 'Book a demo'.",
      "Three or fewer distinct action labels across the page.",
      "A real contact path (email, form or phone) exists and does not compete with the primary action.",
    ],
  },
  {
    id: "specificity",
    title: "Specificity is the whole game",
    principle:
      "Numbers, names, places, dates and the actual workflow. Every adjective that could describe any product is wasted space: 'seamless', 'powerful', 'supercharge', 'unlock', 'elevate', 'game-changer'. Say what happens at 9am on a Monday. Put proof right beside each claim, a number, a named customer, a screenshot, not in a testimonial carousel three screens later. Rhetorical tics like 'It's not X, it's Y' and tidy triplets ('Faster. Smarter. Better.') are filler pretending to be rhythm.",
    checks: [
      "Concrete numbers, names, places and dates appear throughout, not just in pricing.",
      "No generic marketing lexicon: unlock, seamless, supercharge, elevate, game-changer, 'Say goodbye to…'.",
      "No 'It's not X, it's Y' constructions.",
      "No reflexive triplets of adjectives or one-word sentences.",
      "Each claim sits next to its proof.",
    ],
  },
  {
    id: "voice",
    title: "A human made this",
    principle:
      "Write in the first person where it is honest. Show the founder: a name, a face, the real reason this exists, an opinion or two that someone could disagree with. Testimonials carry a full name, a role and a company, or they are not testimonials. 'Sarah K., Marketing Manager' convinces nobody. The page should sound like a person who has done the job, not a committee that has read about it.",
    checks: [
      "First person appears where a real person is speaking.",
      "A founder or team member is named, ideally with a short note on why the product exists.",
      "Testimonials have full names plus role or company; no anonymous initials.",
      "The voice holds at least one specific opinion.",
    ],
  },
  {
    id: "economy",
    title: "Every section earns its scroll",
    principle:
      "Short by default. Length should follow the size of the ask: a free signup needs a screen or three, a five-figure contract can earn more, but even long pages must stay scannable. If a section could be deleted without anyone missing it, delete it. Repeating the same feature grid with new icons is not a second section. The default template sequence (hero, logo strip, three-column grid, testimonials, pricing, FAQ, final CTA) is a sign nobody decided what this page needed. Mobile is the real page; measure length there.",
    checks: [
      "Mobile length is proportional to the ask (roughly 8 screens or fewer for self-serve).",
      "No near-duplicate sections restating the same claims.",
      "The section order is chosen for this product, not the stock template sequence.",
    ],
  },
  {
    id: "identity",
    title: "Identity through restraint",
    principle:
      "One typeface pairing chosen for this product, one accent color, a real grid with real alignment, generous rhythm, and motion only where it explains a state change. Default font stacks, purple-to-blue gradients, frosted-glass cards, the stock utility palette and the same outline icon set everyone ships all say 'template'. A theme is a point of view, not a palette swap. Center-aligning everything is not a layout, it is the absence of one.",
    checks: [
      "A deliberate type pairing, not only default sans stacks.",
      "One accent color, not a rainbow of saturated hues.",
      "No purple-to-blue gradients, glassmorphism or untouched utility-framework palettes.",
      "Icons are drawn for the product or omitted, not pulled wholesale from a stock set.",
      "Text is aligned to a grid; not every block is centered.",
    ],
  },
  {
    id: "speed",
    title: "Speed and stability are design",
    principle:
      "A page that jumps while loading feels broken no matter how it looks. Largest contentful paint under 2.5 seconds, cumulative layout shift near zero, no reflow when web fonts swap in, no lazy image pushing the button out from under a thumb. The page should be readable with JavaScript off.",
    checks: [
      "Largest contentful paint under 2.5s.",
      "Cumulative layout shift under 0.1.",
      "Web fonts do not shift layout when they load (font-display plus metric overrides or a close fallback).",
      "Core content renders without JavaScript.",
    ],
  },
];

/** Markdown block of the 8 principles, for LLM prompts. */
export function doctrinePrompt(): string {
  return DOCTRINE.map((d, i) =>
    [
      `### ${i + 1}. ${d.title} (tenet: ${d.id})`,
      d.principle,
      "Checks:",
      ...d.checks.map((c) => `- ${c}`),
    ].join("\n"),
  ).join("\n\n");
}
