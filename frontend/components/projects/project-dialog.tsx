"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { contextService } from "@/lib/services";
import {
  DEFAULT_PROJECT_COLOR,
  DEFAULT_PROJECT_ICON,
  PROJECT_COLORS,
  PROJECT_ICONS,
  ProjectIconTile,
} from "./project-look";

export interface ProjectFormValues {
  name: string;
  description: string;
  brief: string;
  icon: string;
  color: string;
}

export const emptyProjectForm: ProjectFormValues = {
  name: "",
  description: "",
  brief: "",
  icon: DEFAULT_PROJECT_ICON,
  color: DEFAULT_PROJECT_COLOR,
};

const DESCRIPTION_MAX = 150;
const BRIEF_MAX = 500;

/**
 * The project brief is stored as the project's single FOLDER context, which
 * is what every chat in the project already reads. Creates, updates or removes
 * it to match `brief`; returns false if saving failed so callers can warn.
 */
export async function saveProjectBrief(params: {
  folderId: number;
  projectName: string;
  brief: string;
  existingContextId: number | null;
}): Promise<boolean> {
  const { folderId, projectName, existingContextId } = params;
  const brief = params.brief.trim();
  try {
    if (existingContextId) {
      if (brief) {
        await contextService.update(existingContextId, { title: `${projectName} context`, memory: brief });
      } else {
        await contextService.delete(existingContextId);
      }
    } else if (brief) {
      await contextService.create({
        title: `${projectName} context`,
        memory: brief,
        type: "FOLDER",
        folderId,
      });
    }
    return true;
  } catch {
    return false;
  }
}

const labelCls = "text-[13px] font-medium text-foreground";
const fieldCls =
  "w-full rounded-lg border border-border bg-sunken px-3 text-sm text-foreground placeholder:text-faint outline-none transition-colors focus:border-primary/50 focus:bg-surface disabled:opacity-60";

export function ProjectDialog({
  open,
  onOpenChange,
  mode,
  initial,
  briefLoading,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial: ProjectFormValues;
  briefLoading?: boolean;
  submitting?: boolean;
  onSubmit: (values: ProjectFormValues) => void;
}) {
  const [values, setValues] = useState<ProjectFormValues>(initial);

  // Re-seed whenever the dialog opens or the edited project's values arrive
  // (the brief loads asynchronously after the dialog opens in edit mode).
  useEffect(() => {
    if (open) setValues(initial);
  }, [open, initial]);

  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const canSubmit = values.name.trim().length > 0 && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90dvh] overflow-y-auto gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-[17px] font-semibold">
            {mode === "create" ? "New project" : "Edit project"}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-sunken px-3.5 py-3">
            <ProjectIconTile project={{ icon: values.icon, color: values.color }} size={40} />
            <div className="min-w-0">
              <div className="text-[14.5px] font-semibold text-foreground truncate">
                {values.name.trim() || "Untitled project"}
              </div>
              <div className="text-xs text-muted-foreground">Preview</div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Project name</label>
            <input
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Pizza restaurant launch"
              autoFocus
              className={`${fieldCls} h-10`}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className={labelCls}>
                Short description <span className="font-normal text-faint">· optional</span>
              </label>
              <span className="text-[11px] text-faint">
                {values.description.length}/{DESCRIPTION_MAX}
              </span>
            </div>
            <input
              value={values.description}
              onChange={(e) => set("description", e.target.value.slice(0, DESCRIPTION_MAX))}
              placeholder="What is this project about?"
              className={`${fieldCls} h-10`}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className={labelCls}>
                Project brief <span className="font-normal text-faint">· optional</span>
              </label>
              <span className="text-[11px] text-faint">
                {values.brief.length}/{BRIEF_MAX}
              </span>
            </div>
            <textarea
              value={values.brief}
              onChange={(e) => set("brief", e.target.value.slice(0, BRIEF_MAX))}
              placeholder={briefLoading ? "Loading…" : "Goals, audience, budget, tone, anything the AI should keep in mind…"}
              disabled={briefLoading}
              rows={4}
              className={`${fieldCls} py-2.5 resize-y min-h-[96px]`}
            />
            <p className="text-xs text-muted-foreground">
              Colab AI reads this before every chat in the project, so you don&apos;t have to repeat yourself.
            </p>
          </div>

          <div className="space-y-2">
            <label className={labelCls}>Icon</label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_ICONS.map(({ key, icon: Icon, label }) => {
                const active = values.icon === key;
                return (
                  <button
                    key={key}
                    type="button"
                    title={label}
                    onClick={() => set("icon", key)}
                    className={`h-10 w-10 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                      active
                        ? "border-primary bg-accent-soft text-primary"
                        : "border-border bg-surface text-muted-foreground hover:border-line-strong hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className={labelCls}>Colour</label>
            <div className="flex flex-wrap gap-2.5">
              {PROJECT_COLORS.map((c) => {
                const active = values.color === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    title={c.label}
                    onClick={() => set("color", c.key)}
                    className={`h-7 w-7 rounded-full flex items-center justify-center transition-shadow cursor-pointer ${
                      active ? "ring-2 ring-offset-2 ring-offset-surface" : ""
                    }`}
                    style={{ background: c.value, ...(active ? { ["--tw-ring-color" as string]: c.value } : {}) }}
                  >
                    {active && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-3.5 sm:justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 px-4 rounded-lg border border-border bg-surface text-sm font-medium text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => onSubmit({ ...values, name: values.name.trim(), description: values.description.trim() })}
            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
          >
            {submitting ? "Saving…" : mode === "create" ? "Create project" : "Save changes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProjectDialog({
  projectName,
  open,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  projectName?: string;
  open: boolean;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (deleteChats: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] max-w-[calc(100vw-2rem)] sm:max-w-[560px] p-6">
        <DialogHeader>
          <DialogTitle>Delete project</DialogTitle>
        </DialogHeader>
        <div className="py-3 text-sm text-muted-foreground">
          What would you like to do with the chats inside &quot;{projectName}&quot;?
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between sm:flex-nowrap">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting} className="w-full sm:w-auto">
            Cancel
          </Button>
          <div className="flex flex-col sm:flex-row gap-2 sm:flex-nowrap">
            <Button
              variant="outline"
              onClick={() => onConfirm(false)}
              disabled={deleting}
              className="w-full sm:w-auto border-primary/40 text-primary hover:bg-accent-soft text-xs sm:text-sm"
            >
              {deleting ? "Moving…" : "Move chats out"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => onConfirm(true)}
              disabled={deleting}
              className="w-full sm:w-auto text-xs sm:text-sm"
            >
              {deleting ? "Deleting…" : "Delete chats too"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
