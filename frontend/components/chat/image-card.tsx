"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { Download, Eye, Loader2, MessageSquareText, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { imageService } from "@/lib/services";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export interface GeneratedImage {
  id: number;
  prompt: string;
  fileUrl: string;
  fileSize?: number | null;
  chatId?: number | null;
  createdAt: string;
}

const formatBytes = (bytes?: number | null): string => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export function ImageCard({
  image,
  className,
  onDeleted,
}: {
  image: GeneratedImage;
  className?: string;
  onDeleted?: (id: number) => void;
}) {
  const router = useRouter();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  /**
   * A plain `<a download>` on a Cloudinary URL is silently ignored by the
   * browser — the `download` attribute only applies to same-origin links —
   * so fetching the bytes ourselves and downloading from a same-origin
   * blob: URL is what actually makes "Download" download (same trick as
   * VideoCard.handleDownload).
   */
  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(image.fileUrl);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = blobUrl;
      link.download = `image-${image.id}.webp`;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("Couldn't download the image — try again.");
    } finally {
      setIsDownloading(false);
    }
  }, [image.fileUrl, image.id]);

  const handleChatDetails = useCallback(() => {
    if (!image.chatId) return;
    router.push(`/c/${image.chatId}`);
  }, [image.chatId, router]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await imageService.delete(image.id);
      setConfirmOpen(false);
      onDeleted?.(image.id);
    } catch {
      toast.error("Couldn't delete the image — try again.");
      setIsDeleting(false);
    }
  }, [image.id, onDeleted]);

  return (
    <div
      className={cn(
        "group mt-2 w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <PhotoProvider maskOpacity={0.95}>
        <PhotoView src={image.fileUrl}>
          <div className="relative cursor-pointer">
            <img
              src={image.fileUrl}
              alt={image.prompt || "Generated image"}
              loading="lazy"
              className="aspect-square w-full rounded-t-2xl bg-muted object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
              <Eye className="h-6 w-6 text-white drop-shadow" />
            </div>
          </div>
        </PhotoView>
      </PhotoProvider>

      <div className="flex items-start gap-3 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{image.prompt}</p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(image.createdAt)}
            {image.fileSize ? ` · ${formatBytes(image.fileSize)}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="h-8 text-xs"
            disabled={isDownloading}
            onClick={handleDownload}
          >
            {isDownloading ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3 w-3" />
            )}
            Download
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                title="More options"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleChatDetails}
                disabled={!image.chatId}
                className="gap-2 cursor-pointer"
              >
                <MessageSquareText className="w-3.5 h-3.5" /> Chat details
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setConfirmOpen(true)}
                className="gap-2 text-destructive focus:text-destructive cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this image?"
        description="This permanently deletes the image and removes it from storage. This action cannot be undone."
        onConfirm={handleDelete}
        loading={isDeleting}
      />
    </div>
  );
}
