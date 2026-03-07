import ModuleNav from "./ModuleNav";
import { useAppStore } from "@/store/useAppStore";

export default function Header() {
  const bpm = useAppStore((s) => s.bpm);

  return (
    <header className="sticky top-0 z-30 flex items-center px-4 sm:px-6 lg:px-8 py-3 border-b border-border-default bg-bg-secondary/80 backdrop-blur-sm">
      <div className="flex items-center gap-4 w-full min-w-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-accent flex items-center justify-center text-white font-heading text-sm font-bold shrink-0">
            M
          </span>
          <h1 className="font-heading text-[15px] sm:text-base text-text-primary font-semibold tracking-tight leading-tight">
            Music Theory Lab
          </h1>
        </div>

        {/* Desktop: full module nav */}
        <div className="flex-1 min-w-0 justify-end hidden sm:flex">
          <ModuleNav />
        </div>

        {/* Mobile: BPM indicator */}
        <div className="flex-1 flex justify-end sm:hidden">
          <div className="flex items-center gap-1.5 text-text-muted">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-xs font-mono">{bpm} bpm</span>
          </div>
        </div>
      </div>
    </header>
  );
}
