import { useEffect, useRef, useState } from "react";
import { useLayerState } from "../lib/layerState";
import { useReducedMotion } from "../lib/useReducedMotion";

const START_YEAR = 1933;
const END_YEAR = 1945;
const TOTAL_MONTHS = (END_YEAR - START_YEAR + 1) * 12; // 156
const PLAY_INTERVAL_MS = 80; // ~12.5 s for the full 1933 → 1945 sweep

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

function monthIndexToDate(idx: number): string {
  const year = START_YEAR + Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-15`;
}

function dateToMonthIndex(iso: string | null): number | null {
  if (!iso) return null;
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return null;
  return (y - START_YEAR) * 12 + (m - 1);
}

function formatLong(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function Timeline() {
  const { currentDate, setCurrentDate } = useLayerState();
  const [playing, setPlaying] = useState(false);
  const reduceMotion = useReducedMotion();

  const idx = dateToMonthIndex(currentDate);

  // Header label crossfade — only on user-driven jumps. During the
  // 80 ms play loop the 150 ms animation would never finish, so we
  // pin the displayed value to the current value and skip the fade.
  const [displayedDate, setDisplayedDate] = useState<string | null>(
    currentDate,
  );
  const [fadingOutDate, setFadingOutDate] = useState<string | null>(null);
  useEffect(() => {
    if (currentDate === displayedDate) return;
    if (playing || reduceMotion) {
      setDisplayedDate(currentDate);
      setFadingOutDate(null);
      return;
    }
    setFadingOutDate(displayedDate);
    setDisplayedDate(currentDate);
    const t = window.setTimeout(() => setFadingOutDate(null), 170);
    return () => window.clearTimeout(t);
  }, [currentDate, playing, reduceMotion, displayedDate]);

  useEffect(() => {
    if (!playing) return;
    let i = idx ?? 0;
    setCurrentDate(monthIndexToDate(i));
    const tick = setInterval(() => {
      i += 1;
      if (i >= TOTAL_MONTHS) {
        clearInterval(tick);
        setPlaying(false);
        // Hold the final month for a beat, then return to "Alle".
        setTimeout(() => setCurrentDate(null), 1800);
        return;
      }
      setCurrentDate(monthIndexToDate(i));
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const showAll = currentDate === null;

  function jumpToMonth(i: number) {
    setPlaying(false);
    setCurrentDate(monthIndexToDate(i));
  }

  function reset() {
    setPlaying(false);
    setCurrentDate(null);
  }

  function togglePlay() {
    if (currentDate === null || (idx !== null && idx >= TOTAL_MONTHS - 1)) {
      setCurrentDate(monthIndexToDate(0));
    }
    setPlaying((p) => !p);
  }

  return (
    <div className="pointer-events-auto absolute bottom-6 left-1/2 z-10 w-[min(680px,calc(100%-3rem))] -translate-x-1/2">
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
            <span className="akte-label" style={{ fontSize: "0.55rem" }}>
              Zeitstrahl
            </span>
            <span
              className="akte-display tabular-nums"
              style={{
                display: "inline-grid",
                gridTemplateAreas: '"stack"',
                fontSize: "1.45rem",
                lineHeight: 1,
                color:
                  displayedDate === null
                    ? "var(--color-faded)"
                    : "var(--color-red-oxide)",
                fontWeight: 500,
                letterSpacing: "-0.005em",
              }}
            >
              {fadingOutDate && (
                <span
                  aria-hidden
                  style={{
                    gridArea: "stack",
                    pointerEvents: "none",
                    animation: "timeline-date-fade-out 150ms ease-out forwards",
                  }}
                >
                  {formatLong(fadingOutDate)}
                </span>
              )}
              <span
                key={displayedDate ?? "all"}
                style={{
                  gridArea: "stack",
                  animation: fadingOutDate
                    ? "timeline-date-fade-in 150ms ease-out forwards"
                    : undefined,
                }}
              >
                {displayedDate === null ? "—" : formatLong(displayedDate)}
              </span>
            </span>
          </div>
          <MonthScale
            current={idx}
            onJump={jumpToMonth}
            onTogglePlay={togglePlay}
            playing={playing}
            reduceMotion={reduceMotion}
          />
        </div>

        <button
          type="button"
          onClick={reset}
          aria-label="Alle Jahre zeigen"
          className={`flex shrink-0 items-center px-3 transition-colors ${
            showAll ? "text-faded-light" : "text-faded hover:text-ink"
          }`}
        >
          <span className="akte-label" style={{ fontSize: "0.6rem" }}>
            Alle
          </span>
        </button>
      </div>
    </div>
  );
}

function MonthScale({
  current,
  onJump,
  onTogglePlay,
  playing,
  reduceMotion,
}: {
  current: number | null;
  onJump: (i: number) => void;
  onTogglePlay: () => void;
  playing: boolean;
  reduceMotion: boolean;
}) {
  // The thumb and played-portion bar glide between month positions
  // during play (90 ms eases past one 80 ms tick smoothly). On a
  // direct user jump we leave a short transition so the snap doesn't
  // feel jarring; reduced motion shortens to instant.
  const positionTransition = reduceMotion
    ? "none"
    : playing
      ? "left 90ms linear, width 90ms linear"
      : "left 220ms cubic-bezier(0.2, 0.7, 0.3, 1), width 220ms cubic-bezier(0.2, 0.7, 0.3, 1)";
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const cur = current ?? 0;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowLeft":
        next = Math.max(0, cur - (e.shiftKey ? 12 : 1));
        break;
      case "ArrowRight":
        next = Math.min(TOTAL_MONTHS - 1, cur + (e.shiftKey ? 12 : 1));
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = TOTAL_MONTHS - 1;
        break;
      case " ":
      case "Spacebar":
        onTogglePlay();
        e.preventDefault();
        return;
      default:
        return;
    }
    if (next !== cur) onJump(next);
    e.preventDefault();
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const rect = target.getBoundingClientRect();
    function update(clientX: number) {
      const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const i = Math.round(t * (TOTAL_MONTHS - 1));
      onJump(i);
    }
    update(e.clientX);
    const move = (ev: PointerEvent) => update(ev.clientX);
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  return (
    <div
      className="relative mt-1.5 h-9 cursor-pointer touch-none focus:outline-none focus-visible:ring-1 focus-visible:ring-sepia"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      role="slider"
      aria-label="Zeitstrahl"
      aria-valuemin={0}
      aria-valuemax={TOTAL_MONTHS - 1}
      aria-valuenow={current ?? 0}
      aria-valuetext={
        current === null ? "Alle Jahre" : formatLong(monthIndexToDate(current))
      }
      tabIndex={0}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-4 h-px bg-paper-edge"
      />
      {/* Year tick marks (one per Jan) */}
      {Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, yi) => {
        const monthIdx = yi * 12;
        const left = (monthIdx / (TOTAL_MONTHS - 1)) * 100;
        const year = START_YEAR + yi;
        const passed = current !== null && monthIdx <= current;
        return (
          <span
            key={yi}
            aria-hidden
            className="absolute"
            style={{
              left: `${left}%`,
              transform: "translateX(-50%)",
              bottom: "12px",
            }}
          >
            <span
              className="block h-2 w-px"
              style={{
                background: passed
                  ? "var(--color-sepia)"
                  : "var(--color-paper-edge)",
              }}
            />
            <span
              className="absolute select-none whitespace-nowrap"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.55rem",
                color: passed ? "var(--color-faded)" : "var(--color-faded-light)",
                top: "-12px",
                left: "50%",
                transform: "translateX(-50%)",
              }}
            >
              {String(year).slice(2)}
            </span>
          </span>
        );
      })}
      {/* Half-year minor ticks */}
      {Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, yi) => {
        const monthIdx = yi * 12 + 6;
        if (monthIdx >= TOTAL_MONTHS) return null;
        const left = (monthIdx / (TOTAL_MONTHS - 1)) * 100;
        return (
          <span
            key={`mid-${yi}`}
            aria-hidden
            className="absolute block h-1 w-px bg-paper-edge"
            style={{
              left: `${left}%`,
              bottom: "12px",
              transform: "translateX(-50%)",
            }}
          />
        );
      })}
      {/* Played-portion bar */}
      {current !== null && (
        <span
          aria-hidden
          className="absolute bottom-[12px] left-0 h-px bg-sepia"
          style={{
            width: `${(current / (TOTAL_MONTHS - 1)) * 100}%`,
            transition: positionTransition,
          }}
        />
      )}
      {/* Current-position thumb */}
      {current !== null && (
        <span
          aria-hidden
          className="absolute bottom-[6px] h-4 w-[2px] bg-red-oxide"
          style={{
            left: `${(current / (TOTAL_MONTHS - 1)) * 100}%`,
            transform: "translateX(-50%)",
            transition: positionTransition,
            willChange: "left",
          }}
        />
      )}
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
