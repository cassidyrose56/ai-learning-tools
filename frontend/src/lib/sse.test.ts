import { describe, expect, it, vi } from "vitest";
import { streamSse } from "./sse";

function makeStream(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, {
    headers: { "content-type": "text/event-stream" },
  });
}

describe("streamSse", () => {
  it("yields parsed events from chunked input", async () => {
    const events: any[] = [];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeStream([
        'event: started\ndata: {"story_id":"a","topic":"Soccer"}\n\n',
        'event: done\ndata: {"story_id":"a","text":"hi","predicted_grade":"3","appropriate":true,"attempts":1}\n\n',
        "event: complete\ndata: {}\n\n",
      ]),
    );
    for await (const ev of streamSse("/api/generate", { foo: "bar" })) {
      events.push(ev);
    }
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ type: "started", topic: "Soccer" });
    expect(events[2].type).toBe("complete");
  });

  it("re-assembles events split across chunks", async () => {
    const events: any[] = [];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeStream([
        'event: started\ndata: {"story_id":"a","topic":"Soccer"',
        '}\n\nevent: complete\ndata: {}\n\n',
      ]),
    );
    for await (const ev of streamSse("/api/generate", {})) events.push(ev);
    expect(events.map((e) => e.type)).toEqual(["started", "complete"]);
  });
});
