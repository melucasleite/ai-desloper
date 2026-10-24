import http from "node:http";
import type net from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { closeBrowser, getBrowser } from "./browser";
import { egressProxyUrl } from "./egress";
import { captureHtml, capturePage } from "./capture";
import { assertPublicUrl, isPublicIp } from "./ssrf";

describe("ssrf", () => {
  it("rejects private and metadata addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "::1",
      "fd00::1",
    ]) {
      expect(isPublicIp(ip)).toBe(false);
    }
    expect(isPublicIp("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicIp("93.184.215.14")).toBe(true);
  });

  it("refuses non-http schemes and private hosts", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(assertPublicUrl("http://127.0.0.1/")).rejects.toThrow(
      /private/,
    );
    await expect(assertPublicUrl("http://localhost:3000")).rejects.toThrow();
    await expect(
      assertPublicUrl("http://169.254.169.254/latest"),
    ).rejects.toThrow(/private/);
  });
});

describe.skipIf(!process.env.CAPTURE_E2E)("capture (e2e)", () => {
  afterAll(() => closeBrowser());

  it("captures example.com", { timeout: 60_000 }, async () => {
    const statuses: string[] = [];
    const capture = await capturePage("example.com", (m) => statuses.push(m));
    console.log(statuses.join("\n"));
    console.log({
      finalUrl: capture.finalUrl,
      title: capture.title,
      fonts: capture.fonts,
      colors: capture.colors,
      cls: capture.cls,
      lcp: capture.lcp,
      desktopBlocks: capture.desktop.blocks.length,
      mobileLinks: capture.mobile.links,
      sections: capture.mobile.sections.map((s) => s.tag),
      mobileFullHeight: capture.mobile.fullHeight,
      snapshotBytes: capture.snapshotHtml.length,
    });
    expect(capture.finalUrl).toMatch(/^https:\/\/example\.com/);
    expect(capture.title).toMatch(/Example Domain/);
    expect(capture.desktop.blocks.length).toBeGreaterThan(0);
    expect(capture.mobile.links.length).toBeGreaterThan(0);
    expect(capture.desktop.screenshot.length).toBeGreaterThan(1000);
    expect(capture.mobile.width).toBe(390);
    expect(capture.snapshotHtml).toContain('<base href="https://example.com/"');
    expect(capture.snapshotHtml).not.toMatch(/<script/i);
  });

  it(
    "captures raw HTML and blocks disallowed network",
    { timeout: 60_000 },
    async () => {
      const html = `<!doctype html><html><head><title>Gen</title>
      <script>fetch("http://127.0.0.1:3000/").catch(()=>{})</script></head>
      <body><header><h1>Your score, in 30 seconds</h1><a class="btn" href="#go" style="padding:12px 20px;background:#111;color:#fff">See your score</a></header>
      <section><p>Second section</p><img src="https://example.com/x.png" width="10" height="10" alt=""></section></body></html>`;
      const capture = await captureHtml(html);
      expect(capture.title).toBe("Gen");
      expect(
        capture.desktop.blocks.find((b) => b.tag === "h1")?.text,
      ).toContain("30 seconds");
      expect(
        capture.mobile.links.find((l) => l.text === "See your score")?.isButton,
      ).toBe(true);
      expect(capture.snapshotHtml).toBe(html);
    },
  );

  it(
    "the egress proxy keeps Chromium off loopback, for pages, redirects and websockets",
    { timeout: 60_000 },
    async () => {
      const secret = http.createServer((req, res) => {
        if (req.url === "/hop") {
          res.writeHead(302, { location: "/" });
          return res.end();
        }
        res.end("internal secret");
      });
      await new Promise<void>((r) => secret.listen(0, "127.0.0.1", r));
      const port = (secret.address() as net.AddressInfo).port;
      const browser = await getBrowser();
      const context = await browser.newContext({
        proxy: { server: await egressProxyUrl() },
      });
      try {
        const page = await context.newPage();
        for (const target of [
          `http://127.0.0.1:${port}/`,
          `http://127.0.0.1:${port}/hop`,
          `http://localhost:${port}/`,
        ]) {
          await page.goto(target).catch(() => null);
          expect(await page.content()).not.toContain("internal secret");
        }
        const ws = await page.evaluate(
          (p) =>
            new Promise<string>((resolve) => {
              const s = new WebSocket(`ws://127.0.0.1:${p}/`);
              s.onopen = () => resolve("open");
              s.onerror = () => resolve("error");
            }),
          port,
        );
        expect(ws).toBe("error");
      } finally {
        await context.close();
        secret.close();
      }
    },
  );
});
