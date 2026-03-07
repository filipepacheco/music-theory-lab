import { useAppStore } from "@/store/useAppStore";
import type { ActiveModule } from "@/types";

const MODULES: { id: ActiveModule; label: string }[] = [
  { id: "harmonicField", label: "Campo Harmonico" },
  { id: "progressions", label: "Progressoes" },
  { id: "scales", label: "Escalas" },
  { id: "quiz", label: "Quiz" },
  { id: "transcription", label: "Transcricao" },
  { id: "structure", label: "Estrutura" },
];

export default function ModuleNav() {
  const activeModule = useAppStore((s) => s.activeModule);
  const setActiveModule = useAppStore((s) => s.setActiveModule);

  return (
    <nav
      className="flex gap-0.5 rounded-lg p-0.5 overflow-x-auto scrollbar-none min-w-0 max-w-full"
      style={{ backgroundColor: "rgba(37,43,59,0.5)" }}
      role="navigation"
      aria-label="Modulos"
    >
      {MODULES.map((mod) => {
        const isActive = activeModule === mod.id;
        return (
          <button
            key={mod.id}
            onClick={() => setActiveModule(mod.id)}
            aria-current={isActive ? "page" : undefined}
            className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-[13px] font-medium transition-all cursor-pointer shrink-0 whitespace-nowrap ${
              isActive
                ? "text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
            style={isActive ? { backgroundColor: "#1E2433", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" } : undefined}
          >
            {mod.label}
          </button>
        );
      })}
    </nav>
  );
}
