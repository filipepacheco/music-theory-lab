import ModuleNav from "./ModuleNav";

export default function Header() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 border-b border-border-default bg-bg-secondary/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 w-full justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-heading text-sm font-bold shrink-0">
            M
          </span>
          <div className="flex flex-col">
            <h1 className="font-heading text-base text-text-primary tracking-tight leading-tight">
              Music Theory Lab
            </h1>
            <span className="text-[10px] text-text-muted leading-tight hidden sm:block">
              Laboratorio de Teoria Musical
            </span>
          </div>
        </div>
        <ModuleNav />
      </div>
    </header>
  );
}
