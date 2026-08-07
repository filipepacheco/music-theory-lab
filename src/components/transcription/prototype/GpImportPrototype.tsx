// PROTOTYPE — throwaway. Three variants of the .gp import panel, switchable via
// ?variant=A|B|C, mounted inside the real Transcription module so they are
// judged against the real header, real density and real neighbours.
//
// Answers https://github.com/filipepacheco/music-theory-lab/issues/14.
// Nothing here saves: building and persisting the Song belongs to #15.

import { useState } from 'react';
import PrototypeSwitcher, { getVariant } from '@/components/shared/PrototypeSwitcher';
import { useGpImportPrototype } from './useGpImportPrototype';
import VariantAWizard, { variantName as nameA } from './VariantAWizard';
import VariantBStacked, { variantName as nameB } from './VariantBStacked';
import VariantCSplit, { variantName as nameC } from './VariantCSplit';

const KEYS = ['A', 'B', 'C'];
const NAMES: Record<string, string> = { A: nameA, B: nameB, C: nameC };

export default function GpImportPrototype() {
  const [variant, setVariant] = useState(() => getVariant(KEYS));
  const s = useGpImportPrototype();

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg border border-dashed border-accent/40 bg-bg-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-heading text-text-primary">
          Importar do Guitar Pro
        </h3>
        <span className="text-[10px] font-mono text-text-muted">
          prototipo {variant}
        </span>
      </div>

      {variant === 'A' && <VariantAWizard s={s} />}
      {variant === 'B' && <VariantBStacked s={s} />}
      {variant === 'C' && <VariantCSplit s={s} />}

      <PrototypeSwitcher
        variants={KEYS}
        current={variant}
        name={NAMES[variant]}
        onChange={setVariant}
      />
    </div>
  );
}
