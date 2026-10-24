import { buildCapture } from "./build";

/** Every tic in the book: a generated landing page for an imaginary product. */
export const sloppyCapture = buildCapture({
  url: "https://synthora.example/",
  title: "Synthora — The AI-Powered Platform to Supercharge Your Workflow",
  bodyFont: '"Inter", system-ui, sans-serif',
  colors: [
    "rgb(99, 102, 241)",
    "rgb(168, 85, 247)",
    "rgb(59, 130, 246)",
    "rgb(17, 24, 39)",
    "rgb(107, 114, 128)",
    "rgb(236, 72, 153)",
    "rgb(34, 197, 94)",
    "rgb(249, 115, 22)",
  ],
  backgrounds: [
    "linear-gradient(135deg, rgb(168, 85, 247) 0%, rgb(59, 130, 246) 100%)",
    "rgba(255, 255, 255, 0.1)",
    "linear-gradient(90deg, #8b5cf6, #3b82f6)",
  ],
  cls: 0.31,
  lcp: 4800,
  extraHtml:
    '<div class="backdrop-blur-lg bg-white/10 bg-gradient-to-r from-purple-500 to-blue-500 text-indigo-600 bg-indigo-500 text-slate-900 text-gray-500 border-purple-200 ring-violet-400"><i data-lucide="zap"></i><i data-lucide="shield"></i><i data-lucide="bot"></i><i data-lucide="sparkles"></i></div><link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet">',
  sections: [
    {
      centered: true,
      minHeight: { mobile: 1300, desktop: 1100 },
      items: [
        { tag: "span", text: "✨ Introducing Synthora 2.0 ✨" },
        {
          tag: "h1",
          text: "🚀 The AI-Powered Platform to Supercharge Your Workflow and Unlock Your Team's Full Potential",
        },
        {
          tag: "p",
          text: "Unlock seamless productivity with our all-in-one solution — designed to elevate your team, streamline collaboration, and transform the way you work.",
        },
        { img: "/assets/hero-3d-blob-gradient.png", dims: false, h: 420 },
        { link: "Get Started", button: true },
        { link: "Learn More", button: true },
      ],
    },
    {
      centered: true,
      items: [
        { tag: "p", text: "Trusted by 10,000+ innovative teams worldwide" },
        { img: "/logos/logo-1.svg", kind: "svg", h: 40 },
        { img: "/logos/logo-2.svg", kind: "svg", h: 40 },
        { img: "/logos/logo-3.svg", kind: "svg", h: 40 },
      ],
    },
    {
      centered: true,
      minHeight: { mobile: 1500 },
      items: [
        { tag: "h2", text: "✨ Everything You Need to Succeed" },
        { tag: "p", text: "It's not just a tool — it's a revolution." },
        { img: "/img/abstract-shape-1.svg", kind: "svg", h: 300 },
        { tag: "h3", text: "⚡ Lightning Fast" },
        {
          tag: "p",
          text: "Experience blazing-fast performance that scales with your business — effortlessly.",
        },
        { tag: "h3", text: "🔒 Secure by Design" },
        {
          tag: "p",
          text: "Enterprise-grade security you can trust, so you can focus on what matters most.",
        },
        { tag: "h3", text: "🤖 AI-Driven Insights" },
        {
          tag: "p",
          text: "Harness the power of AI to make smarter decisions, faster.",
        },
      ],
    },
    {
      centered: true,
      minHeight: { mobile: 1200 },
      items: [
        { tag: "h2", text: "Why Teams Love Synthora 🚀" },
        { tag: "li", text: "✅ Seamless integration with your favorite tools" },
        { tag: "li", text: "✅ Supercharge your productivity" },
        { tag: "li", text: "✅ Unlock powerful insights" },
        { tag: "li", text: "✅ Elevate your customer experience" },
        { tag: "li", text: "✅ Say goodbye to busywork" },
        {
          img: "/img/illustration-team-highfive.png",
          alt: "Happy team illustration",
          dims: false,
        },
        { link: "Start Free Trial", button: true },
      ],
    },
    {
      centered: true,
      minHeight: { mobile: 1400 },
      items: [
        { tag: "h2", text: "Built for Modern Teams" },
        { tag: "h3", text: "⚡ Lightning Fast" },
        {
          tag: "p",
          text: "Experience blazing-fast performance that scales with your business — effortlessly.",
        },
        { tag: "h3", text: "🔒 Secure by Design" },
        {
          tag: "p",
          text: "Enterprise-grade security you can trust, so you can focus on what matters most.",
        },
        { tag: "h3", text: "🌟 Smarter. Faster. Better." },
        {
          tag: "p",
          text: "Harness the power of AI to make smarter decisions, faster.",
        },
      ],
    },
    {
      centered: true,
      minHeight: { mobile: 1600 },
      items: [
        { tag: "h2", text: "What Our Customers Say 💬" },
        {
          tag: "blockquote",
          text: "“Synthora is a total game-changer! Our productivity went through the roof.”",
        },
        { tag: "p", text: "— Sarah K." },
        {
          tag: "blockquote",
          text: "“I can't imagine working without it. Absolutely seamless.”",
        },
        { tag: "p", text: "Marketing Manager" },
        {
          tag: "blockquote",
          text: "“The best tool we've ever used. Highly recommend!”",
        },
        { tag: "p", text: "— Michael R." },
        {
          img: "/img/stock-photo-smiling-woman-unsplash.jpg",
          alt: "",
          dims: false,
          h: 300,
        },
      ],
    },
    {
      centered: true,
      minHeight: { mobile: 1700 },
      items: [
        { tag: "h2", text: "Simple, Transparent Pricing" },
        { tag: "h3", text: "Starter" },
        { tag: "p", text: "$19/mo" },
        { link: "Get Started", button: true },
        { tag: "h3", text: "Pro 🔥" },
        { tag: "p", text: "$49/mo" },
        { link: "Get Started Now", button: true },
        { tag: "h3", text: "Enterprise" },
        { tag: "p", text: "Custom" },
        { link: "Book a Demo", button: true },
      ],
    },
    {
      centered: true,
      minHeight: { mobile: 1200 },
      items: [
        { tag: "h2", text: "Frequently Asked Questions" },
        { tag: "h3", text: "What is Synthora?" },
        {
          tag: "p",
          text: "Synthora is an AI-powered platform that helps teams unlock their full potential — seamlessly.",
        },
        { tag: "h3", text: "Is my data secure?" },
        {
          tag: "p",
          text: "Absolutely — we take security seriously with robust, world-class protection.",
        },
        { tag: "h3", text: "Can I cancel anytime?" },
        { tag: "p", text: "Yes — no strings attached." },
      ],
    },
    {
      centered: true,
      items: [
        { tag: "h2", text: "Ready to Supercharge Your Workflow? 🚀" },
        {
          tag: "p",
          text: "Join thousands of teams who have already transformed the way they work.",
        },
        { link: "Get Started for Free 🚀", button: true },
      ],
    },
    {
      tag: "footer",
      centered: true,
      items: [
        { tag: "small", text: "© Synthora. All rights reserved." },
        { link: "Privacy", href: "/privacy" },
        { link: "Terms", href: "/terms" },
      ],
    },
  ],
});
