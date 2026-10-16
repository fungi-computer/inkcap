import { appMethods } from "@fungi.computer/agar/backend";
import {
  createCapabilityRegistry,
  inertHostNavigation,
} from "@fungi.computer/agar";
import type {
  AppCommand,
  AppRoot,
  AppCommandHandler,
} from "@fungi.computer/agar";
import {
  computerList,
  computerReadFile,
  computerWriteFile,
} from "@fungi.computer/agar/computer";
import { RpcStub, RpcTarget } from "@fungi.computer/capnweb";

export type InkcapScenario =
  | "workspace"
  | "images"
  | "videos"
  | "dirty"
  | "empty"
  | "saving"
  | "failed-save"
  | "unavailable"
  | "no-computer-selected"
  | "tree-loading"
  | "tree-error"
  | "read-error"
  | "readonly"
  | "activity-error";
export const projectPath = "/field-notes";
export const videoClipPath = `${projectPath}/clip.mp4`;
export const oversizedVideoPath = `${projectPath}/oversized.mp4`;
/** Served by the browser proof's route interception; a real CC0 clip never
 * ships inline here. A manual Ladle run without that route falls back to the
 * empty placeholder bytes set below. */
const videoFixtureUrl = "/__inkcap-fixtures__/clip.mp4";
const samples = {
  "/field-notes/src/garden.ts": `export type Plant = {
  name: string;
  light: "morning" | "afternoon";
};

export const garden: Plant[] = [
  { name: "Fern", light: "morning" },
  { name: "Clover", light: "afternoon" },
];

export function welcome(plant: Plant): string {
  return \`A little room for \${plant.name.toLowerCase()}.\`;
}
`,
  "/field-notes/src/theme.css": `:root {
  --leaf: #7ba96c;
  --paper: #f6f1e7;
}

.garden {
  display: grid;
  gap: 1rem;
  background: var(--paper);
}
`,
  "/field-notes/README.md": `# Field notes

A small place for ideas to grow.

## Next up

- Plant something new
- Leave room for the unexpected
- Keep the useful bits
`,
  "/field-notes/package.json":
    '{\n  "name": "field-notes",\n  "private": true\n}\n',
};

/** Native Agar capability implementations; all file bytes stay in this story. */
export function createInkcapFixture(
  scenario: InkcapScenario,
  computerId: string | null = scenario === "no-computer-selected"
    ? null
    : "inkcap-workbench",
  commandSink?: AppRoot["commands"],
  navigation: AppRoot["window"]["navigation"] = inertHostNavigation,
  /** The window's status bar; a story without a shell drops its items. */
  status: Pick<AppRoot["ui"], "reportStatus" | "onStatusAction"> = {
    reportStatus: () => Promise.resolve(),
    onStatusAction: () => () => undefined,
  },
) {
  const files = new Map<string, string>(
    scenario === "empty" ? [] : Object.entries(samples),
  );
  if (scenario === "images") {
    files.set(
      `${projectPath}/sample.svg`,
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="green"/><script>parent.document.documentElement.dataset.inkcapSvgScript="executed";</script></svg>',
    );
    files.set(`${projectPath}/invalid.svg`, "This is not an SVG image.");
  }
  if (scenario === "videos") {
    // Text `files` only tracks listing metadata here; the clip's real bytes
    // are binary and never pass through that string-keyed store.
    files.set(videoClipPath, "");
    files.set(oversizedVideoPath, "");
  }
  /** The browser proof intercepts this same-origin fetch with real clip
   * bytes; anything else (a manual Ladle run) keeps an empty placeholder. */
  async function videoClipBlob(): Promise<Blob> {
    try {
      const response = await fetch(videoFixtureUrl);
      return response.ok ? await response.blob() : new Blob([]);
    } catch {
      return new Blob([]);
    }
  }
  const handlers = new Map<string, AppCommandHandler>();
  const definitions = new Map<string, AppCommand>();
  const capabilities = createCapabilityRegistry();
  let beforeClose: (() => boolean | Promise<boolean>) | undefined;
  let denyWrites = scenario === "failed-save";
  const register: typeof capabilities.provide = (contract, value) => {
    if (
      scenario !== "unavailable" &&
      scenario !== "no-computer-selected" &&
      !(scenario === "readonly" && contract.id === computerWriteFile.id)
    )
      capabilities.provide(contract, value);
  };
  register(appMethods, {
    call(method) {
      if (method !== "documents.opened" && method !== "documents.edited")
        return Promise.reject(new Error("Unused fixture method"));
      return scenario === "activity-error"
        ? Promise.reject(new Error("Controlled activity-recording failure"))
        : Promise.resolve({ recorded: true });
    },
  });
  register(computerList, {
    list: ({ path, offset, limit }) => {
      if (scenario === "tree-loading") return new Promise(() => undefined);
      if (scenario === "tree-error")
        return Promise.reject(
          new Error(
            "The Computer could not list /field-notes. Reconnect and retry.",
          ),
        );
      const prefix = `${path.replace(/\/$/, "")}/`;
      const entries = new Map<
        string,
        {
          name: string;
          type: "file" | "directory";
          size: number;
          modifiedAt: number;
        }
      >();
      for (const [name, contents] of files) {
        if (!name.startsWith(prefix)) continue;
        const relative = name.slice(prefix.length);
        const segment = relative.split("/")[0];
        entries.set(segment, {
          name: segment,
          type: relative.includes("/") ? "directory" : "file",
          size: contents.length,
          modifiedAt: 0,
        });
      }
      const listing = [...entries.values()];
      return Promise.resolve({
        path,
        entries: listing.slice(offset, offset + limit),
        nextOffset: offset + limit < listing.length ? offset + limit : null,
      });
    },
  });
  register(computerReadFile, {
    open: ({ path }) =>
      Promise.resolve(
        new RpcStub(
          new (class extends RpcTarget {
            async response() {
              if (scenario === "videos" && path === oversizedVideoPath)
                return Object.assign(
                  new Response(JSON.stringify({ error: "too_large" }), {
                    headers: { "content-type": "application/json" },
                    status: 413,
                  }),
                  {
                    [Symbol.dispose]() {
                      /* Story response owns no remote resource. */
                    },
                  },
                );
              if (scenario === "videos" && path === videoClipPath)
                return Object.assign(
                  new Response(await videoClipBlob(), {
                    headers: { "content-type": "application/octet-stream" },
                    status: 200,
                  }),
                  {
                    [Symbol.dispose]() {
                      /* Story response owns no remote resource. */
                    },
                  },
                );
              const content = files.get(path);
              return Object.assign(
                new Response(content ?? null, {
                  headers: { "content-type": "application/octet-stream" },
                  status:
                    scenario === "read-error"
                      ? 503
                      : content === undefined
                        ? 404
                        : 200,
                }),
                {
                  [Symbol.dispose]() {
                    /* Story response owns no remote resource. */
                  },
                },
              );
            }
            close() {
              /* Native stub lifetime only. */
            }
          })(),
        ),
      ),
  });
  register(computerWriteFile, {
    replace: async ({ path, expectedContent, content }) => {
      await new Promise((resolve) =>
        setTimeout(resolve, scenario === "saving" ? 3500 : 350),
      );
      if (denyWrites)
        throw new Error("The workbench Computer denied this write.");
      if (files.get(path) !== expectedContent) return { kind: "conflict" };
      files.set(path, content);
      return {
        kind: "replaced",
        path,
        bytes: new TextEncoder().encode(content).byteLength,
      };
    },
    mkdir: () =>
      Promise.reject(
        new Error(
          "Folder creation is not supported by the Inkcap preview fixture.",
        ),
      ),
    open: ({ path }) =>
      Promise.resolve(
        new RpcStub(
          new (class extends RpcTarget {
            async write(content: ReadableStream<Uint8Array>) {
              const text = await new Response(content).text();
              await new Promise((resolve) =>
                setTimeout(resolve, scenario === "saving" ? 3500 : 350),
              );
              if (denyWrites)
                throw new Error("The workbench Computer denied this write.");
              files.set(path, text);
            }
            close() {
              /* File content is retained by the story, not the handle. */
            }
          })(),
        ),
      ),
  });
  const context: ReturnType<AppRoot["context"]["get"]> = {
    computerId,
    focus: { editing: false, surface: null },
    openRequest: null,
    visibility: "visible",
  };
  const app: AppRoot = {
    capabilities,
    commands: {
      register: async (command, handler) => {
        handlers.set(command.id, handler);
        definitions.set(command.id, command);
        const release = await commandSink?.register(command, handler);
        return () => {
          handlers.delete(command.id);
          definitions.delete(command.id);
          release?.();
        };
      },
    },
    context: {
      get: () => context,
      subscribe: () => () => undefined,
    },
    lifecycle: { get: () => "connected", subscribe: () => () => undefined },
    theme: { get: () => "latte", subscribe: () => () => undefined },
    identity: {
      appId: "inkcap",
      releaseId: "workbench",
      surfaceId: "inkcap-workbench",
    },
    window: {
      navigation,
      onBeforeClose: (handler) => {
        beforeClose = handler;
        return () => {
          beforeClose = undefined;
        };
      },
    },
    ui: {
      openNavigation: () => Promise.resolve(),
      reportStatus: status.reportStatus,
      onStatusAction: status.onStatusAction,
      requestAppPermissions: () => Promise.resolve("declined" as const),
      openTeamBilling: () => Promise.resolve(),
      requestComputerChoice: () => Promise.reject(new Error("No picker")),
      requestBrowserAction: () => {
        throw new Error("Unexpected browser action");
      },
      openDesktopSettings: () => Promise.resolve(),
      reportAgentSessionSelection: () => Promise.resolve(),
      showToast: () => Promise.resolve(),
    },
    dispose() {
      /* Story state is released on unmount. */
    },
  };
  return {
    connection: { app },
    computerId,
    files,
    allowWrites() {
      denyWrites = false;
    },
    requestClose: () => beforeClose?.(),
    /**
     * Stand in for Agar's App key layer when no host is attached: run the
     * registered commands' `mod+` chords, as the iframe bridge does.
     */
    installKeys(root: HTMLElement): () => void {
      const onKeyDown = (event: KeyboardEvent) => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
        const chord = `mod+${event.key.toLowerCase()}`;
        for (const [id, command] of definitions) {
          if (!command.projections?.bindings?.values.includes(chord)) continue;
          event.preventDefault();
          if (command.availability?.status === "unavailable") return;
          void handlers.get(id)?.({
            origin: "keyboard",
            signal: new AbortController().signal,
          });
          return;
        }
      };
      root.addEventListener("keydown", onKeyDown, { capture: true });
      return () => {
        root.removeEventListener("keydown", onKeyDown, { capture: true });
      };
    },
    async open(path: string) {
      const handler = handlers.get("open-file");
      if (!handler)
        throw new Error("Inkcap's open-file command is not registered.");
      await handler({
        origin: "programmatic",
        arguments: { computerId, path },
        signal: new AbortController().signal,
      });
    },
  };
}
