import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appsCall } from "@fungi.computer/agar/apps";
import { type FileSaveResult } from "@fungi.computer/agar/roles/files";
import { Button } from "@fungi.computer/caps/components/button";
import { Alert } from "@fungi.computer/caps/components/alert";
import { LoadingState } from "@fungi.computer/caps/blocks/loading-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@fungi.computer/caps/components/dialog";
import { GitBranch, History } from "lucide-react";
import {
  useInkcapWorkbench,
  type Connection,
  type InkcapEditorHandle,
} from "./InkcapApp.js";
import { InkcapView } from "./InkcapView.js";
import {
  bonsaiFileSource,
  bonsaiRequestUntilReady,
  type BonsaiTransport,
} from "./bonsai-file-source.js";
import { bonsaiSnapshot } from "./bonsai-repository.js";
import { RepositoryTree } from "./RepositoryTree.js";
import { repositoryKeys } from "./repository-queries.js";

export function InkcapRepositoryApp({
  connection,
  repository,
  initialBranch,
  initialPath,
  openRequestId,
  transport,
  onReady,
}: {
  connection: Connection;
  repository: string;
  initialBranch: string;
  initialPath: string;
  openRequestId: string;
  transport?: BonsaiTransport;
  onReady?: (handle: InkcapEditorHandle) => void;
}) {
  const client = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rebuilding, setRebuilding] = useState(0);
  const [states, setStates] = useState(new Map<string, FileSaveResult>());
  const [actionError, setActionError] = useState("");
  const lifetime = useRef(new AbortController());
  useEffect(() => {
    const frame = new AbortController();
    lifetime.current = frame;
    return () => {
      frame.abort();
    };
  }, []);
  const rawRequest = useCallback<BonsaiTransport>(
    (method, input) =>
      transport
        ? transport(method, input)
        : connection.app.capabilities
            .require(appsCall)
            .call("app_bonsai", method, JSON.stringify(input)),
    [connection.app, transport],
  );
  const request = useCallback<BonsaiTransport>(
    (method, input) =>
      bonsaiRequestUntilReady(
        method,
        input,
        rawRequest,
        lifetime.current.signal,
        (active) => {
          setRebuilding((count) => count + (active ? 1 : -1));
        },
      ),
    [rawRequest],
  );
  const refresh = useCallback(() => {
    void client.invalidateQueries({
      queryKey: repositoryKeys.all(
        connection.app.identity.surfaceId,
        repository,
      ),
    });
  }, [client, connection.app, repository]);
  const sources = useRef(
    new Map<
      string,
      Connection & { source: ReturnType<typeof bonsaiFileSource> }
    >(),
  );
  const selected = useMemo(() => {
    const key = `${connection.app.identity.surfaceId}:${repository}:${initialBranch}`;
    const existing = sources.current.get(key);
    if (existing?.app === connection.app) return existing;
    const source = bonsaiFileSource({
      repository,
      branch: initialBranch,
      request,
      onSaved: refresh,
      onSaveState: (path, result) => {
        if (lifetime.current.signal.aborted) return;
        setStates((previous) => {
          const next = new Map(previous);
          const key = `${repository}:${initialBranch}:${path}`;
          if (result === null) next.delete(key);
          else next.set(key, result);
          return next;
        });
      },
    });
    const selected = { app: connection.app, source };
    sources.current.set(key, selected);
    return selected;
  }, [repository, initialBranch, request, refresh, connection.app]);
  const model = useInkcapWorkbench({ connection: selected });
  const snapshot = useQuery({
    queryKey: repositoryKeys.branch(
      connection.app.identity.surfaceId,
      repository,
      initialBranch,
    ),
    queryFn: () => bonsaiSnapshot(request, repository, initialBranch),
    refetchInterval: 15_000,
  });
  useEffect(
    () => connection.app.window.onBeforeClose(model.requestWindowClose),
    [connection.app, model.requestWindowClose],
  );
  useEffect(() => {
    onReady?.({ requestWindowClose: model.requestWindowClose });
  }, [onReady, model.requestWindowClose]);
  const opened = useRef<string>();
  const heads = useRef(new Map<string, string>());
  const deferredReopens = useRef(new Set<number>());
  useEffect(() => {
    if (!snapshot.data) return;
    const requestKey = `${selected.app.identity.surfaceId}:${selected.source.id}:${openRequestId}`;
    if (opened.current !== requestKey) {
      opened.current = requestKey;
      model.onOpenFile(initialPath);
    }
    const previous = heads.current.get(selected.source.id);
    const changed = previous !== undefined && previous !== snapshot.data.head;
    heads.current.set(selected.source.id, snapshot.data.head);
    const liveKeys = new Set(model.tabs.map((tab) => tab.tabKey));
    for (const key of deferredReopens.current)
      if (!liveKeys.has(key)) deferredReopens.current.delete(key);
    for (const tab of model.tabs) {
      if (
        tab.target.closed ||
        tab.connection !== selected ||
        (!changed && !deferredReopens.current.has(tab.tabKey))
      )
        continue;
      if (tab.target.saving) {
        deferredReopens.current.add(tab.tabKey);
        continue;
      }
      deferredReopens.current.delete(tab.tabKey);
      if (!tab.target.dirty) model.onReopen(tab, { background: true });
    }
  }, [snapshot.data, selected, initialPath, openRequestId, model]);
  const active = model.tabs.find((tab) => tab.tabKey === model.active);
  const state = active?.connection?.source
    ? states.get(`${active.connection.source.id}:${active.path}`)
    : undefined;
  const repositoryStatus =
    state?.kind === "saved"
      ? "Saved · syncing"
      : state?.kind === "synced"
        ? `Synced · ${state.commit.slice(0, 7)}`
        : state?.kind === "conflict"
          ? "Sync conflict · Compare"
          : state?.kind === "failed"
            ? "Sync failed · Retry"
            : undefined;
  async function retrySync() {
    if (!active?.connection?.source) return;
    const provider = sources.current.get(
      `${active.connection.app.identity.surfaceId}:${active.connection.source.id}`,
    );
    if (!provider) return;
    try {
      setActionError("");
      await provider.source.retry(active.path, lifetime.current.signal);
    } catch (cause) {
      console.error("Bonsai sync retry failed", cause);
      setActionError(
        "Could not retry sync. Your saved text remains in Bonsai.",
      );
    }
  }
  async function saveAgain() {
    if (!active?.connection?.source) return;
    const available = () =>
      !active.target.dirty && !active.target.saving && !active.target.closed;
    if (!available()) return;
    const provider = sources.current.get(
      `${active.connection.app.identity.surfaceId}:${active.connection.source.id}`,
    );
    if (!provider) return;
    try {
      setActionError("");
      const file = await provider.source.read(
        active.path,
        lifetime.current.signal,
      );
      if (file.kind !== "text")
        throw new Error("This saved text is unavailable.");
      if (!available()) return;
      await provider.source.replace(
        active.path,
        file.contents,
        file.contents,
        lifetime.current.signal,
      );
    } catch (cause) {
      console.error("Bonsai explicit re-save failed", cause);
      setActionError(
        "Could not save again. Your saved text and open edits remain available.",
      );
    }
  }
  return (
    <div className="inkcap-repository">
      <div className="inkcap-repository-toolbar">
        <span className="inkcap-repository-name">
          <GitBranch aria-hidden="true" /> {repository} · {initialBranch}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setHistoryOpen(true);
          }}
        >
          <History
            aria-hidden="true"
            className="size-[var(--stipe-icon-size-sm)]"
          />{" "}
          History
        </Button>
      </div>
      {rebuilding > 0 && <LoadingState message="Loading this repository…" />}
      {snapshot.data?.truncated && (
        <Alert tone="info" title="Only the indexed files are shown" />
      )}
      {actionError && (
        <Alert
          tone="error"
          title="Sync unavailable"
          description={actionError}
        />
      )}
      {state?.kind === "failed" && (
        <Alert
          tone="warning"
          title={
            state.reason === "permanent_material"
              ? "Sync needs a new save"
              : "Sync failed"
          }
          description={
            state.reason === "permanent_material"
              ? "Your text is saved. Save again using the current repository state to retry sync."
              : "Your file is saved in Bonsai. Retry when access is available."
          }
          action={
            <Button
              size="sm"
              disabled={
                state.reason === "permanent_material" &&
                active !== undefined &&
                (active.target.dirty || active.target.saving)
              }
              onClick={() =>
                void (state.reason === "permanent_material"
                  ? saveAgain()
                  : retrySync())
              }
            >
              {state.reason === "permanent_material" ? "Save again" : "Retry"}
            </Button>
          }
        />
      )}
      <InkcapView
        model={{
          ...model,
          repositoryStatus,
          repositoryStates: states,
          canList: true,
          sourceLabel: selected.source.label,
          onReadCurrent: async (tab, reload) => {
            if (tab.connection?.source?.kind !== "repository")
              return model.onReadCurrent(tab);
            const provider = sources.current.get(
              `${tab.connection.app.identity.surfaceId}:${tab.connection.source.id}`,
            );
            if (!provider || tab.target.closed)
              throw new Error("This Bonsai file is no longer open.");
            if (reload)
              await provider.source.discard(tab.path, lifetime.current.signal);
            return provider.source.readCommitted(
              tab.path,
              lifetime.current.signal,
            );
          },
          error: snapshot.error
            ? "Could not refresh this repository. Your open edits remain available."
            : model.error,
          fileTree: (onOpenFile) => (
            <RepositoryTree
              files={snapshot.data?.files ?? []}
              dirtyPaths={model.tabs
                .filter((tab) => tab.connection === selected && tab.dirty)
                .map((tab) => tab.path)}
              activePath={active?.connection === selected ? active.path : null}
              busy={snapshot.isFetching}
              onRefresh={refresh}
              onOpenFile={onOpenFile}
            />
          ),
        }}
      />
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Commit history</DialogTitle>
            <DialogDescription>
              {repository} · {initialBranch}
            </DialogDescription>
          </DialogHeader>
          <ol className="inkcap-repository-history">
            {snapshot.data?.history.map((commit) => (
              <li key={commit.hash}>
                <code>{commit.hash.slice(0, 7)}</code> {commit.message}
                <span className="text-dim">{commit.author.name}</span>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </div>
  );
}
