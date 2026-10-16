import * as S from "effect/Schema";
import {
  AppStorageError,
  appStorageReadResultSchema,
  appStorageMutationResultSchema,
  type AppStorageWire,
} from "@fungi.computer/agar/storage";
import { documentsChangedKey } from "../src/document-activity-contract.js";

/** Publish a scoped invalidation only after the real activity row was saved. */
export async function markDocumentsChanged(
  storage: Pick<AppStorageWire, "read" | "write">,
  computerId: string,
  sequence: number,
) {
  const current = S.decodeUnknownSync(appStorageReadResultSchema, {
    onExcessProperty: "error",
  })(await storage.read(documentsChangedKey));
  if (current.kind === "rejected") throw new AppStorageError(current.code);
  const result = S.decodeUnknownSync(appStorageMutationResultSchema, {
    onExcessProperty: "error",
  })(
    await storage.write({
      key: documentsChangedKey,
      scope: "member",
      basedOn: current.value.member?.revision ?? null,
      value: { computerId, sequence },
    }),
  );
  if (result.kind === "rejected") throw new AppStorageError(result.code);
}
