export async function fetchLimitedText(
  url: string,
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
  maxBytes = 32 * 1024 * 1024,
): Promise<string> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });

  if (!response.ok || !response.body) {
    throw new Error(`La descarga respondió ${response.status}`);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error("La descarga supera el tamaño permitido");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
