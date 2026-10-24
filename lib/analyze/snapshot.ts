import http from "node:http";
import https from "node:https";
import type { Page } from "playwright-core";
import { publicLookup } from "./ssrf";

// In-page scripts are plain JS strings so bundler/test transforms can never
// inject helpers into code that runs inside the browser.

const LIST_SHEETS = `(() => {
  return Array.from(document.querySelectorAll('link[rel~="stylesheet" i][href]')).map((link) => {
    let rules = null;
    try {
      const list = link.sheet && link.sheet.cssRules;
      if (list && list.length) rules = Array.from(list).map((r) => r.cssText).join("\\n");
    } catch (e) {}
    return { href: link.href, rules };
  });
})()`;

// Best-effort cleanup only, NOT a security boundary: this runs in the target
// page's main world, so a hostile page can patch the DOM APIs it calls and
// return any markup it likes. Safety comes from how the result is served
// (app/api/snapshot/[id]/route.ts: CSP `sandbox`, no scripts, opaque origin).
const SERIALIZE = `(arg) => {
  const doc = document;
  const rulesText = (sheet) => {
    try {
      const list = sheet && sheet.cssRules;
      return list && list.length ? Array.from(list).map((r) => r.cssText).join("\\n") : null;
    } catch (e) {
      return null;
    }
  };

  // Read live state before cloning: resolved image sources, CSSOM-injected rules, canvases.
  const imgSrcs = Array.from(doc.querySelectorAll("img")).map((img) => {
    const lazy = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original");
    const current = img.currentSrc || img.src || "";
    if (current && !current.startsWith("data:image/gif") && !current.startsWith("data:image/svg")) return current;
    if (lazy) {
      try { return new URL(lazy, doc.baseURI).href; } catch (e) {}
    }
    return current;
  });
  const styleTexts = Array.from(doc.querySelectorAll("style")).map((s) => rulesText(s.sheet));
  const canvases = Array.from(doc.querySelectorAll("canvas")).map((c) => {
    try {
      if (!c.width || !c.height) return null;
      const rect = c.getBoundingClientRect();
      return { data: c.toDataURL("image/png"), w: Math.round(rect.width), h: Math.round(rect.height) };
    } catch (e) {
      return null;
    }
  });
  const adopted = (doc.adoptedStyleSheets || []).map(rulesText).filter(Boolean).join("\\n");

  const root = doc.documentElement.cloneNode(true);
  const all = (sel) => Array.from(root.querySelectorAll(sel));

  all("style").forEach((s, i) => {
    if (styleTexts[i]) s.textContent = styleTexts[i];
  });

  let inlined = 0;
  all('link[rel~="stylesheet" i][href]').forEach((link) => {
    let href = "";
    try { href = new URL(link.getAttribute("href"), doc.baseURI).href; } catch (e) {}
    const css = arg.css[href];
    if (css == null) {
      if (href) link.setAttribute("href", href);
      return;
    }
    const style = doc.createElement("style");
    style.setAttribute("data-deslop-href", href);
    const media = link.getAttribute("media");
    if (media && media !== "all") style.setAttribute("media", media);
    style.textContent = css;
    link.replaceWith(style);
    inlined++;
  });

  all("img").forEach((img, i) => {
    const src = imgSrcs[i];
    if (src) img.setAttribute("src", src);
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.removeAttribute("loading");
    img.removeAttribute("decoding");
  });
  all("picture source").forEach((s) => s.remove());
  all("canvas").forEach((c, i) => {
    const shot = canvases[i];
    if (!shot) return;
    const img = doc.createElement("img");
    img.setAttribute("src", shot.data);
    img.setAttribute("width", String(shot.w));
    img.setAttribute("height", String(shot.h));
    if (c.getAttribute("class")) img.setAttribute("class", c.getAttribute("class"));
    if (c.getAttribute("style")) img.setAttribute("style", c.getAttribute("style"));
    c.replaceWith(img);
  });
  all("video").forEach((v) => {
    v.removeAttribute("autoplay");
    v.setAttribute("preload", "none");
  });

  all(
    'script, noscript, iframe, frame, frameset, object, embed, applet, portal, base, meta[http-equiv], ' +
      'link[rel~="preload" i], link[rel~="modulepreload" i], link[rel~="prefetch" i], ' +
      'link[rel~="prerender" i], link[rel~="manifest" i], link[rel~="serviceworker" i]'
  ).forEach((el) => el.remove());

  const urlAttrs = ["href", "src", "action", "formaction", "xlink:href", "data", "poster"];
  [root, ...all("*")].forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") {
        el.removeAttribute(attr.name);
      } else if (urlAttrs.includes(name) && /^\\s*(javascript|vbscript):/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });

  let head = root.querySelector("head");
  if (!head) {
    head = doc.createElement("head");
    root.insertBefore(head, root.firstChild);
  }
  if (adopted) {
    const style = doc.createElement("style");
    style.textContent = adopted;
    head.appendChild(style);
  }
  const csp = doc.createElement("meta");
  csp.setAttribute("http-equiv", "Content-Security-Policy");
  csp.setAttribute("content", "script-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'");
  const base = doc.createElement("base");
  base.setAttribute("href", arg.base);
  head.insertBefore(base, head.firstChild);
  head.insertBefore(csp, head.firstChild);
  let charset = head.querySelector("meta[charset]");
  if (!charset) {
    charset = doc.createElement("meta");
    charset.setAttribute("charset", "utf-8");
  }
  head.insertBefore(charset, head.firstChild);

  return { html: "<!DOCTYPE html>\\n" + root.outerHTML, inlined };
}`;

const MAX_SHEET_BYTES = 1_500_000;
const SHEET_TIMEOUT_MS = 5_000;

/** Records the body of every stylesheet the page loads, so we rarely refetch. */
export function trackStylesheets(
  page: Page,
): Map<string, Promise<string | null>> {
  const sheets = new Map<string, Promise<string | null>>();
  page.on("response", (response) => {
    if (response.request().resourceType() !== "stylesheet" || !response.ok())
      return;
    sheets.set(
      response.url(),
      response.text().catch(() => null),
    );
  });
  return sheets;
}

/** Makes url(...) and @import references absolute against the stylesheet's own URL. */
export function absolutizeCss(css: string, sheetUrl: string): string {
  const resolve = (ref: string) => {
    const trimmed = ref.trim();
    if (!trimmed || /^(data:|#|[a-z][a-z0-9+.-]*:)/i.test(trimmed))
      return trimmed;
    try {
      return new URL(trimmed, sheetUrl).href;
    } catch {
      return trimmed;
    }
  };
  return css
    .replace(
      /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi,
      (_m, quote: string, ref: string) => {
        return `url(${quote}${resolve(ref)}${quote})`;
      },
    )
    .replace(
      /@import\s+(['"])([^'"]+)\1/gi,
      (_m, quote: string, ref: string) => {
        return `@import ${quote}${resolve(ref)}${quote}`;
      },
    );
}

async function fetchSheet(
  href: string,
  signal?: AbortSignal,
): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const timeout = AbortSignal.timeout(SHEET_TIMEOUT_MS);
  const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const client = url.protocol === "https:" ? https : http;

  // node:http with a validating `lookup`: the socket connects to the exact
  // address that was checked, so DNS rebinding can't swap in a private one.
  // No redirects are followed.
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const req = client.get(
      url,
      {
        lookup: publicLookup,
        signal: abort,
        headers: { accept: "text/css,*/*;q=0.1" },
      },
      (res) => {
        if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
          res.resume();
          return done(null);
        }
        res.setEncoding("utf8");
        let text = "";
        res.on("data", (chunk: string) => {
          text += chunk;
          if (text.length > MAX_SHEET_BYTES) {
            req.destroy();
            done(null);
          }
        });
        res.on("end", () => done(text));
        res.on("error", () => done(null));
      },
    );
    req.on("error", () => done(null));
  });
}

/** Bounds an in-page call; the capture deadline closes the context regardless. */
function bounded<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
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

/**
 * Serializes the rendered DOM into a self-contained, script-free document:
 * <base href> injected, stylesheets inlined, handlers stripped, lazy images frozen.
 */
export async function buildSnapshot(
  page: Page,
  finalUrl: string,
  options: {
    sheets?: Map<string, Promise<string | null>>;
    signal?: AbortSignal;
  } = {},
): Promise<{ html: string; inlined: number }> {
  const links = await bounded(
    page.evaluate<{ href: string; rules: string | null }[]>(LIST_SHEETS),
  );
  const css: Record<string, string> = {};

  await Promise.all(
    links.map(async ({ href, rules }) => {
      if (!href || css[href] != null) return;
      let text = (await options.sheets?.get(href)) ?? null;
      if (text == null || text.length > MAX_SHEET_BYTES) text = rules;
      if (text == null) text = await fetchSheet(href, options.signal);
      if (text != null) css[href] = absolutizeCss(text, href);
    }),
  );

  options.signal?.throwIfAborted();
  return bounded(
    page.evaluate<{ html: string; inlined: number }>(
      `(${SERIALIZE})(${JSON.stringify({ base: finalUrl, css })})`,
    ),
  );
}
