import { defineAppGill, type AppBackendGill } from "@fungi.computer/agar/gills";
import {
  documentActivityRefusalSchema,
  documentsChangedKey,
  documentsRecentInputSchema,
  documentsRecentSchema,
} from "../src/document-activity-contract.js";

/** The source pages saved actor/Computer activity; rendering never probes files. */
export const recentFilesGill = defineAppGill({
  id: "recent-files",
  title: "Recent Files",
  source: "documents.recent",
  limit: 10,
  sizes: ["M", "L"],
  params: [
    { key: "computer", label: "Computer", kind: "computer", required: true },
  ],
  watch: { storage: documentsChangedKey },
  input: ({ limit, after }): ReturnType<AppBackendGill["input"]> => {
    const cursor: unknown = after === undefined ? undefined : JSON.parse(after);
    const input = documentsRecentInputSchema.parse(
      cursor === undefined ? { limit } : { limit, after: cursor },
    );
    return input.after === undefined
      ? { limit: input.limit }
      : { limit: input.limit, after: input.after };
  },
  rows: (output) => {
    const identity = { viewId: "recent-files", title: "Recent Files" };
    if (documentActivityRefusalSchema.safeParse(output).success)
      return {
        ...identity,
        state: "error",
        rows: [],
        error: "Choose a Computer and allow Inkcap to read its files.",
        recovery: { kind: "configure", param: "computer" },
      };
    const page = documentsRecentSchema.parse(output);
    if (page.rows.length === 0)
      return { ...identity, state: "empty", rows: [] };
    const rows = page.rows.map((record) => {
      const name = record.path.split("/").at(-1);
      return {
        id: record.id,
        title: name === undefined || name.length === 0 ? record.path : name,
        detail: `${record.activity === "edited" ? "Edited" : "Opened"} · ${record.path}`,
        open: { params: [{ key: "path", value: record.path }] },
      };
    });
    return page.next === null
      ? { ...identity, state: "full", rows }
      : { ...identity, state: "full", rows, next: JSON.stringify(page.next) };
  },
});
