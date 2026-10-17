import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@fungi.computer/agar/query";
import type { StoryDefault } from "@ladle/react";
import { useEffect, useRef, useState } from "react";
import type { AppBackHandler } from "@fungi.computer/agar";
import { InkcapApp } from "../src/InkcapApp.js";
import {
  createInkcapFixture,
  projectPath,
  type InkcapScenario,
} from "./fixtures.js";
import "./workbench.css";

export default { title: "Inkcap" } satisfies StoryDefault;

function Workbench({
  scenario = "workspace",
  narrow = false,
  connected = true,
}: {
  scenario?: InkcapScenario;
  narrow?: boolean;
  connected?: boolean;
}) {
  const [queryClient] = useState(createQueryClient);
  useEffect(
    () => () => {
      queryClient.clear();
    },
    [queryClient],
  );
  const [canGoBack, setCanGoBack] = useState(false);
  const back = useRef<AppBackHandler>();
  const [fixture] = useState(() =>
    createInkcapFixture(scenario, undefined, undefined, {
      publish: (state) => {
        setCanGoBack(state.canGoBack);
        return Promise.resolve();
      },
      onActivate: () => () => undefined,
      onBack: (handler) => {
        back.current = handler;
        return () => {
          if (back.current === handler) back.current = undefined;
        };
      },
    }),
  );
  const [notice, setNotice] = useState("");
  useEffect(() => fixture.installKeys(document.body), [fixture]);
  useEffect(() => {
    const lifecycle = { active: true };
    void (async () => {
      if (
        !connected ||
        scenario === "empty" ||
        scenario === "unavailable" ||
        scenario === "no-computer-selected" ||
        scenario === "tree-loading" ||
        scenario === "tree-error"
      )
        return;
      await fixture.open(`${projectPath}/README.md`);
      if (lifecycle.active) await fixture.open(`${projectPath}/src/garden.ts`);
    })().catch((cause: unknown) => {
      if (lifecycle.active) setNotice(String(cause));
    });
    return () => {
      lifecycle.active = false;
    };
  }, [fixture, scenario, connected]);
  return (
    <div className="inkcap-study" data-narrow={narrow}>
      <div className="inkcap-study-note">
        <span>Inkcap · real editor · in-memory Computer</span>
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
        {scenario === "saving" ? <span>Saves take 3.5 seconds.</span> : null}
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
      <div className="inkcap-study-surface">
        <QueryClientProvider client={queryClient}>
          <InkcapApp
            connection={connected ? fixture.connection : null}
            context={{
              computerId: fixture.computerId,
              computerName: "Workbench",
              projectPath,
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
export const Saving = () => <Workbench scenario="saving" />;
export const FailedSave = () => <Workbench scenario="failed-save" />;
export const UnavailableComputer = () => <Workbench scenario="unavailable" />;
export const NoComputerSelected = () => (
  <Workbench scenario="no-computer-selected" />
);
export const Narrow = () => <Workbench narrow />;

export const FilesLoading = () => <Workbench scenario="tree-loading" />;
export const FilesUnavailable = () => <Workbench scenario="tree-error" />;
export const FileReadFailed = () => <Workbench scenario="read-error" />;
export const ReadOnlyFiles = () => <Workbench scenario="readonly" />;
export const Disconnected = () => <Workbench connected={false} />;

export const ActivityRecordingFailure = () => (
  <Workbench scenario="activity-error" />
);
