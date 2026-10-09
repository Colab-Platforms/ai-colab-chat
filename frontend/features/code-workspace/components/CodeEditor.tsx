"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { Loader2 } from "lucide-react";
import { useTheme } from "@/context/theme-context";
import { codeWorkspace, useCodeWorkspace } from "../store/codeWorkspaceStore";

type MonacoEditor = Parameters<OnMount>[0];

/**
 * Monaco bound to the workspace store.
 *
 * Streaming: deltas never go through React. The store notifies us per delta;
 * we schedule one animation-frame sync that appends whatever the store has
 * beyond the model's current length. That sync is idempotent, so a file
 * switch or a missed frame can never duplicate or drop text.
 */
export function CodeEditor() {
  const activePath = useCodeWorkspace((s) => s.activePath);
  const language = useCodeWorkspace((s) => (s.activePath ? s.files[s.activePath]?.language : undefined));
  const isGenerating = useCodeWorkspace((s) => s.isGenerating);
  const contentRevision = useCodeWorkspace((s) => s.contentRevision);
  const { theme } = useTheme();

  const editorRef = useRef<MonacoEditor | null>(null);
  const activePathRef = useRef(activePath);
  const applyingRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  activePathRef.current = activePath;

  /** Make the model match the store: append the missing tail, or replace on divergence. */
  const syncFromStore = useCallback((follow: boolean) => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const path = activePathRef.current;
    if (!editor || !model || !path) return;
    const want = codeWorkspace.getContent(path);
    const haveLength = model.getValueLength();
    applyingRef.current = true;
    try {
      if (want.length > haveLength && follow) {
        const line = model.getLineCount();
        const col = model.getLineMaxColumn(line);
        model.applyEdits([
          { range: { startLineNumber: line, startColumn: col, endLineNumber: line, endColumn: col }, text: want.slice(haveLength) },
        ]);
        editor.revealLine(model.getLineCount());
      } else if (model.getValue() !== want) {
        model.setValue(want);
      }
    } finally {
      applyingRef.current = false;
    }
  }, []);

  // File switch, load, restore, rename → full sync.
  useEffect(() => {
    if (!ready) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    syncFromStore(false);
  }, [ready, activePath, contentRevision, syncFromStore]);

  // Live stream → at most one append per frame.
  useEffect(
    () =>
      codeWorkspace.subscribeDeltas((path) => {
        if (path !== activePathRef.current || frameRef.current !== null) return;
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          syncFromStore(true);
        });
      }),
    [syncFromStore],
  );

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const beforeMount: BeforeMount = (monaco) => {
    // A browser editor has no node_modules: keep syntax errors, drop the
    // "Cannot find module 'react'" style semantic noise.
    const ts = monaco.languages.typescript;
    const compilerOptions = {
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
      allowNonTsExtensions: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
    };
    for (const defaults of [ts.javascriptDefaults, ts.typescriptDefaults]) {
      defaults.setCompilerOptions(compilerOptions);
      defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
    }
  };

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    setReady(true);
  };

  if (!activePath) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {isGenerating ? "Waiting for the first file…" : "Select a file"}
      </div>
    );
  }

  return (
    <Editor
      path={activePath}
      defaultLanguage={language}
      language={language}
      defaultValue={codeWorkspace.getContent(activePath)}
      theme={theme === "dark" ? "vs-dark" : "light"}
      beforeMount={beforeMount}
      onMount={onMount}
      onChange={(value) => {
        if (applyingRef.current || value === undefined || !activePathRef.current) return;
        codeWorkspace.updateFromEditor(activePathRef.current, value);
      }}
      loading={
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading editor…
        </div>
      }
      options={{
        readOnly: isGenerating,
        readOnlyMessage: { value: "The AI is writing this project — you can edit once it finishes." },
        minimap: { enabled: false },
        fontSize: 13,
        lineHeight: 20,
        fontFamily: "var(--font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace",
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: "off",
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: isGenerating ? "none" : "line",
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      }}
    />
  );
}
