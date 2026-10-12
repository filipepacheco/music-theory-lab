import { useAppStore } from '@/store/useAppStore';
import { TIME_SIGNATURES } from '@/constants/structureColors';
import Button from '@/components/shared/Button';
import Segmented from '@/components/shared/Segmented';

export default function StructureRecorder() {
  const addBarToSection = useAppStore((s) => s.addBarToSection);
  const activeTimeSignature = useAppStore((s) => s.activeTimeSignature);
  const setActiveTimeSignature = useAppStore((s) => s.setActiveTimeSignature);
  const barCount = useAppStore((s) => s.structureBars.length);
  const focusedSectionId = useAppStore((s) => s.focusedSectionId);
  const sections = useAppStore((s) => s.structureSections);

  const focusedSection = sections.find((s) => s.id === focusedSectionId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="lh-field">
          <span className="lh-label">Compasso</span>
          <Segmented
            label="Fórmula de compasso"
            value={activeTimeSignature}
            onChange={setActiveTimeSignature}
            options={TIME_SIGNATURES.map((ts) => ({ value: ts, label: ts }))}
          />
        </div>

        <Button
          onClick={() => {
            if (focusedSectionId) addBarToSection(focusedSectionId);
          }}
          disabled={!focusedSectionId}
        >
          + Compasso
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-text-muted font-mono">
          {barCount} {barCount === 1 ? 'compasso' : 'compassos'}
        </span>
        {focusedSection ? (
          <span className="text-small text-text-muted/80">
            Adicionando a:{' '}
            <span style={{ color: focusedSection.color }} className="font-medium">
              {focusedSection.name}
            </span>
          </span>
        ) : (
          <span className="text-small text-text-muted/60">
            Selecione uma seção
          </span>
        )}
      </div>
    </div>
  );
}
