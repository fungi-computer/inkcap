import * as z from "zod";
import {
  documentActivitySchema,
  documentIds,
  documentsRecentSchema,
} from "../src/document-activity-contract.js";
import {
  createReadCopies,
  type ReadCopySql,
} from "@fungi.computer/agar/read-copy";

/** Bounded owner SQLite rows for each actor's recent Computer documents. */
export type DocumentActivityStore = ReturnType<typeof createReadCopies>;
export function createDocumentActivityStore(
  sql: ReadCopySql,
): DocumentActivityStore {
  return createReadCopies(sql, {
    version: 1,
    maxRows: 256,
    // One row holds up to 100 entries whose paths reach 4,096 characters.
    maxValueBytes: 4 * 1024 * 1024,
    // Activity rows store no blobs; the store's grammar requires positive bounds.
    maxBlobBytes: 1,
    maxBlobTotalBytes: 1,
  });
}

const stateSchema = z.strictObject({
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  rows: z.array(documentActivitySchema).max(100),
});
/** Member/Agent/key identity is supplied only by the admitting host. */
export function documentActivity(
  activity: DocumentActivityStore,
  actorId: string,
  computerId: string,
) {
  const store = activity.open("document-activity-v1", stateSchema);
  const key = JSON.stringify([actorId, computerId]);
  function state() {
    const saved = store.read(key);
    return saved.kind === "ready" ? saved.value : { sequence: 0, rows: [] };
  }
  return {
    record(path: string, activity: "opened" | "edited") {
      const previous = state();
      const row = documentActivitySchema.parse({
        id:
          previous.rows.find((item) => item.path === path)?.id ??
          documentIds.document.generate(),
        computerId,
        path,
        activity,
        occurredAt: Date.now(),
        sequence: previous.sequence + 1,
      });
      store.write(key, null, {
        sequence: row.sequence,
        rows: [
          row,
          ...previous.rows.filter((item) => item.path !== path),
        ].slice(0, 100),
      });
      return row.sequence;
    },
    recent(limit: number, after?: { before: number }) {
      const rows = state().rows.filter(
        (row) => after === undefined || row.sequence < after.before,
      );
      const page = rows.slice(0, limit);
      return documentsRecentSchema.parse({
        rows: page,
        next: rows.length > limit ? { before: page.at(-1)?.sequence } : null,
      });
    },
  };
}
