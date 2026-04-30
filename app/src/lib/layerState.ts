import { createContext, useContext } from "react";
import type { ThemeId } from "./themes";

export type LayerState = {
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

  /** Year cutoff for the timeline. null = "show all years". When set,
   *  POIs are filtered to those whose `year` property is null (always
   *  visible) or <= currentYear. Range 1933..1945. */
  currentYear: number | null;
  setCurrentYear: (y: number | null) => void;
};

export const LayerStateContext = createContext<LayerState | null>(null);

export function useLayerState(): LayerState {
  const v = useContext(LayerStateContext);
  if (!v) throw new Error("LayerStateContext missing — wrap with provider");
  return v;
}
