import type { AppRoot } from "@fungi.computer/agar";
import { computerList } from "@fungi.computer/agar/computer";
import { capabilityQuery, queryKeys } from "@fungi.computer/agar/query";

/**
 * Dot-entries (`.fungi`, `.git`, `.bash_history`) are internal state, so
 * Explorer and the empty state's suggestion leave them out the way file
 * managers do. Files and folders the person named stay.
 */
export function isHiddenEntry(entry: { name: string; type: string }): boolean {
  return entry.name.startsWith(".");
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
