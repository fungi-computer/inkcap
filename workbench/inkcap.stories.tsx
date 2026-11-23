import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@fungi.computer/agar/query";
import type { StoryDefault } from "@ladle/react";
import { useEffect, useRef, useState } from "react";
import type { AppBackHandler, AppForwardHandler } from "@fungi.computer/agar";
import { InkcapApp } from "../src/InkcapApp.js";
import { projectPathFor } from "../src/computer-home.js";
import {
  createInkcapFixture,
  projectPath,
  type InkcapScenario,
} from "./fixtures.js";
import { Toaster, toast } from "@fungi.computer/caps/components/toaster";
import "./workbench.css";

export default { title: "Inkcap" } satisfies StoryDefault;

const defaultOpened = ["README.md", "src/garden.ts"];

function Workbench({
  scenario = "workspace",
  narrow = false,
  connected = true,
  opened = defaultOpened,
}: {
  scenario?: InkcapScenario;
  narrow?: boolean;
  connected?: boolean;
  /** Project files open as tabs, in order. */
  opened?: readonly string[];
}) {
  const [queryClient] = useState(createQueryClient);
  useEffect(
    () => () => {
      queryClient.clear();
    },
    [queryClient],
  );
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const back = useRef<AppBackHandler>();
  const forward = useRef<AppForwardHandler>();
  const [fixture] = useState(() =>
    createInkcapFixture(scenario, undefined, undefined, {
      publish: (state) => {
        setCanGoBack(state.canGoBack);
        setCanGoForward(state.canGoForward);
        return Promise.resolve();
      },
      onActivate: () => () => undefined,
      onForward: (handler) => {
        forward.current = handler;
        return () => {
          if (forward.current === handler) forward.current = undefined;
        };
      },
      onBack: (handler) => {
        back.current = handler;
        return () => {
          if (back.current === handler) back.current = undefined;
        };
      },
    }),
  );
  const [notice, setNotice] = useState("");
  const [fileMenu, setFileMenu] = useState(() => fixture.fileMenu());
  useEffect(
    () =>
      fixture.onFileMenuChange(() => {
        setFileMenu(fixture.fileMenu());
      }),
    [fixture],
  );
  useEffect(() => fixture.installKeys(document.body), [fixture]);
  useEffect(() => {
    const lifecycle = { active: true };
    void (async () => {
      if (
        !connected ||
        scenario === "empty" ||
        scenario === "first-run" ||
        scenario === "unavailable" ||
        scenario === "no-computer-selected" ||
        scenario === "tree-loading" ||
        scenario === "tree-error"
      )
        return;
      for (const path of opened)
        if (lifecycle.active) await fixture.open(`${projectPath}/${path}`);
    })().catch((cause: unknown) => {
      if (lifecycle.active) setNotice(String(cause));
    });
    return () => {
      lifecycle.active = false;
    };
  }, [fixture, scenario, connected, opened]);
  return (
    <div className="inkcap-study" data-narrow={narrow}>
      <div className="inkcap-study-note">
        <span>Inkcap · real editor · in-memory Computer</span>
        <div role="group" aria-label="Host File menu">
          {fileMenu.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!item.enabled}
              onClick={() => {
                void fixture.runMenuItem(item.id);
              }}
            >
              {item.title}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!canGoBack}
          onClick={() => {
            void back.current?.();
          }}
        >
          Host Back
        </button>
        <button
          type="button"
          disabled={!canGoForward}
          onClick={() => {
            void forward.current?.();
          }}
        >
          Host Forward
        </button>
        <button
          type="button"
          onClick={() => {
            void Promise.resolve(fixture.requestClose()).then((accepted) => {
              setNotice(
                accepted ? "Window close accepted" : "Window remains open",
              );
            });
          }}
        >
          Test window close
        </button>
        {scenario === "failed-save" ? (
          <button
            type="button"
            onClick={() => {
              fixture.allowWrites();
              setNotice("Writes allowed. Retry Save.");
            }}
          >
            Allow writes
          </button>
        ) : null}
        {scenario === "saving" ? (
          <button
            type="button"
            onClick={() => {
              fixture.finishSave();
              setNotice("Save finished.");
            }}
          >
            Finish save
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            toast("Saved garden.ts", { duration: Infinity });
          }}
        >
          Show notice
        </button>
        <output>{notice}</output>
      </div>
      {scenario === "dirty" ? (
        <p className="inkcap-study-instruction">
          Edit a line, switch tabs, then try closing the document. The real
          editor owns the dirty state and save/discard prompt.
        </p>
      ) : null}
      {scenario === "failed-save" ? (
        <p className="inkcap-study-instruction">
          Edit a line and save. This Computer rejects writes until you choose
          Allow writes; your text stays in the editor.
        </p>
      ) : null}
      {scenario === "saving" ? (
        <p className="inkcap-study-instruction">
          Edit and save, then keep typing while the write is in flight. Newer
          changes must stay unsaved.
        </p>
      ) : null}
      <Toaster />
      <div className="inkcap-study-surface">
        <QueryClientProvider client={queryClient}>
          <InkcapApp
            connection={connected ? fixture.connection : null}
            context={{
              computerId: fixture.computerId,
              computerName: "Workbench",
              projectPath:
                scenario === "first-run" ? projectPathFor(null) : projectPath,
            }}
          />
        </QueryClientProvider>
      </div>
    </div>
  );
}

export const Workspace = () => <Workbench />;
export const Images = () => <Workbench scenario="images" />;
export const Videos = () => <Workbench scenario="videos" />;
export const DirtyDocument = () => <Workbench scenario="dirty" />;
export const Empty = () => <Workbench scenario="empty" />;
export const FirstRun = () => <Workbench scenario="first-run" />;
export const Saving = () => <Workbench scenario="saving" />;
export const FailedSave = () => <Workbench scenario="failed-save" />;
export const UnavailableComputer = () => <Workbench scenario="unavailable" />;
export const NoComputerSelected = () => (
  <Workbench scenario="no-computer-selected" />
);
export const Narrow = () => <Workbench narrow />;
export const Changes = () => <Workbench scenario="changes" />;
export const ChangesNarrow = () => <Workbench scenario="changes" narrow />;
const crowded = ["README.md", "src/garden.ts", "src/notes.md", "package.json"];
/** Four open files: open a diff beside them to crowd the tab strip. */
export const ChangesCrowded = () => (
  <Workbench scenario="changes" opened={crowded} />
);
export const ChangesEmpty = () => <Workbench scenario="changes-empty" />;
export const ChangesUnavailable = () => <Workbench scenario="changes-error" />;

export const FilesLoading = () => <Workbench scenario="tree-loading" />;
export const FilesUnavailable = () => <Workbench scenario="tree-error" />;
export const FileReadFailed = () => <Workbench scenario="read-error" />;
export const ReadOnlyFiles = () => <Workbench scenario="readonly" />;
export const Disconnected = () => <Workbench connected={false} />;

export const ActivityRecordingFailure = () => (
  <Workbench scenario="activity-error" />
);
