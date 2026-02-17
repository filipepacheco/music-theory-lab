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
    <div className="flex items-center gap-4 px-4 sm:px-6 lg:px-8 py-3 bg-bg-secondary border-b border-border-default flex-wrap">
      <div className="flex items-center gap-3 w-full">
        <div className="flex items-center gap-3">
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

          <div className="flex rounded-md overflow-hidden border border-border-default">
            <button
              onClick={() => setIsMinor(false)}
              className={`px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                !isMinor
                  ? "bg-accent text-white"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
              }`}
            >
              Maior
            </button>
            <button
              onClick={() => setIsMinor(true)}
              className={`px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                isMinor
                  ? "bg-accent text-white"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
              }`}
            >
              Menor
            </button>
          </div>
        </div>

        <div className="w-px h-8 bg-border-default hidden sm:block" />

        <PresetSelector />

        <div className="flex-1" />

        <MetronomeControl />
      </div>
    </div>
  );
}
