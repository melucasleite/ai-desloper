import type { Browser } from "playwright-core";

// One browser per process; each capture gets its own isolated context.
const store = globalThis as typeof globalThis & {
  __deslopBrowser?: Promise<Browser>;
};

const SHARED_ARGS = [
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--mute-audio",
  // WebRTC can send UDP straight past the egress proxy; keep it proxied-only.
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--webrtc-ip-handling-policy=disable_non_proxied_udp",
];

function isServerless() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function launch(): Promise<Browser> {
  if (isServerless()) {
    const [{ chromium }, { default: Chromium }] = await Promise.all([
      import("playwright-core"),
      import("@sparticuz/chromium"),
    ]);
    return chromium.launch({
      executablePath: await Chromium.executablePath(),
      args: [...Chromium.args, ...SHARED_ARGS],
      headless: true,
    });
  }
  // Locally, the "playwright" dev dependency ships with a downloaded chromium.
  const { chromium } = await import("playwright");
  return chromium.launch({
    headless: true,
    args: SHARED_ARGS,
  }) as unknown as Promise<Browser>;
}

export async function getBrowser(): Promise<Browser> {
  const existing = store.__deslopBrowser;
  if (existing) {
    const browser = await existing.catch(() => null);
    if (browser?.isConnected()) return browser;
  }
  const pending = launch().then((browser) => {
    browser.on("disconnected", () => {
      if (store.__deslopBrowser === pending) store.__deslopBrowser = undefined;
    });
    return browser;
  });
  store.__deslopBrowser = pending;
  pending.catch(() => {
    if (store.__deslopBrowser === pending) store.__deslopBrowser = undefined;
  });
  return pending;
}

export async function closeBrowser() {
  const existing = store.__deslopBrowser;
  store.__deslopBrowser = undefined;
  const browser = await existing?.catch(() => null);
  await browser?.close().catch(() => {});
}
