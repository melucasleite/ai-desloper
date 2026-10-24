// A tiny forward proxy that every browser context is pointed at. It is the
// real SSRF boundary: it resolves each host itself, refuses anything that is
// not a public unicast address, and connects to the exact address it checked.
// That covers every redirect hop, every subresource, WebSockets (tunnelled
// through CONNECT) and DNS rebinding, none of which a per-request route
// handler can see reliably.

import http from "node:http";
import net from "node:net";
import type { Duplex } from "node:stream";
import { resolvePublicAddress } from "./ssrf";

const CONNECT_TIMEOUT_MS = 15_000;
const IDLE_TIMEOUT_MS = 60_000;

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const store = globalThis as typeof globalThis & {
  __deslopEgress?: Promise<string>;
};

function refuse(socket: Duplex, status = "403 Forbidden") {
  if (socket.writable) {
    socket.end(
      `HTTP/1.1 ${status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`,
    );
  } else {
    socket.destroy();
  }
}

/** Splits "host:port" (with optional [v6] brackets). */
function splitAuthority(
  authority: string,
): { host: string; port: number } | null {
  const m = /^\[?([^\]]+?)\]?:(\d{1,5})$/.exec(authority.trim());
  if (!m) return null;
  const port = Number(m[2]);
  if (!port || port > 65_535) return null;
  return { host: m[1]!, port };
}

function onConnect(req: http.IncomingMessage, client: Duplex, head: Buffer) {
  client.on("error", () => {});
  const target = splitAuthority(req.url ?? "");
  if (!target) return refuse(client, "400 Bad Request");

  void resolvePublicAddress(target.host).then((address) => {
    if (!address) return refuse(client);
    const upstream = net.connect({
      host: address,
      port: target.port,
      timeout: CONNECT_TIMEOUT_MS,
    });
    upstream.once("timeout", () => upstream.destroy());
    upstream.once("connect", () => {
      upstream.setTimeout(IDLE_TIMEOUT_MS);
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.once("error", () => refuse(client, "502 Bad Gateway"));
    upstream.once("close", () => client.destroy());
    client.once("close", () => upstream.destroy());
  });
}

function onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  let url: URL;
  try {
    url = new URL(req.url ?? "");
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (url.protocol !== "http:") {
    res.writeHead(400).end();
    return;
  }

  void resolvePublicAddress(url.hostname).then((address) => {
    if (!address) {
      res.writeHead(403).end();
      return;
    }
    const headers: http.OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(name.toLowerCase())) headers[name] = value;
    }
    headers.host = url.host;

    const upstream = http.request({
      host: address,
      port: url.port ? Number(url.port) : 80,
      method: req.method,
      path: `${url.pathname}${url.search}`,
      headers,
      setHost: false,
      timeout: CONNECT_TIMEOUT_MS,
    });
    upstream.once("timeout", () => upstream.destroy(new Error("timeout")));
    upstream.once("response", (up) => {
      const out: http.OutgoingHttpHeaders = {};
      for (const [name, value] of Object.entries(up.headers)) {
        if (!HOP_BY_HOP.has(name.toLowerCase()) && value !== undefined)
          out[name] = value;
      }
      res.writeHead(up.statusCode ?? 502, up.statusMessage, out);
      up.pipe(res);
    });
    upstream.once("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
}

function start(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(onRequest);
    server.on("connect", onConnect);
    // Browsers never upgrade a plain proxied request; refuse rather than hang.
    server.on("upgrade", (_req, socket) => refuse(socket, "400 Bad Request"));
    server.on("clientError", (_err, socket) => socket.destroy());
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.unref();
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Egress proxy failed to bind."));
        return;
      }
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

/** The proxy URL to hand to Playwright (`proxy.server`). One per process. */
export function egressProxyUrl(): Promise<string> {
  const pending = (store.__deslopEgress ??= start());
  pending.catch(() => {
    if (store.__deslopEgress === pending) store.__deslopEgress = undefined;
  });
  return pending;
}
