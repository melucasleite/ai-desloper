import type { BrowserContext, Page } from "playwright-core";
import type { Capture, ViewportCapture } from "../types";
import { getBrowser } from "./browser";
import { egressProxyUrl } from "./egress";
import { acquireCaptureSlot } from "./limits";
import { buildSnapshot, trackStylesheets } from "./snapshot";
import {
  assertPublicUrl,
  guardContext,
  isPublicHost,
  type NetworkPolicy,
} from "./ssrf";

type ViewportKind = "desktop" | "mobile";

const VIEWPORTS: Record<ViewportKind, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

/** Budget for navigation + settling; screenshots and collection come after. */
const LOAD_BUDGET_MS = 20_000;
/** Hard ceiling for a whole capture; past it the contexts are torn down. */
const HARD_DEADLINE_MS = LOAD_BUDGET_MS + 70_000;
/** Ceiling for any single in-page evaluate / content read. */
const EVALUATE_TIMEOUT_MS = 10_000;
const MAX_SCREENSHOT_HEIGHT = 8_000;
/** Above this the full-page JPEG is re-encoded smaller, then dropped. */
const MAX_FULL_SCREENSHOT_BYTES = 6_000_000;
const GENERATED_URL = "https://deslop.invalid/";

// CLS uses session windows (gap < 1s, window < 5s), as the web-vitals definition does.
const PERF_INIT = `(() => {
  const state = { cls: 0, lcp: null, _win: 0, _first: 0, _last: 0 };
  Object.defineProperty(window, "__deslopPerf", { value: state, enumerable: false });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        if (state._win && e.startTime - state._last < 1000 && e.startTime - state._first < 5000) {
          state._win += e.value;
        } else {
          state._win = e.value;
          state._first = e.startTime;
        }
        state._last = e.startTime;
        if (state._win > state.cls) state.cls = state._win;
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) state.lcp = last.renderTime || last.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch (e) {}
})();`;

// Synchronous on purpose: with JavaScript disabled (generated pages) timers
// never fire, so nothing in-page may await. When the init-script observer did
// not get to run, buffered entries are read back with takeRecords().
const READ_PERF = `(() => {
  const s = window.__deslopPerf;
  if (s && (s.cls > 0 || s.lcp != null)) return { cls: s.cls, lcp: s.lcp };
  const read = (type) => {
    try {
      const o = new PerformanceObserver(() => {});
      o.observe({ type, buffered: true });
      const list = o.takeRecords();
      o.disconnect();
      return list;
    } catch (e) {
      return [];
    }
  };
  let cls = 0, win = 0, first = 0, last = 0;
  for (const e of read("layout-shift")) {
    if (e.hadRecentInput) continue;
    if (win && e.startTime - last < 1000 && e.startTime - first < 5000) win += e.value;
    else { win = e.value; first = e.startTime; }
    last = e.startTime;
    if (win > cls) cls = win;
  }
  const lcps = read("largest-contentful-paint");
  const l = lcps[lcps.length - 1];
  return { cls, lcp: l ? l.renderTime || l.startTime : null };
})()`;

const SCROLL_STEP = `(() => {
  const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
  // "instant" overrides scroll-behavior: smooth, which would animate each step.
  window.scrollBy({ top: step, behavior: "instant" });
  return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
})()`;

/** Collects everything the detectors need from the current render. Plain JS by design. */
const COLLECT = `((viewport) => {
  const sx = window.scrollX, sy = window.scrollY;
  const clean = (s, max) => (s || "").replace(/\\s+/g, " ").trim().slice(0, max || 500);
  const boxOf = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left + sx), y: Math.round(r.top + sy),
      width: Math.round(r.width), height: Math.round(r.height), viewport,
    };
  };
  const styleCache = new Map();
  const css = (el) => {
    let s = styleCache.get(el);
    if (!s) { s = getComputedStyle(el); styleCache.set(el, s); }
    return s;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = css(el);
    return s.visibility !== "hidden" && s.display !== "none" && parseFloat(s.opacity || "1") > 0.01;
  };
  const primaryFont = (family) => clean((family || "").split(",")[0].replace(/["']/g, ""), 80);
  const toHex = (c) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c || "");
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || (p.length > 3 && p[3] === 0)) return null;
    return "#" + p.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
  };

  const elements = Array.from(document.body ? document.body.querySelectorAll("*") : []).slice(0, 6000);

  // Text blocks.
  const BLOCK_SEL = "h1,h2,h3,h4,h5,h6,p,li,button,blockquote,figcaption,dt,dd,summary,[role=heading],[role=button]";
  const blocks = [];
  for (const el of document.querySelectorAll(BLOCK_SEL)) {
    if (blocks.length >= 800) break;
    if (!visible(el)) continue;
    const text = clean(el.innerText, 600);
    if (!text) continue;
    const s = css(el);
    blocks.push({
      tag: el.tagName.toLowerCase(), text, box: boxOf(el),
      fontFamily: s.fontFamily, fontSize: parseFloat(s.fontSize) || 0,
    });
  }

  // Links and buttons.
  const effectiveBg = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const hex = toHex(css(n).backgroundColor);
      if (hex) return hex;
    }
    return "#ffffff";
  };
  const visibleShadow = (shadow) =>
    !!shadow && shadow !== "none" &&
    (shadow.match(/rgba?\\([^)]*\\)/g) || []).some((c) => !/,\\s*0\\)$/.test(c));
  const isButtonish = (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "button" || tag === "input" || el.getAttribute("role") === "button") return true;
    const cls = (el.getAttribute("class") || "").toLowerCase();
    if (/(^|[\\s_-])(btn|button|cta)([\\s_-]|$)/.test(cls)) return true;
    const s = css(el);
    const r = el.getBoundingClientRect();
    const shaped = r.height >= 24 && r.height <= 90 && r.width >= 40 && r.width <= 480 &&
      (parseFloat(s.paddingLeft) >= 6 || parseFloat(s.paddingRight) >= 6);
    if (!shaped) return false;
    const bg = toHex(s.backgroundColor);
    const filled = bg !== null && bg !== effectiveBg(el);
    const bordered = parseFloat(s.borderTopWidth) >= 1 && s.borderTopStyle !== "none";
    return filled || bordered || visibleShadow(s.boxShadow);
  };
  const links = [];
  for (const el of document.querySelectorAll("a[href], button, [role=button], input[type=submit], input[type=button]")) {
    if (links.length >= 400) break;
    // Controls inside decorative product mockups aren't real calls to action.
    if (!visible(el) || el.closest("[aria-hidden=true], [inert]")) continue;
    const text = clean(el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("title"), 160);
    let href = "";
    if (el.tagName === "A") href = el.href;
    else if (el.form && el.form.action) href = el.form.action;
    links.push({ text, href, box: boxOf(el), isButton: text.length <= 60 && isButtonish(el) });
  }

  // Imagery.
  const images = [];
  const pushImage = (img) => { if (images.length < 300) images.push(img); };
  for (const el of document.querySelectorAll("img")) {
    if (!visible(el)) continue;
    const s = css(el);
    const hasDims = (el.hasAttribute("width") && el.hasAttribute("height")) ||
      (s.aspectRatio && s.aspectRatio !== "auto") || /(^|;)\\s*(width|height)\\s*:/.test(el.getAttribute("style") || "");
    pushImage({ src: el.currentSrc || el.src || "", alt: el.getAttribute("alt") || "", box: boxOf(el), hasDimensions: !!hasDims, kind: "img" });
  }
  for (const el of document.querySelectorAll("svg")) {
    if (el.parentElement && el.parentElement.closest("svg")) continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 256) continue;
    const label = el.getAttribute("aria-label") || (el.querySelector("title") && el.querySelector("title").textContent) || "";
    const hasDims = (el.hasAttribute("width") && el.hasAttribute("height")) || el.hasAttribute("viewBox");
    pushImage({ src: "inline-svg", alt: clean(label, 160), box: boxOf(el), hasDimensions: hasDims, kind: "svg" });
  }
  for (const el of document.querySelectorAll("video")) {
    if (!visible(el)) continue;
    const s = css(el);
    const src = el.currentSrc || el.src || (el.querySelector("source") && el.querySelector("source").src) || el.poster || "";
    const hasDims = (el.hasAttribute("width") && el.hasAttribute("height")) || (s.aspectRatio && s.aspectRatio !== "auto");
    pushImage({ src, alt: el.getAttribute("aria-label") || "", box: boxOf(el), hasDimensions: !!hasDims, kind: "video" });
  }

  // Fonts, colors, backgrounds and background images in one pass.
  const fontSet = new Map();
  const colorCount = new Map();
  const backgrounds = new Set();
  const bump = (hex) => { if (hex) colorCount.set(hex, (colorCount.get(hex) || 0) + 1); };
  bump(toHex(getComputedStyle(document.documentElement).backgroundColor));
  if (document.body) bump(toHex(getComputedStyle(document.body).backgroundColor));
  for (const el of elements) {
    if (!visible(el)) continue;
    const s = css(el);
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText) {
      const f = primaryFont(s.fontFamily);
      if (f) fontSet.set(f, (fontSet.get(f) || 0) + 1);
      bump(toHex(s.color));
    }
    bump(toHex(s.backgroundColor));
    const bgi = s.backgroundImage;
    if (bgi && bgi !== "none") {
      if (backgrounds.size < 60) backgrounds.add(bgi.slice(0, 400));
      const m = /url\\(["']?([^"')]+)["']?\\)/.exec(bgi);
      const r = el.getBoundingClientRect();
      if (m && r.width * r.height >= 1024 && !m[1].startsWith("data:image/svg")) {
        pushImage({ src: m[1].slice(0, 500), alt: el.getAttribute("aria-label") || "", box: boxOf(el), hasDimensions: true, kind: "background" });
      }
    }
  }
  for (const face of document.fonts || []) {
    if (face.status === "loaded") {
      const f = primaryFont(face.family);
      if (f && !fontSet.has(f)) fontSet.set(f, 0);
    }
  }

  // Top-level sections: descend through single-child wrappers, expand <main>.
  const significant = (el) => {
    if (!visible(el)) return false;
    const tag = el.tagName.toLowerCase();
    if (["script", "style", "link", "meta", "noscript", "template"].includes(tag)) return false;
    const s = css(el);
    if (s.position === "fixed" && tag !== "header" && tag !== "nav") return false;
    return el.getBoundingClientRect().height >= 8;
  };
  // Top-level sections: unwrap generic single-child wrappers, then split any
  // block much taller than a screen into its children.
  const WRAPPERS = ["div", "span", "form", "main"];
  const kidsOf = (el) => Array.from(el.children).filter(significant);
  let container = document.body;
  for (let depth = 0; container && depth < 8; depth++) {
    const kids = kidsOf(container);
    if (kids.length === 1 && WRAPPERS.includes(kids[0].tagName.toLowerCase())) container = kids[0];
    else break;
  }
  const split = (el, depth) => {
    const tag = el.tagName.toLowerCase();
    const tall = el.getBoundingClientRect().height > window.innerHeight * 1.5;
    if (depth >= 5 || tag === "footer" || (!tall && tag !== "main")) return [el];
    let inner = el;
    for (let d = 0; d < 4; d++) {
      const kids = kidsOf(inner);
      if (kids.length === 1 && WRAPPERS.includes(kids[0].tagName.toLowerCase())) inner = kids[0];
      else break;
    }
    const kids = kidsOf(inner);
    return kids.length >= 2 ? kids.flatMap((k) => split(k, depth + 1)) : [el];
  };
  const top = container ? kidsOf(container).flatMap((el) => split(el, 0)) : [];
  const sections = top.slice(0, 80).map((el) => ({
    tag: el.tagName.toLowerCase(), box: boxOf(el),
    text: clean(el.innerText, 400), childCount: el.children.length,
  }));

  const fonts = Array.from(fontSet.entries()).sort((a, b) => b[1] - a[1]).map((e) => e[0]).slice(0, 20);
  const colors = Array.from(colorCount.entries()).sort((a, b) => b[1] - a[1]).map((e) => e[0]).slice(0, 40);
  const fullHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);

  return {
    title: document.title || "",
    visibleText: clean(document.body ? document.body.innerText : "", 60000),
    fullHeight, blocks, links, images, sections, fonts, colors,
    backgrounds: Array.from(backgrounds),
  };
})`;

interface Collected {
  title: string;
  visibleText: string;
  fullHeight: number;
  blocks: ViewportCapture["blocks"];
  links: ViewportCapture["links"];
  images: ViewportCapture["images"];
  sections: ViewportCapture["sections"];
  fonts: string[];
  colors: string[];
  backgrounds: string[];
}

interface ViewportResult {
  viewport: ViewportCapture;
  collected: Collected;
  perf: { cls: number; lcp: number | null };
  page: Page;
  sheets: Map<string, Promise<string | null>>;
}

function hostLabel(url: URL | string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return String(url);
  }
}

function abortError(): Error {
  const err = new Error("The analysis was cancelled.");
  err.name = "AbortError";
  return err;
}

function friendlyNavigationError(err: unknown, host: string): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (/ERR_NAME_NOT_RESOLVED/.test(message))
    return new Error(`We couldn't find ${host}.`);
  if (/Timeout|ERR_TIMED_OUT/i.test(message)) {
    return new Error(`${host} took longer than 20 seconds to load.`);
  }
  if (
    /ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED/.test(
      message,
    )
  ) {
    return new Error(`${host} refused the connection.`);
  }
  if (/ERR_CERT|SSL/.test(message))
    return new Error(`${host} has a broken HTTPS certificate.`);
  if (/ERR_BLOCKED_BY_CLIENT/.test(message)) {
    return new Error("That page redirected to an address we can't visit.");
  }
  if (/ERR_TOO_MANY_REDIRECTS/.test(message))
    return new Error(`${host} redirects in a loop.`);
  return new Error(`We couldn't open ${host}.`);
}

function timeoutError(host: string): Error {
  return new Error(`${host} took too long to render.`);
}

/** Bounds a page call; closing the context (deadline/abort) also rejects it. */
function bounded<T>(promise: Promise<T>, ms = EVALUATE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Timeout: the page stopped responding.")),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

async function newContext(
  kind: ViewportKind,
  policy: NetworkPolicy,
): Promise<BrowserContext> {
  const [browser, proxy] = await Promise.all([getBrowser(), egressProxyUrl()]);
  const size = VIEWPORTS[kind];
  const context = await browser.newContext({
    viewport: size,
    screen: size,
    deviceScaleFactor: 1,
    isMobile: kind === "mobile",
    hasTouch: kind === "mobile",
    userAgent: kind === "mobile" ? MOBILE_UA : undefined,
    serviceWorkers: "block",
    acceptDownloads: false,
    // Every request, redirect hop and WebSocket goes through the egress proxy,
    // which enforces the public-IP policy at connect time. Playwright forces
    // loopback through it too (it adds "<-loopback>" to the bypass list).
    proxy: { server: proxy },
    // Generated pages must work without JS (hard constraint 11), and nothing
    // an LLM wrote should get to run code with our network position.
    javaScriptEnabled: policy.mode !== "generated",
    locale: "en-US",
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  await context.addInitScript({ content: PERF_INIT });
  await guardContext(context, policy);
  await context.routeWebSocket(/.*/, async (ws) => {
    let host = "";
    try {
      host = new URL(ws.url()).hostname;
    } catch {
      /* unparsable: closed below */
    }
    if (policy.mode === "generated" || !host || !(await isPublicHost(host))) {
      await ws.close().catch(() => {});
      return;
    }
    ws.connectToServer();
  });
  return context;
}

// Screenshots are CPU-heavy, and on a small serverless instance two running
// at once starve each other. One at a time, across both viewports.
let screenshotQueue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = screenshotQueue.then(task, task);
  screenshotQueue = run.catch(() => {});
  return run;
}

/**
 * Raw CDP capture. Playwright's page.screenshot waits for web fonts, stable
 * frames and animations to settle; on a CPU-starved serverless instance a
 * heavy page can spend over a minute in those waits. CDP just paints.
 */
async function cdpShot(
  page: Page,
  opts: {
    format: "png" | "jpeg";
    quality?: number;
    width: number;
    height: number;
    beyondViewport: boolean;
  },
  timeoutMs: number,
): Promise<Buffer> {
  const session = await page.context().newCDPSession(page);
  try {
    const { data } = await bounded(
      session.send("Page.captureScreenshot", {
        format: opts.format,
        quality: opts.quality,
        clip: { x: 0, y: 0, width: opts.width, height: opts.height, scale: 1 },
        captureBeyondViewport: opts.beyondViewport,
        fromSurface: true,
      }),
      timeoutMs,
    );
    return Buffer.from(data, "base64");
  } finally {
    await session.detach().catch(() => {});
  }
}

async function screenshots(page: Page, kind: ViewportKind, fullHeight: number) {
  const { width, height } = VIEWPORTS[kind];
  const clipHeight = Math.max(
    height,
    Math.min(fullHeight, MAX_SCREENSHOT_HEIGHT),
  );
  // JPEG keeps a long, photo-heavy page well under the storage limit and the
  // SSE payload small; only the first viewport (judge input) is PNG.
  const fullShot = (quality: number) =>
    oneAtATime(() =>
      cdpShot(
        page,
        {
          format: "jpeg",
          quality,
          width,
          height: clipHeight,
          beyondViewport: true,
        },
        25_000,
      ),
    );
  // The first viewport is required (the judge reads it); the full page is not.
  const first = await oneAtATime(() =>
    cdpShot(
      page,
      { format: "png", width, height, beyondViewport: false },
      20_000,
    ),
  );
  let full: Buffer | null = await fullShot(70).catch(() => null);
  if (full && full.byteLength > MAX_FULL_SCREENSHOT_BYTES) {
    full = await fullShot(40).catch(() => null);
    if (full && full.byteLength > MAX_FULL_SCREENSHOT_BYTES) full = null;
  }
  return {
    // Degrade to the first viewport rather than failing the whole report.
    screenshot: full ? full.toString("base64") : first.toString("base64"),
    screenshotType: full ? ("image/jpeg" as const) : ("image/png" as const),
    firstViewport: first.toString("base64"),
  };
}

async function renderViewport(
  context: BrowserContext,
  kind: ViewportKind,
  target: string,
  deadline: number,
  status: (m: string) => void,
  signal: AbortSignal | undefined,
  verifyFinalHost: boolean,
): Promise<ViewportResult> {
  const page = await context.newPage();
  const sheets = trackStylesheets(page);
  const remaining = () => Math.max(1_000, deadline - Date.now());

  const response = await page
    .goto(target, { waitUntil: "domcontentloaded", timeout: remaining() })
    .catch((err) => {
      if (signal?.aborted) throw abortError();
      throw friendlyNavigationError(err, hostLabel(target));
    });
  signal?.throwIfAborted();

  // Advisory: the egress proxy already refused any private hop. This only
  // turns a redirect to a private host into a clear message.
  if (verifyFinalHost && !(await isPublicHost(new URL(page.url()).hostname))) {
    throw new Error("That page redirected to an address we can't visit.");
  }
  const code = response?.status() ?? 200;
  if (code >= 400)
    throw new Error(`${hostLabel(target)} answered with HTTP ${code}.`);

  if (kind === "desktop") status("Waiting for the page to stop moving");
  await page
    .waitForLoadState("load", { timeout: Math.min(remaining(), 10_000) })
    .catch(() => {});
  await page
    .waitForLoadState("networkidle", { timeout: Math.min(remaining(), 6_000) })
    .catch(() => {});
  await page.waitForTimeout(Math.min(400, remaining()));
  signal?.throwIfAborted();

  // Read vitals before we scroll: programmatic scrolling would pollute CLS.
  const perf = await bounded(
    page.evaluate<{ cls: number; lcp: number | null }>(READ_PERF),
  );

  if (kind === "mobile") status("Scrolling through to wake up lazy content");
  // Driven from here, one synchronous step at a time, so a hostile page can't
  // hold the scroll loop and it still works with JavaScript disabled.
  // Best effort: a busy main thread (heavy images, animation) can stall a
  // step, and a partial scroll is better than failing the whole capture.
  const scrollDeadline = Math.min(deadline, Date.now() + 6_000);
  for (let i = 0; i < 60 && Date.now() < scrollDeadline; i++) {
    const atEnd = await bounded(
      page.evaluate<boolean>(SCROLL_STEP),
      2_000,
    ).catch(() => true);
    await page.waitForTimeout(110);
    if (atEnd) break;
  }
  signal?.throwIfAborted();
  await bounded(
    page.evaluate('window.scrollTo({ top: 0, behavior: "instant" })'),
    5_000,
  ).catch(() => {});
  await page.waitForTimeout(150);
  signal?.throwIfAborted();
  await page
    .waitForLoadState("networkidle", { timeout: Math.min(remaining(), 2_500) })
    .catch(() => {});
  await bounded(
    page.evaluate("document.fonts && document.fonts.ready"),
    3_000,
  ).catch(() => {});
  signal?.throwIfAborted();

  const collected = await bounded(
    page.evaluate<Collected>(`${COLLECT}(${JSON.stringify(kind)})`),
  );
  signal?.throwIfAborted();

  const { width, height } = VIEWPORTS[kind];
  if (kind === "mobile") {
    status(
      `Measured ${collected.fullHeight.toLocaleString("en-US")}px of page at ${width}px, ` +
        `${(collected.fullHeight / height).toFixed(1)} screens tall`,
    );
  }
  status(`Taking ${kind === "mobile" ? "mobile" : "desktop"} screenshots`);
  const shots = await screenshots(page, kind, collected.fullHeight);

  return {
    page,
    sheets,
    perf,
    collected,
    viewport: {
      viewport: kind,
      width,
      height,
      fullHeight: collected.fullHeight,
      screenshot: shots.screenshot,
      screenshotType: shots.screenshotType,
      firstViewport: shots.firstViewport,
      blocks: collected.blocks,
      links: collected.links,
      images: collected.images,
      sections: collected.sections,
    },
  };
}

function merge<T>(a: T[], b: T[], limit: number): T[] {
  return Array.from(new Set([...a, ...b])).slice(0, limit);
}

async function runCapture(opts: {
  target: string;
  policy: NetworkPolicy;
  status: (m: string) => void;
  signal?: AbortSignal;
  verifyFinalHost: boolean;
  snapshot: boolean;
}): Promise<Omit<Capture, "url">> {
  const { target, policy, status, signal: outer } = opts;
  if (outer?.aborted) throw abortError();
  const host = hostLabel(target);

  const release = await acquireCaptureSlot(outer);

  // One internal signal for caller aborts and the hard deadline. Aborting it
  // closes both contexts, which rejects any evaluate still stuck in the page.
  const internal = new AbortController();
  const signal = internal.signal;
  const contexts: BrowserContext[] = [];
  const closeAll = () =>
    Promise.all(contexts.map((c) => c.close().catch(() => {})));
  const onOuterAbort = () => internal.abort();
  outer?.addEventListener("abort", onOuterAbort, { once: true });
  let timedOut = false;
  const hardTimer = setTimeout(() => {
    timedOut = true;
    internal.abort();
  }, HARD_DEADLINE_MS);
  signal.addEventListener("abort", () => void closeAll(), { once: true });

  try {
    const [desktopCtx, mobileCtx] = await Promise.all([
      newContext("desktop", policy),
      newContext("mobile", policy),
    ]);
    contexts.push(desktopCtx, mobileCtx);
    if (signal.aborted) {
      await closeAll();
      throw abortError();
    }

    const deadline = Date.now() + LOAD_BUDGET_MS;
    if (opts.policy.mode === "public") {
      status(`Opening ${host} at 1440px…`);
      status(`Opening ${host} at 390px…`);
    }

    const run = (ctx: BrowserContext, kind: ViewportKind) =>
      renderViewport(
        ctx,
        kind,
        target,
        deadline,
        status,
        signal,
        opts.verifyFinalHost,
      ).catch((err) => {
        if (signal.aborted) throw abortError();
        throw err;
      });
    const [desktop, mobile] = await Promise.all([
      run(desktopCtx, "desktop"),
      run(mobileCtx, "mobile"),
    ]);

    const finalUrl = desktop.page.url();
    let html = "";
    let snapshotHtml = "";
    if (opts.snapshot) {
      html = await bounded(desktop.page.content());
      status("Freezing a snapshot of the original, scripts removed");
      const snap = await buildSnapshot(desktop.page, finalUrl, {
        sheets: desktop.sheets,
        signal,
      });
      snapshotHtml = snap.html;
      if (snap.inlined > 0) {
        status(
          `Inlined ${snap.inlined} stylesheet${snap.inlined === 1 ? "" : "s"} into the snapshot`,
        );
      }
    }

    const d = desktop.collected;
    const m = mobile.collected;
    return {
      finalUrl,
      title: d.title || m.title,
      html,
      snapshotHtml,
      visibleText:
        m.visibleText.length > d.visibleText.length
          ? m.visibleText
          : d.visibleText,
      fonts: merge(d.fonts, m.fonts, 20),
      colors: merge(d.colors, m.colors, 40),
      backgrounds: merge(d.backgrounds, m.backgrounds, 60),
      // Mobile is the real page, so its vitals are the ones we report.
      cls: Math.round(mobile.perf.cls * 1000) / 1000,
      lcp: mobile.perf.lcp != null ? Math.round(mobile.perf.lcp) : null,
      desktop: desktop.viewport,
      mobile: mobile.viewport,
    };
  } catch (err) {
    if (timedOut) throw timeoutError(host);
    if (signal.aborted) throw abortError();
    throw err;
  } finally {
    clearTimeout(hardTimer);
    outer?.removeEventListener("abort", onOuterAbort);
    await closeAll();
    release();
  }
}

/** Renders a live URL at 1440 and 390, collecting everything the detectors and judge need. */
export async function capturePage(
  url: string,
  onStatus: (message: string) => void,
  signal?: AbortSignal,
): Promise<Capture> {
  const started = Date.now();
  const safe = await assertPublicUrl(url);
  onStatus(`Checked that ${hostLabel(safe)} is a public address`);

  const result = await runCapture({
    target: safe.href,
    policy: { mode: "public" },
    status: onStatus,
    signal,
    verifyFinalHost: true,
    snapshot: true,
  });
  onStatus(
    `Captured both viewports in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  return { url: safe.href, ...result };
}

/** Renders generated HTML with the same collection, for re-scoring our own output. */
export async function captureHtml(
  html: string,
  onStatus: (m: string) => void = () => {},
  signal?: AbortSignal,
): Promise<Capture> {
  const result = await runCapture({
    target: GENERATED_URL,
    policy: { mode: "generated", documentUrl: GENERATED_URL, html },
    status: onStatus,
    signal,
    verifyFinalHost: false,
    snapshot: false,
  });
  return { ...result, url: GENERATED_URL, html, snapshotHtml: html };
}
