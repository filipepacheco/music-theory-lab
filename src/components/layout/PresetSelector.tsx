import { useAppStore } from "@/store/useAppStore";
import { TONE_PRESETS } from "@/constants/tonePresets";
import Select from "@/components/shared/Select";

export default function PresetSelector() {
  const activePresetId = useAppStore((s) => s.activePresetId);
  const setActivePresetId = useAppStore((s) => s.setActivePresetId);

  return (
    <div className="lh-field min-w-0">
      <label htmlFor="preset-select" className="lh-label hidden sm:inline">
        Timbre
      </label>
      <Select
        id="preset-select"
        aria-label="Timbre"
        value={activePresetId}
        onChange={(e) => setActivePresetId(e.target.value)}
      >
        {TONE_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
