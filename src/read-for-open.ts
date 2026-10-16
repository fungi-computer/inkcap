/** Mutable tab lifetime: editor notifications and close update it synchronously. */
export type OpenTarget = { revision: number; closed: boolean };

export type BinaryOpenResult =
  { kind: "ready"; blob: Blob } | { kind: "changed" | "closed" };

const IMAGE_MEDIA_TYPES = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["svg", "image/svg+xml"],
  ["avif", "image/avif"],
]);

const VIDEO_MEDIA_TYPES = new Map([
  ["mp4", "video/mp4"],
  ["webm", "video/webm"],
]);

export function imageMediaType(path: string): string | undefined {
  return IMAGE_MEDIA_TYPES.get(path.split(".").pop()?.toLowerCase() ?? "");
}

export function videoMediaType(path: string): string | undefined {
  return VIDEO_MEDIA_TYPES.get(path.split(".").pop()?.toLowerCase() ?? "");
}

/** The binary preview kind for a path, with its decoded Blob media type. */
export function binaryPreviewKind(
  path: string,
): { kind: "image" | "video"; mediaType: string } | undefined {
  const image = imageMediaType(path);
  if (image) return { kind: "image", mediaType: image };
  const video = videoMediaType(path);
  if (video) return { kind: "video", mediaType: video };
  return undefined;
}

/** Whether a path opens with a Markdown preview toggle next to the editor. */
export function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

/** Read and decode before deciding whether the original tab can still be replaced. */
export async function readForOpen(
  read: () => Promise<Blob>,
  target?: OpenTarget,
): Promise<
  | { kind: "ready"; contents: string }
  | { kind: "changed" | "closed" | "invalid-text" }
> {
  const revision = target?.revision;
  const file = await read();
  const bytes = await file.arrayBuffer();
  if (target?.closed) return { kind: "closed" };
  if (target && target.revision !== revision) return { kind: "changed" };
  try {
    return {
      kind: "ready",
      contents: new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes),
    };
  } catch {
    return { kind: "invalid-text" };
  }
}

/**
 * The Computer read capability also serves binary previews. Keep the same
 * mutable-tab guard as text reads, but leave bytes as a Blob so the caller can
 * choose the browser-owned preview lifetime.
 */
export async function readBinaryForOpen(
  read: () => Promise<Blob>,
  target?: OpenTarget,
): Promise<BinaryOpenResult> {
  const revision = target?.revision;
  const blob = await read();
  if (target?.closed) return { kind: "closed" };
  if (target && target.revision !== revision) return { kind: "changed" };
  return { kind: "ready", blob };
}
