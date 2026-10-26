"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Code2, Loader2 } from "lucide-react";
import { codeWorkspaceApi, type CodeProjectSummaryDto } from "@/features/code-workspace";
import { StudioTabs } from "@/components/studio/studio-parts";
import { websiteTemplateService } from "@/lib/services";
import type { WebsiteTemplate } from "./website-template";
import { WebsiteTemplateModal } from "./website-template-modal";

interface WebsiteTemplateGalleryProps {
  /** Called when the user confirms a template in the preview modal. */
  onUse: (template: WebsiteTemplate) => void;
}

const FRAMEWORK_LABEL: Record<string, string> = {
  react: "React",
  vue: "Vue",
  vanilla: "JavaScript",
  static: "HTML/CSS/JS",
  node: "Node.js",
  python: "Python",
  other: "Project",
};

type Tab = "templates" | "mine";

/**
 * Admin-curated website designs under the composer, plus a "Your projects"
 * tab so the user can get back to builds they already started. A template
 * card opens the full preview; the modal is what actually attaches it.
 */
export function WebsiteTemplateGallery({ onUse }: WebsiteTemplateGalleryProps) {
  const [tab, setTab] = useState<Tab>("templates");

  const [templates, setTemplates] = useState<WebsiteTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [active, setActive] = useState<WebsiteTemplate | null>(null);

  const [projects, setProjects] = useState<CodeProjectSummaryDto[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    websiteTemplateService
      .list()
      .then((res) => {
        if (!cancelled) setTemplates(res.data?.data || []);
      })
      .catch(() => {
        // A gallery is a nice-to-have on this screen — stay silent and render
        // nothing rather than pushing an error toast over the composer.
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Projects are only fetched once the user actually opens that tab.
  useEffect(() => {
    if (tab !== "mine" || projectsLoaded) return;
    let cancelled = false;
    codeWorkspaceApi
      .listProjects()
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch(() => {
        // Leave the list empty on failure rather than blocking the tab.
      })
      .finally(() => {
        if (!cancelled) {
          setProjectsLoading(false);
          setProjectsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab, projectsLoaded]);

  // Nothing curated and no projects built yet: no gallery at all.
  if (!templatesLoading && templates.length === 0 && !projectsLoading && projects.length === 0 && projectsLoaded) {
    return null;
  }
  if (templatesLoading) {
    return (
      <div className="mx-4 mt-6">
        <div className="mb-3 h-8 w-48 animate-pulse rounded-lg bg-sunken" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-6">
      <div className="mb-3">
        <StudioTabs
          tabs={[
            { id: "templates" as Tab, label: "Templates" },
            { id: "mine" as Tab, label: "Your projects", count: projectsLoaded ? projects.length : undefined },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === "templates" ? (
        templates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No templates yet — describe your site above.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setActive(template)}
                className="group cursor-pointer text-left"
              >
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border/60 bg-sunken transition-transform group-hover:-translate-y-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={template.thumbnailUrl}
                    alt={template.name}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-2 bottom-2 rounded-lg bg-white px-3 py-2 shadow-sm">
                    <div className="truncate text-[12.5px] font-semibold text-[#18161D]">{template.name}</div>
                    {template.techStack.length > 0 && (
                      <div className="truncate text-[11px] text-[#8A8694]">{template.techStack.join(" · ")}</div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      ) : projectsLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No projects yet — pick a template or describe your site above.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/c/${project.chatId}?project=${project.id}`}
              className="group relative flex aspect-[4/3] flex-col justify-between overflow-hidden rounded-2xl border border-border/60 bg-sunken p-3 transition-transform hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
                  {project.status === "GENERATING" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : project.status === "FAILED" ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <Code2 className="h-4 w-4" />
                  )}
                </div>
                {project.status === "GENERATING" && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                    Building
                  </span>
                )}
                {project.status === "FAILED" && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                    Failed
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-foreground">{project.title}</div>
                <div className="truncate text-[11.5px] text-muted-foreground">
                  {FRAMEWORK_LABEL[project.framework] ?? project.framework} · {project.fileCount} file
                  {project.fileCount === 1 ? "" : "s"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <WebsiteTemplateModal
        template={active}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
        onUse={(template) => {
          setActive(null);
          onUse(template);
        }}
      />
    </div>
  );
}
