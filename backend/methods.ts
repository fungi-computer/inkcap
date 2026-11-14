import { resultRows } from "@fungi.computer/agar/method-presentation";
import { recentFilesGill } from "./gills.js";
import {
  documentIdentitySchema,
  documentsRecentInputSchema,
  documentsRecentSchema,
  documentRecordedSchema,
  documentActivityRefusalSchema,
} from "../src/document-activity-contract.js";
import {
  documentActivity,
  type DocumentActivityStore,
} from "./document-activity.js";
import * as z from "zod";
import { filesNavigateIntent } from "@fungi.computer/agar/roles/files";
import type { AppMethodCallContext } from "@fungi.computer/puffball/app-method-runtime";
import {
  defineAppBackend,
  defineAppMethod,
} from "@fungi.computer/agar/backend-definition";
import type { WhistleJsonValue } from "@fungi.computer/whistle";
import type { AppStorageWire } from "@fungi.computer/agar/storage";
import {
  pathSchema,
  listInputSchema,
  listOutputSchema,
  readBytesInputSchema,
  writeOutputSchema,
  mkdirOutputSchema,
  gitChangesInputSchema,
  gitChangesOutputSchema,
} from "@fungi.computer/computer-contract";
export type InkcapBackendContext = {
  activity: DocumentActivityStore;
  documentsChanged(computerId: string, sequence: number): Promise<void>;
  env: {
    APP_STORAGE: Pick<AppStorageWire, "read" | "write">;
    COMPUTER: {
      list(input: z.output<typeof listInput>): Promise<WhistleJsonValue>;
      read(input: z.output<typeof readInput>): Promise<WhistleJsonValue>;
      write(input: z.output<typeof writeInput>): Promise<WhistleJsonValue>;
      mkdir(input: { path: string }): Promise<WhistleJsonValue>;
      gitChanges(
        input: z.output<typeof gitChangesInput>,
      ): Promise<WhistleJsonValue>;
    };
  };
};
const computerPath = pathSchema.refine(
  (value) => !value.split("/").includes(".."),
  "Parent path segments are not allowed",
);
const listInput = listInputSchema.extend({ path: computerPath.default("/") });
const readInput = readBytesInputSchema.extend({
  path: computerPath,
  byteOffset: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),
  byteLength: z
    .number()
    .int()
    .min(1)
    .max(128 * 1024)
    .default(128 * 1024),
});
const gitChangesInput = gitChangesInputSchema.extend({
  path: computerPath.default("/"),
});
const text = z.string().max(48 * 1024);
const writeInput = z
  .strictObject({
    path: computerPath,
    content: text,
    expectedContent: text.optional(),
  })
  .refine(
    (value) =>
      new TextEncoder().encode(value.content).byteLength +
        new TextEncoder().encode(value.expectedContent ?? "").byteLength <=
      48 * 1024,
    "Combined content exceeds 48 KiB",
  );
const readOutput = z.strictObject({
  path: computerPath,
  byteOffset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  content: z.base64().max(174764),
  encoding: z.literal("base64"),
  truncated: z.boolean(),
});
const refusal = z.union([
  z.strictObject({
    error: z.enum([
      "not_granted",
      "revoked",
      "grantor_lost_authority",
      "unavailable",
      "invalid",
      "invalid_path",
      "too_large",
      "conflict",
      "not_found",
    ]),
  }),
  z.strictObject({
    error: z.literal("not_found"),
    message: z.string(),
  }),
  z.strictObject({
    error: z.literal("parent_not_found"),
    message: z.string(),
  }),
  z.strictObject({
    error: z.literal("attachment_budget_exceeded"),
    kind: z.literal("write"),
    retryAfterMs: z.number().int().min(1).max(86400000),
  }),
]);
const listReply = z.union([listOutputSchema, refusal]);
const readReply = z.union([readOutput, refusal]);
const writeReply = z.union([writeOutputSchema, refusal]);
const mkdirReply = z.union([mkdirOutputSchema, refusal]);
const gitChangesReply = z.union([gitChangesOutputSchema, refusal]);
// The host always supplies callable bindings; admission is checked on invocation.
const bindingNotGranted = z.object({ code: z.literal("binding_not_granted") });
// The Computer's file system names an absent file or parent folder ENOENT. It is
// a domain answer, so it must reach the Agent as a refusal; thrown, the sandbox
// reports only "failed for an unrecognized reason".
const pathAbsent = z.object({ code: z.literal("ENOENT") });
function parentFolder(path: string) {
  return path.slice(0, path.lastIndexOf("/")) || "/";
}
function parentNotFound(path: string) {
  return {
    error: "parent_not_found" as const,
    message: `The folder ${parentFolder(path)} does not exist and could not be created. Save into an existing folder (for example /notes.md at the top level), or list folders with listFiles.`,
  };
}
function fileGone(path: string) {
  return {
    error: "not_found" as const,
    message: `The file ${path} no longer exists on the Computer. Read its directory again, or write it as a new file without expectedContent.`,
  };
}
async function computerCall(
  call: () => Promise<WhistleJsonValue>,
  absent: WhistleJsonValue = { error: "not_found" },
): Promise<WhistleJsonValue> {
  try {
    return await call();
  } catch (cause) {
    if (bindingNotGranted.safeParse(cause).success)
      return { error: "not_granted" };
    if (pathAbsent.safeParse(cause).success) return absent;
    throw cause;
  }
}
async function recordDocument(
  input: z.output<typeof documentIdentitySchema>,
  context: InkcapBackendContext,
  caller: AppMethodCallContext,
  activity: "opened" | "edited",
) {
  if (caller.computerId === null || caller.computerId !== input.computerId)
    return { error: "not_granted" as const };
  const sequence = documentActivity(
    context.activity,
    JSON.stringify(caller.actor),
    caller.computerId,
  ).record(input.path, activity);
  await context.documentsChanged(caller.computerId, sequence);
  return { recorded: true as const };
}
export const appBackend = defineAppBackend({
  gills: [recentFilesGill],
  methods: {
    "documents.opened": defineAppMethod({
      description: "Record a successfully opened foreground Computer document",
      effect: "write",
      requires: ["computer.readFile", "app.storage"],
      input: documentIdentitySchema,
      output: z.union([documentRecordedSchema, documentActivityRefusalSchema]),
      handler: (input, context: InkcapBackendContext, caller) =>
        recordDocument(input, context, caller, "opened"),
    }),
    "documents.edited": defineAppMethod({
      description: "Record an accepted Computer document save",
      effect: "write",
      requires: ["computer.writeFile", "app.storage"],
      input: documentIdentitySchema,
      output: z.union([documentRecordedSchema, documentActivityRefusalSchema]),
      handler: (input, context: InkcapBackendContext, caller) =>
        recordDocument(input, context, caller, "edited"),
    }),
    "documents.recent": defineAppMethod({
      description:
        "Read one saved recent-documents page for the actor and admitted Computer; no provider calls",
      effect: "read",
      requires: ["computer.readFile"],
      input: documentsRecentInputSchema,
      output: z.union([documentsRecentSchema, documentActivityRefusalSchema]),
      handler: (input, context: InkcapBackendContext, caller) =>
        caller.computerId === null
          ? { error: "not_granted" as const }
          : documentActivity(
              context.activity,
              JSON.stringify(caller.actor),
              caller.computerId,
            ).recent(input.limit, input.after),
    }),
    listFiles: defineAppMethod({
      description:
        "List one bounded directory page on the attached Computer. Continue with nextOffset; no Computer selector is accepted.",
      effect: "read",
      requires: ["computer.list"],
      input: listInput,
      output: listReply,
      handler: async (input, context: InkcapBackendContext, caller) =>
        caller.computerId === null
          ? refusal.parse({ error: "not_granted" })
          : listReply.parse(
              await computerCall(() => context.env.COMPUTER.list(input)),
            ),
    }),
    gitChanges: defineAppMethod({
      description:
        "Read everything changed in the Git repository holding one folder on the attached Computer, for review before commit or push: changed files and one unified diff against the last commit, untracked files as additions. Read-only; no Computer selector is accepted.",
      effect: "read",
      requires: ["computer.readFile"],
      input: gitChangesInput,
      output: gitChangesReply,
      handler: async (input, context: InkcapBackendContext, caller) =>
        caller.computerId === null
          ? refusal.parse({ error: "not_granted" })
          : gitChangesReply.parse(
              await computerCall(() => context.env.COMPUTER.gitChanges(input)),
            ),
    }),
    readFile: defineAppMethod({
      description:
        "Read up to 128 KiB of a file on the attached Computer as base64. Use byteOffset for the next chunk.",
      effect: "read",
      requires: ["computer.readFile"],
      input: readInput,
      output: readReply,
      handler: async (input, context: InkcapBackendContext, caller) =>
        caller.computerId === null
          ? refusal.parse({ error: "not_granted" })
          : readReply.parse(
              await computerCall(() => context.env.COMPUTER.read(input)),
            ),
    }),
    writeFile: defineAppMethod({
      description:
        "Write UTF-8 text on the attached Computer. A missing folder is created first; if it cannot be created the write is refused as parent_not_found, and the path is on the Computer, not the host machine. Supply expectedContent for a compare-and-swap; combined content is limited to 48 KiB. The host owns attribution and the attachment write budget.",
      effect: "write",
      requires: ["computer.writeFile"],
      input: writeInput,
      output: writeReply,
      present: {
        rows: resultRows,
        verb: "wrote",
        row: ({ output }) =>
          "error" in output
            ? {
                id: "refused",
                title: "Inkcap could not write the file",
                detail:
                  output.error === "parent_not_found"
                    ? "That folder does not exist on the Computer"
                    : output.error,
                tone: "error",
              }
            : {
                id: output.path,
                title: `Inkcap wrote ${output.path.split("/").at(-1) ?? output.path}`,
                detail: `${output.path} · ${String(output.bytes)} bytes`,
                open: {
                  params: filesNavigateIntent({ path: output.path }).params,
                },
              },
      },
      handler: async (input, context: InkcapBackendContext, caller) => {
        if (caller.computerId === null)
          return refusal.parse({ error: "not_granted" });
        // An edit of an existing file (expectedContent) that is missing means
        // the file is gone; only a new path can lack its folder.
        const absent =
          input.expectedContent === undefined
            ? parentNotFound(input.path)
            : fileGone(input.path);
        const attempt = async () => {
          const reply = writeReply.parse(
            await computerCall(() => context.env.COMPUTER.write(input), absent),
          );
          // Hosts answer a missing path as plain not_found.
          return "error" in reply && reply.error === "not_found"
            ? absent
            : reply;
        };
        const reply = await attempt();
        if (
          input.expectedContent !== undefined ||
          !("error" in reply) ||
          reply.error !== "parent_not_found"
        )
          return reply;
        // A new file's missing folder is created, then the write is retried once.
        const made = mkdirReply.parse(
          await computerCall(
            () =>
              context.env.COMPUTER.mkdir({ path: parentFolder(input.path) }),
            absent,
          ),
        );
        return "error" in made ? absent : await attempt();
      },
    }),
  },
});
