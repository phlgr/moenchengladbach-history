export type ThemeId =
  | "stolpersteine"
  | "ns-synagogen"
  | "ns-friedhoefe"
  | "ns-bunker"
  | "ns-stolperschwellen"
  | "ns-zwangsarbeit"
  | "ns-taeter"
  | "ns-gedenkorte";

type Theme = {
  label: string;
  group: string;
  clusterColor: string;
  pointColor: string;
};

export const THEMES: Record<ThemeId, Theme> = {
  stolpersteine: {
    label: "Stolpersteine",
    group: "Personen",
    clusterColor: "#7a5e3a",
    pointColor: "#a0522d",
  },
  "ns-synagogen": {
    label: "Synagogen",
    group: "NS-Orte",
    clusterColor: "#7a2818",
    pointColor: "#a83825",
  },
  "ns-friedhoefe": {
    label: "Jüdische Friedhöfe",
    group: "NS-Orte",
    clusterColor: "#4a4036",
    pointColor: "#6b5a48",
  },
  "ns-bunker": {
    label: "Bunker",
    group: "NS-Orte",
    clusterColor: "#1f2933",
    pointColor: "#3a4a5a",
  },
  "ns-stolperschwellen": {
    label: "Stolperschwellen",
    group: "NS-Orte",
    clusterColor: "#5e4530",
    pointColor: "#8b6a45",
  },
  "ns-zwangsarbeit": {
    label: "Zwangsarbeit & Lager",
    group: "NS-Orte",
    clusterColor: "#6b2820",
    pointColor: "#8a3328",
  },
  "ns-taeter": {
    label: "Tätergeschichte",
    group: "NS-Orte",
    clusterColor: "#0f0f0f",
    pointColor: "#2a2a2a",
  },
  "ns-gedenkorte": {
    label: "Gedenkorte",
    group: "NS-Orte",
    clusterColor: "#7a5a20",
    pointColor: "#a47e3c",
  },
};

/** Map our internal NS-Orte category strings to ThemeId. */
export function nsCategoryToTheme(category: string): ThemeId {
  switch (category) {
    case "destroyed_synagogue":
    case "synagogue_memorial":
      return "ns-synagogen";
    case "jewish_cemetery":
    case "jewish_site":
      return "ns-friedhoefe";
    case "bunker":
      return "ns-bunker";
    case "stolperschwelle":
      return "ns-stolperschwellen";
    case "forced_labor":
    case "pow_camp_memorial":
    case "concentration_camp":
      return "ns-zwangsarbeit";
    case "perpetrator_site":
      return "ns-taeter";
    case "ns_victim_memorial":
    case "ns_memorial":
    case "resistance_memorial":
    case "memorial_other":
    default:
      return "ns-gedenkorte";
  }
}

/** Group ThemeIds by their group label, in display order. */
export function themesByGroup(): Array<{ group: string; themes: ThemeId[] }> {
  const groups = new Map<string, ThemeId[]>();
  for (const id of Object.keys(THEMES) as ThemeId[]) {
    const g = THEMES[id].group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(id);
  }
  return Array.from(groups, ([group, themes]) => ({ group, themes }));
}
