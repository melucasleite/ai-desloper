"use client";

import {
  useCallback,
  useLayoutEffect,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";

import {
  countClosedBlocks,
  emptyCounts,
  injectIntoHead,
  renderableStreamHtml,
  streamFadeStyle,
  type BlockCounts,
} from "@/lib/html-stream";

export type FrameViewport = "desktop" | "mobile";

export const VIEWPORT_WIDTH: Record<FrameViewport, number> = {
  desktop: 1440,
  mobile: 390,
};

export interface HtmlFrameHandle {
  /** Scroll to a 0..1 fraction of the document without echoing onScrollRatio. */
  setScrollRatio(ratio: number): void;
}

interface HtmlFrameProps {
  /** Raw HTML document, rendered via srcdoc. */
  html?: string;
  /** Same-origin URL (e.g. a frozen snapshot), used when `html` is absent. */
  src?: string;
  title: string;
  viewport?: FrameViewport;
  /** Throttle updates and only reveal fully closed blocks. */
  streaming?: boolean;
  /** While streaming, keep the newest block in view unless the reader scrolled up. */
  follow?: boolean;
  onScrollRatio?(ratio: number): void;
  ref?: Ref<HtmlFrameHandle>;
  className?: string;
}

const STREAM_THROTTLE_MS = 400;
const BASE_STYLE =
  "<style data-deslop-base>html{scrollbar-width:thin}html,body{overscroll-behavior:none}</style>";

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function scrollRatioOf(win: Window): number {
  const doc = win.document.scrollingElement ?? win.document.documentElement;
  const max = doc.scrollHeight - win.innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, win.scrollY / max)) : 0;
}

/**
 * A sandboxed, script-free iframe (allow-same-origin only, so the parent can
 * read scroll position). Renders at a fixed CSS width and scales to fit.
 * While streaming it double-buffers two frames so updates never flash.
 */
export default function HtmlFrame({
  html,
  src,
  title,
  viewport = "desktop",
  streaming = false,
  follow = false,
  onScrollRatio,
  ref,
  className = "",
}: HtmlFrameProps) {
  const [boxRef, box] = useElementSize<HTMLDivElement>();
  const frameA = useRef<HTMLIFrameElement>(null);
  const frameB = useRef<HTMLIFrameElement>(null);
  const frames = [frameA, frameB];
  const [front, setFront] = useState(0);
  const [docs, setDocs] = useState<[string | null, string | null]>([
    null,
    null,
  ]);
  const [hasContent, setHasContent] = useState(false);

  const frontRef = useRef(front);
  const onScrollRef = useRef(onScrollRatio);
  const suppressUntil = useRef(0);
  const shownCounts = useRef<BlockCounts>(emptyCounts());
  const lastRendered = useRef<string | null>(null);
  const latestHtml = useRef(html);
  const followRef = useRef(follow);
  const pinnedToBottom = useRef(true);
  const hasRendered = useRef(false);
  const srcMode = html === undefined;

  // Mirror the latest props into refs for event handlers and timers.
  useLayoutEffect(() => {
    frontRef.current = front;
    onScrollRef.current = onScrollRatio;
    latestHtml.current = html;
    followRef.current = follow;
  });

  const width = VIEWPORT_WIDTH[viewport];
  const scale = box.width > 0 ? Math.min(1, box.width / width) : 1;
  const frameHeight = box.height > 0 ? box.height / scale : 900;
  const offsetX = Math.max(0, (box.width - width * scale) / 2);

  useImperativeHandle(
    ref,
    () => ({
      setScrollRatio(ratio: number) {
        const win = frames[frontRef.current].current?.contentWindow;
        if (!win) return;
        try {
          const doc =
            win.document.scrollingElement ?? win.document.documentElement;
          suppressUntil.current = performance.now() + 120;
          win.scrollTo({ top: ratio * (doc.scrollHeight - win.innerHeight) });
        } catch {
          /* cross-origin src: no sync */
        }
      },
    }),
    // frames are stable refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Build the next document and write it into the back buffer.
  const pushDocument = useCallback((nextHtml: string, isStreaming: boolean) => {
    let doc: string | null;
    if (isStreaming) {
      const partial = renderableStreamHtml(nextHtml);
      if (!partial) return;
      doc = injectIntoHead(
        partial,
        BASE_STYLE + streamFadeStyle(shownCounts.current),
      );
      shownCounts.current = countClosedBlocks(partial);
    } else {
      doc = injectIntoHead(nextHtml, BASE_STYLE);
    }
    if (doc === lastRendered.current) return;
    lastRendered.current = doc;
    setDocs((prev) => {
      const back = hasRendered.current
        ? 1 - frontRef.current
        : frontRef.current;
      const next: [string | null, string | null] = [...prev];
      next[back] = doc;
      return next;
    });
  }, []);

  // Final (non-streaming) html: render immediately.
  useEffect(() => {
    if (streaming || html === undefined) return;
    pushDocument(html, false);
  }, [html, streaming, pushDocument]);

  // Streaming html: sample every STREAM_THROTTLE_MS.
  useEffect(() => {
    if (!streaming) return;
    const tick = () => {
      if (latestHtml.current !== undefined)
        pushDocument(latestHtml.current, true);
    };
    tick();
    const id = setInterval(tick, STREAM_THROTTLE_MS);
    return () => clearInterval(id);
  }, [streaming, pushDocument]);

  const attachScroll = useCallback((iframe: HTMLIFrameElement) => {
    try {
      const win = iframe.contentWindow;
      if (!win) return;
      win.addEventListener(
        "scroll",
        () => {
          if (iframe !== frames[frontRef.current].current) return;
          const ratio = scrollRatioOf(win);
          pinnedToBottom.current = ratio > 0.97;
          if (performance.now() < suppressUntil.current) return;
          onScrollRef.current?.(ratio);
        },
        { passive: true },
      );
    } catch {
      /* cross-origin */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoad = useCallback(
    (index: number) => {
      const iframe = frames[index].current;
      if (!iframe) return;
      attachScroll(iframe);
      setHasContent(true);
      if (srcMode) return; // src mode: single frame

      const isFirst = !hasRendered.current;
      hasRendered.current = true;
      if (!isFirst && index === frontRef.current) return;

      // Carry the reader's scroll position into the fresh buffer, then swap.
      try {
        const prevWin = frames[frontRef.current].current?.contentWindow;
        const nextWin = iframe.contentWindow;
        if (nextWin && prevWin && !isFirst) {
          suppressUntil.current = performance.now() + 120;
          nextWin.scrollTo({ top: prevWin.scrollY });
        }
        if (
          nextWin &&
          streaming &&
          followRef.current &&
          pinnedToBottom.current
        ) {
          const reduce = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches;
          requestAnimationFrame(() =>
            nextWin.scrollTo({
              top: nextWin.document.documentElement.scrollHeight,
              behavior: reduce ? "auto" : "smooth",
            }),
          );
        }
      } catch {
        /* ignore */
      }
      setFront(index);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [srcMode, streaming, attachScroll],
  );

  const frameStyle = {
    width,
    height: frameHeight,
    transform: `translateX(${offsetX}px) scale(${scale})`,
    transformOrigin: "top left",
  } as const;

  return (
    <div
      ref={boxRef}
      className={`relative h-full w-full overflow-hidden ${className}`}
    >
      {html === undefined && src ? (
        <iframe
          ref={frameA}
          src={src}
          title={title}
          sandbox="allow-same-origin"
          loading="lazy"
          onLoad={() => handleLoad(0)}
          className="absolute left-0 top-0 border-0 bg-white"
          style={frameStyle}
        />
      ) : (
        docs.map((doc, i) =>
          doc === null ? null : (
            <iframe
              key={i}
              ref={i === 0 ? frameA : frameB}
              srcDoc={doc}
              title={i === front ? title : `${title} (buffer)`}
              aria-hidden={i !== front}
              tabIndex={i === front ? 0 : -1}
              sandbox="allow-same-origin"
              onLoad={() => handleLoad(i)}
              className="absolute left-0 top-0 border-0 bg-white"
              style={{
                ...frameStyle,
                visibility: i === front ? "visible" : "hidden",
                zIndex: i === front ? 1 : 0,
              }}
            />
          ),
        )
      )}
      {!hasContent && <FrameSkeleton streaming={streaming} />}
    </div>
  );
}

function FrameSkeleton({ streaming }: { streaming: boolean }) {
  return (
    <div
      className="absolute inset-0 flex flex-col gap-5 bg-surface p-8"
      aria-hidden
    >
      <div className="animate-shimmer bg-line/70 h-6 w-32 rounded-full" />
      <div className="animate-shimmer bg-line/70 mt-6 h-12 w-4/5 rounded-xl" />
      <div className="animate-shimmer bg-line/70 h-12 w-3/5 rounded-xl" />
      <div className="animate-shimmer bg-line/70 h-5 w-2/3 rounded-full" />
      <div className="animate-shimmer bg-line/70 mt-4 h-11 w-44 rounded-full" />
      <div className="animate-shimmer bg-line/70 mt-8 aspect-[16/9] w-full rounded-2xl" />
      {streaming && (
        <span className="sr-only">The new page is being written</span>
      )}
    </div>
  );
}
