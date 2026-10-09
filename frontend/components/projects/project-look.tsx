import {
  Code,
  Folder,
  GraduationCap,
  Globe,
  Heart,
  Music,
  Palette,
  Pizza,
  Store,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/** Icon keys are what's persisted on Folder.icon — keep them stable. */
export const PROJECT_ICONS: { key: string; icon: LucideIcon; label: string }[] = [
  { key: "folder", icon: Folder, label: "Folder" },
  { key: "pizza", icon: Pizza, label: "Food" },
  { key: "trending", icon: TrendingUp, label: "Growth" },
  { key: "palette", icon: Palette, label: "Design" },
  { key: "globe", icon: Globe, label: "Web" },
  { key: "learn", icon: GraduationCap, label: "Learning" },
  { key: "store", icon: Store, label: "Business" },
  { key: "music", icon: Music, label: "Music" },
  { key: "code", icon: Code, label: "Code" },
  { key: "heart", icon: Heart, label: "Personal" },
];

/** Colour keys are what's persisted on Folder.color. */
export const PROJECT_COLORS: { key: string; value: string; label: string }[] = [
  { key: "blue", value: "#4A86D9", label: "Blue" },
  { key: "violet", value: "#8B6FD6", label: "Violet" },
  { key: "magenta", value: "#B25AB8", label: "Magenta" },
  { key: "red", value: "#CD5C55", label: "Red" },
  { key: "orange", value: "#D9733F", label: "Orange" },
  { key: "green", value: "#3F9E54", label: "Green" },
  { key: "teal", value: "#1FA39A", label: "Teal" },
  { key: "pink", value: "#C95A85", label: "Pink" },
];

export const DEFAULT_PROJECT_ICON = "folder";
export const DEFAULT_PROJECT_COLOR = "blue";

export function resolveProjectLook(project: { id?: number; icon?: string | null; color?: string | null }) {
  const icon = PROJECT_ICONS.find((i) => i.key === project.icon)?.icon ?? Folder;
  // Projects made before icons existed get a stable colour from their id
  // instead of all collapsing to one.
  const color =
    PROJECT_COLORS.find((c) => c.key === project.color) ??
    (project.id !== undefined ? PROJECT_COLORS[project.id % PROJECT_COLORS.length] : PROJECT_COLORS[0]);
  return { Icon: icon, color: color.value };
}

/** Rounded icon tile tinted with the project colour. */
export function ProjectIconTile({
  project,
  size = 40,
}: {
  project: { id?: number; icon?: string | null; color?: string | null };
  size?: number;
}) {
  const { Icon, color } = resolveProjectLook(project);
  return (
    <div
      className="shrink-0 rounded-xl flex items-center justify-center"
      style={{
        width: size,
        height: size,
        color,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
      }}
    >
      <Icon style={{ width: size * 0.45, height: size * 0.45 }} />
    </div>
  );
}

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** "Today", "Yesterday", "Mon" (this week), "Oct 3". Used for chat rows and asset captions. */
export function shortDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Looser wording for captions: "2 days ago", "last week". */
export function relativeDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "last week";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "Updated today" / "Updated last week" / "Updated Oct 1". */
export function updatedLabel(iso?: string | null): string {
  const text = relativeDate(iso);
  if (!text) return "";
  return `Updated ${text === "Today" || text === "Yesterday" ? text.toLowerCase() : text}`;
}
