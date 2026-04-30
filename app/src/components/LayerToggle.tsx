import { THEMES, type ThemeId, themesByGroup } from "../lib/themes";

export function LayerToggle({
  active,
  counts,
  onToggle,
  onToggleGroup,
}: {
  active: Record<ThemeId, boolean>;
  counts: Partial<Record<ThemeId, number>>;
  onToggle: (id: ThemeId) => void;
  onToggleGroup: (group: string, allOn: boolean) => void;
}) {
  const groups = themesByGroup();
  return (
    <div className="pointer-events-auto rounded border border-sepia-light bg-paper/95 shadow">
      {groups.map(({ group, themes }, gi) => {
        const total = themes.reduce((n, t) => n + (counts[t] ?? 0), 0);
        const allOn = themes.every((t) => active[t]);
        const someOn = themes.some((t) => active[t]);
        return (
          <div
            key={group}
            className={gi > 0 ? "border-t border-sepia-light/60" : ""}
          >
            <button
              type="button"
              onClick={() => onToggleGroup(group, !allOn)}
              aria-pressed={allOn}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest transition-colors ${
                allOn
                  ? "text-ink"
                  : someOn
                    ? "text-faded hover:text-ink"
                    : "text-faded/60 hover:text-ink"
              }`}
            >
              <span
                aria-hidden
                className="relative inline-block h-3 w-3 rounded-sm border-[1.5px] border-sepia"
                style={{
                  backgroundColor: allOn
                    ? "var(--color-sepia)"
                    : someOn
                      ? "color-mix(in srgb, var(--color-sepia) 40%, transparent)"
                      : "transparent",
                }}
              />
              <span className="flex-1">{group}</span>
              <span className="text-[10px] tabular-nums text-faded">
                {total}
              </span>
            </button>
            {themes.length > 1 && (
              <div className="pb-1">
                {themes.map((id) => {
                  const t = THEMES[id];
                  const on = active[id];
                  const c = counts[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onToggle(id)}
                      aria-pressed={on}
                      className={`flex w-full items-center gap-2 py-[3px] pl-7 pr-3 text-left text-[11px] transition-colors ${
                        on
                          ? "text-ink"
                          : "text-faded/70 hover:text-ink"
                      }`}
                    >
                      <span
                        aria-hidden
                        className="inline-block h-2.5 w-2.5 rounded-full border-2"
                        style={{
                          backgroundColor: on ? t.pointColor : "transparent",
                          borderColor: t.pointColor,
                        }}
                      />
                      <span className="flex-1">{t.label}</span>
                      {c !== undefined && (
                        <span className="text-[10px] tabular-nums text-faded/80">
                          {c}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
