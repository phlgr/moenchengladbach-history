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
          <p className="text-xs text-faded">
            Stolpersteine — eine offene, interaktive Karte
          </p>
        </div>
      </header>
      <MapView />
    </main>
  );
}
