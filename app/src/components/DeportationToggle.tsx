import { Route } from "lucide-react";

export function DeportationToggle({
  active,
  onToggle,
  totalRoutes,
}: {
  active: boolean;
  onToggle: () => void;
  totalRoutes: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`akte-grain pointer-events-auto group relative flex w-full max-w-[224px] flex-col items-stretch border bg-paper-light/95 text-left shadow-[0_1px_0_rgba(28,24,20,0.05),0_8px_28px_rgba(28,24,20,0.10)] backdrop-blur-sm transition-colors ${
        active
          ? "border-red-oxide bg-paper-light"
          : "border-paper-edge hover:border-sepia"
      }`}
    >
      <span
        aria-hidden
        className="flex items-center justify-between border-b border-paper-edge bg-paper-soft/70 px-4 py-1.5"
      >
        <span className="akte-label" style={{ fontSize: "0.52rem" }}>
          {active ? "Aktiv" : "Werkzeug"}
        </span>
        <DeportationGlyph active={active} />
      </span>
      <span className="px-4 py-2.5 sm:py-3">
        <span
          className="block akte-display"
          style={{ fontSize: "1.05rem", lineHeight: 1.15, fontWeight: 500 }}
        >
          {active ? "Zurück zur Karte" : "Deportationsnetz"}
        </span>
        <span
          className="mt-1 hidden text-[0.78rem] italic text-faded sm:block"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {active ? "Schließt das Netz" : "Wohin sie verschleppt wurden"}
        </span>
        {totalRoutes !== null && (
          <span className="akte-meta mt-2 hidden items-center gap-2 text-[0.62rem] sm:flex">
            <span className="tabular-nums">{totalRoutes}</span>
            <span>Routen</span>
            <span className="h-px flex-1 bg-paper-edge/60" />
            <span className="text-red-oxide">↗</span>
          </span>
        )}
      </span>
    </button>
  );
}

function DeportationGlyph({ active }: { active: boolean }) {
  return (
    <Route
      aria-hidden
      className="h-4 w-4"
      strokeWidth={1.6}
      style={{
        color: active ? "var(--color-red-oxide)" : "var(--color-sepia)",
      }}
    />
  );
}
