import { createContext, useContext } from "react";
import type { ThemeId } from "./themes";

type LayerState = {
  active: Record<ThemeId, boolean>;
  counts: Partial<Record<ThemeId, number>>;
  toggle: (id: ThemeId) => void;
  toggleGroup: (group: string, allOn: boolean) => void;
  setCount: (id: ThemeId, n: number) => void;

  /** Cinematic deportation-network mode: dims POI markers, draws arcs
   *  from each Stolperstein origin to its deportation destination, and
   *  zooms the camera out to fit MG + Eastern Europe. */
  deportationMode: boolean;
  setDeportationMode: (v: boolean) => void;
  /** Total deportation routes (filled once the data is loaded). */
  deportationCount: number | null;
  setDeportationCount: (n: number) => void;

  /** ISO YYYY-MM-DD cutoff for the timeline. null = "show all dates".
   *  When set, POIs are filtered to those whose `date` property is null
   *  (always visible) or <= currentDate. Resolution is month-level so
   *  events appear gradually rather than in a yearly burst. Range
   *  1933-01..1945-12. */
  currentDate: string | null;
  setCurrentDate: (d: string | null) => void;

  /** Whether the MapLibre attribution box is expanded. Timeline uses this
   *  to shift up and avoid overlapping with the open copyright notice. */
  attributionExpanded: boolean;
  setAttributionExpanded: (v: boolean) => void;
};

export const LayerStateContext = createContext<LayerState | null>(null);

export function useLayerState(): LayerState {
  const v = useContext(LayerStateContext);
  if (!v) throw new Error("LayerStateContext missing — wrap with provider");
  return v;
}
