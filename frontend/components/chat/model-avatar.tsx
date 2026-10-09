import { getModelIcon } from "@/lib/model-icons";

/**
 * Provider logo on a white tile (palette: logos keep their brand colours on a
 * white backing). Falls back to the model's initial when no logo is known.
 */
export function ModelAvatar({
  externalId,
  name,
  size = 22,
  className = "",
}: {
  externalId?: string | null;
  name?: string;
  size?: number;
  className?: string;
}) {
  const icon = externalId ? getModelIcon(externalId) : null;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white ${className}`}
      style={{ width: size, height: size }}
    >
      {icon ? (
        <img src={icon} alt="" className="object-contain" style={{ width: size * 0.64, height: size * 0.64 }} />
      ) : (
        <span className="text-[10px] font-semibold text-[#5D5968]">{(name || "AI").charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}

/** Overlapping avatars, used for the multi-model chip and the chat header. */
export function ModelAvatarStack({
  models,
  size = 18,
  max = 3,
}: {
  models: { id: number; name: string; externalId?: string | null }[];
  size?: number;
  max?: number;
}) {
  return (
    <span className="inline-flex items-center">
      {models.slice(0, max).map((m, i) => (
        <ModelAvatar
          key={m.id}
          externalId={m.externalId}
          name={m.name}
          size={size}
          className={`!rounded-full ring-2 ring-surface ${i > 0 ? "-ml-1.5" : ""}`}
        />
      ))}
    </span>
  );
}
