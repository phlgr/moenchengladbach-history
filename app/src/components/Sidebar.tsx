import { useEffect, useState } from "react";

export type StolpersteinContent = {
  id: string;
  name: string;
  address: string;
  install_date: string | null;
  inscription: string;
  image: string | null;
  bio: string;
  district: string;
  source_url: string;
};

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

export function Sidebar({
  selectedId,
  onClose,
}: {
  selectedId: string | null;
  onClose: () => void;
}) {
  const [content, setContent] = useState<StolpersteinContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setContent(null);
    setError(null);
    setLoading(true);

    fetch(`/data/content/stolpersteine/${selectedId}.json`)
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
  }, [selectedId]);

  // Close on Esc
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, onClose]);

  const open = selectedId !== null;

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
          Stolperstein
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="rounded p-1 text-faded-ink transition-colors hover:bg-sepia-light/40 hover:text-ink"
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
          <div className="px-5 py-10 text-center text-sm text-faded-ink">
            Lade…
          </div>
        )}
        {error && (
          <div className="px-5 py-10 text-center text-sm text-red-oxide">
            Fehler: {error}
          </div>
        )}
        {content && (
          <article>
            {content.image && (
              <a
                href={commonsFilePage(content.image)}
                target="_blank"
                rel="noreferrer"
                className="block aspect-[4/3] w-full overflow-hidden bg-sepia-light/40"
              >
                <img
                  src={commonsThumb(content.image, 600)}
                  alt={`Stolperstein für ${content.name}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </a>
            )}
            <div className="px-5 py-5">
              <h1 className="font-serif text-xl font-bold leading-tight text-ink">
                {content.name}
              </h1>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-faded-ink">
                {content.address && <span>{content.address}</span>}
                {content.install_date && (
                  <span>Verlegt&nbsp;{content.install_date}</span>
                )}
                <span className="capitalize">
                  Stadtbezirk&nbsp;{content.district}
                </span>
              </div>

              {content.inscription && (
                <pre
                  aria-label="Inschrift"
                  className="mt-4 whitespace-pre-wrap border-l-2 border-sepia bg-[#f4efe7] p-3 font-serif text-sm leading-snug text-ink"
                >
                  {content.inscription}
                </pre>
              )}

              {content.bio && (
                <div className="mt-5 text-[15px] leading-relaxed text-ink">
                  {content.bio.split(/\n+/).map((p, i) => (
                    <p key={i} className="mb-3 last:mb-0">
                      {p}
                    </p>
                  ))}
                </div>
              )}

              <div className="mt-6 border-t border-sepia-light pt-4 text-xs text-faded-ink">
                <a
                  href={content.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sepia underline hover:text-ink"
                >
                  Quelle: Wikipedia (CC&nbsp;BY-SA&nbsp;4.0)
                </a>
              </div>
            </div>
          </article>
        )}
      </div>
    </aside>
  );
}
