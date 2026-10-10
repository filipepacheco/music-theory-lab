import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import type { ActiveModule } from "@/types";

/* 20x20 icons. They take the colour of the tab, so they invert with it. */
function IconCampo() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2" y="4" width="16" height="12" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 10V16M10 8V16M14 6V16" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconProgr() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M4 10h3l2-5 2 10 2-5h3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconEscalas() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 3v7l4 4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconQuiz() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 3l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconMais() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M4 5h12M4 10h12M4 15h8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

const TAB_CLASS = "lh-tab flex-1 flex-col justify-center gap-1 py-2 text-label uppercase";

const MAIN_TABS: { id: ActiveModule; label: string; Icon: typeof IconCampo }[] = [
  { id: "harmonicField", label: "Campo", Icon: IconCampo },
  { id: "progressions", label: "Progr.", Icon: IconProgr },
  { id: "scales", label: "Escalas", Icon: IconEscalas },
  { id: "quiz", label: "Quiz", Icon: IconQuiz },
];

const MORE_TABS: { id: ActiveModule; label: string }[] = [
  { id: "transcription", label: "Transcrição" },
  { id: "structure", label: "Estrutura" },
  { id: "library", label: "Biblioteca" },
];

export default function BottomNav() {
  const activeModule = useAppStore((s) => s.activeModule);
  const setActiveModule = useAppStore((s) => s.setActiveModule);
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = MORE_TABS.some((t) => t.id === activeModule);

  return (
    <>
      {/* More menu overlay */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 sm:hidden"
            onClick={() => setMoreOpen(false)}
          >
            <div className="absolute inset-0 bg-scrim" />
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="lh-dialog absolute bottom-24 left-4 right-4 w-auto flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {MORE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveModule(tab.id);
                    setMoreOpen(false);
                  }}
                  aria-current={activeModule === tab.id ? "page" : undefined}
                  className="lh-tab w-full py-3"
                >
                  {tab.label}
                </button>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav
        className="fixed bottom-0 inset-x-0 z-50 sm:hidden flex items-stretch border-t border-border-default bg-bg-secondary pb-7"
        aria-label="Navegação principal"
      >
        {MAIN_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveModule(tab.id);
              setMoreOpen(false);
            }}
            aria-current={activeModule === tab.id ? "page" : undefined}
            className={TAB_CLASS}
          >
            <tab.Icon />
            <span>{tab.label}</span>
          </button>
        ))}

        <button
          onClick={() => setMoreOpen(!moreOpen)}
          aria-expanded={moreOpen}
          aria-current={isMoreActive ? "page" : undefined}
          className={TAB_CLASS}
        >
          <IconMais />
          <span>Mais</span>
        </button>
      </nav>
    </>
  );
}
