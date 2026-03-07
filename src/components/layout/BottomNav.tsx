import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import type { ActiveModule } from "@/types";

/* SVG icons from Paper mockup (20x20 viewBox) */
function IconCampo({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="4" width="16" height="12" rx="2" stroke={color} strokeWidth="1.5" />
      <path d="M6 10V16M10 8V16M14 6V16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconProgr({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h3l2-5 2 10 2-5h3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconEscalas({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7" stroke={color} strokeWidth="1.5" />
      <path d="M10 3v7l4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconQuiz({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 3l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconMais({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 5h12M4 10h12M4 15h8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const ACTIVE_COLOR = "#3B82F6";
const INACTIVE_COLOR = "#64748B";

const MAIN_TABS: { id: ActiveModule; label: string; Icon: typeof IconCampo }[] = [
  { id: "harmonicField", label: "Campo", Icon: IconCampo },
  { id: "progressions", label: "Progr.", Icon: IconProgr },
  { id: "scales", label: "Escalas", Icon: IconEscalas },
  { id: "quiz", label: "Quiz", Icon: IconQuiz },
];

const MORE_TABS: { id: ActiveModule; label: string }[] = [
  { id: "transcription", label: "Transcricao" },
  { id: "structure", label: "Estrutura" },
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
            <div className="absolute inset-0 bg-black/40" />
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-20 left-4 right-4 bg-[#161B28] border border-white/10 rounded-xl p-2 flex flex-col gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {MORE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveModule(tab.id);
                    setMoreOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    activeModule === tab.id
                      ? "bg-[#3B82F6]/15 text-[#3B82F6]"
                      : "text-[#94A3B8] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom navigation bar - matches Paper X5-0 */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 sm:hidden flex items-center justify-around"
        style={{
          backgroundColor: "#161B28",
          borderTop: "1px solid #2D3548",
          paddingTop: 8,
          paddingBottom: 28,
          paddingLeft: 8,
          paddingRight: 8,
        }}
        role="navigation"
        aria-label="Navegacao principal"
      >
        {MAIN_TABS.map((tab) => {
          const isActive = activeModule === tab.id;
          const color = isActive ? ACTIVE_COLOR : INACTIVE_COLOR;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveModule(tab.id);
                setMoreOpen(false);
              }}
              className="flex flex-col items-center cursor-pointer"
              style={{ gap: 3, paddingBlock: 4, paddingInline: 8 }}
            >
              <tab.Icon color={color} />
              <span
                className="text-[10px] leading-3"
                style={{ color, fontWeight: isActive ? 600 : 500 }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          className="flex flex-col items-center cursor-pointer"
          style={{ gap: 3, paddingBlock: 4, paddingInline: 8 }}
        >
          <IconMais color={isMoreActive || moreOpen ? ACTIVE_COLOR : INACTIVE_COLOR} />
          <span
            className="text-[10px] leading-3"
            style={{
              color: isMoreActive || moreOpen ? ACTIVE_COLOR : INACTIVE_COLOR,
              fontWeight: isMoreActive || moreOpen ? 600 : 500,
            }}
          >
            Mais
          </span>
        </button>
      </nav>
    </>
  );
}
