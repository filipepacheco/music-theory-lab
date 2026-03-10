import { useAppStore } from '@/store/useAppStore';

export default function StructurePrintView() {
  const title = useAppStore((s) => s.structureTitle);
  const artist = useAppStore((s) => s.structureArtist);
  const bpm = useAppStore((s) => s.structureBpm);
  const bars = useAppStore((s) => s.structureBars);
  const sections = useAppStore((s) => s.structureSections);

  const barMap = new Map(bars.map((b) => [b.id, b]));

  return (
    <div className="structure-print-view">
      <div className="print-header">
        <div className="print-title">{title || 'Sem titulo'}</div>
        {(artist || bpm !== 120) && (
          <div className="print-subtitle">
            {artist && <span>{artist}</span>}
            {artist && bpm !== 120 && <span> - </span>}
            {bpm !== 120 && <span>{bpm} BPM</span>}
          </div>
        )}
      </div>

      <div className="print-sections">
        {sections.map((section) => {
          const sectionBars = section.barIds
            .map((id) => barMap.get(id))
            .filter(Boolean);
          if (sectionBars.length === 0) return null;

          const barsPerRow = section.barsPerRow ?? 4;
          let displayIndex = 1;

          return (
            <div key={section.id} className="print-section">
              <div
                className="print-section-badge"
                style={{
                  backgroundColor: section.color + '20',
                  borderColor: section.color + '40',
                  color: section.color,
                }}
              >
                {section.name} ({sectionBars.length})
              </div>

              <div
                className="print-bars"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${barsPerRow}, 2rem)`,
                  gap: '3px',
                }}
              >
                {sectionBars.map((bar) => {
                  if (!bar) return null;
                  const idx = displayIndex++;
                  const showTs = bar.timeSignature !== '4/4';
                  return (
                    <div
                      key={bar.id}
                      className="print-bar"
                      style={{ borderColor: section.color + '30' }}
                    >
                      <span className="print-bar-number">{idx}</span>
                      {showTs && (
                        <span className="print-bar-ts">
                          {bar.timeSignature}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {section.comment && (
                <div className="print-comment">{section.comment}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
