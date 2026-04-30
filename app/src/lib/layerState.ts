import { createContext, useContext } from "react";
import type { ThemeId } from "./themes";

export type LayerState = {
  active: Record<ThemeId, boolean>;
  counts: Partial<Record<ThemeId, number>>;
  toggle: (id: ThemeId) => void;
  toggleGroup: (group: string, allOn: boolean) => void;
  setCount: (id: ThemeId, n: number) => void;
};

export const LayerStateContext = createContext<LayerState | null>(null);

export function useLayerState(): LayerState {
  const v = useContext(LayerStateContext);
  if (!v) throw new Error("LayerStateContext missing — wrap with provider");
  return v;
}
