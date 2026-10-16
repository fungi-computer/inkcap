import type { AppRoot } from "@fungi.computer/agar";
import { appsCall } from "@fungi.computer/agar/apps";
import { useAppContext } from "@fungi.computer/agar/react";
import { Alert } from "@fungi.computer/caps/components/alert";
import { useCallback } from "react";
import { InkcapApp, type InkcapEditorHandle } from "./InkcapApp.js";
import { InkcapRepositoryApp } from "./InkcapRepositoryApp.js";
import { repositoryLocation } from "./repository-navigation.js";
import { useEditorSwapGate, type EditorTarget } from "./editor-swap-gate.js";

export function InkcapEntry({
  app,
  computerName,
  projectPath,
}: {
  app: AppRoot | null;
  computerName: string | null;
  projectPath: string;
}) {
  const context = useAppContext(app);
  const repository = repositoryLocation(context?.openRequest ?? null);
  const hasRepositoryCapability = app?.capabilities.has(appsCall) ?? false;
  const desired: EditorTarget =
    repository !== null && repository !== "invalid" && hasRepositoryCapability
      ? { kind: "repository", ...repository }
      : { kind: "computer" };
  const { mounted, registerHandle } = useEditorSwapGate(desired);
  const onEditorReady = useCallback(
    (handle: InkcapEditorHandle) => {
      registerHandle(handle.requestWindowClose);
    },
    [registerHandle],
  );

  if (mounted.kind === "repository" && app !== null)
    return (
      <InkcapRepositoryApp
        connection={{ app }}
        repository={mounted.repository}
        initialBranch={mounted.initialBranch}
        initialPath={mounted.initialPath}
        openRequestId={mounted.openRequestId}
        onReady={onEditorReady}
      />
    );
  return (
    <>
      {repository === "invalid" ? (
        <Alert
          tone="warning"
          title="This repository link cannot be opened"
          description="Open the file again from Bonsai. Computer files and local drafts are still available."
        />
      ) : (
        repository !== null &&
        !hasRepositoryCapability && (
          <Alert
            tone="info"
            title="Repositories open from Bonsai"
            description="This host can still open Computer files and local drafts."
          />
        )
      )}
      <InkcapApp
        connection={app ? { app } : null}
        context={{
          computerId: context?.computerId ?? null,
          computerName,
          projectPath,
        }}
        onReady={onEditorReady}
      />
    </>
  );
}
