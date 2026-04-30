export type ThemeId = "stolpersteine" | "ns-orte";

export const THEMES: Record<
  ThemeId,
  { label: string; clusterColor: string; pointColor: string }
> = {
  stolpersteine: {
    label: "Stolpersteine",
    clusterColor: "#7a5e3a",
    pointColor: "#a0522d",
  },
  "ns-orte": {
    label: "NS-Orte",
    clusterColor: "#3a3530",
    pointColor: "#5e4f30",
  },
};
