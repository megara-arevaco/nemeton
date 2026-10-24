import { z } from "zod";
import { downloadUrlSchema } from "../shared/downloads.js";

const torrentInfoSchema = z.object({
  id: z.string(),
  filename: z.string().optional(),
  status: z.string(),
  progress: z.number(),
  bytes: z.number(),
  links: z.array(downloadUrlSchema),
  files: z
    .array(
      z.object({
        id: z.number().int().nonnegative(),
        path: z.string().max(4096),
        bytes: z.number().nonnegative(),
        selected: z.number().optional(),
      }),
    )
    .default([]),
});

export async function fetchTorrentMetadata(url: string, signal: AbortSignal) {
  downloadUrlSchema.parse(url);
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  downloadUrlSchema.parse(response.url);
  if (!response.ok || !response.body) {
    throw new Error(`http-${response.status}`);
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) {
      throw new Error("torrent-too-large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export class RealDebrid {
  constructor(private token: string) {}

  private async request(
    route: string,
    signal?: AbortSignal,
    form?: Record<string, string>,
    method?: string,
    body?: Blob,
  ): Promise<unknown> {
    const response = await fetch(`https://api.real-debrid.com/rest/1.0/${route}`, {
      method: method ?? (form ? "POST" : "GET"),
      headers: { Authorization: `Bearer ${this.token}` },
      body: body ?? (form ? new URLSearchParams(form) : undefined),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`real-debrid-${response.status}`);
    }
    return response.status === 204 ? null : response.json();
  }

  async account() {
    const user = z
      .object({ username: z.string(), expiration: z.string(), type: z.string() })
      .parse(await this.request("user"));

    if (user.type !== "premium") {
      throw new Error("premium-required");
    }
    return { username: user.username, expiration: user.expiration };
  }

  async addMagnet(magnet: string, signal: AbortSignal) {
    return z
      .object({ id: z.string() })
      .parse(await this.request("torrents/addMagnet", signal, { magnet })).id;
  }

  async addTorrent(data: Uint8Array, signal: AbortSignal) {
    return z
      .object({ id: z.string() })
      .parse(
        await this.request(
          "torrents/addTorrent",
          signal,
          undefined,
          "PUT",
          new Blob([Uint8Array.from(data)]),
        ),
      ).id;
  }

  async info(id: string, signal: AbortSignal) {
    return torrentInfoSchema.parse(
      await this.request(`torrents/info/${encodeURIComponent(id)}`, signal),
    );
  }

  async select(id: string, ids: string[], signal: AbortSignal) {
    await this.request(`torrents/selectFiles/${encodeURIComponent(id)}`, signal, {
      files: ids.join(","),
    });
  }

  async unrestrict(link: string, signal: AbortSignal) {
    return z
      .object({
        filename: z.string(),
        filesize: z.number().nonnegative(),
        download: downloadUrlSchema,
      })
      .parse(await this.request("unrestrict/link", signal, { link }));
  }
}
