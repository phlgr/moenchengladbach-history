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

function commonsThumb(filename: string, width = 600): string {
  const safe = filename.replace(/ /g, "_");
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    safe,
  )}?width=${width}`;
}

function commonsFilePage(filename: string): string {
  const safe = filename.replace(/ /g, "_");
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(safe)}`;
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
  return (
    <article>
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

function NsOrtView({ n }: { n: NsOrt }) {
  const sourceLabel =
    n.source === "osm"
      ? "Quelle: OpenStreetMap (ODbL)"
      : n.source === "baudenkmal"
        ? "Quelle: Wikipedia (CC BY-SA 4.0)"
        : "Recherche";
  return (
    <article>
      {n.image && (
        <a
          href={n.image.startsWith("http") ? n.image : commonsFilePage(n.image)}
          target="_blank"
          rel="noreferrer"
          className="block aspect-[4/3] w-full overflow-hidden bg-sepia-light/40"
        >
          <img
            src={
              n.image.startsWith("http")
                ? n.image
                : commonsThumb(n.image, 600)
            }
            alt={n.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </a>
      )}
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
