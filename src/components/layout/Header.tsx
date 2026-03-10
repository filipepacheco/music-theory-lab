import ModuleNav from "./ModuleNav";
import { useAppStore } from "@/store/useAppStore";

export default function Header() {
  const bpm = useAppStore((s) => s.bpm);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

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

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer shrink-0"
          aria-label={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4.5 h-4.5">
              <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.06 1.06l1.06 1.06ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.06a.75.75 0 1 0-1.06 1.06l1.06 1.06Z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4.5 h-4.5">
              <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
