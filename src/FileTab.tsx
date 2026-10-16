import { useEffect, useMemo, useRef, useState } from "react";
import { EditProvider, File as DiffsFile } from "@pierre/diffs/react";
import { Editor } from "@pierre/diffs/edit";
import {
  Button,
  type ButtonResult,
} from "@fungi.computer/caps/components/button";
import { IconButton } from "@fungi.computer/caps/components/icon-button";
import { TabsContent } from "@fungi.computer/caps/components/tabs";
import { Input } from "@fungi.computer/caps/components/input";
import { Alert } from "@fungi.computer/caps/components/alert";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@fungi.computer/caps/components/tooltip";
import { RefreshCw, Save, SaveAll, Download, X, Info, Eye } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@fungi.computer/caps/components/dialog";
import { Field } from "@fungi.computer/caps/components/field";
import { Markdown } from "@fungi.computer/caps/components/markdown";
import { getTheme, subscribeTheme } from "@fungi.computer/stipe/theme";
import { useForm, useSelector } from "@tanstack/react-form";
import { FileConflict } from "./FileConflict.js";
import { useFileDocument, type DocumentTarget } from "./useFileDocument.js";
import type { InkcapSaveBinding } from "./commands.js";
import { imageMediaType, isMarkdownPath } from "./read-for-open.js";

export function FileTab({
  path,
  initial,
  active,
  narrow,
  tabKey,
  savable,
  local,
  sourceLabel,
  activityNotice,
  onDismissActivityNotice,
  previewUrl,
  previewKind,
  onReopen,
  onSaveAs,
  onPathChange,
  target,
  write,
  overwrite,
  readCurrent,
  onStatus,
  onSaveBinding,
  syncConflict = false,
}: {
  path: string;
  initial: string;
  active: boolean;
  narrow: boolean;
  tabKey: number;
  savable: boolean;
  local: boolean;
  sourceLabel?: string;
  activityNotice?: boolean;
  onDismissActivityNotice?: () => void;
  previewUrl?: string;
  previewKind?: "image" | "video";
  onReopen?: () => void;
  onSaveAs?: (path: string, contents: string) => Promise<string>;
  onPathChange?: (path: string) => void;
  target?: DocumentTarget;
  write: (contents: string, expectedContent: string) => Promise<void>;
  overwrite: (contents: string) => Promise<void>;
  readCurrent: (reload: boolean) => Promise<string>;
  syncConflict?: boolean;
  onStatus: (dirty: boolean, saving: boolean) => void;
  onSaveBinding: (
    tabKey: number,
    binding: InkcapSaveBinding | undefined,
  ) => void;
}): React.JSX.Element {
  const [theme, setTheme] = useState(() => getTheme() ?? "latte");
  const themeRoot = useRef<HTMLDivElement>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [markdownPreview, setMarkdownPreview] = useState(false);
  useEffect(() => {
    const root = themeRoot.current?.closest<HTMLElement>("[data-theme]");
    setTheme(getTheme(root ?? undefined) ?? "latte");
    return subscribeTheme(setTheme, root ?? undefined);
  }, []);
  const document = useFileDocument({
    path,
    initial,
    local,
    onSaveAs,
    onPathChange,
    onStatus,
    target,
    write,
    overwrite,
    readCurrent,
    syncConflict,
  });
  const saveRef = useRef(document.save);
  const dirtyRef = useRef(document.dirty);
  const savingRef = useRef(document.saving);
  const savableRef = useRef(savable);
  const closedRef = useRef(false);
  saveRef.current = document.save;
  dirtyRef.current = document.dirty;
  savingRef.current = document.saving;
  savableRef.current = savable && !document.conflict && !document.resolving;
  closedRef.current = target?.closed ?? false;
  const saveBinding = useMemo<InkcapSaveBinding>(
    () => ({
      availability: () => {
        const dirty = target?.dirty ?? dirtyRef.current;
        const saving = target?.saving ?? savingRef.current;
        if (closedRef.current || !savableRef.current || !dirty)
          return {
            status: "unavailable",
            reason: "No focused savable dirty document.",
          };
        if (saving)
          return {
            status: "unavailable",
            reason: "A save is already running.",
          };
        return { status: "available" };
      },
      save: () => saveRef.current(),
    }),
    [],
  );
  useEffect(() => {
    onSaveBinding(tabKey, saveBinding);
    return () => {
      onSaveBinding(tabKey, undefined);
    };
  }, [onSaveBinding, saveBinding, tabKey]);
  const file = useMemo(
    () => ({ name: document.currentPath, contents: document.contents }),
    [document.currentPath, document.contents],
  );
  const editorOptions = useMemo<
    NonNullable<Parameters<typeof DiffsFile>[0]["editorOptions"]>
  >(
    () => ({
      onAttach: (editor) => {
        if (local && active) editor.focus({ lineNumber: 1, character: 0 });
      },
      onChange: (next) => {
        document.edit(next.contents);
      },
    }),
    [document.edit, local, active],
  );

  const canPreviewMarkdown = isMarkdownPath(document.currentPath);
  return (
    <FileTabLayout
      themeRoot={themeRoot}
      tabKey={tabKey}
      savable={savable}
      narrow={narrow}
      local={local}
      sourceLabel={sourceLabel}
      savedConflict={syncConflict}
      activityNotice={activityNotice}
      onDismissActivityNotice={onDismissActivityNotice}
      previewUrl={previewUrl}
      previewKind={previewKind}
      onSaveAs={onSaveAs}
      onReopen={onReopen}
      document={document}
      file={file}
      editorOptions={editorOptions}
      theme={theme}
      saveAsOpen={saveAsOpen}
      setSaveAsOpen={setSaveAsOpen}
      canPreviewMarkdown={canPreviewMarkdown}
      markdownPreview={canPreviewMarkdown && markdownPreview}
      onToggleMarkdownPreview={() => {
        setMarkdownPreview((value) => !value);
      }}
    />
  );
}

function FileTabLayout({
  themeRoot,
  tabKey,
  savable,
  narrow,
  local,
  sourceLabel,
  savedConflict,
  activityNotice,
  onDismissActivityNotice,
  previewUrl,
  previewKind,
  onSaveAs,
  onReopen,
  document,
  file,
  editorOptions,
  theme,
  saveAsOpen,
  setSaveAsOpen,
  canPreviewMarkdown,
  markdownPreview,
  onToggleMarkdownPreview,
}: {
  themeRoot: React.RefObject<HTMLDivElement>;
  tabKey: number;
  savable: boolean;
  narrow: boolean;
  local: boolean;
  sourceLabel?: string;
  savedConflict: boolean;
  activityNotice?: boolean;
  onDismissActivityNotice?: () => void;
  previewUrl?: string;
  previewKind?: "image" | "video";
  onSaveAs?: (path: string, contents: string) => Promise<string>;
  onReopen?: () => void;
  document: ReturnType<typeof useFileDocument>;
  file: { name: string; contents: string };
  editorOptions: NonNullable<Parameters<typeof DiffsFile>[0]["editorOptions"]>;
  theme: string;
  saveAsOpen: boolean;
  setSaveAsOpen: (open: boolean) => void;
  canPreviewMarkdown: boolean;
  markdownPreview: boolean;
  onToggleMarkdownPreview: () => void;
}): React.JSX.Element {
  return (
    <TabsContent
      ref={themeRoot}
      className="inkcap-editor mt-0"
      value={String(tabKey)}
      forceMount
      aria-label={document.currentPath}
    >
      <FileToolbar
        narrow={narrow}
        savable={savable && !document.conflict && !document.resolving}
        path={document.currentPath}
        sourceLabel={sourceLabel}
        activityNotice={activityNotice}
        onDismissActivityNotice={onDismissActivityNotice}
        dirty={document.dirty}
        saving={document.saving}
        local={local}
        canSaveAs={Boolean(onSaveAs && !previewUrl)}
        canPreviewMarkdown={canPreviewMarkdown}
        markdownPreview={markdownPreview}
        onToggleMarkdownPreview={onToggleMarkdownPreview}
        onSave={() => {
          void document.save().catch((cause: unknown) => {
            console.error("Inkcap save failed", cause);
            return undefined;
          });
        }}
        onSaveAs={() => {
          setSaveAsOpen(true);
        }}
        onReopen={onReopen}
      />
      <FileConflict
        document={document}
        theme={theme}
        sourceLabel={sourceLabel}
        savedConflict={savedConflict}
      />
      {document.error ? (
        <Alert
          className="inkcap-notice"
          tone="error"
          title={
            document.conflict
              ? "Couldn't resolve the file conflict"
              : "Couldn't save"
          }
          description={document.error}
        />
      ) : null}
      <FileContent
        key={document.reloadVersion}
        previewUrl={previewUrl}
        previewKind={previewKind}
        path={document.currentPath}
        imageError={document.imageError}
        setImageError={document.setImageError}
        file={file}
        editorOptions={editorOptions}
        theme={theme}
        narrow={narrow}
        markdownPreview={markdownPreview}
      />
      <SaveAsDialog
        sourceLabel={sourceLabel}
        error={document.error}
        path={document.currentPath}
        open={saveAsOpen}
        busy={document.saving}
        onSubmit={document.saveAs}
        onOpenChange={setSaveAsOpen}
      />
    </TabsContent>
  );
}

function FileToolbar({
  narrow,
  savable,
  path,
  dirty,
  saving,
  local,
  sourceLabel,
  activityNotice,
  onDismissActivityNotice,
  canSaveAs,
  canPreviewMarkdown,
  markdownPreview,
  onToggleMarkdownPreview,
  onSave,
  onSaveAs,
  onReopen,
}: {
  narrow: boolean;
  savable: boolean;
  path: string;
  dirty: boolean;
  saving: boolean;
  local: boolean;
  sourceLabel?: string;
  activityNotice?: boolean;
  onDismissActivityNotice?: () => void;
  canSaveAs: boolean;
  canPreviewMarkdown: boolean;
  markdownPreview: boolean;
  onToggleMarkdownPreview: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onReopen?: () => void;
}): React.JSX.Element {
  // A finished save checks the Save button; a refused one shakes it.
  const [wasSaving, setWasSaving] = useState(saving);
  const [outcome, setOutcome] = useState<ButtonResult | undefined>(undefined);
  if (wasSaving !== saving) {
    setWasSaving(saving);
    setOutcome(saving ? undefined : dirty ? "failed" : "done");
  }
  return (
    <div className="inkcap-file-toolbar" aria-label="File actions">
      <span className="inkcap-path" title={path}>
        {path}
        {sourceLabel ? ` · ${sourceLabel}` : ""}
      </span>
      {canPreviewMarkdown ? (
        <IconButton
          variant="ghost"
          size="xs"
          icon={<Eye />}
          aria-label="Preview Markdown"
          title="Preview Markdown"
          active={markdownPreview}
          aria-pressed={markdownPreview}
          onClick={onToggleMarkdownPreview}
        />
      ) : null}
      <IconButton
        variant="ghost"
        size="xs"
        icon={local ? <Download /> : <Save />}
        aria-label={saveLabel(local, dirty, saving)}
        title={saveLabel(local, dirty, saving)}
        disabled={!savable || !dirty || saving}
        onClick={onSave}
        result={outcome}
      />
      {activityNotice ? (
        <>
          <small
            role="status"
            className={narrow ? "sr-only" : "whitespace-nowrap"}
          >
            {saveLabel(local, dirty, saving)} · Recent files didn't update
          </small>
          {narrow ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  icon={<Info />}
                  aria-label="Recent files didn't update"
                  variant="ghost"
                  size="xs"
                />
              </TooltipTrigger>
              <TooltipContent>
                {saveLabel(local, dirty, saving)} · Recent files didn't update
              </TooltipContent>
            </Tooltip>
          ) : null}
          <IconButton
            icon={<X />}
            aria-label="Dismiss Recent Files notice"
            title="Dismiss Recent Files notice"
            variant="ghost"
            size="xs"
            onClick={onDismissActivityNotice}
          />
        </>
      ) : null}
      {canSaveAs && (
        <IconButton
          icon={<SaveAll />}
          aria-label="Save file as"
          title="Save file as"
          variant="ghost"
          size="xs"
          disabled={!savable || saving}
          onClick={onSaveAs}
        />
      )}
      {onReopen && (
        <IconButton
          icon={<RefreshCw />}
          aria-label="Reload file"
          title="Reload saved file"
          variant="ghost"
          size="xs"
          disabled={!savable || dirty || saving}
          onClick={onReopen}
        />
      )}
    </div>
  );
}

function saveLabel(local: boolean, dirty: boolean, saving: boolean): string {
  if (saving) return local ? "Downloading…" : "Saving…";
  if (dirty) return local ? "Download" : "Save";
  return local ? "Download ready" : "Saved";
}

function FileContent({
  previewUrl,
  previewKind,
  path,
  imageError,
  setImageError,
  file,
  editorOptions,
  theme,
  narrow,
  markdownPreview,
}: {
  previewUrl?: string;
  previewKind?: "image" | "video";
  path: string;
  imageError: boolean;
  setImageError: (failed: boolean) => void;
  file: { name: string; contents: string };
  editorOptions: NonNullable<Parameters<typeof DiffsFile>[0]["editorOptions"]>;
  theme: string;
  narrow: boolean;
  markdownPreview: boolean;
}): React.JSX.Element {
  if (previewUrl)
    return previewKind === "video" ? (
      <VideoPreview path={path} url={previewUrl} />
    ) : (
      <ImagePreview
        path={path}
        url={previewUrl}
        failed={imageError}
        onFailed={setImageError}
      />
    );
  if (markdownPreview)
    return (
      <div className="flex-1 min-h-0 overflow-auto">
        <Markdown className="max-w-none p-lg">{file.contents}</Markdown>
      </div>
    );
  return (
    <div className="inkcap-code">
      <EditProvider createEditor={(options) => new Editor(options)}>
        <DiffsFile
          file={file}
          edit
          editorOptions={editorOptions}
          options={{
            disableFileHeader: true,
            overflow: narrow ? "wrap" : "scroll",
            themeType: theme === "mocha" ? "dark" : "light",
            theme: { dark: "catppuccin-mocha", light: "catppuccin-latte" },
          }}
        />
      </EditProvider>
    </div>
  );
}

function ImagePreview({
  path,
  url,
  failed,
  onFailed,
}: {
  path: string;
  url: string;
  failed: boolean;
  onFailed: (failed: boolean) => void;
}): React.JSX.Element {
  const svg = imageMediaType(path) === "image/svg+xml";
  return (
    <div className="inkcap-preview">
      {failed ? (
        <div role="alert">
          <strong>Preview unavailable</strong>
          <span>{path}</span>
        </div>
      ) : (
        <img
          src={url}
          alt={path}
          draggable={svg ? false : undefined}
          onContextMenu={(event) => {
            if (svg) event.preventDefault();
          }}
          onError={() => {
            if (svg) URL.revokeObjectURL(url);
            onFailed(true);
          }}
          onLoad={() => {
            // Keep decoded pixels, not a navigable same-origin SVG document.
            if (svg) URL.revokeObjectURL(url);
            onFailed(false);
          }}
        />
      )}
    </div>
  );
}

function VideoPreview({
  path,
  url,
}: {
  path: string;
  url: string;
}): React.JSX.Element {
  return (
    <div className="inkcap-preview">
      <video src={url} controls aria-label={path} />
    </div>
  );
}

function SaveAsDialog({
  sourceLabel,
  error,
  path,
  open,
  busy,
  onSubmit,
  onOpenChange,
}: {
  sourceLabel?: string;
  error: string;
  path: string;
  open: boolean;
  busy: boolean;
  onSubmit: (path: string) => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const form = useForm({
    defaultValues: { path },
    onSubmit: async ({ value }) => {
      if (await onSubmit(value.path)) onOpenChange(false);
    },
  });
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const formBusy = busy || submitting;
  useEffect(() => {
    if (open) form.setFieldValue("path", path);
  }, [open, path]);
  return (
    <Dialog
      open={open && !(sourceLabel && busy)}
      onOpenChange={(next) => {
        if (!busy) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save file as</DialogTitle>
          <DialogDescription>
            {sourceLabel
              ? `Choose a relative repository path in ${sourceLabel}.`
              : "Choose the Computer path for this document."}
          </DialogDescription>
        </DialogHeader>
        <div>
          <form.Field
            name="path"
            validators={{
              onChange: ({ value }) =>
                !value.trim()
                  ? "A file path is required."
                  : value.trim().endsWith("/")
                    ? "Save As needs a file path."
                    : undefined,
            }}
          >
            {(field) => (
              <Field
                label="File path"
                required
                error={field.state.meta.errors[0] ?? error}
              >
                <Input
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      if (!formBusy) void form.handleSubmit();
                    }
                  }}
                  autoFocus
                  disabled={formBusy}
                  required
                />
              </Field>
            )}
          </form.Field>
          <DialogFooter>
            <DialogClose disabled={formBusy}>Cancel</DialogClose>
            <Button
              type="button"
              disabled={formBusy}
              onClick={() => {
                void form.handleSubmit();
              }}
            >
              {formBusy ? "Saving…" : "Save As"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
