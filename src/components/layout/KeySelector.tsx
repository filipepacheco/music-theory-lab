import { useAppStore } from "@/store/useAppStore";
import { NOTE_NAMES } from "@/constants/notes";
import PresetSelector from "./PresetSelector";
import MetronomeControl from "@/components/shared/MetronomeControl";

export default function KeySelector() {
  const rootNote = useAppStore((s) => s.rootNote);
  const isMinor = useAppStore((s) => s.isMinor);
  const setRootNote = useAppStore((s) => s.setRootNote);
  const setIsMinor = useAppStore((s) => s.setIsMinor);

  return (
    <div className="flex items-center gap-2 sm:gap-4 px-4 sm:px-6 lg:px-8 py-2 sm:py-3 bg-bg-secondary border-b border-border-default flex-wrap">
      <div className="flex items-center gap-2 sm:gap-3 w-full min-w-0 flex-wrap">
        {/* Desktop: label + select */}
        <div className="hidden sm:flex items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-text-muted font-medium">
            Tom
          </span>

          <select
            id="root-note-select"
            value={rootNote}
            onChange={(e) => setRootNote(Number(e.target.value))}
            aria-label="Tonalidade"
            className="bg-bg-tertiary text-text-primary border border-border-default rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-border-focus focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
          >
            {NOTE_NAMES.map((name, idx) => (
              <option key={name} value={idx}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* Mobile: compact "Tom C" pill */}
        <div className="flex sm:hidden items-center">
          <div className="flex items-center bg-bg-tertiary border border-border-default rounded-lg overflow-hidden">
            <span className="text-xs text-text-muted font-medium pl-2.5 pr-1">Tom</span>
            <select
              value={rootNote}
              onChange={(e) => setRootNote(Number(e.target.value))}
              aria-label="Tonalidade"
              className="bg-transparent text-text-primary py-1.5 pr-2.5 text-sm font-mono focus:outline-none cursor-pointer appearance-none"
            >
              {NOTE_NAMES.map((name, idx) => (
                <option key={name} value={idx}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Mode toggle - shared but with responsive sizing */}
        <div className="flex rounded-lg overflow-hidden border border-border-default">
          <button
            onClick={() => setIsMinor(false)}
            className={`px-2.5 sm:px-3 py-1.5 sm:py-2 text-sm font-medium transition-colors cursor-pointer ${
              !isMinor
                ? "bg-accent text-white"
                : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
            }`}
          >
            Maior
          </button>
          <button
            onClick={() => setIsMinor(true)}
            className={`px-2.5 sm:px-3 py-1.5 sm:py-2 text-sm font-medium transition-colors cursor-pointer ${
              isMinor
                ? "bg-accent text-white"
                : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
            }`}
          >
            Menor
          </button>
        </div>

        {/* Desktop: divider */}
        <div className="w-px h-8 bg-border-default hidden sm:block" />

        {/* Preset selector - on mobile pushed right via ml-auto */}
        <div className="ml-auto sm:ml-0">
          <PresetSelector />
        </div>

        {/* Desktop spacer + metronome */}
        <div className="flex-1 hidden sm:block" />
        <div className="hidden sm:flex">
          <MetronomeControl />
        </div>
      </div>
    </div>
  );
}
