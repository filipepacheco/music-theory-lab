interface SpeedControlProps {
  percent: number;
  onChange: (p: number) => void;
  originalBpm: number;
}

export default function SpeedControl({
  percent,
  onChange,
  originalBpm,
}: SpeedControlProps) {
  const effectiveBpm = Math.round((originalBpm * percent) / 100);

  const handleChange = (value: number) => {
    // Snap to increments of 5
    const snapped = Math.round(value / 5) * 5;
    onChange(Math.max(50, Math.min(150, snapped)));
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-text-muted whitespace-nowrap">
        Velocidade
      </span>
      <input
        type="range"
        min={50}
        max={150}
        step={5}
        value={percent}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="flex-1 h-1 bg-bg-tertiary rounded-full appearance-none cursor-pointer accent-accent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
      />
      <span className="text-xs font-mono text-text-secondary min-w-[80px] text-right">
        {percent}% ({effectiveBpm} bpm)
      </span>
    </div>
  );
}
