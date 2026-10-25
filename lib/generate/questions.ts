// Client-safe: imported by the Prompt stage and lib/fix-prompt. No server dependencies here.
import type { InterviewKey } from "@/lib/types";

export interface InterviewQuestion {
  key: InterviewKey;
  question: string;
  /** Why we ask, shown under the question. */
  hint: string;
  placeholder: string;
  required?: boolean;
}

/** The nine interview questions, in plan order. Every one is skippable in the UI. */
export const QUESTIONS: InterviewQuestion[] = [
  {
    key: "story",
    question: "How did this start?",
    hint: "The real reason the product exists is the part nobody else can copy. It becomes your founder note.",
    placeholder:
      "I was running ops at a 40-person clinic and kept rebuilding the same spreadsheet every Monday…",
  },
  {
    key: "pain",
    question: "What does the problem sound like when a customer says it?",
    hint: "Your headline should be in their words, not ours. Paste a quote from a call or an email if you have one.",
    placeholder:
      "“I spend Friday afternoons chasing invoices instead of going home.”",
  },
  {
    key: "customer",
    question: "Who is it for, exactly?",
    hint: "One reader. A role, a size, a moment in their week. The page gets sharper the narrower this is.",
    placeholder:
      "Office managers at independent dental practices with 2 to 6 chairs",
  },
  {
    key: "action",
    question: "What is the one thing a visitor should do?",
    hint: "This becomes the primary button, phrased as what they get. Everything else on the page steps aside for it.",
    placeholder:
      "Book a 15-minute demo, start a free trial, join the waitlist…",
  },
  {
    key: "culture",
    question: "What music, films or books have shaped how you think?",
    hint: "Not for name-dropping. Your references set the mood and the rhythm of the copy.",
    placeholder:
      "Late-night radio, old field guides, anything by a good documentary editor",
  },
  {
    key: "games",
    question: "Any video games you have lost whole weekends to?",
    hint: "Games are a shortcut to taste: maps, inventories, menus and progress bars all make good page metaphors.",
    placeholder:
      "Exploration games, city builders, a puzzle game I still replay",
  },
  {
    key: "hobbies",
    question: "What do you do when you are not working on this?",
    hint: "Hobbies give the page its small details and its vocabulary. A climber and a baker write very different pages.",
    placeholder: "Trail running, film photography, fixing old bikes",
  },
  {
    key: "place",
    question: "Where are you from, or where do you build from?",
    hint: "Place gives a page texture: its colors, its light, the way it talks. It is also proof a real person is behind it.",
    placeholder: "Grew up in Porto, building from a back room in Lisbon",
  },
  {
    key: "hate",
    question: "What do you hate about your current page?",
    hint: "Your instincts count as much as our score. Whatever bothers you goes straight into the never-do list.",
    placeholder:
      "It sounds like every other tool. The gradient. The rocket emoji.",
  },
];
