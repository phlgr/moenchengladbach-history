export type ThemeId = "stolpersteine" | "baudenkmaeler";

export const THEMES: Record<
  ThemeId,
  { label: string; clusterColor: string; pointColor: string }
> = {
  stolpersteine: {
    label: "Stolpersteine",
    clusterColor: "#7a5e3a",
    pointColor: "#a0522d",
  },
  baudenkmaeler: {
    label: "Baudenkmäler",
    clusterColor: "#2f4f4f",
    pointColor: "#5a7a78",
  },
};
