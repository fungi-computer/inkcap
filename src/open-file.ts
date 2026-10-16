import type { AppRoot } from "@fungi.computer/agar";
import { readComputerFile } from "@fungi.computer/agar/computer";
import {
  binaryPreviewKind,
  readBinaryForOpen,
  readForOpen,
  type OpenTarget,
} from "./read-for-open.js";

export type OpenedFile =
  | { kind: "text"; contents: string }
  | { kind: "image"; blob: Blob }
  | { kind: "video"; blob: Blob }
  | { kind: "invalid-text" }
  | { kind: "changed" }
  | { kind: "closed" };

export async function readOpenedFile(
  app: AppRoot,
  path: string,
  signal: AbortSignal,
  target?: OpenTarget,
): Promise<OpenedFile> {
  const read = () => readComputerFile(app.capabilities, { path }, { signal });
  const binary = binaryPreviewKind(path);
  if (binary) {
    const result = await readBinaryForOpen(read, target);
    return result.kind === "ready"
      ? {
          kind: binary.kind,
          // Computer reads are octet streams. A binary preview owns its MIME
          // type; the browser still decodes and validates the unchanged bytes.
          blob: result.blob.slice(0, result.blob.size, binary.mediaType),
        }
      : result;
  }
  const result = await readForOpen(read, target);
  return result.kind === "ready"
    ? { kind: "text", contents: result.contents }
    : result;
}
