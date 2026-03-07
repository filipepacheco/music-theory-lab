import { useAppStore } from "@/store/useAppStore";
import { TONE_PRESETS } from "@/constants/tonePresets";

export default function PresetSelector() {
  const activePresetId = useAppStore((s) => s.activePresetId);
  const setActivePresetId = useAppStore((s) => s.setActivePresetId);

  return (
    <div className="flex items-center gap-2">
      {/* Desktop: label + standard select */}
      <label htmlFor="preset-select" className="text-sm text-text-secondary hidden sm:inline">
        Timbre:
      </label>
      <select
        id="preset-select"
        value={activePresetId}
        onChange={(e) => setActivePresetId(e.target.value)}
        className="hidden sm:block bg-bg-tertiary text-text-primary border border-border-default rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-border-focus focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
      >
        {TONE_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>

      {/* Mobile: compact pill-style select */}
      <div className="relative sm:hidden">
        <select
          value={activePresetId}
          onChange={(e) => setActivePresetId(e.target.value)}
          className="appearance-none bg-transparent text-text-secondary text-xs font-mono pr-4 cursor-pointer focus:outline-none"
        >
          {TONE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <svg
          className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
}
