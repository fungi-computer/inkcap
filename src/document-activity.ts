import { appMethods } from "@fungi.computer/agar/backend";
import type { AppRoot } from "@fungi.computer/agar";
import * as Redacted from "effect/Redacted";
import {
  documentIdentitySchema,
  documentRecordedSchema,
  documentActivityRefusalSchema,
} from "./document-activity-contract.js";

/** A post-acceptance notification, never a second file operation or an IO retry. */
export async function recordDocumentActivity(
  app: AppRoot,
  computerId: string,
  path: string,
  activity: "opened" | "edited",
): Promise<boolean> {
  try {
    const input = documentIdentitySchema.parse({ computerId, path });
    const result = await app.capabilities
      .require(appMethods)
      .call(`documents.${activity}`, JSON.stringify(input));
    const refused = documentActivityRefusalSchema.safeParse(result);
    if (refused.success) throw new Error("Document activity was not admitted");
    documentRecordedSchema.parse(result);
    return true;
  } catch (cause) {
    console.error(
      "Inkcap document activity could not be recorded",
      Redacted.make(cause),
    );
    return false;
  }
}
