interface NoteIndicatorProps {
  noteName: string;
  color: string;
  size?: "sm" | "md" | "lg";
}

export default function NoteIndicator({
  noteName,
  color,
  size = "sm",
}: NoteIndicatorProps) {
  const sizeClasses =
    size === "sm"
      ? "w-5 h-5 text-[10px]"
      : size === "md"
        ? "w-6 h-6 text-xs"
        : "w-7 h-7 text-xs";

  return (
    <span
      className={`${sizeClasses} rounded-full flex items-center justify-center font-mono font-bold text-bg-primary shrink-0`}
      style={{ backgroundColor: color }}
    >
      {noteName}
    </span>
  );
}
