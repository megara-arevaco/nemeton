const samples = new Map<
  string,
  { values: number[]; count: number; maxMs: number; errors: number }
>();

export function recordOperation(name: string, elapsedMs: number, failed = false) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return;
  }

  let entry = samples.get(name);

  if (!entry) {
    if (samples.size >= 128) {
      samples.delete(samples.keys().next().value!);
    }
    entry = { values: [], count: 0, maxMs: 0, errors: 0 };
    samples.set(name, entry);
  }
  entry.count++;
  entry.errors += Number(failed);
  entry.maxMs = Math.max(entry.maxMs, elapsedMs);
  if (entry.values.length >= 256) {
    entry.values.shift();
  }
  entry.values.push(elapsedMs);
}

export function operationMetrics() {
  return [...samples].map(([name, entry]) => {
    const ordered = [...entry.values].sort((a, b) => a - b);
    const percentile = (p: number) =>
      Math.round(ordered[Math.max(0, Math.ceil(ordered.length * p) - 1)] ?? 0);
    return {
      name,
      count: entry.count,
      sampleCount: ordered.length,
      errors: entry.errors,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      maxMs: Math.round(entry.maxMs),
    };
  });
}
