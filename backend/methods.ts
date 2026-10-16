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
} from "@fungi.computer/computer/operations";
export type InkcapBackendContext = {
  activity: DocumentActivityStore;
  documentsChanged(computerId: string, sequence: number): Promise<void>;
  env: {
    APP_STORAGE: Pick<AppStorageWire, "read" | "write">;
    COMPUTER?: {
      list?(input: z.output<typeof listInput>): Promise<WhistleJsonValue>;
      read?(input: z.output<typeof readInput>): Promise<WhistleJsonValue>;
      write?(input: z.output<typeof writeInput>): Promise<WhistleJsonValue>;
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
    error: z.literal("attachment_budget_exceeded"),
    kind: z.literal("write"),
    retryAfterMs: z.number().int().min(1).max(86400000),
  }),
]);
const listReply = z.union([listOutputSchema, refusal]);
const readReply = z.union([readOutput, refusal]);
const writeReply = z.union([writeOutputSchema, refusal]);
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
        caller.computerId === null || !context.env.COMPUTER?.list
          ? refusal.parse({ error: "not_granted" })
          : listReply.parse(await context.env.COMPUTER.list(input)),
    }),
    readFile: defineAppMethod({
      description:
        "Read up to 128 KiB of a file on the attached Computer as base64. Use byteOffset for the next chunk.",
      effect: "read",
      requires: ["computer.readFile"],
      input: readInput,
      output: readReply,
      handler: async (input, context: InkcapBackendContext, caller) =>
        caller.computerId === null || !context.env.COMPUTER?.read
          ? refusal.parse({ error: "not_granted" })
          : readReply.parse(await context.env.COMPUTER.read(input)),
    }),
    writeFile: defineAppMethod({
      description:
        "Write UTF-8 text on the attached Computer. Supply expectedContent for a compare-and-swap; combined content is limited to 48 KiB. The host owns attribution and the attachment write budget.",
      effect: "write",
      requires: ["computer.writeFile"],
      input: writeInput,
      output: writeReply,
      handler: async (input, context: InkcapBackendContext, caller) =>
        caller.computerId === null || !context.env.COMPUTER?.write
          ? refusal.parse({ error: "not_granted" })
          : writeReply.parse(await context.env.COMPUTER.write(input)),
    }),
  },
});
