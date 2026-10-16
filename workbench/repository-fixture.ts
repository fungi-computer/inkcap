import { createCapabilityRegistry, type AppRoot } from "@fungi.computer/agar";
import { appsCall } from "@fungi.computer/agar/apps";
import {
  commitPage,
  copyRebuildPage,
  fileContent,
  fileDiscardInput,
  fileDiscardResult,
  fileSaveInput,
  fileSaveResult,
  fileSyncResult,
  fileList,
  treeListing,
  readCopyRebuilding,
  type FileSaveInput,
} from "@fungi.computer/agar/roles/files";
import type { WhistleJsonValue } from "@fungi.computer/whistle";
import { Schema } from "effect";
import { createInkcapFixture } from "./fixtures.js";

const initialHead = "a".repeat(40);
const nextHead = "b".repeat(40);
const agentHead = "c".repeat(40);
const initialBlob = "d".repeat(40);
const updatedBlob = "e".repeat(40);

export function createRepositoryFixture({
  holdCommitAcknowledgement = false,
  holdCopyRebuild = false,
  appCalls = true,
  status,
}: {
  holdCommitAcknowledgement?: boolean;
  holdCopyRebuild?: boolean;
  /** False models a host (the Hub) that offers Inkcap no `apps.call`. */
  appCalls?: boolean;
  status?: Pick<AppRoot["ui"], "reportStatus" | "onStatusAction">;
} = {}) {
  const base = createInkcapFixture("empty", null, undefined, undefined, status);
  const capabilities = createCapabilityRegistry();
  const files = new Map([
    ["src/garden.ts", 'export const garden = "fern";\n'],
    ["README.md", "# Field notes\n"],
  ]);
  const versions = new Map<string, number>();
  const rows = new Map<string, FileSaveInput & { version: number }>();
  const settled = new Map<string, ReturnType<typeof fileSaveResult.parse>>();
  const calls: string[] = [];
  let head = initialHead;
  let blob = initialBlob;
  let rebuilding = holdCopyRebuild;
  let resolveCommit: (() => void) | undefined;
  const acknowledgement = holdCommitAcknowledgement
    ? new Promise<void>((resolve) => {
        resolveCommit = resolve;
      })
    : Promise.resolve();
  function commit(hash: string, message: string) {
    return {
      hash,
      treeHash: hash,
      message,
      author: { name: "Ada", email: "ada@example.test" },
      committer: { name: "Ada", email: "ada@example.test" },
      parents: hash === initialHead ? [] : [initialHead],
      authoredAt: 1_700_000_000,
      committedAt: 1_700_000_000,
    };
  }
  capabilities.provide(appsCall, {
    async call(appId, method, serialized) {
      if (appId !== "app_bonsai") throw new Error("Unexpected target App");
      calls.push(method);
      const input = Schema.decodeUnknownSync(
        Schema.Record(Schema.String, Schema.Json),
      )(JSON.parse(serialized));
      if (rebuilding && method !== "rebuildCopies")
        return readCopyRebuilding.parse({ kind: "rebuilding" });
      if (method === "rebuildCopies") {
        rebuilding = false;
        return copyRebuildPage.parse({ done: true, cursor: null });
      }
      if (method === "files.tree")
        return treeListing.parse({
          ref: "main",
          commit: commit(head, "Plant notes"),
          path: "",
          entries: [
            { name: "src", mode: "040000", hash: blob, type: "tree" },
            { name: "README.md", mode: "100644", hash: blob, type: "blob" },
          ],
        });
      if (method === "files.list")
        return fileList.parse({
          ref: "main",
          commit: commit(head, "Plant notes"),
          paths: ["src/", ...files.keys()],
          truncated: false,
        });
      if (method === "commits.list")
        return commitPage.parse({
          ref: "main",
          commits: [
            {
              commit: commit(
                head,
                head === agentHead ? "Agent planted moss" : "Plant notes",
              ),
              agent: null,
            },
          ],
        });
      if (method === "files.read") {
        const path = fileSaveInput.shape.path.parse(input.path);
        const row = rows.get(path);
        const text = files.get(path) ?? null;
        const result = fileContent.parse({
          version: versions.get(path) ?? null,
          commit: head,
          blob: text === null ? null : blob,
          ref: "main",
          path,
          size: text?.length ?? 0,
          binary: false,
          text,
        });
        if (row) {
          const outcome = settled.get(path);
          result.pending = {
            text: row.text,
            revision: row.version,
            state: outcome?.kind === "conflict" ? "conflict" : "pending",
          };
          if (outcome?.kind === "conflict" && outcome.theirs)
            result.pending.theirs = outcome.theirs;
        }
        return result;
      }
      if (method === "files.save") {
        const save = fileSaveInput.parse(input);
        const version = versions.get(save.path) ?? null;
        if (save.revision !== version)
          return fileSaveResult.parse({
            kind: "conflict",
            revision: version ?? 0,
          });
        const next = (version ?? 0) + 1;
        versions.set(save.path, next);
        rows.set(save.path, { ...save, version: next });
        settled.delete(save.path);
        return fileSaveResult.parse({
          kind: "saved",
          revision: next,
          state: "pending",
        });
      }
      if (method === "files.sync") {
        await acknowledgement;
        for (const [path, row] of rows) {
          if (row.baseBlob !== blob && files.get(path) !== row.text) {
            settled.set(path, {
              kind: "conflict",
              revision: row.version,
              theirs: { blob, commit: head },
            });
            continue;
          }
          files.set(path, row.text);
          head = nextHead;
          blob = updatedBlob;
          settled.set(path, {
            kind: "synced",
            revision: row.version,
            commit: head,
          });
          rows.delete(path);
        }
        return fileSyncResult.parse({
          settled: [...settled].map(([path, result]) => ({
            repo: "field-notes",
            branch: "main",
            path,
            result,
          })),
          more: false,
        });
      }
      if (method === "files.discard") {
        const discard = fileDiscardInput.parse(input);
        if (versions.get(discard.path) !== discard.revision)
          return fileDiscardResult.parse({
            kind: "conflict",
            revision: versions.get(discard.path) ?? 1,
          });
        rows.delete(discard.path);
        settled.delete(discard.path);
        return fileDiscardResult.parse({ kind: "discarded" });
      }
      throw new Error(`Unexpected Bonsai method ${method}`);
    },
  });
  function navigateTo(requestId: string, path: string) {
    return {
      ...base.connection.app.context.get(),
      openRequest: {
        kind: "navigate" as const,
        requestId,
        params: [
          { key: "repository", value: "field-notes" },
          { key: "branch", value: "main" },
          { key: "path", value: path },
        ],
      },
    };
  }
  let context = navigateTo("bonsai-open-garden", "src/garden.ts");
  const listeners = new Set<(value: typeof context) => void>();
  const app: AppRoot = {
    ...base.connection.app,
    capabilities: appCalls ? capabilities : base.connection.app.capabilities,
    context: {
      get: () => context,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  };
  return {
    connection: { app },
    /** Bonsai's Edit in Inkcap re-targets the already open window. */
    navigate(path: string) {
      context = navigateTo(`bonsai-open-${path}`, path);
      for (const listener of listeners) listener(context);
    },
    calls,
    push() {
      files.set("src/garden.ts", 'export const garden = "moss";\n');
      head = agentHead;
      blob = agentHead;
      return Promise.resolve();
    },
    acknowledgeCommit: () => resolveCommit?.(),
    acknowledgeRebuild: () => {
      rebuilding = false;
    },
    installKeys: (element: HTMLElement) => base.installKeys(element),
    request: (method: string, input: WhistleJsonValue) =>
      capabilities
        .require(appsCall)
        .call("app_bonsai", method, JSON.stringify(input)),
  };
}
