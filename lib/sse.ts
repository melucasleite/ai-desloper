import type { AnalyzeEvent } from "@/lib/types";

const HEARTBEAT_MS = 10_000;

export interface SSEChannel {
  stream: ReadableStream<Uint8Array>;
  /** Writes one `data: <json>` event. No-op once closed. */
  send(event: AnalyzeEvent): void;
  close(): void;
  readonly closed: boolean;
}

/** A server-sent-events stream with a heartbeat comment every 10s. */
export function createSSE(signal?: AbortSignal): SSEChannel {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const write = (chunk: string) => {
    if (closed || !controller) return;
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      shutdown();
    }
  };

  const shutdown = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    try {
      controller?.close();
    } catch {
      // already closed or errored by the consumer
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      // Opening comment flushes headers through proxies right away.
      write(": open\n\n");
      heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
    },
    cancel() {
      shutdown();
    },
  });

  signal?.addEventListener("abort", shutdown, { once: true });

  return {
    stream,
    send(event) {
      write(`data: ${JSON.stringify(event)}\n\n`);
    },
    close: shutdown,
    get closed() {
      return closed;
    },
  };
}

export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
