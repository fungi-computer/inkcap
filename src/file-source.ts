import type { OpenedFile } from "./open-file.js";
import type { OpenTarget } from "./read-for-open.js";

/** A tab keeps its original source, including the repository branch. */
export type InkcapFileSource = Readonly<{
  kind: "computer" | "repository";
  id: string;
  label: string;
  read(
    path: string,
    signal: AbortSignal,
    target?: OpenTarget,
  ): Promise<OpenedFile>;
  replace(
    path: string,
    contents: string,
    expectedContent: string,
    signal: AbortSignal,
  ): Promise<void>;
  write(path: string, contents: string, signal: AbortSignal): Promise<void>;
}>;
