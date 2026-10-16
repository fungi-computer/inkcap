import { markDocumentsChanged } from "./documents-changed.js";
import * as Redacted from "effect/Redacted";
import { DurableObject } from "cloudflare:workers";
import * as z from "zod";
import {
  appBackendActorHeader,
  appBackendComputerHeader,
} from "@fungi.computer/agar/backend";
import { createDocumentActivityStore } from "./document-activity.js";
import { appBackend, type InkcapBackendContext } from "./methods.js";

const requestSchema = z.strictObject({
  method: z.enum(["documents.opened", "documents.edited", "documents.recent"]),
  input: z.json(),
});
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
  override async fetch(request: Request): Promise<Response> {
    if (request.method !== "PUT")
      return new Response(null, { status: 405, headers: { Allow: "PUT" } });
    const memberId = request.headers.get(appBackendActorHeader);
    if (!memberId)
      return Response.json({ error: "App actor unavailable" }, { status: 403 });
    try {
      const input = requestSchema.parse(await request.json());
      return Response.json(
        await appBackend.call(input.method, input.input, this, {
          actor: { kind: "member", memberId },
          computerId: request.headers.get(appBackendComputerHeader),
        }),
      );
    } catch (cause) {
      console.error("Inkcap action failed", Redacted.make(cause));
      // Never reflect provider errors, remote addresses or headers into the UI.
      return Response.json(
        { error: "Inkcap could not complete this action" },
        { status: 400 },
      );
    }
  }
}
export const Inkcap = appBackend.implement(InkcapFacet);
