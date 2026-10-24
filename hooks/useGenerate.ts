"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { parseGenerateStream } from "@/lib/html-stream";
import type { GenerateRequest, Score } from "@/lib/types";

export interface GenerateState {
  /** Progressive HTML (protocol comments removed). */
  html: string;
  done: boolean;
  /** True after the html finished and while the server re-scores. */
  scoring: boolean;
  score: Score | null;
  error: string | null;
  /** The server swapped in a revised draft. */
  revised: boolean;
  /** The page finished but the stream ended before its score arrived. */
  truncated: boolean;
}

const INITIAL: GenerateState = {
  html: "",
  done: false,
  scoring: false,
  score: null,
  error: null,
  revised: false,
  truncated: false,
};

/** How often streamed text is pushed into React state. */
const FLUSH_MS = 90;

/**
 * Streams POST /api/generate. Starts automatically when `request` is non-null
 * and restarts whenever `runKey` changes. Tolerates React strict-mode
 * double-mounting without firing two generations.
 */
export function useGenerate(
  request: GenerateRequest | null,
  runKey: string | number = 0,
) {
  const [state, setState] = useState<GenerateState>(INITIAL);
  const requestRef = useRef(request);
  const hasRequest = request !== null;
  useEffect(() => {
    requestRef.current = request;
  }, [request]);
  const controllerRef = useRef<AbortController | null>(null);
  const pendingAbort = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeKey = useRef<string | number | null>(null);

  const run = useCallback(async (req: GenerateRequest) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState(INITIAL);

    let raw = "";
    let lastFlush = 0;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = (final = false) => {
      if (controller.signal.aborted) return;
      const parsed = parseGenerateStream(raw);
      const htmlComplete = /<\/html\s*>/i.test(parsed.html);
      // The stream can end early (maxDuration, a dropped network, a proxy)
      // without the closing meta comment. A half-written page is a failure;
      // a complete one is kept, flagged as having no score.
      const cutShort = final && !parsed.metaComplete;
      setState({
        html: parsed.html,
        done: final,
        scoring: !final && htmlComplete && !parsed.metaComplete,
        score: parsed.score,
        error:
          parsed.error ??
          (final && !parsed.html.trim()
            ? "The page came back empty. Try again."
            : cutShort && !htmlComplete
              ? "The connection dropped before the page finished. Try again."
              : null),
        revised: parsed.replaced,
        truncated: cutShort && htmlComplete,
      });
      lastFlush = Date.now();
    };

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let message = `Generation failed (${res.status}).`;
        try {
          const data = (await res.json()) as {
            error?: string;
            message?: string;
          };
          message = data.error ?? data.message ?? message;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(message);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        const since = Date.now() - lastFlush;
        if (since >= FLUSH_MS) {
          flush();
        } else if (!flushTimer) {
          flushTimer = setTimeout(() => {
            flushTimer = null;
            flush();
          }, FLUSH_MS - since);
        }
      }
      raw += decoder.decode();
      if (flushTimer) clearTimeout(flushTimer);
      flush(true);
    } catch (err) {
      if (flushTimer) clearTimeout(flushTimer);
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Generation failed.";
      setState((s) => ({ ...s, done: true, scoring: false, error: message }));
    }
  }, []);

  useEffect(() => {
    // Cancel an abort scheduled by a strict-mode unmount of this same run.
    if (pendingAbort.current) {
      clearTimeout(pendingAbort.current);
      pendingAbort.current = null;
    }
    const req = requestRef.current ?? request;
    if (req && activeKey.current !== runKey) {
      activeKey.current = runKey;
      void run(req);
    }
    return () => {
      pendingAbort.current = setTimeout(() => {
        controllerRef.current?.abort();
        activeKey.current = null;
      }, 0);
    };
    // `request` changes identity every render; callers restart via `runKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, hasRequest, run]);

  const retry = useCallback(() => {
    if (requestRef.current) void run(requestRef.current);
  }, [run]);

  const abort = useCallback(() => controllerRef.current?.abort(), []);

  return { ...state, retry, abort };
}
