export interface LibraryAnnotationSection {
  id: string;
  name: string;
  /** Inclusive, zero-based index of the first bar. */
  startBar: number;
  /** Exclusive, zero-based index after the final bar. */
  endBar: number;
  /** Provenance of this section's leading boundary; absent at the track edge. */
  startBoundaryOrigin?: 'automatic' | 'manual';
}

export interface LibraryAnnotationDocument {
  schemaVersion: 1;
  sourceSha256: string;
  sections: LibraryAnnotationSection[];
}

export interface LibraryAnnotationEditResult {
  document: LibraryAnnotationDocument;
  error: string | null;
}

export interface AdoptableLibraryBoundarySuggestion {
  barIndex: number | null;
  unavailableReason: string | null;
}

export function validateLibraryAnnotation(
  document: LibraryAnnotationDocument,
  barCount: number,
): string[] {
  const errors: string[] = [];
  let expectedStart = 0;
  for (const section of document.sections) {
    if (
      !Number.isInteger(section.startBar) ||
      !Number.isInteger(section.endBar)
    ) {
      errors.push(
        'Os limites das seções precisam ser índices inteiros de compassos.',
      );
    }
    if (section.startBar !== expectedStart) {
      errors.push(
        'As seções precisam cobrir a faixa sem lacunas nem sobreposições.',
      );
    }
    if (section.endBar <= section.startBar) {
      errors.push('Toda seção precisa conter ao menos um compasso.');
    }
    expectedStart = section.endBar;
  }
  if (document.sections.length === 0 || expectedStart !== barCount) {
    errors.push(
      'As seções precisam cobrir a faixa sem lacunas nem sobreposições.',
    );
  }
  return errors;
}

export function migrateLibraryAnnotation(
  raw: unknown,
  sourceSha256: string,
  barCount: number,
): LibraryAnnotationDocument {
  const record = isRecord(raw) ? raw : {};
  const rawSections = Array.isArray(record.sections) ? record.sections : [];
  const sections = rawSections.flatMap((value, index) => {
    if (!isRecord(value)) return [];
    const startBar = numberField(value, 'startBar', 'start_bar');
    const endBar = numberField(value, 'endBar', 'end_bar');
    if (startBar === null || endBar === null) return [];
    const id = typeof value.id === 'string' ? value.id : `section-${index + 1}`;
    const candidateName =
      typeof value.name === 'string'
        ? value.name
        : typeof value.label === 'string'
          ? value.label
          : `Parte ${index + 1}`;
    const rawOrigin = value.startBoundaryOrigin;
    const startBoundaryOrigin: LibraryAnnotationSection['startBoundaryOrigin'] =
      index > 0 && (rawOrigin === 'automatic' || rawOrigin === 'manual')
        ? rawOrigin
        : undefined;
    return [
      {
        id,
        name: candidateName.trim() || `Parte ${index + 1}`,
        startBar,
        endBar,
        ...(startBoundaryOrigin ? { startBoundaryOrigin } : {}),
      },
    ];
  });
  const migrated: LibraryAnnotationDocument = {
    schemaVersion: 1,
    sourceSha256,
    sections,
  };
  return validateLibraryAnnotation(migrated, barCount).length === 0
    ? migrated
    : createLibraryAnnotation(sourceSha256, barCount, []);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numberField(
  record: Record<string, unknown>,
  modern: string,
  legacy: string,
): number | null {
  const value = record[modern] ?? record[legacy];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

export function createLibraryAnnotation(
  sourceSha256: string,
  barCount: number,
  acceptedBoundaryBars: number[],
): LibraryAnnotationDocument {
  if (!Number.isInteger(barCount) || barCount < 1) {
    throw new RangeError(
      'Uma faixa anotável precisa conter ao menos um compasso.',
    );
  }
  const accepted = [...new Set(acceptedBoundaryBars)]
    .filter(
      (boundary) =>
        Number.isInteger(boundary) && boundary > 0 && boundary < barCount,
    )
    .sort((left, right) => left - right);
  const boundaries = [0, ...accepted, barCount];

  return {
    schemaVersion: 1,
    sourceSha256,
    sections: boundaries.slice(0, -1).map((startBar, index) => ({
      id: `section-${index + 1}`,
      name: `Parte ${index + 1}`,
      startBar,
      endBar: boundaries[index + 1],
      ...(index > 0 ? { startBoundaryOrigin: 'automatic' as const } : {}),
    })),
  };
}

export function renameLibrarySection(
  document: LibraryAnnotationDocument,
  sectionId: string,
  name: string,
): LibraryAnnotationEditResult {
  const index = document.sections.findIndex(
    (section) => section.id === sectionId,
  );
  const normalizedName = name.trim();
  if (index === -1) return failure(document, 'Seção não encontrada.');
  if (!normalizedName)
    return failure(document, 'O nome da seção não pode ficar vazio.');

  return success(
    document,
    document.sections.map((section, sectionIndex) =>
      sectionIndex === index ? { ...section, name: normalizedName } : section,
    ),
  );
}

export function splitLibrarySection(
  document: LibraryAnnotationDocument,
  sectionId: string,
  startBar: number,
): LibraryAnnotationEditResult {
  const index = document.sections.findIndex(
    (section) => section.id === sectionId,
  );
  const section = document.sections[index];
  const error = getSplitError(document, sectionId, startBar);
  if (error || !section)
    return failure(document, error ?? 'Seção não encontrada.');

  const nextNumber = nextSectionNumber(document.sections);
  const created: LibraryAnnotationSection = {
    id: `section-${nextNumber}`,
    name: `Parte ${nextNumber}`,
    startBar,
    endBar: section.endBar,
    startBoundaryOrigin: 'manual',
  };
  const sections = [...document.sections];
  sections.splice(index, 1, { ...section, endBar: startBar }, created);
  return success(document, sections);
}

export function adoptRejectedBoundarySuggestion(
  document: LibraryAnnotationDocument,
  suggestion: AdoptableLibraryBoundarySuggestion,
): LibraryAnnotationEditResult {
  const error = getRejectedBoundaryAdoptionError(document, suggestion);
  if (error) return failure(document, error);
  const barIndex = suggestion.barIndex;
  if (barIndex === null) return failure(document, 'Sugestão indisponível.');
  const section = document.sections.find(
    (item) => item.startBar < barIndex && barIndex < item.endBar,
  );
  if (!section) return failure(document, 'Sugestão indisponível.');
  return splitLibrarySection(document, section.id, barIndex);
}

export function getRejectedBoundaryAdoptionError(
  document: LibraryAnnotationDocument,
  suggestion: AdoptableLibraryBoundarySuggestion,
): string | null {
  if (suggestion.barIndex === null) {
    return (
      suggestion.unavailableReason ??
      'Esta sugestão não corresponde mais à grade atual de compassos.'
    );
  }
  const section = document.sections.find(
    (item) =>
      suggestion.barIndex !== null &&
      item.startBar < suggestion.barIndex &&
      suggestion.barIndex < item.endBar,
  );
  if (!section) {
    return 'Esta divisão já existe ou não está disponível na anotação atual.';
  }
  return null;
}

export type BoundaryDirection = -1 | 1;

export function getSplitError(
  document: LibraryAnnotationDocument,
  sectionId: string,
  startBar: number,
): string | null {
  const section = document.sections.find((item) => item.id === sectionId);
  if (!section) return 'Seção não encontrada.';
  if (startBar <= section.startBar || startBar >= section.endBar) {
    return 'Escolha um compasso interno para iniciar a nova seção.';
  }
  return null;
}

export function getBoundaryMoveError(
  document: LibraryAnnotationDocument,
  boundaryIndex: number,
  direction: BoundaryDirection,
): string | null {
  const left = document.sections[boundaryIndex];
  const right = document.sections[boundaryIndex + 1];
  if (!left || !right) return 'Esta fronteira fica na borda da faixa.';
  if (direction === -1 && left.endBar - left.startBar <= 1) {
    return 'A seção anterior precisa manter um compasso.';
  }
  if (direction === 1 && right.endBar - right.startBar <= 1) {
    return 'A próxima seção precisa manter um compasso.';
  }
  return null;
}

export function moveLibraryBoundary(
  document: LibraryAnnotationDocument,
  boundaryIndex: number,
  direction: BoundaryDirection,
): LibraryAnnotationEditResult {
  const left = document.sections[boundaryIndex];
  const right = document.sections[boundaryIndex + 1];
  const error = getBoundaryMoveError(document, boundaryIndex, direction);
  if (error || !left || !right)
    return failure(document, error ?? 'Fronteira não encontrada.');

  const boundary = left.endBar + direction;
  const sections = document.sections.map((section, index) => {
    if (index === boundaryIndex) return { ...section, endBar: boundary };
    if (index === boundaryIndex + 1) {
      return {
        ...section,
        startBar: boundary,
        startBoundaryOrigin: 'manual' as const,
      };
    }
    return section;
  });
  return success(document, sections);
}

export function mergeLibrarySections(
  document: LibraryAnnotationDocument,
  leftSectionId: string,
): LibraryAnnotationEditResult {
  const index = document.sections.findIndex(
    (section) => section.id === leftSectionId,
  );
  const left = document.sections[index];
  const right = document.sections[index + 1];
  const error = getMergeError(document, leftSectionId);
  if (error || !left || !right)
    return failure(document, error ?? 'Seção não encontrada.');

  const sections = [...document.sections];
  sections.splice(index, 2, { ...left, endBar: right.endBar });
  return success(document, sections);
}

export function getMergeError(
  document: LibraryAnnotationDocument,
  leftSectionId: string,
): string | null {
  const index = document.sections.findIndex(
    (section) => section.id === leftSectionId,
  );
  if (index === -1) return 'Seção não encontrada.';
  if (index === document.sections.length - 1) {
    return 'A última seção não tem uma próxima para unir.';
  }
  return null;
}

function nextSectionNumber(sections: LibraryAnnotationSection[]): number {
  let number = 1;
  const ids = new Set(sections.map((section) => section.id));
  while (ids.has(`section-${number}`)) number += 1;
  return number;
}

function success(
  document: LibraryAnnotationDocument,
  sections: LibraryAnnotationSection[],
): LibraryAnnotationEditResult {
  return { document: { ...document, sections }, error: null };
}

function failure(
  document: LibraryAnnotationDocument,
  error: string,
): LibraryAnnotationEditResult {
  return { document, error };
}
