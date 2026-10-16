import { AppError } from "@fungi.computer/agar/errors";
import type { WhistleJsonValue } from "@fungi.computer/whistle";
import {
  copyRebuildPage,
  fileContent,
  fileDiscardInput,
  fileDiscardResult,
  fileSaveInput,
  fileSaveResult,
  fileSyncResult,
  readCopyRebuilding,
  type FileContent,
  type FileSaveResult,
} from "@fungi.computer/agar/roles/files";
import type { InkcapFileSource } from "./file-source.js";

export type BonsaiTransport = (
  method: string,
  input: WhistleJsonValue,
) => Promise<WhistleJsonValue>;

/** One editor request drives at most this many Bonsai copy-rebuild pages. */
const rebuildPageLimit = 256;

export async function bonsaiRequestUntilReady(
  method: string,
  input: WhistleJsonValue,
  request: BonsaiTransport,
  signal: AbortSignal,
  rebuilding: (active: boolean) => void,
): Promise<WhistleJsonValue> {
  signal.throwIfAborted();
  const result = await request(method, input);
  if (!readCopyRebuilding.safeParse(result).success) return result;
  rebuilding(true);
  try {
    let cursor: string | null = null;
    let done = false;
    for (let page = 0; page < rebuildPageLimit && !done; page++) {
      signal.throwIfAborted();
      const next = copyRebuildPage.parse(
        await request("rebuildCopies", { cursor }),
      );
      done = next.done;
      cursor = next.cursor;
    }
    if (!done)
      throw new AppError(
        "Bonsai is still preparing this repository. Try again shortly.",
        { code: "TIMEOUT", retryable: true },
      );
    signal.throwIfAborted();
    const ready = await request(method, input);
    if (readCopyRebuilding.safeParse(ready).success)
      throw new Error(
        "The repository changed while loading. Refresh to retry.",
      );
    return ready;
  } finally {
    rebuilding(false);
  }
}

export function bonsaiFileSource({
  repository,
  branch,
  request,
  onSaved,
  onSaveState,
}: {
  repository: string;
  branch: string;
  request: BonsaiTransport;
  onSaved: () => void;
  onSaveState: (path: string, result: FileSaveResult | null) => void;
}): InkcapFileSource & {
  retry(path: string, signal: AbortSignal): Promise<void>;
  discard(path: string, signal: AbortSignal): Promise<void>;
  readCommitted(path: string, signal: AbortSignal): Promise<string>;
} {
  const baselines = new Map<
    string,
    { file: FileContent; contents: string; version: number | null }
  >();
  async function read(path: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const file = fileContent.parse(
      await request("files.read", { repo: repository, ref: branch, path }),
    );
    signal.throwIfAborted();
    if (file.binary)
      throw new Error("This Bonsai file is not a text document.");
    if (file.text === null && file.blob !== null)
      throw new AppError("This Bonsai file is too large to edit.", {
        code: "FILE_TOO_LARGE",
        retryable: false,
      });
    return file;
  }
  async function sync(path: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const result = fileSyncResult.parse(await request("files.sync", {}));
    signal.throwIfAborted();
    const settled = result.settled.find(
      (entry) =>
        entry.repo === repository &&
        entry.branch === branch &&
        entry.path === path,
    );
    if (settled) {
      if (settled.result.kind === "refused")
        throw new AppError(`Bonsai refused sync: ${settled.result.reason}`, {
          code: "CAPABILITY_DENIED",
          retryable: settled.result.reason === "background-unavailable",
        });
      const baseline = baselines.get(path);
      if (settled.result.revision !== baseline?.version)
        throw new AppError("Your saved file changed. Compare before syncing.", {
          code: "CONFLICT",
          retryable: true,
        });
      onSaveState(path, settled.result);
    }
    onSaved();
  }
  async function save(
    path: string,
    text: string,
    expectedContent: string | undefined,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    let baseline = baselines.get(path);
    if (expectedContent === undefined) {
      const file = await read(path, signal);
      baseline = {
        file,
        contents: file.pending?.text ?? file.text ?? "",
        version: file.version,
      };
    }
    if (!baseline) throw new Error("Reopen this Bonsai file before saving.");
    if (expectedContent !== undefined && baseline.contents !== expectedContent)
      throw new AppError("The file baseline changed. Compare before saving.", {
        code: "CONFLICT",
        retryable: true,
      });
    if (expectedContent !== undefined) {
      const current = await read(path, signal);
      if (
        current.version !== baseline.version ||
        (current.pending?.text ?? current.text ?? "") !== baseline.contents
      )
        throw new AppError("The file changed. Compare before saving.", {
          code: "CONFLICT",
          retryable: true,
        });
      if (current.pending === undefined) baseline.file = current;
    }
    const input = fileSaveInput.parse({
      repo: repository,
      branch,
      path,
      baseCommit: baseline.file.commit,
      baseBlob: baseline.file.blob,
      text,
      revision: baseline.version,
    });
    const result = fileSaveResult.parse(await request("files.save", input));
    if (result.kind === "refused")
      throw new AppError(`Bonsai refused this save: ${result.reason}`, {
        code: "CAPABILITY_DENIED",
        retryable: result.reason === "background-unavailable",
      });
    onSaveState(path, result);
    if (result.kind === "conflict")
      throw new AppError("Your saved file changed. Compare before saving.", {
        code: "CONFLICT",
        retryable: true,
      });
    baselines.set(path, {
      file: baseline.file,
      contents: text,
      version: result.revision,
    });
    onSaved();
    if (result.kind === "saved") {
      void sync(path, signal).catch((cause: unknown) => {
        console.error("Bonsai sync status could not be refreshed", cause);
        if (baselines.get(path)?.version !== result.revision || signal.aborted)
          return;
        onSaveState(path, {
          kind: "failed",
          revision: result.revision,
          reason: "sync_failed",
        });
      });
    }
  }
  return {
    kind: "repository",
    id: `${repository}:${branch}`,
    label: `${repository} · ${branch}`,
    async read(path, signal, target) {
      const revision = target?.revision;
      const file = await read(path, signal);
      if (target?.closed) return { kind: "closed" };
      if (target && target.revision !== revision) return { kind: "changed" };
      const contents = file.pending?.text ?? file.text ?? "";
      baselines.set(path, { file, contents, version: file.version });
      const pending = file.pending;
      if (pending?.state === "pending")
        onSaveState(path, {
          kind: "saved",
          revision: pending.revision,
          state: "pending",
        });
      else if (pending?.state === "conflict")
        onSaveState(path, {
          kind: "conflict",
          revision: pending.revision,
          theirs: pending.theirs,
        });
      else if (pending?.state === "failed")
        onSaveState(path, {
          kind: "failed",
          revision: pending.revision,
          reason: pending.failure ?? "sync_failed",
        });
      else if (file.version !== null)
        onSaveState(path, {
          kind: "synced",
          revision: file.version,
          commit: file.commit,
        });
      return { kind: "text", contents };
    },
    replace: (path, text, expectedContent, signal) =>
      save(path, text, expectedContent, signal),
    write: (path, text, signal) => save(path, text, undefined, signal),
    retry: sync,
    async discard(path, signal) {
      signal.throwIfAborted();
      const baseline = baselines.get(path);
      if (!baseline)
        throw new Error("Reopen this saved file before discarding it.");
      if (baseline.version === null) return;
      const input = fileDiscardInput.parse({
        repo: repository,
        branch,
        path,
        revision: baseline.version,
      });
      const result = fileDiscardResult.parse(
        await request("files.discard", input),
      );
      signal.throwIfAborted();
      if (result.kind === "conflict")
        throw new AppError(
          "Your saved file changed. Refresh before discarding.",
          {
            code: "CONFLICT",
            retryable: true,
          },
        );
      baselines.delete(path);
      onSaveState(path, null);
      onSaved();
    },
    async readCommitted(path, signal) {
      const file = await read(path, signal);
      const contents = file.text ?? "";
      if (!baselines.has(path))
        baselines.set(path, { file, contents, version: file.version });
      return contents;
    },
  };
}
