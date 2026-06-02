import type { SseEvent } from "../types";

export async function* streamSse(
  url: string,
  body: unknown,
): AsyncGenerator<SseEvent> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.body) throw new Error("no response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const evMatch = raw.match(/^event:\s*(.+)$/m);
      const dataMatch = raw.match(/^data:\s*(.+)$/m);
      if (!evMatch) continue;
      const data = dataMatch ? JSON.parse(dataMatch[1]) : {};
      yield { type: evMatch[1], ...data } as SseEvent;
    }
  }
}
