import type { AppRoot } from "@fungi.computer/agar";
import { computerList } from "@fungi.computer/agar/computer";
import { capabilityQuery, queryKeys } from "@fungi.computer/agar/query";

/**
 * Dot-folders (`.fungi`, `.git`) are internal state, so Explorer leaves them
 * out the way editors do. Files, and folders the person named, stay.
 */
export function isHiddenEntry(entry: { name: string; type: string }): boolean {
  return entry.type === "directory" && entry.name.startsWith(".");
}

/** Explorer and the reopen invitation share the same scoped directory page. */
export function directoryQuery(app: AppRoot | null, path: string, offset = 0) {
  return capabilityQuery(
    app,
    computerList,
    queryKeys.of(app, "tree", app?.capabilities.version ?? 0, path, offset),
    async (handle, signal) => {
      const listing = await handle.list({ path, offset, limit: 256 });
      signal.throwIfAborted();
      return {
        ...listing,
        entries: listing.entries.filter((entry) => !isHiddenEntry(entry)),
      };
    },
  );
}
