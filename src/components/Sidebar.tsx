import {
  Fence,
  Flame,
  Footprints,
  Gavel,
  Hammer,
  Landmark,
  type LucideIcon,
  Shield,
  Signpost,
  Stone as StoneIcon,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { path } from "../lib/assets";
import type { ThemeId } from "../lib/themes";

type Stolperstein = {
  id: string;
  name: string;
  install_date: string | null;
  inscription: string;
  image: string | null;
  bio: string;
};

type StolpersteinGroup = {
  kind: "stolperstein-group";
  id: string;
  address: string;
  district: string;
  lat: number;
  lng: number;
  source_url: string;
  stones: Stolperstein[];
};

type NsOrt = {
  kind: "ns-orte";
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  address?: string;
  ortsteil?: string;
  description?: string;
  build_date?: string;
  image?: string | null;
  wikipedia?: string;
  wikidata?: string;
  source: "osm" | "baudenkmal" | "curated" | string;
  source_url?: string;
  denkmal_nummer?: string;
  ns_name?: string;
  ns_period?: string;
  lifespan?: string;
  roles?: string[];
};

export type SidebarSelection = {
  theme: ThemeId;
  id: string;
  contentDir: string;
} | null;

function normaliseFilename(filename: string): string {
  return filename
    .replace(/^(Datei|File|Image|Bild):/i, "")
    .trim()
    .replace(/ /g, "_");
}

function commonsThumb(filename: string, width = 600): string {
  if (/^https?:\/\//i.test(filename)) return filename;
  const safe = normaliseFilename(filename);
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    safe,
  )}?width=${width}`;
}

function commonsFilePage(filename: string): string {
  if (/^https?:\/\//i.test(filename)) return filename;
  const safe = normaliseFilename(filename);
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(safe)}`;
}

// Star of David — drawn here directly because Lucide has no equivalent.
// Two equilateral triangles, both with centroid (12, 12) and R = 11.
function StarOfDavid({
  className,
  strokeWidth = 1.5,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <title>Star of David</title>
      <path d="M12 1 L21.526 17.5 L2.474 17.5 Z" />
      <path d="M12 23 L2.474 6.5 L21.526 6.5 Z" />
    </svg>
  );
}

type CategoryIcon = LucideIcon | typeof StarOfDavid;

const CATEGORY_ICONS: Record<string, CategoryIcon> = {
  destroyed_synagogue: StarOfDavid,
  synagogue_memorial: StarOfDavid,
  jewish_cemetery: StarOfDavid,
  jewish_site: StarOfDavid,
  bunker: Shield,
  stolperschwelle: Footprints,
  perpetrator_site: Gavel,
  renamed_street: Signpost,
  forced_labor: Hammer,
  pow_camp_memorial: Fence,
  concentration_camp: Fence,
  resistance_memorial: Flame,
  ns_victim_memorial: Landmark,
  ns_memorial: Landmark,
  memorial_other: Landmark,
  stolperstein: StoneIcon,
};

function MediaPlaceholder({
  category,
  label,
}: {
  category: string;
  label: string;
}) {
  const Icon = CATEGORY_ICONS[category] ?? CATEGORY_ICONS["ns_memorial"];
  return (
    <div
      aria-hidden
      className="relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, var(--color-paper-soft) 0%, var(--color-sepia-light) 70%, color-mix(in srgb, var(--color-sepia) 25%, var(--color-paper-soft)) 100%)",
      }}
    >
      {/* corner crop marks — printer's marks for the archival feel */}
      <CornerMark className="left-3 top-3" position="tl" />
      <CornerMark className="right-3 top-3" position="tr" />
      <CornerMark className="bottom-3 left-3" position="bl" />
      <CornerMark className="bottom-3 right-3" position="br" />
      <Icon className="h-16 w-16 text-sepia/70" strokeWidth={1.1} />
      <div className="akte-label" style={{ fontSize: "0.6rem" }}>
        {label}
      </div>
      <div
        className="text-[10px] italic text-faded/80"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        kein Foto verfügbar
      </div>
    </div>
  );
}

function CornerMark({
  className = "",
  position,
}: {
  className?: string;
  position: "tl" | "tr" | "bl" | "br";
}) {
  const lines: Record<typeof position, string> = {
    tl: "M0 0 V8 M0 0 H8",
    tr: "M16 0 V8 M16 0 H8",
    bl: "M0 16 V8 M0 16 H8",
    br: "M16 16 V8 M16 16 H8",
  };
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={`absolute h-3 w-3 text-faded/50 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
    >
      <title>Corner decoration</title>
      <path d={lines[position]} />
    </svg>
  );
}

const THEME_LABELS: Partial<Record<ThemeId, string>> = {
  stolpersteine: "Stolpersteine",
  "ns-synagogen": "Synagoge",
  "ns-friedhoefe": "Jüdischer Friedhof",
  "ns-bunker": "Bunker",
  "ns-stolperschwellen": "Stolperschwelle",
  "ns-zwangsarbeit": "Zwangsarbeit & Lager",
  "ns-taeter": "Tätergeschichte",
  "ns-strassen": "NS-Straßenname",
  "ns-gedenkorte": "Gedenkort",
};

const SOURCE_LABELS: Record<string, string> = {
  osm: "OpenStreetMap (ODbL)",
  baudenkmal: "Wikipedia (CC BY-SA 4.0)",
  "wikipedia-narrative": "Wikipedia (CC BY-SA 4.0)",
  "wp-auto": "Wikipedia (CC BY-SA 4.0)",
};
const SOURCE_LABEL_FALLBACK = "Eigene Recherche";

const NS_CATEGORY_LABELS: Record<string, string> = {
  destroyed_synagogue: "Zerstörte Synagoge",
  synagogue_memorial: "Gedenkort Synagoge",
  jewish_cemetery: "Jüdischer Friedhof",
  jewish_site: "Jüdische Gedenktafel",
  bunker: "Luftschutzbunker",
  pow_camp_memorial: "Kriegsgefangenenlager",
  forced_labor: "Zwangsarbeit",
  concentration_camp: "Konzentrationslager",
  perpetrator_site: "Tätergeschichte",
  stolperschwelle: "Stolperschwelle",
  ns_victim_memorial: "NS-Opfer-Gedenkort",
  ns_memorial: "NS-Gedenkort",
  resistance_memorial: "Widerstand",
  memorial_other: "Gedenkort",
  renamed_street: "NS-Straßenname",
};

export function Sidebar({
  selection,
  onClose,
}: {
  selection: SidebarSelection;
  onClose: () => void;
}) {
  const [content, setContent] = useState<StolpersteinGroup | NsOrt | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    setContent(null);
    setError(null);
    setLoading(true);

    fetch(path(`data/content/${selection.contentDir}/${selection.id}.json`))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((c) => {
        if (cancelled) return;
        setContent(c);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selection]);

  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, onClose]);

  const open = selection !== null;

  return (
    <aside
      aria-hidden={!open}
      aria-label="Detailansicht"
      className={`akte-grain pointer-events-auto fixed inset-y-0 right-0 z-20 flex w-full max-w-[440px] flex-col border-l border-paper-edge bg-paper-light shadow-[-12px_0_36px_rgba(28,24,20,0.18)] transition-transform duration-[420ms] ${
        open ? "translate-x-0 ease-out" : "translate-x-full ease-in"
      }`}
    >
      {/* Index-tab top bar */}
      <div className="relative flex items-center justify-between border-b border-paper-edge bg-paper-soft/60 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="block h-3 w-3 rounded-full border-2 border-sepia"
            style={{
              backgroundColor: selection
                ? "color-mix(in srgb, var(--color-sepia) 70%, transparent)"
                : "transparent",
            }}
          />
          <span
            className="akte-label"
            style={{ fontSize: "0.6rem", letterSpacing: "0.24em" }}
          >
            {selection ? (THEME_LABELS[selection.theme] ?? "Akte") : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="group flex items-center gap-1.5 rounded-none border border-transparent px-1.5 py-1 text-faded transition-colors hover:border-paper-edge hover:bg-paper hover:text-ink"
        >
          <span
            className="akte-label"
            style={{ fontSize: "0.55rem", letterSpacing: "0.22em" }}
          >
            Esc
          </span>
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col items-center gap-3 px-5 py-16">
            <div aria-hidden className="h-px w-12 animate-pulse bg-sepia/60" />
            <div className="akte-label">Lade Akte</div>
          </div>
        )}
        {error && (
          <div className="px-5 py-10 text-center">
            <div className="akte-stamp">Fehler</div>
            <div
              className="mt-3 text-sm italic text-faded"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {error}
            </div>
          </div>
        )}
        {content?.kind === "stolperstein-group" && (
          <StolpersteinGroupView g={content} />
        )}
        {content?.kind === "ns-orte" && <NsOrtView n={content} />}
      </div>
    </aside>
  );
}

function StolpersteinGroupView({ g }: { g: StolpersteinGroup }) {
  const firstWithImage = g.stones.find((s) => s.image)?.image;
  return (
    <article>
      <HeaderMedia
        image={firstWithImage}
        alt={`Stolpersteine ${g.address}`}
        category="stolperstein"
        label="Stolpersteine"
      />
      <div className="border-b border-paper-edge bg-paper-light px-6 py-5">
        <div className="akte-meta mb-2 flex items-center gap-3">
          <span className="text-faded-light">Adresse</span>
          <span className="h-px flex-1 bg-paper-edge/70" />
          <span className="tabular-nums text-faded">
            {g.stones.length === 1 ? "1 Person" : `${g.stones.length} Personen`}
          </span>
        </div>
        <h1
          className="akte-display"
          style={{ fontSize: "1.85rem", fontWeight: 500, lineHeight: 1.05 }}
        >
          {g.address}
        </h1>
        {g.district && (
          <div className="mt-2 akte-meta">
            <span className="capitalize">Stadtbezirk {g.district}</span>
          </div>
        )}
      </div>
      <ol className="divide-y divide-paper-edge/60">
        {g.stones.map((s, idx) => (
          <li key={s.id} className="px-6 py-6">
            <div className="akte-meta mb-3 flex items-center gap-2">
              <span className="tabular-nums text-faded-light">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="h-px flex-1 bg-paper-edge/50" />
              {s.install_date && (
                <span className="tabular-nums text-faded-light">
                  verlegt {s.install_date}
                </span>
              )}
            </div>
            <div className="flex gap-4">
              {s.image && (
                <a
                  href={commonsFilePage(s.image)}
                  target="_blank"
                  rel="noreferrer"
                  className="block h-28 w-28 shrink-0 overflow-hidden rounded-none border border-paper-edge bg-sepia-light/40"
                >
                  <img
                    src={commonsThumb(s.image, 240)}
                    alt={`Stolperstein für ${s.name}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </a>
              )}
              <div className="min-w-0 flex-1">
                <h2
                  className="akte-display"
                  style={{ fontSize: "1.25rem", lineHeight: 1.15 }}
                >
                  {s.name}
                </h2>
                {s.inscription && (
                  <section
                    aria-label="Inschrift"
                    className="inscription mt-3 text-[0.82rem]"
                  >
                    {s.inscription}
                  </section>
                )}
              </div>
            </div>
            {s.bio && (
              <div className="article-body mt-4 text-[0.92rem] leading-[1.7]">
                {s.bio.split(/\n+/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="px-6 py-5">
        <SourceLink href={g.source_url} label="Wikipedia (CC BY-SA 4.0)" />
      </div>
    </article>
  );
}

function HeaderMedia({
  image,
  alt,
  category,
  label,
}: {
  image: string | null | undefined;
  alt: string;
  category: string;
  label: string;
}) {
  const [errored, setErrored] = useState(false);
  if (!image || errored) {
    return <MediaPlaceholder category={category} label={label} />;
  }
  return (
    <a
      href={commonsFilePage(image)}
      target="_blank"
      rel="noreferrer"
      className="relative block aspect-[4/3] w-full overflow-hidden bg-paper-soft"
    >
      <img
        src={commonsThumb(image, 600)}
        alt={alt}
        loading="lazy"
        onError={() => setErrored(true)}
        className="h-full w-full object-cover"
      />
      {/* Soft vignette to integrate with the paper chrome */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 60%, rgba(28,24,20,0.18) 100%)",
        }}
      />
    </a>
  );
}

function NsOrtView({ n }: { n: NsOrt }) {
  const sourceLabel = SOURCE_LABELS[n.source] ?? SOURCE_LABEL_FALLBACK;
  const categoryLabel = NS_CATEGORY_LABELS[n.category] ?? n.category;
  return (
    <article>
      <HeaderMedia
        image={n.image}
        alt={n.name}
        category={n.category}
        label={categoryLabel}
      />
      <div className="px-6 py-6">
        <div className="mb-3 flex items-center gap-3">
          <span className="akte-stamp">{categoryLabel}</span>
        </div>
        <h1
          className="akte-display"
          style={{ fontSize: "1.85rem", fontWeight: 500, lineHeight: 1.06 }}
        >
          {n.name}
        </h1>
        {n.address && (
          <div
            className="mt-1.5 italic text-faded"
            style={{ fontFamily: "var(--font-serif)", fontSize: "1rem" }}
          >
            {n.address}
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-y border-paper-edge/60 py-3">
          {n.ortsteil && <MetaCell label="Ortsteil" value={n.ortsteil} />}
          {n.build_date && <MetaCell label="Bauzeit" value={n.build_date} />}
          {n.denkmal_nummer && (
            <MetaCell label="Denkmal-Nr." value={n.denkmal_nummer} />
          )}
          {n.lifespan && <MetaCell label="Lebensdaten" value={n.lifespan} />}
          {n.ns_name && (
            <MetaCell
              label={n.ns_period ? `NS-Name (${n.ns_period})` : "NS-Name"}
              value={n.ns_name}
            />
          )}
          <MetaCell
            label="Koordinaten"
            value={`${n.lat.toFixed(4)}, ${n.lng.toFixed(4)}`}
          />
        </div>
        {n.description && (
          <div className="article-body with-dropcap mt-6">
            {n.description.split(/\n+/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}
        <div className="mt-7">
          <SourceLink href={n.source_url} label={sourceLabel} />
        </div>
      </div>
    </article>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="akte-label" style={{ fontSize: "0.55rem" }}>
        {label}
      </span>
      <span
        className="text-[0.85rem] tabular-nums text-ink-soft"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {value}
      </span>
    </div>
  );
}

function SourceLink({
  href,
  label,
}: {
  href: string | undefined;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-paper-edge/60 pt-4">
      <span className="akte-label">Quelle</span>
      <span className="h-px flex-1 bg-paper-edge/40" />
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="akte-meta text-sepia underline decoration-sepia/40 underline-offset-2 transition-colors hover:text-ink hover:decoration-ink"
        >
          {label}
        </a>
      ) : (
        <span className="akte-meta">{label}</span>
      )}
    </div>
  );
}
