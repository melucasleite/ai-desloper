import http from "node:http";
import net from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { egressProxyUrl } from "./egress";
import { acquireCaptureSlot, CaptureBusyError } from "./limits";
import { isVerifiedQuote } from "./judge";
import { take } from "../rate-limit";

let secret: http.Server;
let secretPort = 0;

beforeAll(async () => {
  secret = http.createServer((_req, res) => res.end("internal secret"));
  await new Promise<void>((r) => secret.listen(0, "127.0.0.1", r));
  secretPort = (secret.address() as net.AddressInfo).port;
});
afterAll(() => secret.close());

function proxyPort(url: string) {
  return Number(new URL(url).port);
}

describe("egress proxy", () => {
  it("refuses CONNECT tunnels to loopback and metadata addresses", async () => {
    const port = proxyPort(await egressProxyUrl());
    for (const target of [
      `127.0.0.1:${secretPort}`,
      "169.254.169.254:80",
      "localhost:80",
      "[::1]:80",
    ]) {
      const reply = await new Promise<string>((resolve) => {
        const sock = net.connect(port, "127.0.0.1", () => {
          sock.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`);
        });
        let buf = "";
        sock.on("data", (d) => (buf += d.toString()));
        sock.on("close", () => resolve(buf));
        sock.on("error", () => resolve(buf));
      });
      expect(reply).toMatch(/^HTTP\/1\.1 4\d\d/);
      expect(reply).not.toContain("internal secret");
    }
  });

  it("refuses plain proxied requests to private hosts", async () => {
    const port = proxyPort(await egressProxyUrl());
    const { status, body } = await new Promise<{
      status: number;
      body: string;
    }>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path: `http://127.0.0.1:${secretPort}/`,
          headers: { host: `127.0.0.1:${secretPort}` },
        },
        (res) => {
          let body = "";
          res.on("data", (d) => (body += d));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(403);
    expect(body).not.toContain("internal secret");
  });
});

describe("capture slots", () => {
  it("caps concurrency and refuses once the queue is full", async () => {
    const held = await Promise.all([
      acquireCaptureSlot(),
      acquireCaptureSlot(),
    ]);
    const waiting = Array.from({ length: 4 }, () => acquireCaptureSlot());
    await expect(acquireCaptureSlot()).rejects.toBeInstanceOf(CaptureBusyError);
    held.forEach((release) => release());
    // Each waiter gets a slot handed over as one is released.
    for (const pending of waiting) (await pending)();
  });
});

describe("judge quote verification", () => {
  const page =
    "we close your books in four days, not four weeks. the ai does the matching.";
  it("rejects trivially short quotes that match any page", () => {
    for (const q of ["the", "AI", ".", "the ai"]) {
      expect(isVerifiedQuote(q, page)).toBe(false);
    }
  });
  it("accepts a meaningful verbatim quote", () => {
    expect(isVerifiedQuote("We close your books in four days", page)).toBe(
      true,
    );
    expect(isVerifiedQuote("We close your books in two days", page)).toBe(
      false,
    );
  });
});

describe("rate limit", () => {
  it("allows a burst, then asks the caller to wait", () => {
    const key = `test-${Math.random()}`;
    const now = 1_000_000;
    for (let i = 0; i < 6; i++) expect(take("analyze", key, now).ok).toBe(true);
    const denied = take("analyze", key, now);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.retryAfter).toBeGreaterThan(0);
    expect(take("analyze", key, now + 10 * 60_000).ok).toBe(true);
  });
});
