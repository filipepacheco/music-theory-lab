import { useAppStore } from "@/store/useAppStore";
import { NOTE_NAMES } from "@/constants/notes";
import { getPreferredRootName } from "@/utils/noteHelpers";
import PresetSelector from "./PresetSelector";
import MetronomeControl from "@/components/shared/MetronomeControl";
import Segmented from "@/components/shared/Segmented";
import Select from "@/components/shared/Select";

export default function KeySelector() {
  const rootNote = useAppStore((s) => s.rootNote);
  const isMinor = useAppStore((s) => s.isMinor);
  const setRootNote = useAppStore((s) => s.setRootNote);
  const setIsMinor = useAppStore((s) => s.setIsMinor);

  return (
    <div className="flex items-center px-4 sm:px-6 lg:px-8 py-2 border-b border-border-default bg-bg-primary">
      <div className="flex items-center gap-2 sm:gap-4 w-full min-w-0 sm:flex-wrap">
        <div className="lh-field">
          <span className="lh-label">Tom</span>

          {/* Desktop: sharp names */}
          <Select
            id="root-note-select"
            className="hidden sm:inline-flex"
            value={rootNote}
            onChange={(e) => setRootNote(Number(e.target.value))}
            aria-label="Tonalidade"
          >
            {NOTE_NAMES.map((name, idx) => (
              <option key={name} value={idx}>
                {name}
              </option>
            ))}
          </Select>

          {/* Mobile: the name the key prefers */}
          <Select
            className="sm:hidden"
            value={rootNote}
            onChange={(e) => setRootNote(Number(e.target.value))}
            aria-label="Tonalidade"
          >
            {NOTE_NAMES.map((name, idx) => (
              <option key={name} value={idx}>
                {getPreferredRootName(idx)}
              </option>
            ))}
          </Select>
        </div>

        <Segmented
          label="Modo"
          value={isMinor ? "minor" : "major"}
          onChange={(mode) => setIsMinor(mode === "minor")}
          options={[
            { value: "major", label: "Maior" },
            { value: "minor", label: "Menor" },
          ]}
        />

        {/* Desktop: divider */}
        <div className="w-px h-6 bg-border-default hidden sm:block" />

        {/* Preset selector - on mobile pushed right via ml-auto */}
        <div className="ml-auto sm:ml-0 min-w-0">
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
