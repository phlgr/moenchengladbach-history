import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { DeportationToggle } from "../components/DeportationToggle";
import { LayerToggle } from "../components/LayerToggle";
import { MapView } from "../components/MapView";
import { Timeline } from "../components/Timeline";
import { LayerStateContext } from "../lib/layerState";
import { THEMES, type ThemeId } from "../lib/themes";

export const Route = createFileRoute("/")({
  component: HomePage,
});

const ALL_THEMES = Object.keys(THEMES) as ThemeId[];

function HomePage() {
  const [active, setActive] = useState<Record<ThemeId, boolean>>(() => {
    const a = {} as Record<ThemeId, boolean>;
    for (const t of ALL_THEMES) a[t] = true;
    return a;
  });
  const [counts, setCounts] = useState<Partial<Record<ThemeId, number>>>({});
  const [deportationMode, setDeportationMode] = useState(false);
  const [deportationCount, setDeportationCount] = useState<number | null>(null);
  const [currentDate, setCurrentDate] = useState<string | null>(null);
  const [attributionExpanded, setAttributionExpanded] = useState(false);

  const toggle = useCallback(
    (id: ThemeId) => setActive((a) => ({ ...a, [id]: !a[id] })),
    [],
  );
  const toggleGroup = useCallback((group: string, allOn: boolean) => {
    setActive((a) => {
      const next = { ...a };
      for (const t of ALL_THEMES) {
        if (THEMES[t].group === group) next[t] = allOn;
      }
      return next;
    });
  }, []);
  const setCount = useCallback(
    (id: ThemeId, n: number) => setCounts((c) => ({ ...c, [id]: n })),
    [],
  );

  return (
    <LayerStateContext.Provider
      value={{
        active,
        counts,
        toggle,
        toggleGroup,
        setCount,
        deportationMode,
        setDeportationMode,
        deportationCount,
        setDeportationCount,
        currentDate,
        setCurrentDate,
        attributionExpanded,
        setAttributionExpanded,
      }}
    >
      <main className="relative h-dvh w-screen overflow-hidden">
        <header className="pointer-events-none absolute left-0 top-0 z-10 flex w-[min(60vw,224px)] flex-col gap-2 p-3 pl-safe pt-safe sm:w-auto sm:max-w-[280px] sm:gap-3 sm:p-5">
          <div className="akte-grain akte-reveal pointer-events-auto relative flex flex-col gap-1 border border-paper-edge bg-paper-light/95 px-4 pb-2 pt-2 shadow-[0_1px_0_rgba(28,24,20,0.05),0_8px_28px_rgba(28,24,20,0.10)] backdrop-blur-sm sm:gap-2 sm:px-5 sm:pb-3 sm:pt-3">
            <div
              aria-hidden
              className="absolute -right-px -top-px h-3 w-10 origin-top-right border-l border-paper-edge bg-paper-soft"
            />
            <div
              className="akte-label flex items-center gap-2"
              style={{ fontSize: "0.55rem" }}
            >
              <span>Akte</span>
              <span className="h-px w-4 bg-paper-edge" />
              <span>NRW · MG</span>
            </div>
            <h1 className="akte-display text-[1.15rem] tracking-tight sm:text-[1.65rem]">
              Mönchengladbach
              <span className="hidden text-[0.95rem] italic text-faded sm:block">
                Eine Geschichtskarte
              </span>
            </h1>
            <div className="akte-meta text-[0.6rem] sm:pt-0.5 sm:text-[0.62rem]">
              1933 — 1945
            </div>
          </div>

          <LayerToggle />
          <DeportationToggle
            active={deportationMode}
            onToggle={() => setDeportationMode(!deportationMode)}
            totalRoutes={deportationCount}
          />
        </header>

        <MapView />

        {/* Timeline — collapsible */}
        {!deportationMode && <Timeline />}
      </main>
    </LayerStateContext.Provider>
  );
}
