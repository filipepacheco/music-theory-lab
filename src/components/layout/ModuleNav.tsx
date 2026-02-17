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
      className="flex gap-0.5 bg-bg-tertiary/50 rounded-lg p-0.5"
      role="navigation"
      aria-label="Modulos"
    >
      {MODULES.map((mod) => (
        <button
          key={mod.id}
          onClick={() => setActiveModule(mod.id)}
          aria-current={activeModule === mod.id ? "page" : undefined}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
            activeModule === mod.id
              ? "bg-bg-card text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          {mod.label}
        </button>
      ))}
    </nav>
  );
}
