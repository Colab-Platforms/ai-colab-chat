"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import {
  AlertCircle,
  Download,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Play,
  PlayCircle,
  Search,
  Table2,
  Trash2,
} from "lucide-react";
import { documentService, imageService, videoService } from "@/lib/services";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { relativeDate } from "@/components/projects/project-look";

type AssetKind = "document" | "image" | "video";
type Filter = "all" | "documents" | "images" | "videos";

interface Asset {
  key: string;
  id: number;
  kind: AssetKind;
  title: string;
  /** "<chat> · <date>" for documents/images, "<model> · <date>" for videos. */
  caption: string;
  chip: string;
  createdAt: string;
  chatId: number | null;
  chatTitle: string;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  status: "READY" | "PENDING" | "FAILED";
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "documents", label: "Documents" },
  { id: "images", label: "Images" },
  { id: "videos", label: "Videos" },
];

const imageExtension = (url: string): string => {
  const match = url.split("?")[0].match(/\.([a-z0-9]{3,4})$/i);
  return (match?.[1] ?? "png").toUpperCase();
};

const docStatus = (s: string): Asset["status"] =>
  s === "COMPLETED" ? "READY" : s === "FAILED" ? "FAILED" : "PENDING";

function toAssets(docs: any[], images: any[], videos: any[]): Asset[] {
  const out: Asset[] = [];
  for (const d of docs) {
    out.push({
      key: `d${d.id}`,
      id: d.id,
      kind: "document",
      title: d.title || d.fileName || "Untitled document",
      caption: [d.chat?.title, relativeDate(d.createdAt)].filter(Boolean).join(" · "),
      chip: String(d.format || "PDF").toUpperCase(),
      createdAt: d.createdAt,
      chatId: d.chatId ?? null,
      chatTitle: d.chat?.title ?? "",
      fileUrl: d.fileUrl ?? null,
      thumbnailUrl: null,
      status: docStatus(d.status),
    });
  }
  for (const i of images) {
    out.push({
      key: `i${i.id}`,
      id: i.id,
      kind: "image",
      title: i.prompt || "Generated image",
      caption: [i.chat?.title, relativeDate(i.createdAt)].filter(Boolean).join(" · "),
      chip: imageExtension(i.fileUrl || ""),
      createdAt: i.createdAt,
      chatId: i.chatId ?? null,
      chatTitle: i.chat?.title ?? "",
      fileUrl: i.fileUrl ?? null,
      thumbnailUrl: i.fileUrl ?? null,
      status: "READY",
    });
  }
  for (const v of videos) {
    out.push({
      key: `v${v.id}`,
      id: v.id,
      kind: "video",
      title: v.prompt || "Generated video",
      caption: [v.model?.name, relativeDate(v.createdAt)].filter(Boolean).join(" · "),
      chip: "MP4",
      createdAt: v.createdAt,
      chatId: v.chatId ?? null,
      chatTitle: v.chat?.title ?? "",
      fileUrl: v.fileUrl ?? null,
      thumbnailUrl: v.thumbnailUrl ?? null,
      status: "READY",
    });
  }
  return out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function docIcon(chip: string) {
  if (chip === "XLSX" || chip === "CSV") return Table2;
  if (chip === "PPTX") return PlayCircle;
  return FileText;
}

/** Diagonal stripe backdrop (palette --stripe) for media placeholders. */
const STRIPES: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--cl-stripe) 0 10px, transparent 10px 20px)",
};

function AssetTile({
  asset,
  onOpen,
  onDelete,
  onDownload,
  onOpenChat,
}: {
  asset: Asset;
  onOpen: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onOpenChat: () => void;
}) {
  const isMedia = asset.kind !== "document";
  const Icon = asset.kind === "document" ? docIcon(asset.chip) : asset.kind === "image" ? ImageIcon : PlayCircle;

  const thumb = (
    <div
      className={`relative aspect-[1.6/1] overflow-hidden rounded-xl border border-border ${
        isMedia ? "bg-sunken" : "bg-surface"
      } transition-colors group-hover:border-line-strong`}
      style={isMedia && !asset.thumbnailUrl ? STRIPES : undefined}
    >
      {asset.kind === "image" && asset.thumbnailUrl ? (
        <img src={asset.thumbnailUrl} alt={asset.title} loading="lazy" className="h-full w-full object-cover" />
      ) : asset.kind === "video" && asset.thumbnailUrl ? (
        <>
          <img src={asset.thumbnailUrl} alt={asset.title} loading="lazy" className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="h-9 w-9 rounded-full bg-black/55 text-white flex items-center justify-center">
              <Play className="w-3.5 h-3.5 fill-current" />
            </span>
          </span>
        </>
      ) : asset.kind === "video" && asset.fileUrl ? (
        <>
          <video src={asset.fileUrl} preload="metadata" muted className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="h-9 w-9 rounded-full bg-black/55 text-white flex items-center justify-center">
              <Play className="w-3.5 h-3.5 fill-current" />
            </span>
          </span>
        </>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-faint">
          {asset.status === "PENDING" ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : asset.status === "FAILED" ? (
            <AlertCircle className="w-6 h-6 text-danger" />
          ) : (
            <Icon className="w-7 h-7" strokeWidth={1.5} />
          )}
        </span>
      )}

      <span className="absolute left-2.5 top-2.5 rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
        {asset.status === "FAILED" ? "FAILED" : asset.status === "PENDING" ? "WORKING" : asset.chip}
      </span>
    </div>
  );

  return (
    <div className="group relative">
      {asset.kind === "image" && asset.fileUrl ? (
        <PhotoView src={asset.fileUrl}>
          <button type="button" className="block w-full text-left cursor-pointer">
            {thumb}
          </button>
        </PhotoView>
      ) : (
        <button type="button" onClick={onOpen} className="block w-full text-left cursor-pointer">
          {thumb}
        </button>
      )}

      <div className="mt-2.5 flex items-start gap-1 px-0.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-foreground" title={asset.title}>
            {asset.title}
          </div>
          <div className="truncate text-xs text-faint" title={asset.caption}>
            {asset.caption}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Asset actions"
              className="h-7 w-7 -mt-0.5 shrink-0 rounded-md text-muted-foreground flex items-center justify-center hover:bg-sidebar-accent hover:text-foreground md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity cursor-pointer"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {asset.chatId && (
              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={onOpenChat}>
                <MessageSquare className="w-4 h-4" /> Open chat
              </DropdownMenuItem>
            )}
            {asset.fileUrl && asset.status === "READY" && (
              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={onDownload}>
                <Download className="w-4 h-4" /> Download
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={onDelete}>
              <Trash2 className="w-4 h-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [playing, setPlaying] = useState<Asset | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Each list is independent: a failure in one shouldn't blank the others.
    Promise.allSettled([
      documentService.list({ limit: "100" }),
      imageService.list({ limit: "100" }),
      videoService.list({ limit: "100", status: "COMPLETED" }),
    ]).then(([docs, images, videos]) => {
      if (cancelled) return;
      const items = (r: PromiseSettledResult<any>) => (r.status === "fulfilled" ? r.value.data?.data?.items || [] : []);
      if ([docs, images, videos].every((r) => r.status === "rejected")) toast.error("Failed to load your assets");
      setAssets(toAssets(items(docs), items(images), items(videos)));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (filter === "documents" && a.kind !== "document") return false;
      if (filter === "images" && a.kind !== "image") return false;
      if (filter === "videos" && a.kind !== "video") return false;
      if (!q) return true;
      return a.title.toLowerCase().includes(q) || a.chatTitle.toLowerCase().includes(q);
    });
  }, [assets, filter, search]);

  const openAsset = useCallback(
    (a: Asset) => {
      if (a.kind === "video" && a.fileUrl) {
        setPlaying(a);
      } else if (a.kind === "document" && a.status === "READY" && a.fileUrl) {
        window.open(a.fileUrl, "_blank", "noopener,noreferrer");
      } else if (a.chatId) {
        router.push(`/c/${a.chatId}`);
      }
    },
    [router],
  );

  const download = useCallback(async (a: Asset) => {
    if (!a.fileUrl) return;
    try {
      const res = await fetch(a.fileUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${a.title.slice(0, 60).replace(/[^\w.-]+/g, "_") || "asset"}.${a.chip.toLowerCase()}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // Cross-origin fetch can be blocked; fall back to opening the file.
      window.open(a.fileUrl, "_blank", "noopener,noreferrer");
    }
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "document") await documentService.delete(deleteTarget.id);
      else if (deleteTarget.kind === "image") await imageService.delete(deleteTarget.id);
      else await videoService.delete(deleteTarget.id);
      setAssets((prev) => prev.filter((a) => a.key !== deleteTarget.key));
      toast.success("Deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1100px] px-6 pt-10 pb-16">
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Assets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every document, image and video Colab AI has made for you.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-[360px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or chat"
              className="h-10 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-sm text-foreground placeholder:text-faint outline-none transition-colors focus:border-primary/50"
            />
          </div>

          <div className="inline-flex items-center rounded-lg border border-border bg-sunken p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`h-8 rounded-md border px-3 text-[13px] font-medium transition-colors cursor-pointer ${
                  filter === f.id
                    ? "border-border bg-surface text-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <div className="py-20 text-center">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-primary">
                <FileIcon className="w-5 h-5" />
              </span>
              <h2 className="text-sm font-semibold text-foreground">
                {search || filter !== "all" ? "No matching assets" : "Nothing here yet"}
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                {search || filter !== "all"
                  ? "Try a different search or filter."
                  : "Documents, images and videos you generate will show up here."}
              </p>
            </div>
          ) : (
            <PhotoProvider>
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-4">
                {visible.map((a) => (
                  <AssetTile
                    key={a.key}
                    asset={a}
                    onOpen={() => openAsset(a)}
                    onDelete={() => setDeleteTarget(a)}
                    onDownload={() => download(a)}
                    onOpenChat={() => a.chatId && router.push(`/c/${a.chatId}`)}
                  />
                ))}
              </div>
            </PhotoProvider>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.kind ?? "asset"}`}
        description="This permanently deletes the file. It can't be undone."
        onConfirm={confirmDelete}
        loading={deleting}
      />

      <Dialog open={!!playing} onOpenChange={(open) => !open && setPlaying(null)}>
        <DialogContent className="sm:max-w-3xl p-3 gap-2">
          <DialogHeader className="px-1 pt-1">
            <DialogTitle className="text-sm font-medium truncate pr-8">{playing?.title}</DialogTitle>
          </DialogHeader>
          {playing?.fileUrl && (
            <video src={playing.fileUrl} controls autoPlay className="w-full rounded-lg bg-black max-h-[70dvh]" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
