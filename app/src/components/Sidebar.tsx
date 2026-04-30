import { useEffect, useState } from "react";
import type { ThemeId } from "../lib/themes";

type Stone = {
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
  stones: Stone[];
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
};

export type SidebarSelection =
  | { theme: ThemeId; id: string; contentDir: string }
  | null;

function normaliseFilename(filename: string): string {
  // Strip Datei:/File: prefix (e.g. when image came from a wikitext link)
  // and normalise spaces to underscores per Commons URL convention.
  return filename
    .replace(/^(Datei|File|Image|Bild):/i, "")
    .trim()
    .replace(/ /g, "_");
}

function commonsThumb(filename: string, width = 600): string {
  // If a full URL was provided (e.g. an OSM `image` tag pointing offsite),
  // pass it through untouched.
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

const CATEGORY_ICONS: Record<string, string> = {
  destroyed_synagogue:
    // Star of David, intentionally broken-line treatment via stroke-dasharray
    "M12 2 L21 18 H3 Z M12 22 L3 6 H21 Z",
  synagogue_memorial: "M12 2 L21 18 H3 Z M12 22 L3 6 H21 Z",
  jewish_cemetery:
    // Headstone outline + base
    "M5 22 V10 a7 7 0 0114 0 V22 Z",
  jewish_site: "M5 22 V10 a7 7 0 0114 0 V22 Z",
  bunker:
    // Squat fortress
    "M3 20 V12 L7 8 H17 L21 12 V20 Z M9 20 V14 H15 V20",
  stolperschwelle:
    // Square paving stone
    "M4 6 H20 V18 H4 Z",
  perpetrator_site:
    // Crossed-out square (torch suppressed; using a "no" mark for tact)
    "M4 4 H20 V20 H4 Z M4 4 L20 20 M20 4 L4 20",
  forced_labor:
    // Barracks profile
    "M3 20 V13 L12 7 L21 13 V20 Z M9 20 V15 H15 V20",
  pow_camp_memorial: "M3 20 V13 L12 7 L21 13 V20 Z M9 20 V15 H15 V20",
  concentration_camp: "M3 20 V13 L12 7 L21 13 V20 Z M9 20 V15 H15 V20",
  resistance_memorial:
    // Flame
    "M12 2 C8 6 6 9 6 13 a6 6 0 0012 0 C18 9 16 6 12 2 Z",
  ns_victim_memorial:
    // Wreath ring
    "M12 4 a8 8 0 110 16 a8 8 0 110-16 M9 4 V20 M15 4 V20",
  ns_memorial: "M12 4 a8 8 0 110 16 a8 8 0 110-16 M9 4 V20 M15 4 V20",
  memorial_other: "M12 4 a8 8 0 110 16 a8 8 0 110-16 M9 4 V20 M15 4 V20",
  // Stolperstein placeholder: a small square stone with engraving lines
  stolperstein: "M5 5 H19 V19 H5 Z M8 9 H16 M8 12 H16 M8 15 H13",
};

function MediaPlaceholder({
  category,
  label,
}: {
  category: string;
  label: string;
}) {
  const path = CATEGORY_ICONS[category] ?? CATEGORY_ICONS["ns_memorial"];
  return (
    <div
      aria-hidden
      className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3"
      style={{
        background:
          "linear-gradient(135deg, var(--color-sepia-light) 0%, color-mix(in srgb, var(--color-sepia-light) 60%, var(--color-paper)) 100%)",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-16 w-16 text-sepia/70"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
      <div className="font-serif text-[11px] uppercase tracking-[0.18em] text-sepia/80">
        {label}
      </div>
      <div className="text-[10px] text-faded/70">Kein Foto verfügbar</div>
    </div>
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
  "ns-gedenkorte": "Gedenkort",
};

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
};

export function Sidebar({
  selection,
  onClose,
}: {
  selection: SidebarSelection;
  onClose: () => void;
}) {
  const [content, setContent] = useState<
    StolpersteinGroup | NsOrt | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    setContent(null);
    setError(null);
    setLoading(true);

    fetch(`/data/content/${selection.contentDir}/${selection.id}.json`)
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
      className={`pointer-events-auto fixed inset-y-0 right-0 z-20 flex w-full max-w-[420px] flex-col border-l border-sepia-light bg-paper shadow-2xl transition-transform duration-300 ease-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between border-b border-sepia-light px-5 py-3">
        <h2 className="font-serif text-xs uppercase tracking-widest text-sepia">
          {selection ? (THEME_LABELS[selection.theme] ?? "") : ""}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="rounded p-1 text-faded transition-colors hover:bg-sepia-light/40 hover:text-ink"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="px-5 py-10 text-center text-sm text-faded">
            Lade…
          </div>
        )}
        {error && (
          <div className="px-5 py-10 text-center text-sm text-red-oxide">
            Fehler: {error}
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
      <div className="border-b border-sepia-light bg-paper px-5 py-4">
        <h1 className="font-serif text-xl font-bold leading-tight text-ink">
          {g.address}
        </h1>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-faded">
          <span>
            {g.stones.length === 1
              ? "1 Stolperstein"
              : `${g.stones.length} Stolpersteine`}
          </span>
          {g.district && (
            <span className="capitalize">Stadtbezirk&nbsp;{g.district}</span>
          )}
        </div>
      </div>
      <ol className="divide-y divide-sepia-light/60">
        {g.stones.map((s) => (
          <li key={s.id} className="px-5 py-5">
            <div className="flex gap-4">
              {s.image && (
                <a
                  href={commonsFilePage(s.image)}
                  target="_blank"
                  rel="noreferrer"
                  className="block h-28 w-28 shrink-0 overflow-hidden rounded bg-sepia-light/40"
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
                <h2 className="font-serif text-base font-bold leading-tight text-ink">
                  {s.name}
                </h2>
                {s.install_date && (
                  <div className="mt-0.5 text-[11px] text-faded">
                    Verlegt&nbsp;{s.install_date}
                  </div>
                )}
                {s.inscription && (
                  <pre
                    aria-label="Inschrift"
                    className="mt-2 whitespace-pre-wrap border-l-2 border-sepia bg-[#f4efe7] p-2 font-serif text-[12px] leading-snug text-ink"
                  >
                    {s.inscription}
                  </pre>
                )}
              </div>
            </div>
            {s.bio && (
              <div className="article-body mt-3 text-[14px] text-ink">
                {s.bio.split(/\n+/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="px-5 py-4">
        <SourceLink href={g.source_url} />
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
      className="block aspect-[4/3] w-full overflow-hidden bg-sepia-light/40"
    >
      <img
        src={commonsThumb(image, 600)}
        alt={alt}
        loading="lazy"
        onError={() => setErrored(true)}
        className="h-full w-full object-cover"
      />
    </a>
  );
}

function NsOrtView({ n }: { n: NsOrt }) {
  const sourceLabel =
    n.source === "osm"
      ? "Quelle: OpenStreetMap (ODbL)"
      : n.source === "baudenkmal"
        ? "Quelle: Wikipedia (CC BY-SA 4.0)"
        : n.source === "wikipedia-narrative"
          ? "Quelle: Wikipedia (CC BY-SA 4.0)"
          : "Recherche";
  const categoryLabel = NS_CATEGORY_LABELS[n.category] ?? n.category;
  return (
    <article>
      <HeaderMedia
        image={n.image}
        alt={n.name}
        category={n.category}
        label={categoryLabel}
      />
      <div className="px-5 py-5">
        <div className="text-[10px] uppercase tracking-widest text-sepia">
          {NS_CATEGORY_LABELS[n.category] ?? n.category}
        </div>
        <h1 className="mt-1 font-serif text-xl font-bold leading-tight text-ink">
          {n.name}
        </h1>
        {n.address && (
          <div className="mt-1 text-sm text-faded">{n.address}</div>
        )}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-faded">
          {n.ortsteil && <span>{n.ortsteil}</span>}
          {n.build_date && <span>Bauzeit:&nbsp;{n.build_date}</span>}
          {n.denkmal_nummer && (
            <span>Denkmal-Nr.&nbsp;{n.denkmal_nummer}</span>
          )}
        </div>
        {n.description && (
          <div className="article-body mt-5 text-[15px] text-ink">
            {n.description.split(/\n+/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}
        <div className="mt-6 border-t border-sepia-light pt-4 text-xs text-faded">
          {n.source_url ? (
            <a
              href={n.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-sepia underline hover:text-ink"
            >
              {sourceLabel}
            </a>
          ) : (
            <span>{sourceLabel}</span>
          )}
        </div>
      </div>
    </article>
  );
}

function SourceLink({ href }: { href: string }) {
  return (
    <div className="mt-6 border-t border-sepia-light pt-4 text-xs text-faded">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-sepia underline hover:text-ink"
      >
        Quelle: Wikipedia (CC&nbsp;BY-SA&nbsp;4.0)
      </a>
    </div>
  );
}
