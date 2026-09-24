"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderArchive, Search, LayoutGrid, List, ChevronDown, Check, Film, Image as ImageIcon } from "lucide-react";
import { documentService, videoService, imageService } from "@/lib/services";
import { toast }  from "@/lib/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocumentCard, type GeneratedDocument } from "@/components/chat/document-card";
import { VideoCard, type GeneratedVideo } from "@/components/chat/video-card";
import { ImageCard, type GeneratedImage } from "@/components/chat/image-card";

type AssetType = "documents" | "videos" | "images";
type ViewMode = "grid" | "list";
type SortKey = "newest" | "oldest" | "title";
type FormatFilter = "ALL" | "PDF" | "DOCX" | "PPTX" | "XLSX" | "CSV";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "title", label: "Title A-Z" },
];

const FORMAT_OPTIONS: { key: FormatFilter; label: string }[] = [
  { key: "ALL", label: "All formats" },
  { key: "PDF", label: "PDF" },
  { key: "DOCX", label: "Word" },
  { key: "PPTX", label: "PowerPoint" },
  { key: "XLSX", label: "Excel" },
  { key: "CSV", label: "CSV" },
];

interface DocumentRow extends GeneratedDocument {
  createdAt: string;
}

interface VideoRow extends GeneratedVideo {
  createdAt: string;
}

interface ImageRow extends GeneratedImage {
  createdAt: string;
}

const ASSET_TYPES: { key: AssetType; label: string }[] = [
  { key: "documents", label: "Documents" },
  { key: "videos", label: "Videos" },
  { key: "images", label: "Images" },
];

export default function AssetsVaultPage() {
  const [assetType, setAssetType] = useState<AssetType>("documents");
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [images, setImages] = useState<ImageRow[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [format, setFormat] = useState<FormatFilter>("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const stored = localStorage.getItem("assetsViewMode");
    if (stored === "grid" || stored === "list") setViewMode(stored);
  }, []);

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("assetsViewMode", mode);
  };

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "100" };
      if (format !== "ALL") params.format = format;
      const res = await documentService.list(params);
      setDocuments(res.data.data?.items || []);
    } catch {
      toast.error("Failed to load your assets");
    } finally {
      setLoading(false);
    }
  }, [format]);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await videoService.list({ limit: "100", status: "COMPLETED" });
      setVideos(res.data.data?.items || []);
    } catch {
      toast.error("Failed to load your videos");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await imageService.list({ limit: "100" });
      setImages(res.data.data?.items || []);
    } catch {
      toast.error("Failed to load your images");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (assetType === "documents") fetchDocuments();
    else if (assetType === "videos") fetchVideos();
    else fetchImages();
  }, [assetType, fetchDocuments, fetchVideos, fetchImages]);

  const handleVideoDeleted = useCallback((id: number) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const handleImageDeleted = useCallback((id: number) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const visibleDocuments = useMemo(() => {
    let items = documents;
    if (debouncedSearch) {
      items = items.filter((doc) =>
        (doc.title || doc.fileName || "").toLowerCase().includes(debouncedSearch),
      );
    }
    const sorted = [...items];
    if (sort === "newest") {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sort === "oldest") {
      sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else {
      sorted.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }
    return sorted;
  }, [documents, debouncedSearch, sort]);

  const visibleVideos = useMemo(() => {
    let items = videos;
    if (debouncedSearch) {
      items = items.filter((video) => (video.prompt || "").toLowerCase().includes(debouncedSearch));
    }
    const sorted = [...items];
    if (sort === "newest") {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sort === "oldest") {
      sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else {
      sorted.sort((a, b) => (a.prompt || "").localeCompare(b.prompt || ""));
    }
    return sorted;
  }, [videos, debouncedSearch, sort]);

  const visibleImages = useMemo(() => {
    let items = images;
    if (debouncedSearch) {
      items = items.filter((image) => (image.prompt || "").toLowerCase().includes(debouncedSearch));
    }
    const sorted = [...items];
    if (sort === "newest") {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sort === "oldest") {
      sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else {
      sorted.sort((a, b) => (a.prompt || "").localeCompare(b.prompt || ""));
    }
    return sorted;
  }, [images, debouncedSearch, sort]);

  const sortLabel = useMemo(
    () => SORT_OPTIONS.find((o) => o.key === sort)?.label ?? "Sort",
    [sort],
  );
  const formatLabel = useMemo(
    () => FORMAT_OPTIONS.find((o) => o.key === format)?.label ?? "All formats",
    [format],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-4 px-6 py-5 border-b border-border/50">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Assets Vault</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every document, video, and image ColabAI has generated for you, from any chat, in one place.
          </p>
        </div>

        {/* Asset type tabs */}
        <div className="flex items-center gap-1 bg-muted/60 border border-border/40 rounded-full p-0.5 w-fit">
          {ASSET_TYPES.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setAssetType(opt.key)}
              className={`h-8 px-3.5 flex items-center gap-1.5 rounded-full text-xs font-medium transition-colors ${
                assetType === opt.key
                  ? "bg-white dark:bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.key === "videos" && <Film className="w-3.5 h-3.5" />}
              {opt.key === "images" && <ImageIcon className="w-3.5 h-3.5" />}
              {opt.label}
            </button>
          ))}
        </div>

        {/* Toolbar: search / format / sort / view toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your assets..."
              className="w-full h-9 pl-9 pr-3 rounded-full border border-border/60 bg-muted/40 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:bg-background transition-colors"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {assetType === "documents" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border/60 bg-background text-xs font-medium text-foreground hover:bg-muted/60 transition-colors">
                    {formatLabel}
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {FORMAT_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.key}
                      onClick={() => setFormat(opt.key)}
                      className="gap-2 cursor-pointer"
                    >
                      <div className="w-3.5 flex justify-center">
                        {format === opt.key && <Check className="w-3.5 h-3.5 text-primary" />}
                      </div>
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border/60 bg-background text-xs font-medium text-foreground hover:bg-muted/60 transition-colors">
                  {sortLabel}
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {SORT_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.key}
                    onClick={() => setSort(opt.key)}
                    className="gap-2 cursor-pointer"
                  >
                    <div className="w-3.5 flex justify-center">
                      {sort === opt.key && <Check className="w-3.5 h-3.5 text-primary" />}
                    </div>
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-0.5 bg-muted/60 border border-border/40 rounded-full p-0.5">
              <button
                onClick={() => changeViewMode("grid")}
                title="Grid view"
                className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors ${
                  viewMode === "grid"
                    ? "bg-white dark:bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => changeViewMode("list")}
                title="List view"
                className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors ${
                  viewMode === "list"
                    ? "bg-white dark:bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : assetType === "documents" ? (
          visibleDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <FolderArchive className="w-6 h-6" />
              </div>
              <h2 className="text-sm font-semibold">
                {debouncedSearch || format !== "ALL" ? "No matching assets" : "No documents yet"}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {debouncedSearch || format !== "ALL"
                  ? "Try a different search term or format filter."
                  : "Ask ColabAI to generate a PDF, Word doc, spreadsheet, or slide deck in any chat and it'll show up here."}
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="max-w-5xl mx-auto py-6 px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleDocuments.map((doc) => (
                <DocumentCard key={doc.id} document={doc} className="mt-0 max-w-none" />
              ))}
            </div>
          ) : (
            <div className="max-w-2xl mx-auto py-4 px-4 flex flex-col gap-1.5">
              {visibleDocuments.map((doc) => (
                <DocumentCard key={doc.id} document={doc} className="mt-0 max-w-none" />
              ))}
            </div>
          )
        ) : assetType === "videos" ? (
          visibleVideos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <Film className="w-6 h-6" />
              </div>
              <h2 className="text-sm font-semibold">
                {debouncedSearch ? "No matching videos" : "No videos yet"}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {debouncedSearch
                  ? "Try a different search term."
                  : "Use \"Generate Video\" in any chat and it'll show up here."}
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="max-w-5xl mx-auto py-6 px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleVideos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  className="mt-0 max-w-none"
                  onDeleted={handleVideoDeleted}
                />
              ))}
            </div>
          ) : (
            <div className="max-w-2xl mx-auto py-4 px-4 flex flex-col gap-1.5">
              {visibleVideos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  className="mt-0 max-w-none"
                  onDeleted={handleVideoDeleted}
                />
              ))}
            </div>
          )
        ) : visibleImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <ImageIcon className="w-6 h-6" />
            </div>
            <h2 className="text-sm font-semibold">
              {debouncedSearch ? "No matching images" : "No images yet"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {debouncedSearch
                ? "Try a different search term."
                : "Ask ColabAI to generate an image in any chat and it'll show up here."}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="max-w-5xl mx-auto py-6 px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleImages.map((image) => (
              <ImageCard
                key={image.id}
                image={image}
                className="mt-0 max-w-none"
                onDeleted={handleImageDeleted}
              />
            ))}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto py-4 px-4 flex flex-col gap-1.5">
            {visibleImages.map((image) => (
              <ImageCard
                key={image.id}
                image={image}
                className="mt-0 max-w-none"
                onDeleted={handleImageDeleted}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
