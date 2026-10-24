import { buildCapture } from "./build";

/** A specific, hand-made page for an imaginary one-person bookkeeping service. */
export const handmadeCapture = buildCapture({
  url: "https://ledgerline.example/",
  title: "Ledgerline · Bookkeeping for independent bike shops",
  headingFont: '"Fraunces", Georgia, serif',
  bodyFont: '"IBM Plex Sans", system-ui, sans-serif',
  colors: [
    "rgb(28, 25, 23)",
    "rgb(250, 248, 244)",
    "rgb(194, 65, 12)",
    "rgb(120, 113, 108)",
  ],
  backgrounds: ["rgb(250, 248, 244)"],
  cls: 0.01,
  lcp: 1400,
  extraHtml:
    '<style>@font-face{font-family:"Fraunces";src:url(/f/fraunces.woff2);font-display:optional;size-adjust:104%}</style>',
  sections: [
    {
      items: [
        { tag: "h1", text: "Your books, closed by the 5th. Even in July." },
        {
          tag: "p",
          text: "I reconcile your POS, bank and supplier invoices every week, so you see real margins on every bike you sell.",
        },
        {
          link: "See a sample month-end report",
          href: "/sample",
          button: true,
        },
        {
          img: "/img/month-end-report-screenshot.png",
          alt: "Month-end report showing $41,280 revenue and 31% margin for March 2025",
        },
        {
          link: "Or email me: dana@ledgerline.example",
          href: "mailto:dana@ledgerline.example",
        },
      ],
    },
    {
      items: [
        { tag: "h2", text: "What happens each Monday" },
        {
          tag: "li",
          text: "6 a.m.: I pull last week's sales from your POS and match them to deposits.",
        },
        {
          tag: "li",
          text: "By noon: supplier invoices from your distributors are coded to the right bike, part or service line.",
        },
        {
          tag: "li",
          text: "Tuesday: you get a one-page note with anything odd, like a $380 duplicate charge.",
        },
        {
          tag: "p",
          text: "Last season 14 shops in Oregon and Washington cut their month-end close from 11 days to 3.",
        },
      ],
    },
    {
      items: [
        {
          tag: "blockquote",
          text: "“We found $6,200 in duplicate supplier charges in the first month. That paid for two years of Dana.”",
        },
        { tag: "p", text: "Marcus Bell, owner of Spoke & Chain, Portland" },
      ],
    },
    {
      items: [
        { tag: "h2", text: "Why I started this" },
        {
          img: "/img/dana-at-the-shop-counter.jpg",
          alt: "Dana Ortiz at the counter of her uncle's bike shop in Eugene",
        },
        {
          tag: "p",
          text: "I ran the back office at my uncle's shop in Eugene for six years. Every April we found out whether we had made money the summer before. I built Ledgerline so no shop waits nine months to learn that.",
        },
        { tag: "p", text: "Dana Ortiz, founder" },
      ],
    },
    {
      items: [
        { tag: "h2", text: "$340 a month, flat" },
        {
          tag: "p",
          text: "Covers up to 400 transactions. No setup fee. Cancel with 30 days' notice.",
        },
        {
          link: "See a sample month-end report",
          href: "/sample",
          button: true,
        },
      ],
    },
    {
      tag: "footer",
      items: [
        { tag: "small", text: "Ledgerline · Eugene, Oregon" },
        {
          link: "dana@ledgerline.example",
          href: "mailto:dana@ledgerline.example",
        },
      ],
    },
  ],
});
