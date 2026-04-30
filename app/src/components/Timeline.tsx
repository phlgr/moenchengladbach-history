import { useEffect, useRef, useState } from "react";
import { useLayerState } from "../lib/layerState";

const START = 1933;
const END = 1945;
const YEARS = END - START + 1;
const PLAY_INTERVAL_MS = 750;

export function Timeline() {
  const { currentYear, setCurrentYear } = useLayerState();
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  // Auto-advance year while playing
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setCurrentYear(currentYear === null ? START : currentYear);
    }, 0);
    clearInterval(id);

    let y = currentYear ?? START;
    setCurrentYear(y);
    const tick = setInterval(() => {
      y += 1;
      if (y > END) {
        clearInterval(tick);
        setPlaying(false);
        // Hold the final year for a beat, then return to "Alle" so the
        // clustering re-engages and the user sees the full picture again.
        setTimeout(() => setCurrentYear(null), 1600);
        return;
      }
      setCurrentYear(y);
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const showAll = currentYear === null;

  function jumpTo(year: number) {
    setPlaying(false);
    setCurrentYear(year);
  }

  function reset() {
    setPlaying(false);
    setCurrentYear(null);
  }

  function togglePlay() {
    if (currentYear === null || currentYear >= END) {
      setCurrentYear(START);
    }
    setPlaying((p) => !p);
  }

  return (
    <div className="pointer-events-auto absolute bottom-6 left-1/2 z-10 w-[min(640px,calc(100%-3rem))] -translate-x-1/2">
      <div className="akte-grain akte-reveal relative flex items-stretch gap-3 border border-paper-edge bg-paper-light/95 px-4 py-2.5 shadow-[0_1px_0_rgba(28,24,20,0.05),0_8px_28px_rgba(28,24,20,0.10)] backdrop-blur-sm">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Abspielen"}
          className={`flex h-9 w-9 shrink-0 items-center justify-center border transition-colors ${
            playing
              ? "border-red-oxide bg-red-oxide/10 text-red-oxide"
              : "border-paper-edge bg-paper text-ink hover:border-sepia hover:text-sepia"
          }`}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>

        <div className="flex flex-1 flex-col">
          <div className="flex items-baseline justify-between">
            <span
              className="akte-label"
              style={{ fontSize: "0.55rem" }}
            >
              Zeitstrahl
            </span>
            <span
              className="akte-display tabular-nums"
              style={{
                fontSize: "1.6rem",
                lineHeight: 1,
                color: showAll
                  ? "var(--color-faded)"
                  : "var(--color-red-oxide)",
                fontWeight: 500,
                letterSpacing: "-0.01em",
              }}
            >
              {showAll ? "—" : currentYear}
            </span>
          </div>
          <YearScale
            current={currentYear}
            onChange={jumpTo}
          />
        </div>

        <button
          type="button"
          onClick={reset}
          aria-label="Alle Jahre zeigen"
          className={`flex shrink-0 items-center px-3 transition-colors ${
            showAll
              ? "text-faded-light"
              : "text-faded hover:text-ink"
          }`}
        >
          <span
            className="akte-label"
            style={{ fontSize: "0.6rem" }}
          >
            Alle
          </span>
        </button>
      </div>
    </div>
  );
}

function YearScale({
  current,
  onChange,
}: {
  current: number | null;
  onChange: (y: number) => void;
}) {
  return (
    <div className="relative mt-1.5 flex h-8 items-end">
      {/* Track */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-3 h-px bg-paper-edge"
      />
      {Array.from({ length: YEARS }, (_, i) => {
        const year = START + i;
        const active = current !== null && year <= current;
        const isCurrent = current === year;
        return (
          <button
            key={year}
            type="button"
            onClick={() => onChange(year)}
            aria-label={`Jahr ${year}`}
            className="group relative flex flex-1 cursor-pointer flex-col items-center justify-end"
            style={{ minWidth: 0 }}
          >
            <span
              aria-hidden
              className={`block h-2 w-px transition-all ${
                isCurrent
                  ? "h-4 bg-red-oxide"
                  : active
                    ? "bg-sepia"
                    : "bg-paper-edge"
              }`}
            />
            <span
              aria-hidden
              className={`absolute -bottom-3 mt-0.5 select-none transition-opacity ${
                isCurrent || year % 2 === 1
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100"
              }`}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: isCurrent ? "0.62rem" : "0.55rem",
                color: isCurrent
                  ? "var(--color-red-oxide)"
                  : active
                    ? "var(--color-faded)"
                    : "var(--color-faded-light)",
                fontWeight: isCurrent ? 500 : 400,
              }}
            >
              {String(year).slice(2)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M7 5 V19 L19 12 Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="5" width="4" height="14" />
    </svg>
  );
}
