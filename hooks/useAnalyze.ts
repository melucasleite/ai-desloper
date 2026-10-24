"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { AnalyzeEvent, Box, Finding, Report, Score } from "@/lib/types";

export type ScreenshotInfo = { url: string; fullHeight: number; width: number };
export type Screenshots = Partial<Record<"desktop" | "mobile", ScreenshotInfo>>;

interface State {
  running: boolean;
  events: AnalyzeEvent[];
  status: string | null;
  lastBox: Box | null;
  screenshots: Screenshots;
  findings: Finding[];
  score: Score | null;
  report: Report | null;
  error: string | null;
}

type Action =
  | { type: "start" }
  | { type: "event"; event: AnalyzeEvent }
  | { type: "fail"; message: string }
  | { type: "end" };

const initial: State = {
  running: false,
  events: [],
  status: null,
  lastBox: null,
  screenshots: {},
  findings: [],
  score: null,
  report: null,
  error: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "start":
      return { ...initial, running: true, status: "Starting up" };
    case "fail":
      return { ...state, running: false, error: action.message };
    case "end":
      if (state.report || state.error) return { ...state, running: false };
      return {
        ...state,
        running: false,
        error: "The analysis stopped before it finished. Try again.",
      };
    case "event": {
      const ev = action.event;
      const next: State = { ...state, events: [...state.events, ev] };
      switch (ev.type) {
        case "status":
          next.status = ev.message;
          if (ev.box) next.lastBox = ev.box;
          break;
        case "screenshot":
          next.screenshots = {
            ...state.screenshots,
            [ev.viewport]: {
              url: ev.url,
              fullHeight: ev.fullHeight,
              width: ev.width,
            },
          };
          break;
        case "finding":
          next.findings = [...state.findings, ev.finding];
          if (ev.finding.boxes[0]) next.lastBox = ev.finding.boxes[0];
          break;
        case "score":
          next.score = ev.score;
          break;
        case "done":
          next.report = ev.report;
          next.score = ev.report.score;
          next.findings = ev.report.findings;
          next.status = "Read complete";
          next.running = false;
          break;
        case "error":
          next.error = ev.message;
          next.running = false;
          break;
      }
      return next;
    }
  }
}

/** Parses one SSE block ("data: ..." lines); ignores comments and heartbeats. */
function parseBlock(block: string): AnalyzeEvent | null {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data) return null;
  try {
    return JSON.parse(data) as AnalyzeEvent;
  } catch {
    return null;
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    if (body.error || body.message) return (body.error ?? body.message)!;
  } catch {
    // not JSON
  }
  if (res.status === 429) return "Too many requests. Give it a minute.";
  return "We couldn't start the analysis. Try again.";
}

export function useAnalyze() {
  const [state, dispatch] = useReducer(reducer, initial);
  const controller = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  const start = useCallback(async (url: string) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    dispatch({ type: "start" });

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        dispatch({ type: "fail", message: await readError(res) });
        return;
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value.replace(/\r\n?/g, "\n");
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const event = parseBlock(buffer.slice(0, idx));
          buffer = buffer.slice(idx + 2);
          if (event) dispatch({ type: "event", event });
        }
      }
      const tail = parseBlock(buffer);
      if (tail) dispatch({ type: "event", event: tail });
      if (controller.current === ctrl) dispatch({ type: "end" });
    } catch {
      if (ctrl.signal.aborted) return;
      dispatch({
        type: "fail",
        message: "Lost the connection mid-read. Try again.",
      });
    } finally {
      if (controller.current === ctrl) controller.current = null;
    }
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  return { ...state, start, abort };
}
