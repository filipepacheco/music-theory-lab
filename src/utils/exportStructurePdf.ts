import jsPDF from 'jspdf';
import {
  DEFAULT_GROOVE_SUBDIVISION,
  DRUM_PIECES,
  GROOVE_SUBDIVISIONS,
  grooveMeasureCount,
  grooveStepsPerBeat,
  grooveTotalStepCount,
} from '@/constants/groove';
import {
  dotsForTimeSignature,
  effectiveBarColor,
  hexToRgb,
  lightenRgb,
  getSectionBars,
} from './structureLayout';
import { grooveChartLayout } from './grooveChartLayout';
import type {
  DrumPiece,
  GroovePattern,
  StructureBar,
  StructureSection,
} from '@/types';

export type PdfFormat = 'a4' | 'ipad-air';

interface ExportOptions {
  title: string;
  artist: string;
  bpm?: number;
  sections: StructureSection[];
  bars: StructureBar[];
  format?: PdfFormat;
}

export interface FormatConfig {
  pageW: number;
  pageH: number;
  margin: number;
  barW: number;
  barH: number;
  barGap: number;
  sectionGapY: number;
  commentGap: number;
  colGap: number;
  numCols: number;
  titleFontSize: number;
  subtitleFontSize: number;
  badgeFontSize: number;
  barNumFontSize: number;
  commentFontSize: number;
  barCountFontSize: number;
  badgePadH: number;
  badgeHeight: number;
  badgeRadius: number;
  barsTopOffset: number;
  commentLineHeight: number;
  commentBesideMinW: number;
  grooveGapY: number;
  grooveHeight: number;
  grooveFontSize: number;
  grooveLabelW: number;
  grooveMeasureW: number;
}

export const FORMATS: Record<PdfFormat, FormatConfig> = {
  a4: {
    pageW: 210,
    pageH: 297,
    margin: 6,
    barW: 8,
    barH: 5.5,
    barGap: 1,
    sectionGapY: 4,
    commentGap: 3,
    colGap: 5,
    numCols: 2,
    titleFontSize: 16,
    subtitleFontSize: 9,
    badgeFontSize: 7,
    barNumFontSize: 6,
    commentFontSize: 7,
    barCountFontSize: 6,
    badgePadH: 4,
    badgeHeight: 4,
    badgeRadius: 0.8,
    barsTopOffset: 5,
    commentLineHeight: 3,
    commentBesideMinW: 20,
    grooveGapY: 2,
    grooveHeight: 24,
    grooveFontSize: 5.5,
    grooveLabelW: 8,
    grooveMeasureW: 43,
  },
  'ipad-air': {
    pageW: 160,
    pageH: 228,
    margin: 4,
    barW: 10,
    barH: 7,
    barGap: 1.2,
    sectionGapY: 5,
    commentGap: 3.5,
    colGap: 5,
    numCols: 2,
    titleFontSize: 15,
    subtitleFontSize: 9,
    badgeFontSize: 7.5,
    barNumFontSize: 6.5,
    commentFontSize: 7.5,
    barCountFontSize: 6.5,
    badgePadH: 4.5,
    badgeHeight: 4.5,
    badgeRadius: 1,
    barsTopOffset: 5.5,
    commentLineHeight: 3.2,
    commentBesideMinW: 20,
    grooveGapY: 2,
    grooveHeight: 24,
    grooveFontSize: 5.5,
    grooveLabelW: 8,
    grooveMeasureW: 31,
  },
};

export interface SectionLayout {
  section: StructureSection;
  sectionBars: StructureBar[];
  barsPerRow: number;
  gridW: number;
  barsH: number;
  commentLines: string[];
  commentBeside: boolean;
  contentH: number;
  grooveX: number;
  grooveY: number;
  grooveMeasureW: number;
  grooveH: number;
  totalH: number;
}

export interface GroovePdfRow {
  piece: DrumPiece;
  label: string;
  hits: boolean[];
}

/** Normalize groove rows for the PDF renderer, including legacy patterns. */
export function groovePdfRows(groove?: GroovePattern): GroovePdfRow[] {
  if (!groove) return [];

  const stepCount = grooveTotalStepCount(
    groove.subdivision ?? DEFAULT_GROOVE_SUBDIVISION,
    groove.measureCount,
  );
  const rows = DRUM_PIECES.map((piece) => ({
    piece: piece.id,
    label: piece.label,
    hits: Array.from({ length: stepCount }, (_, step) =>
      Boolean(groove[piece.id][step]),
    ),
  }));

  return rows.some((row) => row.hits.some(Boolean)) ? rows : [];
}

function grooveResolutionLabel(groove: GroovePattern): string {
  const subdivision = groove.subdivision ?? DEFAULT_GROOVE_SUBDIVISION;
  const resolution =
    GROOVE_SUBDIVISIONS.find((option) => option.id === subdivision)
      ?.shortLabel ?? '1/16';
  return `${resolution} - ${grooveMeasureCount(groove.measureCount)}c`;
}

type WrapText = (text: string, maxWidth: number) => string[];

/**
 * Pure layout for one section: bar grid geometry and comment placement for a
 * page format. `wrapText` is injected so tests can cross this seam without
 * jsPDF — the export path passes `doc.splitTextToSize` bound to the document.
 */
export function calcSectionLayout(
  section: StructureSection,
  sectionBars: StructureBar[],
  cfg: FormatConfig,
  wrapText: WrapText,
): SectionLayout {
  const colW =
    (cfg.pageW - cfg.margin * 2 - cfg.colGap * (cfg.numCols - 1)) / cfg.numCols;

  const barsPerRow =
    section.barsPerRow ??
    Math.max(1, Math.floor((colW * 0.45) / (cfg.barW + cfg.barGap)));
  const rowCount =
    sectionBars.length > 0 ? Math.ceil(sectionBars.length / barsPerRow) : 0;
  const colCount = Math.min(sectionBars.length, barsPerRow);
  const gridW =
    colCount > 0 ? colCount * (cfg.barW + cfg.barGap) - cfg.barGap : 0;
  const barsH =
    rowCount > 0 ? rowCount * (cfg.barH + cfg.barGap) - cfg.barGap : 0;

  const availableBesideW = colW - gridW - cfg.commentGap;
  const commentBeside = availableBesideW >= cfg.commentBesideMinW;
  const commentMaxW = commentBeside ? availableBesideW : colW;

  const commentLines = section.comment
    ? wrapText(section.comment, commentMaxW)
    : [];
  const commentH = commentLines.length * cfg.commentLineHeight;

  let contentH: number;
  if (commentBeside) {
    contentH = cfg.barsTopOffset + Math.max(barsH, commentH);
  } else {
    contentH =
      cfg.barsTopOffset + barsH + (commentLines.length > 0 ? 2 + commentH : 0);
  }
  const grooveH = groovePdfRows(section.groove).length ? cfg.grooveHeight : 0;
  const measureCount = grooveMeasureCount(section.groove?.measureCount);
  const grooveWidth = cfg.grooveLabelW + measureCount * cfg.grooveMeasureW;
  const grooveBeside =
    grooveH > 0 && commentBeside && grooveWidth <= availableBesideW;
  const grooveAvailableW = grooveBeside ? availableBesideW : colW;
  const grooveMeasureW = (grooveAvailableW - cfg.grooveLabelW) / measureCount;
  let grooveX = 0;
  let grooveY = contentH;

  if (grooveH > 0) {
    if (grooveBeside) {
      grooveX = gridW + cfg.commentGap;
      grooveY =
        cfg.barsTopOffset +
        (commentLines.length > 0 ? commentH + cfg.grooveGapY : 0);
      contentH = Math.max(contentH, grooveY + grooveH);
    } else {
      grooveY = contentH + cfg.grooveGapY;
    }
  }

  return {
    section,
    sectionBars,
    barsPerRow,
    gridW,
    barsH,
    commentLines,
    commentBeside,
    contentH,
    grooveX,
    grooveY,
    grooveMeasureW,
    grooveH,
    totalH: grooveBeside ? contentH : grooveY + grooveH,
  };
}

/** Layouts for every non-empty section, in section order. Pure. */
export function layoutSections(
  sections: StructureSection[],
  bars: StructureBar[],
  cfg: FormatConfig,
  wrapText: WrapText,
): SectionLayout[] {
  const barMap = new Map(bars.map((b) => [b.id, b]));
  const layouts: SectionLayout[] = [];
  for (const section of sections) {
    const sectionBars = getSectionBars(section, barMap);
    if (
      sectionBars.length === 0 &&
      groovePdfRows(section.groove).length === 0
    ) {
      continue;
    }
    layouts.push(calcSectionLayout(section, sectionBars, cfg, wrapText));
  }
  return layouts;
}

function renderGroove(
  doc: jsPDF,
  groove: GroovePattern,
  rows: GroovePdfRow[],
  color: string,
  x: number,
  y: number,
  grooveMeasureW: number,
  cfg: FormatConfig,
) {
  const layout = grooveChartLayout(groove, {
    measureWidth: grooveMeasureW,
    labelWidth: cfg.grooveLabelW,
    staffTop: 7,
    staffSpacing: 2.2,
    height: cfg.grooveHeight,
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(cfg.grooveFontSize);
  doc.setTextColor(90, 90, 90);
  doc.text(`Groove ${grooveResolutionLabel(groove)}`, x, y + 2);

  const [r, g, b] = hexToRgb(color);
  doc.setDrawColor(110, 110, 110);
  doc.setLineWidth(0.12);

  for (let line = 0; line < 5; line++) {
    const lineY = y + layout.staffTop + line * layout.staffSpacing;
    doc.line(x + layout.staffLeft, lineY, x + layout.staffRight, lineY);
  }

  for (let measure = 0; measure < layout.measureCount; measure++) {
    for (let beat = 0; beat < 4; beat++) {
      const beatX = x + layout.beatX(measure, beat);
      doc.setDrawColor(185, 185, 185);
      doc.setLineWidth(0.08);
      doc.line(
        beatX,
        y + layout.staffTop - 2,
        beatX,
        y + layout.staffBottom + 2,
      );
    }
  }

  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.2);
  for (let measure = 0; measure <= layout.measureCount; measure++) {
    const barX = x + layout.measureX(measure);
    doc.line(barX, y + layout.staffTop - 2, barX, y + layout.staffBottom + 2);
    if (measure < layout.measureCount) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(cfg.grooveFontSize);
      doc.setTextColor(r, g, b);
      doc.text(String(measure + 1), barX + 1, y + 5);
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(cfg.grooveFontSize);
  doc.setTextColor(100, 100, 100);
  for (const row of rows) {
    doc.text(row.label, x, y + layout.noteY[row.piece] + 1.2);
  }

  const hasHit = (step: number): boolean =>
    rows.some((row) => row.hits[step] === true);

  const stepsPerBeat = grooveStepsPerBeat(
    groove.subdivision ?? DEFAULT_GROOVE_SUBDIVISION,
  );
  const noteRadiusX = Math.min(2, layout.stepWidth * 0.32);
  const noteRadiusY = Math.min(1.4, layout.stepWidth * 0.22);
  const crossHalf = Math.min(2, layout.stepWidth * 0.34);
  const stemOffset = Math.min(1.5, layout.stepWidth * 0.25);
  for (let measure = 0; measure < layout.measureCount; measure++) {
    for (let beat = 0; beat < 4; beat++) {
      const start = measure * layout.stepsPerMeasure + beat * stepsPerBeat;
      const beatHasHit = Array.from({ length: stepsPerBeat }, (_, offset) =>
        hasHit(start + offset),
      ).some(Boolean);
      if (beatHasHit) continue;

      const restX = x + layout.beatX(measure, beat) + layout.measureWidth / 8;
      const restY = y + layout.staffTop + layout.staffSpacing * 2;
      doc.setDrawColor(110, 110, 110);
      doc.setLineWidth(0.25);
      doc.line(restX - 1.5, restY - 1.5, restX + 1, restY + 0.5);
      doc.line(restX + 1, restY + 0.5, restX - 0.5, restY + 2.5);
      doc.line(restX - 0.5, restY + 2.5, restX + 1.5, restY + 4.5);
    }
  }

  for (let measure = 0; measure < layout.measureCount; measure++) {
    for (let beat = 0; beat < 4; beat++) {
      const start = measure * layout.stepsPerMeasure + beat * stepsPerBeat;
      const end = start + stepsPerBeat;
      const groups = Math.max(0, Math.log2(stepsPerBeat));
      for (let level = 0; level < groups; level++) {
        const groupSize = Math.max(1, stepsPerBeat / 2 ** (level + 1));
        for (let group = 0; group < stepsPerBeat / groupSize; group++) {
          const groupStart = start + group * groupSize;
          const groupEnd = Math.min(end, groupStart + groupSize);
          if (
            !Array.from({ length: groupEnd - groupStart }, (_, offset) =>
              hasHit(groupStart + offset),
            ).some(Boolean)
          ) {
            continue;
          }
          const beamY = y + layout.staffTop - 3 - level * 1.7;
          doc.setDrawColor(r, g, b);
          doc.setLineWidth(0.45);
          doc.line(
            x + layout.stepX(groupStart),
            beamY,
            x + layout.stepX(groupEnd - 1),
            beamY,
          );
        }
      }
    }
  }

  for (let step = 0; step < layout.totalSteps; step++) {
    const stepX = x + layout.stepX(step);
    for (const row of rows) {
      if (!row.hits[step]) continue;

      const noteY = y + layout.noteY[row.piece];
      const isKick = row.piece === 'bumbo';
      const stemX = stepX + (isKick ? -stemOffset : stemOffset);
      const stemEnd =
        y + (isKick ? layout.staffBottom + 4 : layout.staffTop - 3);
      doc.setDrawColor(r, g, b);
      doc.setFillColor(r, g, b);
      doc.setLineWidth(0.3);
      doc.line(stemX, isKick ? noteY + 0.8 : noteY - 0.8, stemX, stemEnd);

      if (row.piece === 'chimbal') {
        doc.line(
          stepX - crossHalf,
          noteY - crossHalf,
          stepX + crossHalf,
          noteY + crossHalf,
        );
        doc.line(
          stepX + crossHalf,
          noteY - crossHalf,
          stepX - crossHalf,
          noteY + crossHalf,
        );
      } else {
        doc.ellipse(stepX, noteY, noteRadiusX, noteRadiusY, 'F');
      }
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(cfg.grooveFontSize);
  doc.setTextColor(110, 110, 110);
  doc.text('HH chimbal - C caixa - B bumbo', x, y + cfg.grooveHeight - 1);
}

function renderSection(
  doc: jsPDF,
  layout: SectionLayout,
  x: number,
  y: number,
  cfg: FormatConfig,
) {
  const {
    section,
    sectionBars,
    barsPerRow,
    gridW,
    commentLines,
    commentBeside,
    barsH,
    grooveX,
    grooveY,
    grooveMeasureW,
    grooveH,
  } = layout;
  const [r, g, b] = hexToRgb(section.color);
  const [lr, lg, lb] = lightenRgb(section.color, 0.85);

  // Badge
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(cfg.badgeFontSize);
  const badgeText = section.name;
  const badgeW = doc.getTextWidth(badgeText) + cfg.badgePadH;
  doc.setFillColor(lr, lg, lb);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.25);
  doc.roundedRect(
    x,
    y,
    badgeW,
    cfg.badgeHeight,
    cfg.badgeRadius,
    cfg.badgeRadius,
    'FD',
  );
  doc.setTextColor(r, g, b);
  doc.text(badgeText, x + cfg.badgePadH / 2, y + cfg.badgeHeight * 0.7);

  // Bar count
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(cfg.barCountFontSize);
  doc.setTextColor(160, 160, 160);
  doc.text(
    `${sectionBars.length}c`,
    x + badgeW + 1.5,
    y + cfg.badgeHeight * 0.7,
  );

  const barsTopY = y + cfg.barsTopOffset;

  // Bars grid
  const sectionFillRgb = lightenRgb(section.color, 0.88);
  const sectionBorderRgb = lightenRgb(section.color, 0.6);

  for (let i = 0; i < sectionBars.length; i++) {
    const col = i % barsPerRow;
    const row = Math.floor(i / barsPerRow);
    const bx = x + col * (cfg.barW + cfg.barGap);
    const by = barsTopY + row * (cfg.barH + cfg.barGap);
    const bar = sectionBars[i]!;

    // Per-bar color or section color
    const barColor = effectiveBarColor(bar.color, section.color)!;
    const [blr, blg, blb] = bar.color
      ? lightenRgb(bar.color, 0.88)
      : sectionFillRgb;
    const [bdr, bdg, bdb] = bar.color
      ? lightenRgb(bar.color, 0.6)
      : sectionBorderRgb;

    doc.setFillColor(blr, blg, blb);
    doc.setDrawColor(bdr, bdg, bdb);
    doc.setLineWidth(0.15);
    doc.roundedRect(bx, by, cfg.barW, cfg.barH, 0.6, 0.6, 'FD');

    // Bar number
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(cfg.barNumFontSize);
    doc.setTextColor(50, 50, 50);
    const numStr = String(i + 1);
    const numW = doc.getTextWidth(numStr);
    doc.text(numStr, bx + (cfg.barW - numW) / 2, by + cfg.barH * 0.38);

    // Beat dots - single row
    const dotCount = dotsForTimeSignature(bar.timeSignature);
    const accentSet = new Set(bar.accents ?? []);
    const dotR = cfg.barH * 0.04;
    const accentR = cfg.barH * 0.06;
    const dotSpacing = cfg.barW * 0.09;
    const dotsW = (dotCount - 1) * dotSpacing;
    const dotsStartX = bx + (cfg.barW - dotsW) / 2;
    const dotsY = by + cfg.barH * 0.72;
    const [acR, acG, acB] = hexToRgb(barColor);

    for (let di = 0; di < dotCount; di++) {
      const dx = dotsStartX + di * dotSpacing;
      const isAccent = accentSet.has(di);
      const isDownbeat = di % 2 === 0;

      if (isAccent) {
        doc.setFillColor(acR, acG, acB);
        doc.circle(dx, dotsY, isDownbeat ? accentR * 1.3 : accentR, 'F');
      } else {
        doc.setFillColor(
          isDownbeat ? 150 : 190,
          isDownbeat ? 150 : 190,
          isDownbeat ? 150 : 190,
        );
        doc.circle(dx, dotsY, isDownbeat ? dotR * 1.4 : dotR, 'F');
      }
    }
  }

  // Comment
  if (commentLines.length > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(cfg.commentFontSize);
    doc.setTextColor(100, 100, 100);

    if (commentBeside) {
      const commentX = x + gridW + cfg.commentGap;
      doc.text(commentLines, commentX, barsTopY + 2.5);
    } else {
      const commentY = barsTopY + barsH + 2;
      doc.text(commentLines, x, commentY + cfg.commentLineHeight);
    }
  }

  if (grooveH > 0 && section.groove) {
    renderGroove(
      doc,
      section.groove,
      groovePdfRows(section.groove),
      section.color,
      x + grooveX,
      y + grooveY,
      grooveMeasureW,
      cfg,
    );
  }
}

export function exportStructurePdf({
  title,
  artist,
  bpm,
  sections,
  bars,
  format = 'a4',
}: ExportOptions) {
  const cfg = FORMATS[format];
  const doc = new jsPDF({
    unit: 'mm',
    format: [cfg.pageW, cfg.pageH],
  });
  const wrapText: WrapText = (text, maxWidth) => {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(cfg.commentFontSize);
    return doc.splitTextToSize(text, maxWidth);
  };
  const colW =
    (cfg.pageW - cfg.margin * 2 - cfg.colGap * (cfg.numCols - 1)) / cfg.numCols;

  let headerH = 0;

  // -- Title --
  let ty = cfg.margin;
  if (title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(cfg.titleFontSize);
    doc.setTextColor(30, 30, 30);
    doc.text(title, cfg.margin, ty + 5);
    ty += 6;
  }

  // -- Subtitle line: artist and/or BPM --
  const subtitleParts: string[] = [];
  if (artist) subtitleParts.push(artist);
  if (bpm && bpm !== 120) subtitleParts.push(`${bpm} BPM`);

  if (subtitleParts.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(cfg.subtitleFontSize);
    doc.setTextColor(100, 100, 100);
    doc.text(subtitleParts.join('  -  '), cfg.margin, ty + 3.5);
    ty += 5;
  }

  if (title || subtitleParts.length > 0) {
    ty += 1;
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.3);
    doc.line(cfg.margin, ty, cfg.pageW - cfg.margin, ty);
    ty += 4;
  }
  headerH = ty - cfg.margin;

  // -- Pre-calculate layouts --
  const layouts = layoutSections(sections, bars, cfg, wrapText);

  // -- Flow sections into columns (fill left first, then right) --
  let col = 0;
  const colY: number[] = new Array(cfg.numCols).fill(cfg.margin + headerH);
  const pageBottom = cfg.pageH - cfg.margin;

  for (const layout of layouts) {
    if (colY[col] + layout.totalH <= pageBottom) {
      const colX = cfg.margin + col * (colW + cfg.colGap);
      renderSection(doc, layout, colX, colY[col], cfg);
      colY[col] += layout.totalH + cfg.sectionGapY;
    } else if (col + 1 < cfg.numCols) {
      col++;
      const colX = cfg.margin + col * (colW + cfg.colGap);
      renderSection(doc, layout, colX, colY[col], cfg);
      colY[col] += layout.totalH + cfg.sectionGapY;
    } else {
      doc.addPage();
      for (let i = 0; i < cfg.numCols; i++) colY[i] = cfg.margin;
      col = 0;
      renderSection(doc, layout, cfg.margin, colY[col], cfg);
      colY[col] += layout.totalH + cfg.sectionGapY;
    }
  }

  // -- Download --
  const filename = title
    ? `${title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}_estrutura.pdf`
    : 'estrutura.pdf';
  doc.save(filename);
}
