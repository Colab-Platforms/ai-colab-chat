"use client";

import { Folder } from "lucide-react";

export function ProjectBanner({ name }: { name: string }) {
  return (
    <div className="w-full flex items-center gap-2.5 px-4 sm:px-10 py-2.5 bg-violet-100/40 dark:bg-violet-500/10 backdrop-blur-md">
      <div className="h-6 w-6 shrink-0 rounded-md bg-violet-500/15 text-violet-600 dark:text-violet-300 flex items-center justify-center">
        <Folder className="w-3.5 h-3.5" />
      </div>
      <span className="text-sm font-semibold truncate">{name}</span>
    </div>
  );
}
