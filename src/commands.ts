import { useAppCommandCatalog } from "@fungi.computer/agar/react";
import type { WhistleCommand } from "@fungi.computer/whistle";
import { useCallback, useEffect, useRef } from "react";
import type { AppCommand, AppRoot } from "@fungi.computer/agar";
import * as Schema from "effect/Schema";

/** The File menu action shared by Inkcap's UI and its command handler. */
const INKCAP_NEW_DRAFT_COMMAND = {
  id: "new-draft",
  title: "New Draft",
  category: "File",
  description: "Create a new draft in Inkcap",
  projections: {
    bindings: { values: ["<leader>n"], order: 0 },
    menu: { order: 0 },
    palette: { order: 0 },
  },
  action: { presentation: { type: "action" } },
} satisfies AppCommand;

const INKCAP_BROWSE_FILES_COMMAND = {
  id: "browse-files",
  title: "Show Files",
  category: "File",
  description: "Choose a file to open from Explorer",
  projections: {
    menu: { order: 1 },
    palette: { order: 2 },
  },
  action: { presentation: { type: "action" } },
} satisfies AppCommand;

const INKCAP_SAVE_COMMAND = {
  id: "save",
  title: "Save",
  category: "File",
  description: "Save the focused Inkcap document",
  projections: {
    bindings: { values: ["mod+s"], order: 1 },
    menu: { order: 2 },
    palette: { order: 1 },
  },
  action: { presentation: { type: "action" } },
} satisfies AppCommand;

const INKCAP_SAVE_AS_COMMAND = {
  id: "save-as",
  title: "Save As\u2026",
  category: "File",
  description: "Save the focused Inkcap document under a new path",
  projections: {
    menu: { order: 3 },
    palette: { order: 3 },
  },
  action: { presentation: { type: "action" } },
} satisfies AppCommand;

const INKCAP_OPEN_FILE_COMMAND = {
  id: "open-file",
  title: "Open File",
  category: "File",
  description: "Open a file handed off by another App",
  projections: { menu: { order: 4 } },
  action: {
    inputSchema: {
      type: "object",
      properties: {
        computerId: { type: "string" },
        path: { type: "string" },
      },
      required: ["computerId", "path"],
      additionalProperties: false,
    },
    presentation: { type: "action" },
  },
} satisfies AppCommand;

export type InkcapOpenFileInput = Readonly<{
  computerId: string;
  path: string;
}>;

const openFileInputSchema = Schema.Struct({
  computerId: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(256),
  ),
  path: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1024)),
});

export type InkcapSaveAvailability =
  | Readonly<{ status: "available" }>
  | Readonly<{ status: "unavailable"; reason: string }>;

/** The live operation and state owner for one mounted document. */
export type InkcapSaveBinding = Readonly<{
  availability: () => InkcapSaveAvailability;
  save: () => Promise<boolean>;
  /** Whether Save As applies to this document now. */
  saveAsAvailability: () => InkcapSaveAvailability;
  /** Ask where to save a copy; the dialog owns the rest. */
  saveAs: () => void;
}>;

/** The live workbench actions; the focused document remains the Save owner. */
export type InkcapCommandBinding = Readonly<{
  newDraft: () => void;
  /** Reveal Explorer so a file can be chosen. */
  browseFiles: () => void;
  save?: () => InkcapSaveBinding | undefined;
  openFile?: (input: InkcapOpenFileInput) => Promise<void>;
}>;

/** Publish Inkcap's catalog through Agar; React owns registration lifetime. */
export function useInkcapCommands(
  app: AppRoot | null,
  binding: InkcapCommandBinding,
): void {
  const current = useRef<{
    app: AppRoot | null;
    binding: InkcapCommandBinding;
  }>();
  useEffect(() => {
    current.current = { app, binding };
    return () => {
      current.current = undefined;
    };
  }, [app, binding]);
  const availability = binding.save?.()?.availability();
  const status = availability?.status ?? "unavailable";
  const reason =
    availability?.status === "unavailable"
      ? availability.reason
      : availability
        ? undefined
        : "No focused savable dirty document.";
  const saveAsAvailability = binding.save?.()?.saveAsAvailability();
  const saveAsStatus = saveAsAvailability?.status ?? "unavailable";
  const saveAsReason =
    saveAsAvailability?.status === "unavailable"
      ? saveAsAvailability.reason
      : saveAsAvailability
        ? undefined
        : "No open file to save as.";
  const build = useCallback<() => readonly WhistleCommand<never>[]>(() => {
    const active = (signal?: AbortSignal) => {
      if (
        !app ||
        signal?.aborted ||
        current.current?.app !== app ||
        !isUsable(app)
      )
        return undefined;
      return current.current.binding;
    };
    return [
      {
        ...INKCAP_NEW_DRAFT_COMMAND,
        handler: ({ signal }) => {
          active(signal)?.newDraft();
        },
      },
      {
        ...INKCAP_BROWSE_FILES_COMMAND,
        handler: ({ signal }) => {
          active(signal)?.browseFiles();
        },
      },
      {
        ...INKCAP_SAVE_COMMAND,
        availability: () =>
          status === "available"
            ? { status: "available" }
            : {
                status: "unavailable",
                reason: reason ?? "No focused savable dirty document.",
              },
        handler: async ({ signal }) => {
          const binding = active(signal);
          if (!binding) return;
          const save = binding.save?.();
          if (!save) throw new Error("No focused savable dirty document.");
          const availability = save.availability();
          if (availability.status === "unavailable")
            throw new Error(availability.reason);
          if (!(await save.save()))
            throw new Error("No focused savable dirty document.");
        },
      },
      {
        ...INKCAP_SAVE_AS_COMMAND,
        availability: () =>
          saveAsStatus === "available"
            ? { status: "available" }
            : {
                status: "unavailable",
                reason: saveAsReason ?? "No open file to save as.",
              },
        handler: ({ signal }) => {
          const binding = active(signal);
          if (!binding) return;
          const save = binding.save?.();
          if (!save) throw new Error("No open file to save as.");
          const availability = save.saveAsAvailability();
          if (availability.status === "unavailable")
            throw new Error(availability.reason);
          save.saveAs();
        },
      },
      {
        ...INKCAP_OPEN_FILE_COMMAND,
        handler: async ({ arguments: value, signal }) => {
          const binding = active(signal);
          if (!binding) return;
          if (!binding.openFile)
            throw new Error("Inkcap is not ready to open a handed-off file.");
          let input: InkcapOpenFileInput;
          try {
            input = Schema.decodeUnknownSync(openFileInputSchema, {
              onExcessProperty: "error",
            })(value);
          } catch (cause) {
            throw new Error("Inkcap open-file arguments are invalid.", {
              cause,
            });
          }
          await binding.openFile(input);
        },
      },
    ];
  }, [app, status, reason, saveAsStatus, saveAsReason]);
  useAppCommandCatalog(
    app,
    { sourceId: "inkcap-file", namespace: "inkcap" },
    build,
  );
}

function isUsable(app: AppRoot): boolean {
  const state = app.lifecycle.get();
  return (
    state !== "disposing" && state !== "disposed" && state !== "disconnected"
  );
}
