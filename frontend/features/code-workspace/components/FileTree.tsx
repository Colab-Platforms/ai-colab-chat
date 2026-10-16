"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronRight,
  FileCode2,
  FileJson,
  FileText,
  FilePlus2,
  Folder,
  FolderOpen,
  Loader2,
  Palette,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { codeWorkspace, useCodeWorkspace } from "../store/codeWorkspaceStore";
import { ancestorFolders, buildFileTree, type TreeNode } from "../lib/fileTree";

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "json") return <FileJson className="h-3.5 w-3.5 shrink-0 text-amber-500" />;
  if (ext === "css" || ext === "scss" || ext === "less") return <Palette className="h-3.5 w-3.5 shrink-0 text-sky-500" />;
  if (ext === "md" || ext === "txt") return <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  return <FileCode2 className="h-3.5 w-3.5 shrink-0 text-violet-500" />;
}

/** Inline text input used for "new file" and "rename". Enter commits, Esc cancels. */
function InlineInput({
  initial,
  depth,
  onCommit,
  onCancel,
}: {
  initial: string;
  depth: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    // Select the name but not the extension, like VS Code.
    const dot = initial.lastIndexOf(".");
    const slash = initial.lastIndexOf("/");
    ref.current?.setSelectionRange(slash + 1, dot > slash ? dot : initial.length);
  }, [initial]);
  return (
    <div style={{ paddingLeft: 8 + depth * 12 }} className="py-0.5 pr-2">
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(value);
          if (e.key === "Escape") onCancel();
        }}
        onBlur={() => onCancel()}
        className="h-6 w-full rounded border border-violet-400 bg-background px-1.5 font-mono text-xs outline-none"
        placeholder="src/components/NewFile.jsx"
      />
    </div>
  );
}

export function FileTree() {
  const files = useCodeWorkspace((s) => s.files);
  const activePath = useCodeWorkspace((s) => s.activePath);
  const isGenerating = useCodeWorkspace((s) => s.isGenerating);
  const title = useCodeWorkspace((s) => s.project?.title ?? "project");

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  const paths = useMemo(() => Object.keys(files), [files]);
  const tree = useMemo(() => buildFileTree(paths), [paths]);

  // Keep the file being written (or selected) visible: when the active file
  // changes, expand its folders (adjusted during render, not in an effect).
  const [revealedPath, setRevealedPath] = useState(activePath);
  if (activePath !== revealedPath) {
    setRevealedPath(activePath);
    const hidden = activePath ? ancestorFolders(activePath).filter((f) => collapsed.has(f)) : [];
    if (hidden.length > 0) {
      const next = new Set(collapsed);
      hidden.forEach((f) => next.delete(f));
      setCollapsed(next);
    }
  }

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const remove = (node: TreeNode) => {
    const what = node.kind === "folder" ? `the folder "${node.path}" and everything in it` : `"${node.path}"`;
    if (window.confirm(`Delete ${what}?`)) void codeWorkspace.deletePath(node.path);
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (renaming === node.path) {
      return (
        <InlineInput
          key={`rename-${node.path}`}
          initial={node.path}
          depth={depth}
          onCommit={(value) => {
            setRenaming(null);
            void codeWorkspace.renamePath(node.path, value);
          }}
          onCancel={() => setRenaming(null)}
        />
      );
    }

    const meta = node.kind === "file" ? files[node.path] : undefined;
    const isOpenFolder = node.kind === "folder" && !collapsed.has(node.path);
    const isActive = node.path === activePath;

    return (
      <motion.div
        key={node.path}
        layout="position"
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <div
          role="treeitem"
          aria-selected={isActive}
          aria-expanded={node.kind === "folder" ? isOpenFolder : undefined}
          onClick={() => (node.kind === "folder" ? toggle(node.path) : codeWorkspace.selectFile(node.path))}
          style={{ paddingLeft: 8 + depth * 12 }}
          className={cn(
            "group flex h-7 cursor-pointer select-none items-center gap-1.5 pr-1.5 text-[13px]",
            isActive
              ? "bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-100"
              : "text-foreground/85 hover:bg-muted",
          )}
        >
          {node.kind === "folder" ? (
            <>
              <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", isOpenFolder && "rotate-90")} />
              {isOpenFolder ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              )}
            </>
          ) : (
            <>
              <span className="w-3 shrink-0" />
              <FileIcon name={node.name} />
            </>
          )}
          <span className="min-w-0 flex-1 truncate">{node.name}</span>

          {meta?.status === "streaming" && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-violet-500" />}
          {meta?.truncated && meta.status === "done" && (
            <span title="The AI was cut off while writing this file">
              <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
            </span>
          )}
          {!isGenerating && (
            <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
              <button
                type="button"
                title="Rename"
                className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenaming(node.path);
                }}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="Delete"
                className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(node);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
        {node.kind === "folder" && isOpenFolder && (
          <AnimatePresence initial={false}>{node.children.map((c) => renderNode(c, depth + 1))}</AnimatePresence>
        )}
      </motion.div>
    );
  };

  return (
    <div className="flex h-full flex-col" role="tree" aria-label="Project files">
      <div className="flex h-9 shrink-0 items-center justify-between px-3">
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" title={title}>
          Files
        </span>
        <button
          type="button"
          title={isGenerating ? "Wait for the AI to finish" : "New file"}
          disabled={isGenerating}
          onClick={() => setCreating(true)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <FilePlus2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {creating && (
          <InlineInput
            initial=""
            depth={0}
            onCommit={(value) => {
              setCreating(false);
              void codeWorkspace.createFile(value);
            }}
            onCancel={() => setCreating(false)}
          />
        )}
        <AnimatePresence initial={false}>{tree.map((n) => renderNode(n, 0))}</AnimatePresence>
        {paths.length === 0 && !creating && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            {isGenerating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Planning the project…
              </>
            ) : (
              "No files yet"
            )}
          </div>
        )}
      </div>
    </div>
  );
}
