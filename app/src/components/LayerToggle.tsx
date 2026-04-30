import { THEMES, type ThemeId } from "../lib/themes";

export function LayerToggle({
  active,
  counts,
  onToggle,
}: {
  active: Record<ThemeId, boolean>;
  counts: Partial<Record<ThemeId, number>>;
  onToggle: (id: ThemeId) => void;
}) {
  return (
    <div className="pointer-events-auto rounded border border-sepia-light bg-paper/95 shadow">
      {(Object.keys(THEMES) as ThemeId[]).map((id, i) => {
        const t = THEMES[id];
        const isActive = active[id];
        const c = counts[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            aria-pressed={isActive}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
              i > 0 ? "border-t border-sepia-light/60" : ""
            } ${
              isActive
                ? "text-ink"
                : "text-faded/70 hover:text-ink"
            }`}
          >
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-full border-2 border-paper-light"
              style={{
                backgroundColor: isActive ? t.pointColor : "transparent",
                borderColor: t.pointColor,
              }}
            />
            <span className="flex-1 font-medium">{t.label}</span>
            {c !== undefined && (
              <span className="text-[10px] tabular-nums text-faded/80">
                {c}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
