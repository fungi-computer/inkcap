import { defineIdFamily } from "@fungi.computer/cairn";
import * as z from "zod";
import { pathSchema } from "@fungi.computer/computer-contract";

export const documentIds = defineIdFamily({
  family: "inkcap",
  version: 1,
  kinds: { document: { prefix: "inkcap_document" } },
});
export const documentsChangedKey = "documents-recent";
const sequence = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const documentIdentitySchema = z.strictObject({
  computerId: z.string().min(1).max(256),
  path: pathSchema.refine(
    (path) => !path.split("/").includes(".."),
    "Parent path segments are not allowed",
  ),
});
export const documentActivitySchema = documentIdentitySchema.extend({
  id: z
    .string()
    .refine((id) => documentIds.document.is(id), "Invalid document identity"),
  activity: z.enum(["opened", "edited"]),
  occurredAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sequence,
});
export const documentsRecentInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(50).default(20),
  after: z.strictObject({ before: sequence }).optional(),
});
export const documentsRecentSchema = z.strictObject({
  rows: z.array(documentActivitySchema).max(50),
  next: z.strictObject({ before: sequence }).nullable(),
});
export const documentRecordedSchema = z.strictObject({
  recorded: z.literal(true),
});
export const documentActivityRefusalSchema = z.strictObject({
  error: z.literal("not_granted"),
});
