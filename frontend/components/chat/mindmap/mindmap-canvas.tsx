"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  ImageDown,
  ListPlus,
  Maximize2,
  Minus,
  Pencil,
  Plus,
  Redo2,
  StickyNote,
  Trash2,
  Undo2,
} from "lucide-react";
import { layoutMindmap, type LayoutNode, type MindmapLayout } from "./mindmap-layout";
import {
  MINDMAP_LIMITS,
  NEW_NODE_TEXT,
  addChild,
  addSibling,
  canMoveSibling,
  deleteNode,
  descendantIds,
  isError,
  locate,
  moveNode,
  moveSibling,
  renameNode,
  setNote,
  type EditResult,
} from "./mindmap-tree";
import type { MindmapEditor, SaveStatus } from "./use-mindmap-editor";
import type { MindmapSpec, MindmapThemeTokens } from "./mindmap-types";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const PNG_SCALE = 2;
const PNG_MAX_SIDE = 8192;
/** Pointer travel before a press on a node becomes a drag rather than a click. */
const DRAG_THRESHOLD_PX = 5;
const NOTICE_MS = 3500;

interface View {
  k: number;
  x: number;
  y: number;
}

const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
const lineWidth = (depth: number) => (depth <= 1 ? 3 : depth === 2 ? 2 : 1.5);

/** The view that centres `bounds` in a `w` x `h` container, never zooming past 140%. */
const fitView = (
  bounds: { x: number; y: number; width: number; height: number },
  w: number,
  h: number,
): View => {
  const k = clampZoom(Math.min(w / bounds.width, h / bounds.height, 1.4));
  return {
    k,
    x: w / 2 - (bounds.x + bounds.width / 2) * k,
    y: h / 2 - (bounds.y + bounds.height / 2) * k,
  };
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "mind-map";

const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const STATUS_LABEL: Record<SaveStatus, string> = {
  clean: "",
  dirty: "Unsaved changes…",
  saving: "Saving…",
  saved: "All changes saved",
  error: "Couldn't save",
};

/**
 * The mind map: pan, zoom, collapse, export, and (when an `editor` is passed)
 * editing.
 *
 * Drawn from the same pure layout the server uses for the downloadable SVG, so
 * what the user sees is what they download. Exports clone the live SVG minus
 * everything marked `data-ui` (controls, selection, drag ghost) or `data-hit`
 * (the invisible grab areas; unlike `data-ui` these DO receive pointer-down
 * as part of their node) instead of
 * re-implementing the drawing.
 *
 * Without an `editor` this is a read-only viewer. Mount with a `key` of the
 * document id: pan/zoom/collapse/selection are per map.
 */
export function MindmapCanvas({
  spec,
  tokens,
  editor,
  disabled = false,
}: {
  spec: MindmapSpec;
  tokens: MindmapThemeTokens;
  editor?: MindmapEditor;
  /** Pauses editing (e.g. while a theme change is re-rendering). */
  disabled?: boolean;
}) {
  const editable = Boolean(editor) && !disabled;

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [panning, setPanning] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
    targetId: string | null;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const didFit = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against Enter-then-blur committing the same rename twice.
  const activeRename = useRef<string | null>(null);
  const activeNote = useRef<string | null>(null);
  const pan = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null);
  const nodeGesture = useRef<{ id: string; px: number; py: number; moved: boolean } | null>(null);
  const dragRef = useRef<typeof drag>(null);

  const layout: MindmapLayout = useMemo(
    () => layoutMindmap(spec.root, collapsed),
    [spec.root, collapsed],
  );
  const nodesById = useMemo(
    () => new Map(layout.nodes.map((n) => [n.id, n])),
    [layout.nodes],
  );

  const colorFor = useCallback(
    (branch: number) =>
      branch < 0
        ? tokens.rootBg
        : tokens.branchColors[branch % tokens.branchColors.length],
    [tokens],
  );

  const boundsRef = useRef(layout.bounds);
  useEffect(() => {
    boundsRef.current = layout.bounds;
  }, [layout.bounds]);

  const fit = useCallback(() => {
    if (!size.w || !size.h) return;
    setView(fitView(layout.bounds, size.w, size.h));
  }, [layout.bounds, size.w, size.h]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
      // Fit once, the first time the container has a size. Later layout
      // changes (collapsing a branch, adding a node) keep the user's view.
      if (!didFit.current && width > 0 && height > 0) {
        didFit.current = true;
        setView(fitView(boundsRef.current, width, height));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setView((v) => {
      const k = clampZoom(v.k * factor);
      const ratio = k / v.k;
      return { k, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio };
    });
  }, []);

  // Non-passive on purpose: React's onWheel is passive, so it could not stop
  // the page behind the panel from scrolling while the map zooms.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(
        Math.exp(-event.deltaY * 0.0015),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  /* ------------------------------ editing ------------------------------ */

  /** Pans just enough to bring `id` fully into view, using the layout of `nextSpec`. */
  const reveal = useCallback(
    (id: string, nextSpec: MindmapSpec, nextCollapsed: ReadonlySet<string>) => {
      const next = layoutMindmap(nextSpec.root, nextCollapsed).nodes.find((n) => n.id === id);
      if (!next || !size.w || !size.h) return;
      const margin = 80;
      setView((v) => {
        const left = v.x + next.x * v.k;
        const right = left + next.w * v.k;
        const top = v.y + (next.y - next.h / 2) * v.k;
        const bottom = top + next.h * v.k;
        let { x, y } = v;
        if (left < margin) x += margin - left;
        else if (right > size.w - margin) x -= right - (size.w - margin);
        if (top < margin) y += margin - top;
        else if (bottom > size.h - margin) y -= bottom - (size.h - margin);
        return x === v.x && y === v.y ? v : { ...v, x, y };
      });
    },
    [size.w, size.h],
  );

  /** Commits an edit or explains why it was refused. Returns the result when it was applied. */
  const applyEdit = useCallback(
    (result: EditResult) => {
      if (!editor) return null;
      if (isError(result)) {
        showNotice(result.error);
        return null;
      }
      editor.commit(result.spec);
      return result;
    },
    [editor, showNotice],
  );

  const beginRename = useCallback((id: string, text: string) => {
    activeRename.current = id;
    setRenamingId(id);
    setRenameDraft(text);
  }, []);

  const startRename = useCallback(
    (id: string) => {
      const found = locate(spec, id);
      if (found) beginRename(id, found.node.text);
    },
    [spec, beginRename],
  );

  const finishRename = useCallback(
    (save: boolean) => {
      const id = activeRename.current;
      activeRename.current = null;
      setRenamingId(null);
      if (!save || !id) return;
      applyEdit(renameNode(spec, id, renameDraft));
      containerRef.current?.focus({ preventScroll: true });
    },
    [spec, renameDraft, applyEdit],
  );

  const startNote = useCallback(
    (id: string) => {
      const found = locate(spec, id);
      if (!found) return;
      activeNote.current = id;
      setNoteId(id);
      setNoteDraft(found.node.note ?? "");
    },
    [spec],
  );

  const finishNote = useCallback(
    (save: boolean) => {
      const id = activeNote.current;
      activeNote.current = null;
      setNoteId(null);
      if (!save || !id) return;
      applyEdit(setNote(spec, id, noteDraft));
      containerRef.current?.focus({ preventScroll: true });
    },
    [spec, noteDraft, applyEdit],
  );

  /** A new node opens straight into rename, like every outliner. */
  const addAndRename = useCallback(
    (result: EditResult, expandId?: string) => {
      const applied = applyEdit(result);
      if (!applied || !applied.id) return;
      let nextCollapsed = collapsed;
      if (expandId && collapsed.has(expandId)) {
        const next = new Set(collapsed);
        next.delete(expandId);
        nextCollapsed = next;
        setCollapsed(next);
      }
      setSelectedId(applied.id);
      beginRename(applied.id, NEW_NODE_TEXT);
      reveal(applied.id, applied.spec, nextCollapsed);
    },
    [applyEdit, collapsed, beginRename, reveal],
  );

  const addChildOf = useCallback(
    (id: string) => addAndRename(addChild(spec, id), id),
    [spec, addAndRename],
  );
  const addSiblingOf = useCallback(
    (id: string) => addAndRename(addSibling(spec, id), id),
    [spec, addAndRename],
  );

  const deleteSelected = useCallback(
    (id: string) => {
      const applied = applyEdit(deleteNode(spec, id));
      if (applied) setSelectedId(applied.id ?? null);
    },
    [spec, applyEdit],
  );

  const moveSelected = useCallback(
    (id: string, direction: -1 | 1) => {
      applyEdit(moveSibling(spec, id, direction));
    },
    [spec, applyEdit],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!editable || !editor) return;
    const tag = (event.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === "z") {
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
      return;
    }
    if (mod && key === "y") {
      event.preventDefault();
      editor.redo();
      return;
    }

    if (!selectedId || !nodesById.has(selectedId)) return;
    switch (event.key) {
      case "Tab":
        event.preventDefault();
        addChildOf(selectedId);
        break;
      case "Enter":
        event.preventDefault();
        addSiblingOf(selectedId);
        break;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        deleteSelected(selectedId);
        break;
      case "F2":
        event.preventDefault();
        startRename(selectedId);
        break;
      case "Escape":
        setSelectedId(null);
        break;
    }
  };

  /* ----------------------------- pointer input ----------------------------- */

  /** Client coordinates → layout coordinates. */
  const toLayout = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - view.x) / view.k,
      y: (clientY - rect.top - view.y) / view.k,
    };
  };

  const nodeAt = (lx: number, ly: number, exclude: ReadonlySet<string>): string | null => {
    const pad = 10;
    let best: { id: string; dist: number } | null = null;
    for (const n of layout.nodes) {
      if (exclude.has(n.id)) continue;
      if (
        lx >= n.x - pad &&
        lx <= n.x + n.w + pad &&
        ly >= n.y - n.h / 2 - pad &&
        ly <= n.y + n.h / 2 + pad
      ) {
        const dist = Math.hypot(lx - (n.x + n.w / 2), ly - n.y);
        if (!best || dist < best.dist) best = { id: n.id, dist };
      }
    }
    return best?.id ?? null;
  };

  const onPointerDown = (event: React.PointerEvent) => {
    const target = event.target as Element;
    if (target.closest("[data-ui]")) return;
    containerRef.current?.focus({ preventScroll: true });

    const nodeEl = editable ? target.closest("[data-node]") : null;
    if (nodeEl) {
      const id = nodeEl.getAttribute("data-node");
      if (id) {
        setSelectedId(id);
        nodeGesture.current = { id, px: event.clientX, py: event.clientY, moved: false };
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      }
      return;
    }

    pan.current = {
      px: event.clientX,
      py: event.clientY,
      vx: view.x,
      vy: view.y,
      moved: false,
    };
    setPanning(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const gesture = nodeGesture.current;
    if (gesture) {
      const dx = event.clientX - gesture.px;
      const dy = event.clientY - gesture.py;
      if (!gesture.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

      const node = nodesById.get(gesture.id);
      const found = locate(spec, gesture.id);
      // The central node can be selected and renamed, but not dragged.
      if (!node || !found || node.side === "root") return;

      gesture.moved = true;
      const point = toLayout(event.clientX, event.clientY);
      const blocked = descendantIds(found.node);
      blocked.add(gesture.id);
      const next = {
        id: gesture.id,
        x: point.x,
        y: point.y,
        targetId: nodeAt(point.x, point.y, blocked),
      };
      dragRef.current = next;
      setDrag(next);
      return;
    }

    const p = pan.current;
    if (!p) return;
    const dx = event.clientX - p.px;
    const dy = event.clientY - p.py;
    if (Math.hypot(dx, dy) > 3) p.moved = true;
    setView((v) => ({ ...v, x: p.vx + dx, y: p.vy + dy }));
  };

  const endPointer = () => {
    const gesture = nodeGesture.current;
    nodeGesture.current = null;
    const dropped = dragRef.current;
    dragRef.current = null;
    setDrag(null);

    if (gesture?.moved && dropped?.targetId) {
      const applied = applyEdit(moveNode(spec, gesture.id, dropped.targetId));
      if (applied && collapsed.has(dropped.targetId)) {
        // Show where it landed.
        const next = new Set(collapsed);
        next.delete(dropped.targetId);
        setCollapsed(next);
      }
      return;
    }

    const p = pan.current;
    pan.current = null;
    setPanning(false);
    // A click on empty canvas (not a pan) clears the selection.
    if (p && !p.moved && editable) setSelectedId(null);
  };

  const onDoubleClick = (event: React.MouseEvent) => {
    if (!editable) return;
    // Hit-test by position rather than reading `event.target`: the pointer is
    // captured by the container on pointerdown, so the browser reports the
    // click (and double-click) on the container, never on the node under it.
    const point = toLayout(event.clientX, event.clientY);
    const id = nodeAt(point.x, point.y, new Set());
    if (id) startRename(id);
  };

  /* -------------------------------- export -------------------------------- */

  /** A standalone copy of the live SVG: no pan/zoom transform, no controls. */
  const buildExportSvg = () => {
    const svg = svgRef.current;
    if (!svg) return null;
    const { x, y, width, height } = layout.bounds;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll("[data-ui], [data-hit]").forEach((node) => node.remove());
    clone.querySelector("[data-viewport]")?.removeAttribute("transform");
    clone.removeAttribute("class");
    clone.removeAttribute("style");
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
    clone.setAttribute("width", String(Math.ceil(width)));
    clone.setAttribute("height", String(Math.ceil(height)));
    clone.setAttribute("font-family", tokens.fontFamily);
    return {
      markup: new XMLSerializer().serializeToString(clone),
      width: Math.ceil(width),
      height: Math.ceil(height),
    };
  };

  const exportSvg = () => {
    const built = buildExportSvg();
    if (!built) return;
    saveBlob(
      new Blob([built.markup], { type: "image/svg+xml;charset=utf-8" }),
      `${slug(spec.title)}.svg`,
    );
  };

  const exportPng = async () => {
    const built = buildExportSvg();
    if (!built) return;
    const scale = Math.min(
      PNG_SCALE,
      PNG_MAX_SIDE / Math.max(built.width, built.height),
    );
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(built.markup)}`;
    try {
      await img.decode();
    } catch {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(built.width * scale);
    canvas.height = Math.round(built.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) saveBlob(blob, `${slug(spec.title)}.png`);
    }, "image/png");
  };

  /* -------------------------------- drawing -------------------------------- */

  const renderNode = (n: LayoutNode) => {
    const top = n.y - n.h / 2;
    const baseline = n.y + n.h / 2;
    const textX =
      n.anchor === "middle"
        ? n.x + n.w / 2
        : n.anchor === "end"
          ? n.x + n.w - n.padX
          : n.x + n.padX;
    const isRoot = n.depth === 0;
    const color = colorFor(n.branch);
    const fill = isRoot ? tokens.rootText : n.depth >= 3 ? tokens.muted : tokens.text;
    const toggleX = n.side === "left" ? n.x - 12 : n.x + n.w + 12;
    const canToggle = !isRoot && n.childCount > 0;
    const hiddenForRename = renamingId === n.id;

    return (
      <g key={n.id} className="group" data-node={n.id}>
        {n.note ? <title>{n.note}</title> : null}
        {/* A larger hit area: makes thin underlines easy to grab and keeps the collapse control reachable. */}
        <rect
          data-hit
          x={n.side === "left" ? n.x - 26 : n.x}
          y={top - 4}
          width={n.w + 26}
          height={n.h + 8}
          fill="transparent"
        />
        {isRoot && (
          <rect x={n.x} y={top} width={n.w} height={n.h} rx={14} fill={tokens.rootBg} />
        )}
        <text
          fontSize={n.fontSize}
          fontWeight={n.depth <= 1 ? tokens.headingWeight : 400}
          fill={fill}
          textAnchor={n.anchor}
          opacity={hiddenForRename ? 0 : 1}
          style={{ userSelect: "none" }}
        >
          {n.lines.map((line, i) => (
            <tspan
              key={i}
              x={textX}
              y={top + n.padY + i * n.lineHeight + n.fontSize * 0.98}
            >
              {line}
            </tspan>
          ))}
        </text>
        {!isRoot && (
          <line
            x1={n.x}
            y1={baseline}
            x2={n.x + n.w}
            y2={baseline}
            stroke={color}
            strokeWidth={lineWidth(n.depth)}
            strokeLinecap="round"
          />
        )}
        {canToggle && (
          <g
            data-ui
            className={
              n.collapsed
                ? "cursor-pointer"
                : "cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
            }
            onClick={() => toggle(n.id)}
          >
            <circle cx={toggleX} cy={baseline} r={9} fill={tokens.bg} stroke={color} strokeWidth={1.5} />
            <text
              x={toggleX}
              y={baseline + 3.5}
              fontSize={10}
              fontWeight={600}
              textAnchor="middle"
              fill={color}
              style={{ userSelect: "none" }}
            >
              {n.collapsed ? n.childCount : "−"}
            </text>
          </g>
        )}
      </g>
    );
  };

  const b = layout.bounds;
  const selected = editable && selectedId ? nodesById.get(selectedId) ?? null : null;
  const dropTarget = drag?.targetId ? nodesById.get(drag.targetId) ?? null : null;
  const draggedNode = drag ? nodesById.get(drag.id) ?? null : null;
  const renaming = renamingId ? nodesById.get(renamingId) ?? null : null;
  const noting = noteId ? nodesById.get(noteId) ?? null : null;

  /** Screen-space rectangle of a node, for positioning HTML overlays. */
  const screenRect = (n: LayoutNode) => ({
    left: view.x + n.x * view.k,
    top: view.y + (n.y - n.h / 2) * view.k,
    width: n.w * view.k,
    height: n.h * view.k,
  });

  const showToolbar = Boolean(selected) && !renaming && !noting && !drag;
  const toolbarRect = selected ? screenRect(selected) : null;
  const status = editor?.status ?? "clean";

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="relative h-full w-full select-none overflow-hidden outline-none"
      style={{
        background: tokens.bg,
        cursor: drag || panning ? "grabbing" : "grab",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    >
      <svg
        ref={svgRef}
        className="h-full w-full"
        style={{ fontFamily: tokens.fontFamily }}
      >
        <g
          data-viewport
          transform={`translate(${view.x} ${view.y}) scale(${view.k})`}
        >
          <rect x={b.x} y={b.y} width={b.width} height={b.height} fill={tokens.bg} />
          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={edge.d}
              fill="none"
              stroke={colorFor(edge.branch)}
              strokeWidth={lineWidth(edge.depth)}
              strokeLinecap="round"
            />
          ))}
          {layout.nodes.map(renderNode)}

          {selected && (
            <rect
              data-ui
              pointerEvents="none"
              x={selected.x - 5}
              y={selected.y - selected.h / 2 - 3}
              width={selected.w + 10}
              height={selected.h + 6}
              rx={7}
              fill="none"
              stroke={colorFor(selected.branch)}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          )}

          {dropTarget && (
            <rect
              data-ui
              pointerEvents="none"
              x={dropTarget.x - 6}
              y={dropTarget.y - dropTarget.h / 2 - 4}
              width={dropTarget.w + 12}
              height={dropTarget.h + 8}
              rx={8}
              fill={colorFor(dropTarget.branch)}
              fillOpacity={0.14}
              stroke={colorFor(dropTarget.branch)}
              strokeWidth={2}
            />
          )}

          {drag && draggedNode && (
            <g data-ui pointerEvents="none" opacity={0.75}>
              <text
                x={drag.x}
                y={drag.y}
                fontSize={draggedNode.fontSize}
                fontWeight={draggedNode.depth <= 1 ? tokens.headingWeight : 400}
                fill={tokens.text}
                textAnchor="middle"
              >
                {draggedNode.text.length > 40
                  ? `${draggedNode.text.slice(0, 40)}…`
                  : draggedNode.text}
              </text>
              <line
                x1={drag.x - draggedNode.w / 2}
                x2={drag.x + draggedNode.w / 2}
                y1={drag.y + 5}
                y2={drag.y + 5}
                stroke={colorFor(draggedNode.branch)}
                strokeWidth={2}
              />
            </g>
          )}
        </g>
      </svg>

      {/* Save status and refusals */}
      {editor && STATUS_LABEL[status] && (
        <div
          data-ui
          className="absolute left-3 top-3 flex items-center gap-2 rounded-md border border-black/10 bg-white/90 px-2.5 py-1 text-xs text-neutral-700 shadow-sm backdrop-blur"
          style={{ cursor: "default" }}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status === "error"
                ? "bg-red-500"
                : status === "saved"
                  ? "bg-emerald-500"
                  : "bg-amber-500"
            }`}
          />
          {STATUS_LABEL[status]}
          {status === "error" && (
            <button
              type="button"
              className="cursor-pointer font-medium text-neutral-900 underline"
              onClick={() => void editor.flush()}
            >
              Retry
            </button>
          )}
        </div>
      )}
      {notice && (
        <div
          data-ui
          className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white shadow"
        >
          {notice}
        </div>
      )}

      {/* Floating node toolbar */}
      {showToolbar && selected && toolbarRect && (
        <div
          data-ui
          className="absolute z-10 flex items-center gap-0.5 rounded-lg border border-black/10 bg-white p-1 text-neutral-700 shadow-md"
          style={{
            left: Math.min(
              Math.max(toolbarRect.left + toolbarRect.width / 2, 130),
              Math.max(size.w - 130, 130),
            ),
            top:
              toolbarRect.top > 56
                ? toolbarRect.top - 46
                : toolbarRect.top + toolbarRect.height + 10,
            transform: "translateX(-50%)",
            cursor: "default",
          }}
        >
          <ToolbarButton title="Add child (Tab)" onClick={() => addChildOf(selected.id)}>
            <Plus className="h-3.5 w-3.5" />
          </ToolbarButton>
          {selected.depth > 0 && (
            <ToolbarButton title="Add sibling (Enter)" onClick={() => addSiblingOf(selected.id)}>
              <ListPlus className="h-3.5 w-3.5" />
            </ToolbarButton>
          )}
          <ToolbarButton
            title="Rename (F2 or double-click)"
            onClick={() => startRename(selected.id)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            title={selected.note ? "Edit note" : "Add note"}
            onClick={() => startNote(selected.id)}
          >
            <StickyNote className={`h-3.5 w-3.5 ${selected.note ? "text-amber-600" : ""}`} />
          </ToolbarButton>
          {selected.depth > 0 && (
            <>
              <span className="mx-0.5 h-4 w-px bg-black/10" />
              <ToolbarButton
                title="Move up"
                disabled={!canMoveSibling(spec, selected.id, -1)}
                onClick={() => moveSelected(selected.id, -1)}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </ToolbarButton>
              <ToolbarButton
                title="Move down"
                disabled={!canMoveSibling(spec, selected.id, 1)}
                onClick={() => moveSelected(selected.id, 1)}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </ToolbarButton>
              <ToolbarButton title="Delete (Del)" onClick={() => deleteSelected(selected.id)}>
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </ToolbarButton>
            </>
          )}
        </div>
      )}

      {/* Inline rename */}
      {renaming && (
        <input
          data-ui
          autoFocus
          value={renameDraft}
          maxLength={MINDMAP_LIMITS.text}
          onChange={(e) => setRenameDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => finishRename(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              finishRename(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              finishRename(false);
            }
            e.stopPropagation();
          }}
          className="absolute z-20 rounded border-2 px-1.5 outline-none"
          style={{
            ...(() => {
              const r = screenRect(renaming);
              const width = Math.max(r.width, 150);
              return {
                left: renaming.side === "left" ? r.left + r.width - width : r.left,
                top: r.top,
                width,
                height: Math.max(r.height, 24),
              };
            })(),
            fontSize: Math.max(renaming.fontSize * view.k, 12),
            fontFamily: tokens.fontFamily,
            fontWeight: renaming.depth <= 1 ? tokens.headingWeight : 400,
            textAlign:
              renaming.anchor === "end"
                ? "right"
                : renaming.anchor === "middle"
                  ? "center"
                  : "left",
            background: tokens.bg,
            color: tokens.text,
            borderColor: colorFor(renaming.branch),
            cursor: "text",
          }}
        />
      )}

      {/* Note editor */}
      {noting && (
        <div
          data-ui
          className="absolute z-20 w-[270px] rounded-lg border border-black/10 bg-white p-2 shadow-lg"
          style={{
            left: Math.min(Math.max(screenRect(noting).left, 8), Math.max(size.w - 278, 8)),
            top: screenRect(noting).top + screenRect(noting).height + 10,
            cursor: "default",
          }}
        >
          <textarea
            autoFocus
            value={noteDraft}
            maxLength={MINDMAP_LIMITS.note}
            rows={4}
            placeholder="A longer explanation, shown when hovering this node"
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                finishNote(false);
              } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                finishNote(true);
              }
              e.stopPropagation();
            }}
            className="w-full resize-none rounded border border-black/10 bg-white p-1.5 text-xs text-neutral-900 outline-none focus:border-neutral-400"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              type="button"
              className="h-7 cursor-pointer rounded-md px-2.5 text-xs text-neutral-600 hover:bg-black/5"
              onClick={() => finishNote(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-7 cursor-pointer rounded-md bg-neutral-900 px-2.5 text-xs font-medium text-white hover:bg-neutral-700"
              onClick={() => finishNote(true)}
            >
              Save note
            </button>
          </div>
        </div>
      )}

      {/* Bottom toolbar */}
      <div
        data-ui
        className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-lg border border-black/10 bg-white/90 p-1 text-neutral-700 shadow-sm backdrop-blur"
        style={{ cursor: "default" }}
      >
        {editor && (
          <>
            <ToolbarButton
              title="Undo (Ctrl+Z)"
              disabled={!editable || !editor.canUndo}
              onClick={() => editor.undo()}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Redo (Ctrl+Shift+Z)"
              disabled={!editable || !editor.canRedo}
              onClick={() => editor.redo()}
            >
              <Redo2 className="h-3.5 w-3.5" />
            </ToolbarButton>
            <span className="mx-1 h-4 w-px bg-black/10" />
          </>
        )}
        <ToolbarButton
          title="Zoom out"
          onClick={() => zoomAt(1 / 1.25, size.w / 2, size.h / 2)}
        >
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="w-11 text-center text-xs tabular-nums">
          {Math.round(view.k * 100)}%
        </span>
        <ToolbarButton
          title="Zoom in"
          onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)}
        >
          <Plus className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Fit to screen" onClick={fit}>
          <Maximize2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-black/10" />
        <ToolbarButton title="Export as SVG" onClick={exportSvg}>
          <Download className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Export as PNG" onClick={() => void exportPng()}>
          <ImageDown className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
