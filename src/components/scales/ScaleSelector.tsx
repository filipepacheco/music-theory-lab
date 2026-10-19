import { useAppStore } from "@/store/useAppStore";
import { SCALE_PATTERNS } from "@/constants/scales";
import Select from "@/components/shared/Select";

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
      <div className="lh-field min-w-0 max-w-full">
        <label htmlFor="scale-select" className="lh-label shrink-0">
          Escala
        </label>
        <Select
          id="scale-select"
          value={selectedScaleId ?? ""}
          onChange={(e) => selectScale(e.target.value || null)}
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
        </Select>
      </div>

      <div className="lh-field min-w-0 max-w-full">
        <label htmlFor="comparison-scale-select" className="lh-label shrink-0">
          Comparar com
        </label>
        <Select
          id="comparison-scale-select"
          value={comparisonScaleId ?? ""}
          onChange={(e) => setComparisonScale(e.target.value || null)}
          disabled={!selectedScaleId}
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
        </Select>
      </div>
    </div>
  );
}
