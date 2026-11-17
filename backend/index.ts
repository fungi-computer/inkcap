import { markDocumentsChanged } from "./documents-changed.js";
import { DurableObject } from "cloudflare:workers";
import { createDocumentActivityStore } from "./document-activity.js";
import { appBackend, type InkcapBackendContext } from "./methods.js";

class InkcapFacet extends DurableObject<InkcapBackendContext["env"]> {
  declare public readonly env: InkcapBackendContext["env"];
  readonly activity;
  constructor(ctx: DurableObjectState, env: InkcapBackendContext["env"]) {
    super(ctx, env);
    this.activity = createDocumentActivityStore(ctx.storage.sql);
  }
  readonly documentsChanged = (
    computerId: string,
    sequence: number,
  ): Promise<void> =>
    markDocumentsChanged(this.env.APP_STORAGE, computerId, sequence);
}
export const Inkcap = appBackend.implement(InkcapFacet);
