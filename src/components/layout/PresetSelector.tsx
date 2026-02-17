import { useAppStore } from "@/store/useAppStore";
import { TONE_PRESETS } from "@/constants/tonePresets";

export default function PresetSelector() {
  const activePresetId = useAppStore((s) => s.activePresetId);
  const setActivePresetId = useAppStore((s) => s.setActivePresetId);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="preset-select" className="text-sm text-text-secondary">Timbre:</label>
      <select
        id="preset-select"
        value={activePresetId}
        onChange={(e) => setActivePresetId(e.target.value)}
        className="bg-bg-tertiary text-text-primary border border-border-default rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-border-focus focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
      >
        {TONE_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>
    </div>
  );
}
