import * as z from "zod";
import type { AppRoot } from "@fungi.computer/agar";
import { appMethods } from "@fungi.computer/agar/backend";
import { AppError } from "@fungi.computer/agar/errors";
import { capabilityQuery, queryKeys } from "@fungi.computer/agar/query";
import { gitChangesOutputSchema } from "@fungi.computer/computer-contract";

const changesReplySchema = z.union([
  gitChangesOutputSchema,
  z.looseObject({ error: z.string() }),
]);

/** Everything changed in the repository holding `root`, read through Inkcap's own backend method. */
export function changesQuery(app: AppRoot | null, root: string) {
  return capabilityQuery(
    app,
    appMethods,
    queryKeys.of(app, "changes", app?.capabilities.version ?? 0, root),
    async (handle, signal) => {
      const reply = changesReplySchema.parse(
        await handle.call("gitChanges", JSON.stringify({ path: root })),
      );
      signal.throwIfAborted();
      if ("error" in reply)
        throw new AppError(
          "Changes could not be read from the Computer. Try again.",
          { code: "HOST_FAILURE", retryable: true },
        );
      return reply;
    },
  );
}
