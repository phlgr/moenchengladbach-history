import { createFileRoute } from "@tanstack/react-router";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapView } from "../components/MapView";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4">
        <div className="pointer-events-auto rounded border border-sepia-light bg-paper/95 px-4 py-2 shadow">
          <h1 className="font-serif text-lg font-bold text-ink">
            Mönchengladbach History
          </h1>
          <p className="text-xs text-faded-ink">
            Stolpersteine — eine offene, interaktive Karte
          </p>
        </div>
      </header>
      <MapView />
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-end p-2">
        <div className="pointer-events-auto rounded border border-sepia-light bg-paper/90 px-2 py-1 text-[10px] text-faded-ink">
          Daten:{" "}
          <a
            href="https://de.wikipedia.org/wiki/Liste_der_Stolpersteine_in_M%C3%B6nchengladbach"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Wikipedia
          </a>{" "}
          (CC&nbsp;BY-SA&nbsp;4.0) · Karte © OpenStreetMap-Mitwirkende
        </div>
      </footer>
    </main>
  );
}
