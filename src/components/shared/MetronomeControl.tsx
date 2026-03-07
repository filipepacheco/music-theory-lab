import { useMetronome } from "@/hooks/useMetronome";
import { useAppStore } from "@/store/useAppStore";

export default function MetronomeControl() {
  const { toggle, isMetronomeOn } = useMetronome();
  const bpm = useAppStore((s) => s.bpm);
  const setBpm = useAppStore((s) => s.setBpm);
  const currentBeat = useAppStore((s) => s.currentBeat);

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <button
        onClick={toggle}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer border ${
          isMetronomeOn
            ? "border-accent bg-accent/15 text-accent"
            : "border-border-default bg-bg-tertiary text-text-secondary hover:text-text-primary"
        }`}
      >
        {/* Beat dots */}
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-75 ${
                isMetronomeOn && currentBeat === i
                  ? i === 0
                    ? "bg-accent"
                    : "bg-text-primary"
                  : "bg-text-muted/40"
              }`}
            />
          ))}
        </div>
        <span className="hidden sm:inline">{isMetronomeOn ? "Parar" : "Metronomo"}</span>
        <span className="sm:hidden">{isMetronomeOn ? "Stop" : "BPM"}</span>
      </button>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setBpm(Math.max(40, bpm - 5))}
          aria-label="Diminuir BPM"
          className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg bg-bg-tertiary text-text-secondary hover:text-text-primary text-sm cursor-pointer border border-border-default"
        >
          -
        </button>
        <span className="text-xs font-mono text-text-secondary w-12 sm:w-14 text-center">
          {bpm} bpm
        </span>
        <button
          onClick={() => setBpm(Math.min(200, bpm + 5))}
          aria-label="Aumentar BPM"
          className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg bg-bg-tertiary text-text-secondary hover:text-text-primary text-sm cursor-pointer border border-border-default"
        >
          +
        </button>
      </div>
    </div>
  );
}
