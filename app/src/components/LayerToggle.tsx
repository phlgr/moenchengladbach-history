import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { THEMES, type ThemeId, themesByGroup } from "../lib/themes";
import { useLayerState } from "../lib/layerState";

export function LayerToggle() {
  const { active, counts, toggle, toggleGroup } = useLayerState();
  const groups = themesByGroup();
  // Collapsed on mobile by default (the body would otherwise eat half
  // the viewport over the map). On `sm:` and up we ignore this state
  // and always render the body.
  const [open, setOpen] = useState(false);
  const totalActive = (Object.keys(THEMES) as ThemeId[]).filter(
    (t) => active[t],
  ).length;
  return (
    <div
      className="akte-grain akte-reveal pointer-events-auto relative w-full max-w-[224px] border border-paper-edge bg-paper-light/95 shadow-[0_1px_0_rgba(28,24,20,0.05),0_8px_28px_rgba(28,24,20,0.10)] backdrop-blur-sm"
      style={{ animationDelay: "120ms" }}
    >
      {/* Index-card binding-hole header strip — also the mobile
          collapse toggle. On sm+ the chevron hides and the strip
          becomes presentational again. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="layer-toggle-body"
        className="flex w-full items-center justify-between gap-2 border-b border-paper-edge bg-paper-soft/70 px-4 py-1.5 text-left sm:cursor-default"
      >
        <span className="akte-label" style={{ fontSize: "0.52rem" }}>
          Filtern
        </span>
        <span className="flex items-center gap-3">
          <span className="akte-meta tabular-nums sm:hidden" style={{ fontSize: "0.6rem" }}>
            {totalActive}/{Object.keys(THEMES).length}
          </span>
          <span aria-hidden className="hidden gap-3 sm:flex">
            <span className="block h-1.5 w-1.5 rounded-full bg-paper-edge/80" />
            <span className="block h-1.5 w-1.5 rounded-full bg-paper-edge/80" />
            <span className="block h-1.5 w-1.5 rounded-full bg-paper-edge/80" />
          </span>
          <ChevronDown
            aria-hidden
            strokeWidth={2}
            className={`h-3.5 w-3.5 text-faded transition-transform duration-200 sm:hidden ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      <div
        id="layer-toggle-body"
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out sm:!max-h-none sm:!opacity-100 ${
          open ? "max-h-[60vh] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
      {groups.map(({ group, themes }, gi) => {
        const total = themes.reduce((n, t) => n + (counts[t] ?? 0), 0);
        const allOn = themes.every((t) => active[t]);
        const someOn = themes.some((t) => active[t]);
        return (
          <div
            key={group}
            className={gi > 0 ? "border-t border-paper-edge/70" : ""}
          >
            <button
              type="button"
              onClick={() => toggleGroup(group, !allOn)}
              aria-pressed={allOn}
              className={`group flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${
                allOn
                  ? "text-ink"
                  : someOn
                    ? "text-faded hover:text-ink"
                    : "text-faded-light hover:text-ink"
              }`}
            >
              <span
                aria-hidden
                className="relative inline-block h-3 w-3 border-[1.5px] border-sepia"
                style={{
                  backgroundColor: allOn
                    ? "var(--color-sepia)"
                    : someOn
                      ? "color-mix(in srgb, var(--color-sepia) 45%, transparent)"
                      : "transparent",
                }}
              />
              <span
                className="flex-1 font-mono text-[0.7rem] font-medium uppercase"
                style={{ letterSpacing: "0.22em" }}
              >
                {group}
              </span>
              <span className="akte-meta text-[0.65rem] tabular-nums">
                {total}
              </span>
            </button>
            {themes.length > 1 && (
              <div className="pb-1.5">
                {themes.map((id) => {
                  const t = THEMES[id];
                  const on = active[id];
                  const c = counts[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggle(id)}
                      aria-pressed={on}
                      className={`flex w-full items-center gap-2.5 py-[3px] pl-9 pr-4 text-left transition-colors ${
                        on
                          ? "text-ink"
                          : "text-faded-light hover:text-ink"
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
                      <span
                        className="flex-1"
                        style={{
                          fontFamily: "var(--font-serif)",
                          fontSize: "0.86rem",
                          fontWeight: 400,
                          letterSpacing: "0",
                        }}
                      >
                        {t.label}
                      </span>
                      {c !== undefined && (
                        <span className="akte-meta text-[0.6rem] tabular-nums opacity-80">
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
    </div>
  );
}
