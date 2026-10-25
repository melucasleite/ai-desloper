import { lookup } from "node:dns/promises";
import net from "node:net";
import ipaddr from "ipaddr.js";
import type { BrowserContext, Route } from "playwright-core";

/** Only plain unicast addresses on the public internet are allowed. */
export function isPublicIp(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  let addr = ipaddr.parse(ip);
  if (addr.kind() === "ipv6" && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    addr = (addr as ipaddr.IPv6).toIPv4Address();
  }
  if (addr.range() !== "unicast") return false;
  // Cloud metadata endpoints that sit inside otherwise-unicast space.
  const normalized = addr.toNormalizedString();
  if (normalized === "100.100.100.200") return false;
  if (addr.kind() === "ipv6" && normalized.startsWith("fd00:ec2:"))
    return false;
  return true;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

function blockedName(host: string): boolean {
  return (
    !host ||
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  );
}

/**
 * Resolves a hostname (or IP literal) and returns an address to connect to,
 * or null unless every address it resolves to is public. Never cached: the
 * egress proxy connects to exactly the address returned here, which is what
 * defeats DNS rebinding.
 */
export async function resolvePublicAddress(
  hostname: string,
): Promise<string | null> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (blockedName(host)) return null;
  if (ipaddr.isValid(host)) return isPublicIp(host) ? host : null;
  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (records.length === 0) return null;
    if (!records.every((r) => isPublicIp(r.address))) return null;
    return records[0]!.address;
  } catch {
    return null;
  }
}

// Advisory only: the route guard uses this to fail fast, but the egress proxy
// (lib/analyze/egress.ts) re-resolves and enforces at connect time.
const hostCache = new Map<string, { ok: boolean; at: number }>();
const HOST_CACHE_MS = 30_000;

/**
 * Fast pre-check that a hostname resolves only to public addresses. Advisory:
 * the answer can go stale (DNS rebinding), so anything that actually connects
 * must go through the egress proxy or `publicLookup`.
 */
export async function isPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (blockedName(host)) return false;
  if (ipaddr.isValid(host)) return isPublicIp(host);

  const cached = hostCache.get(host);
  if (cached && Date.now() - cached.at < HOST_CACHE_MS) return cached.ok;
  const ok = (await resolvePublicAddress(host)) !== null;
  hostCache.set(host, { ok, at: Date.now() });
  return ok;
}

/**
 * A `lookup` for node:http/https requests that only ever yields a public
 * address, so the connection goes to the address that was checked.
 */
export function publicLookup(
  hostname: string,
  options: unknown,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | { address: string; family: number }[],
    family?: number,
  ) => void,
): void {
  const all =
    typeof options === "object" &&
    options !== null &&
    (options as { all?: boolean }).all === true;
  void resolvePublicAddress(hostname).then((address) => {
    if (!address) {
      const err: NodeJS.ErrnoException = new Error(
        `Refusing to connect to non-public host ${hostname}`,
      );
      err.code = "EACCES";
      callback(err, all ? [] : "", 4);
      return;
    }
    const family = net.isIPv6(address) ? 6 : 4;
    if (all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  });
}

/**
 * Normalizes user input into a URL that is safe to fetch from the server.
 * Throws an Error with a message suitable for showing to the user.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const input = (raw ?? "").trim();
  if (!input) throw new Error("Paste a URL to get started.");

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
    ? input
    : `https://${input}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("That doesn't look like a URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https pages can be analyzed.");
  }
  if (url.username || url.password) {
    throw new Error("URLs with credentials in them can't be analyzed.");
  }
  if (url.port && !["80", "443", "8080", "8443"].includes(url.port)) {
    throw new Error("That port isn't allowed. Use a normal web address.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host.includes(".") && !ipaddr.isValid(host)) {
    throw new Error("That doesn't look like a public web address.");
  }

  if (ipaddr.isValid(host)) {
    if (!isPublicIp(host))
      throw new Error("That address points to a private network.");
    return url;
  }

  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (records.length === 0) throw new Error("empty");
    if (!records.every((r) => isPublicIp(r.address))) {
      throw new Error("That address points to a private network.");
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("private network"))
      throw err;
    throw new Error(`We couldn't find ${host}. Check the spelling?`);
  }
  return url;
}

export type NetworkPolicy =
  /** Live pages: any public http(s) host; private addresses are aborted. */
  | { mode: "public" }
  /** Generated pages: only Google Fonts and https images, plus a fulfilled document. */
  | { mode: "generated"; documentUrl: string; html: string }
  /** The command line, on the owner's machine: any http(s) host, localhost included. */
  | { mode: "local" };

const GENERATED_ALLOWED_HOSTS = new Set([
  "fonts.googleapis.com",
  "fonts.gstatic.com",
]);

/**
 * Installs a request guard on a browser context: scheme filtering, the
 * generated-mode allowlist and a fast private-host pre-check. This is not the
 * SSRF boundary on its own. Playwright only routes the first hop of a redirect
 * chain and never routes WebSockets, so every context must also use the egress
 * proxy (lib/analyze/egress.ts), which enforces the IP policy at connect time.
 */
export async function guardContext(
  context: BrowserContext,
  policy: NetworkPolicy,
) {
  await context.route("**/*", async (route: Route) => {
    const request = route.request();
    const href = request.url();
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return route.abort("blockedbyclient");
    }
    if (url.protocol === "data:" || url.protocol === "blob:")
      return route.continue();
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return route.abort("blockedbyclient");
    }

    const type = request.resourceType();
    // Video/audio streams are heavy and never needed for analysis.
    if (type === "media") return route.abort("blockedbyclient");

    if (policy.mode === "generated") {
      if (href === policy.documentUrl) {
        return route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: policy.html,
        });
      }
      const allowed =
        GENERATED_ALLOWED_HOSTS.has(url.hostname) ||
        (url.protocol === "https:" && type === "image");
      if (!allowed || !(await isPublicHost(url.hostname))) {
        return route.abort("blockedbyclient");
      }
      return route.continue();
    }

    if (policy.mode === "local") return route.continue();
    if (!(await isPublicHost(url.hostname)))
      return route.abort("blockedbyclient");
    return route.continue();
  });
}
