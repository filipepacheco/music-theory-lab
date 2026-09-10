export interface LibraryAnnotationSection {
  id: string;
  name: string;
  /** Inclusive, zero-based index of the first bar. */
  startBar: number;
  /** Exclusive, zero-based index after the final bar. */
  endBar: number;
  /** Provenance of the boundary that starts this section. */
  origin: 'automatic' | 'fallback' | 'manual';
}

export interface LibraryAnnotationDocument {
  schemaVersion: 2;
  sourceSha256: string;
  barCount: number;
  reviewRequired: boolean;
  createdAt: string;
  updatedAt: string;
  sections: LibraryAnnotationSection[];
}

export interface LibraryAnnotationEditResult {
  document: LibraryAnnotationDocument;
  error: string | null;
}

export interface CloudLibraryAnnotation {
  source_sha256: unknown;
  schema_version: unknown;
  bar_count: unknown;
  review_required: unknown;
  sections: unknown;
  created_at: unknown;
  updated_at: unknown;
}

export interface SerializedCloudLibraryAnnotation {
  source_sha256: string;
  schema_version: number;
  bar_count: number;
  review_required: number;
  sections: string;
  created_at: string;
  updated_at: string;
}

const DOCUMENT_FIELDS = new Set([
  'schemaVersion',
  'sourceSha256',
  'barCount',
  'reviewRequired',
  'createdAt',
  'updatedAt',
  'sections',
]);

const SECTION_FIELDS = new Set(['id', 'name', 'startBar', 'endBar', 'origin']);

export function validateLibraryAnnotation(
  document: LibraryAnnotationDocument,
  barCount = document.barCount,
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
  const sections: LibraryAnnotationSection[] = rawSections.flatMap(
    (value, index): LibraryAnnotationSection[] => {
      if (!isRecord(value)) return [];
      const startBar = numberField(value, 'startBar', 'start_bar');
      const endBar = numberField(value, 'endBar', 'end_bar');
      if (startBar === null || endBar === null) return [];
      const id =
        typeof value.id === 'string' ? value.id : `section-${index + 1}`;
      const candidateName =
        typeof value.name === 'string'
          ? value.name
          : typeof value.label === 'string'
            ? value.label
            : `Parte ${index + 1}`;
      const origin = stringField(value, 'origin');
      return [
        {
          id,
          name: candidateName.trim() || `Parte ${index + 1}`,
          startBar,
          endBar,
          origin:
            origin === 'automatic' ||
            origin === 'fallback' ||
            origin === 'manual'
              ? origin
              : rawSections.length === 1
                ? 'fallback'
                : 'automatic',
        },
      ];
    },
  );
  const now = new Date().toISOString();
  const createdAt = timestampField(record, 'createdAt', 'created_at') ?? now;
  const updatedAt = timestampField(record, 'updatedAt', 'updated_at') ?? now;
  const migrated: LibraryAnnotationDocument = {
    schemaVersion: 2,
    sourceSha256,
    barCount,
    reviewRequired:
      typeof record.reviewRequired === 'boolean'
        ? record.reviewRequired
        : typeof record.review_required === 'boolean'
          ? record.review_required
          : sections.length === 1,
    createdAt,
    updatedAt,
    sections,
  };
  return validateLibraryAnnotation(migrated, barCount).length === 0
    ? migrated
    : createLibraryAnnotation(sourceSha256, barCount, []);
}

/** Strict parser for untrusted cloud data; unlike migration, never repairs it. */
export function parseLibraryAnnotation(
  raw: unknown,
): LibraryAnnotationDocument | null {
  if (
    !isRecord(raw) ||
    !hasOnlyFields(raw, DOCUMENT_FIELDS) ||
    raw.schemaVersion !== 2
  ) {
    return null;
  }
  if (
    typeof raw.sourceSha256 !== 'string' ||
    !Number.isInteger(raw.barCount) ||
    (raw.barCount as number) < 1 ||
    typeof raw.reviewRequired !== 'boolean' ||
    !isIsoTimestamp(raw.createdAt) ||
    !isIsoTimestamp(raw.updatedAt) ||
    !Array.isArray(raw.sections)
  ) {
    return null;
  }
  const sections: LibraryAnnotationSection[] = raw.sections.flatMap(
    (value): LibraryAnnotationSection[] => {
      if (
        !isRecord(value) ||
        !hasOnlyFields(value, SECTION_FIELDS) ||
        typeof value.id !== 'string' ||
        !value.id ||
        typeof value.name !== 'string' ||
        !value.name.trim() ||
        !Number.isInteger(value.startBar) ||
        !Number.isInteger(value.endBar) ||
        (value.origin !== 'automatic' &&
          value.origin !== 'fallback' &&
          value.origin !== 'manual')
      ) {
        return [];
      }
      return [
        {
          id: value.id,
          name: value.name,
          startBar: value.startBar as number,
          endBar: value.endBar as number,
          origin: value.origin,
        },
      ];
    },
  );
  if (sections.length !== raw.sections.length) return null;
  const document: LibraryAnnotationDocument = {
    schemaVersion: 2,
    sourceSha256: raw.sourceSha256,
    barCount: raw.barCount as number,
    reviewRequired: raw.reviewRequired,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    sections,
  };
  return validateLibraryAnnotation(document).length === 0 ? document : null;
}

export function parseCloudLibraryAnnotation(
  row: CloudLibraryAnnotation,
): LibraryAnnotationDocument | null {
  if (typeof row.sections !== 'string') return null;
  let sections: unknown;
  try {
    sections = JSON.parse(row.sections) as unknown;
  } catch {
    return null;
  }
  return parseLibraryAnnotation({
    schemaVersion: row.schema_version,
    sourceSha256: row.source_sha256,
    barCount: row.bar_count,
    reviewRequired:
      row.review_required === 1 || row.review_required === true
        ? true
        : row.review_required === 0 || row.review_required === false
          ? false
          : null,
    sections,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function serializeCloudLibraryAnnotation(
  document: LibraryAnnotationDocument,
): SerializedCloudLibraryAnnotation {
  return {
    source_sha256: document.sourceSha256,
    schema_version: document.schemaVersion,
    bar_count: document.barCount,
    review_required: document.reviewRequired ? 1 : 0,
    sections: JSON.stringify(document.sections),
    created_at: document.createdAt,
    updated_at: document.updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasOnlyFields(
  record: Record<string, unknown>,
  fields: Set<string>,
): boolean {
  return Object.keys(record).every((field) => fields.has(field));
}

function numberField(
  record: Record<string, unknown>,
  modern: string,
  legacy: string,
): number | null {
  const value = record[modern] ?? record[legacy];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function stringField(
  record: Record<string, unknown>,
  field: string,
): string | null {
  return typeof record[field] === 'string' ? record[field] : null;
}

function timestampField(
  record: Record<string, unknown>,
  modern: string,
  legacy: string,
): string | null {
  const value = record[modern] ?? record[legacy];
  return isTimestamp(value) ? value : null;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isIsoTimestamp(value: unknown): value is string {
  return isTimestamp(value) && new Date(value).toISOString() === value;
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
  const now = new Date().toISOString();

  return {
    schemaVersion: 2,
    sourceSha256,
    barCount,
    reviewRequired: accepted.length === 0,
    createdAt: now,
    updatedAt: now,
    sections: boundaries.slice(0, -1).map((startBar, index) => ({
      id: `section-${index + 1}`,
      name: `Parte ${index + 1}`,
      startBar,
      endBar: boundaries[index + 1],
      origin: accepted.length === 0 ? 'fallback' : 'automatic',
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
    origin: 'manual',
  };
  const sections = [...document.sections];
  sections.splice(index, 1, { ...section, endBar: startBar }, created);
  return success(document, sections);
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
      return { ...section, startBar: boundary, origin: 'manual' as const };
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
  return {
    document: {
      ...document,
      reviewRequired: false,
      updatedAt: nextTimestamp(document.updatedAt),
      sections,
    },
    error: null,
  };
}

function nextTimestamp(previous: string): string {
  const now = Date.now();
  const previousTime = Date.parse(previous);
  return new Date(Math.max(now, previousTime + 1)).toISOString();
}

function failure(
  document: LibraryAnnotationDocument,
  error: string,
): LibraryAnnotationEditResult {
  return { document, error };
}
