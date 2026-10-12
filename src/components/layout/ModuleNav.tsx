import { useAppStore } from "@/store/useAppStore";
import type { ActiveModule } from "@/types";

const MODULES: { id: ActiveModule; label: string; devOnly?: boolean }[] = [
  { id: "harmonicField", label: "Campo Harmônico" },
  { id: "progressions", label: "Progressões" },
  { id: "scales", label: "Escalas" },
  { id: "quiz", label: "Quiz" },
  { id: "transcription", label: "Transcrição" },
  { id: "structure", label: "Estrutura" },
  { id: "library", label: "Biblioteca" },
  // Drives a service that only ever runs on the developer's machine, and the
  // deployed site is public: a working upload box there would let anyone push
  // audio into a public static export. Never shipped.
  { id: "analyze", label: "Analisar", devOnly: true },
];

const VISIBLE_MODULES = MODULES.filter(
  (mod) => !mod.devOnly || import.meta.env.DEV,
);

export default function ModuleNav() {
  const activeModule = useAppStore((s) => s.activeModule);
  const setActiveModule = useAppStore((s) => s.setActiveModule);

  return (
    <nav
      className="lh-tabs overflow-x-auto scrollbar-none max-w-full"
      aria-label="Módulos"
    >
      {VISIBLE_MODULES.map((mod) => {
        const isActive = activeModule === mod.id;
        return (
          <button
            key={mod.id}
            onClick={() => setActiveModule(mod.id)}
            aria-current={isActive ? "page" : undefined}
            className="lh-tab shrink-0"
          >
            {mod.label}
          </button>
        );
      })}
    </nav>
  );
}
