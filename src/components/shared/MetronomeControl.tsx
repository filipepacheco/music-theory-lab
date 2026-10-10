import { useMetronome } from "@/hooks/useMetronome";
import { useAppStore } from "@/store/useAppStore";
import Button from "@/components/shared/Button";

export default function MetronomeControl() {
  const { toggle, isMetronomeOn } = useMetronome();
  const bpm = useAppStore((s) => s.bpm);
  const setBpm = useAppStore((s) => s.setBpm);
  const currentBeat = useAppStore((s) => s.currentBeat);

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <Button onClick={toggle} pressed={isMetronomeOn} live={isMetronomeOn}>
        <span className="lh-pips mr-[1ch]" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`lh-pip ${
                isMetronomeOn && currentBeat === i ? "is-active" : ""
              }`}
            />
          ))}
        </span>
        <span className="hidden sm:inline">
          {isMetronomeOn ? "Parar" : "Metrônomo"}
        </span>
        <span className="sm:hidden">{isMetronomeOn ? "Stop" : "BPM"}</span>
      </Button>

      <div className="flex items-center">
        <Button
          onClick={() => setBpm(Math.max(40, bpm - 5))}
          aria-label="Diminuir BPM"
        >
          -
        </Button>
        <span className="w-[7ch] text-center text-meta text-text-secondary">
          {bpm} bpm
        </span>
        <Button
          onClick={() => setBpm(Math.min(200, bpm + 5))}
          aria-label="Aumentar BPM"
        >
          +
        </Button>
      </div>
    </div>
  );
}
