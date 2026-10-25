"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

interface Props {
  onSubmit(url: string): void;
  error?: string | null;
}

const EXAMPLES = [
  "yourstartup.ai",
  "acme-analytics.io",
  "launch.example.com",
  "getmyapp.dev",
  "your-product.co",
];

/** Returns a normalized https URL, or null when it doesn't look like a page. */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (!u.hostname.includes(".") || u.hostname.endsWith(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export default function Idle({ onSubmit, error }: Props) {
  const [value, setValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [example, setExample] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(
      () => setExample((i) => (i + 1) % EXAMPLES.length),
      2600,
    );
    return () => clearInterval(id);
  }, [reduced]);

  useEffect(() => inputRef.current?.focus(), []);

  const submit = (raw: string) => {
    const url = normalizeUrl(raw);
    if (!url) {
      setLocalError("That doesn't look like a web address. Try example.com.");
      return;
    }
    setLocalError(null);
    onSubmit(url);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    const url = normalizeUrl(text);
    if (!url || value.trim()) return;
    e.preventDefault();
    setValue(text.trim());
    // A beat so the pasted address registers before the field morphs away.
    setTimeout(() => onSubmit(url), 260);
  };

  const shownError = localError ?? error ?? null;

  return (
    <section className="flex flex-1 flex-col items-center justify-center px-5 pb-[12vh] sm:px-8">
      <div className="w-full max-w-2xl">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 26 }}
          className="text-center text-[clamp(2.25rem,6vw,4rem)] font-semibold [font-stretch:94%]"
        >
          Paste a landing page.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 26,
            delay: 0.06,
          }}
          className="mx-auto mt-4 max-w-md text-center text-lg text-muted"
        >
          We score how generic it reads, show you why, and write the prompt your
          AI needs to fix it.
        </motion.p>

        <form
          className="mt-10"
          onSubmit={(e) => {
            e.preventDefault();
            submit(value);
          }}
        >
          <motion.div
            layoutId="url-pill"
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            style={{ borderRadius: 28 }}
            className={`relative flex items-center border bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_40px_-20px_rgb(0_0_0/0.18)] transition-colors ${
              shownError
                ? "border-bad"
                : focused
                  ? "border-accent"
                  : "border-line"
            }`}
          >
            <label htmlFor="url" className="sr-only">
              Landing page address
            </label>
            <input
              id="url"
              ref={inputRef}
              type="text"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (localError) setLocalError(null);
              }}
              onPaste={onPaste}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              aria-invalid={shownError ? true : undefined}
              aria-describedby="url-help"
              className="peer h-16 w-full min-w-0 bg-transparent pr-16 pl-6 text-lg text-ink outline-none sm:h-[4.5rem] sm:text-xl"
            />
            {!value ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-6 flex items-center overflow-hidden text-lg text-muted/70 sm:text-xl"
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={EXAMPLES[example]}
                    initial={{ y: 18, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -18, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  >
                    {EXAMPLES[example]}
                  </motion.span>
                </AnimatePresence>
              </span>
            ) : null}
            <button
              type="submit"
              aria-label="Analyze this page"
              disabled={!value.trim()}
              className="absolute right-2.5 flex size-11 items-center justify-center rounded-full bg-ink text-bg transition-[opacity,transform] duration-200 hover:scale-[1.04] active:scale-95 disabled:opacity-25 sm:size-12"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </motion.div>

          <div id="url-help" className="mt-4 min-h-6 px-6 text-sm">
            <AnimatePresence mode="wait" initial={false}>
              {shownError ? (
                <motion.p
                  key="error"
                  role="alert"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-bad"
                >
                  {shownError}
                </motion.p>
              ) : (
                <motion.p
                  key="help"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-muted"
                >
                  Paste and it starts, or press Enter. Any public page works.
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </form>
      </div>
    </section>
  );
}
