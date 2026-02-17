import { useAppStore } from "@/store/useAppStore";
import { SCALE_PATTERNS } from "@/constants/scales";

const SCALE_GROUPS: { label: string; ids: string[] }[] = [
  {
    label: "Modos Gregos",
    ids: [
      "major",
      "dorian",
      "phrygian",
      "lydian",
      "mixolydian",
      "aeolian",
      "locrian",
    ],
  },
  {
    label: "Pentatonicas e Blues",
    ids: ["pentatonicMajor", "pentatonicMinor", "blues", "bluesMajor"],
  },
  {
    label: "Simetricas",
    ids: ["wholeTone", "dimWH", "dimHW"],
  },
  {
    label: "Bebop",
    ids: ["bebopDominant", "bebopMajor"],
  },
  {
    label: "Outras",
    ids: ["harmonicMinor", "melodicMinor", "harmonicMajor", "hungarianMinor"],
  },
];

export default function ScaleSelector() {
  const selectedScaleId = useAppStore((s) => s.selectedScaleId);
  const comparisonScaleId = useAppStore((s) => s.comparisonScaleId);
  const selectScale = useAppStore((s) => s.selectScale);
  const setComparisonScale = useAppStore((s) => s.setComparisonScale);

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <label htmlFor="scale-select" className="text-sm text-text-secondary">Escala:</label>
        <select
          id="scale-select"
          value={selectedScaleId ?? ""}
          onChange={(e) => selectScale(e.target.value || null)}
          className="bg-bg-tertiary text-text-primary border border-border-default rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-border-focus focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
        >
          <option value="">Selecione...</option>
          {SCALE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.ids.map((id) => (
                <option key={id} value={id}>
                  {SCALE_PATTERNS[id].label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="comparison-scale-select" className="text-sm text-text-secondary">Comparar com:</label>
        <select
          id="comparison-scale-select"
          value={comparisonScaleId ?? ""}
          onChange={(e) => setComparisonScale(e.target.value || null)}
          disabled={!selectedScaleId}
          className="bg-bg-tertiary text-text-primary border border-border-default rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-border-focus focus-visible:ring-2 focus-visible:ring-accent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">Nenhuma</option>
          {SCALE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.ids
                .filter((id) => id !== selectedScaleId)
                .map((id) => (
                  <option key={id} value={id}>
                    {SCALE_PATTERNS[id].label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}
