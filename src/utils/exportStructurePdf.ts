import jsPDF from 'jspdf';
import {
  DEFAULT_GROOVE_SUBDIVISION,
  DRUM_PIECES,
  grooveTotalStepCount,
  grooveRow,
} from '@/constants/groove';
import { grooveHasHits, grooveMeasures } from '@/domain/grooveSchedule';
import {
  dotsForTimeSignature,
  effectiveBarColor,
  hexToRgb,
  lightenRgb,
  getSectionBars,
} from './structureLayout';
import { createElement } from 'react';
import {
  GrooveNotation,
  grooveNotationLayout,
} from '@/components/structure/GrooveChart';
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
  grooveW: number;
  grooveH: number;
  totalH: number;
}

export interface GroovePdfRow {
  piece: DrumPiece;
  label: string;
  hits: boolean[];
}

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
      Boolean(grooveRow(groove, piece.id)[step]),
    ),
  }));

  // A groove whose only hits are in beats of their own resolution still prints.
  return grooveHasHits(groove) ? rows : [];
}

const GROOVE_ROW_GAP = 2;

type WrapText = (text: string, maxWidth: number) => string[];

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
  const hasGroove = groovePdfRows(section.groove).length > 0;
  const measures = section.groove ? grooveMeasures(section.groove) : [];
  const notation = measures[0] ? grooveNotationLayout(measures[0]) : null;
  const grooveAvailableW = commentBeside ? availableBesideW : colW;
  // Keep the compact screen proportions, shrinking only to fit the notes column.
  const grooveW =
    hasGroove && notation
      ? Math.min(grooveAvailableW, notation.width * 0.2)
      : 0;
  const grooveH =
    hasGroove && notation
      ? ((grooveW * notation.height) / notation.width) * measures.length +
        GROOVE_ROW_GAP * (measures.length - 1)
      : 0;
  const grooveX = commentBeside ? gridW + cfg.commentGap : 0;
  const grooveY = commentBeside
    ? cfg.barsTopOffset + (commentH > 0 ? commentH + cfg.grooveGapY : 0)
    : contentH + (hasGroove ? cfg.grooveGapY : 0);
  if (hasGroove) contentH = Math.max(contentH, grooveY + grooveH);

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
    grooveW,
    grooveH,
    totalH: contentH,
  };
}

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

async function renderGroove(
  doc: jsPDF,
  groove: GroovePattern,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const [{ svg2pdf }, { renderToStaticMarkup }] = await Promise.all([
    import('svg2pdf.js'),
    import('react-dom/server'),
  ]);
  const measures = grooveMeasures(groove);
  const rowHeight =
    (height - GROOVE_ROW_GAP * (measures.length - 1)) / measures.length;
  for (const [index, measure] of measures.entries()) {
    const markup = renderToStaticMarkup(
      createElement(GrooveNotation, {
        groove: measure,
        color: '#222222',
        print: true,
        firstMeasure: index + 1,
      }),
    );
    const svg = new DOMParser().parseFromString(
      markup,
      'image/svg+xml',
    ).documentElement;
    svg.removeAttribute('style');
    svg.removeAttribute('class');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(rowHeight));
    await svg2pdf(svg, doc, {
      x,
      y: y + index * (rowHeight + GROOVE_ROW_GAP),
      width,
      height: rowHeight,
    });
  }
}

async function renderSection(
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
    grooveW,
    grooveH,
  } = layout;
  const [r, g, b] = hexToRgb(section.color);
  const [lr, lg, lb] = lightenRgb(section.color, 0.85);

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

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(cfg.barCountFontSize);
  doc.setTextColor(160, 160, 160);
  doc.text(
    `${sectionBars.length}c`,
    x + badgeW + 1.5,
    y + cfg.badgeHeight * 0.7,
  );

  const barsTopY = y + cfg.barsTopOffset;

  const sectionFillRgb = lightenRgb(section.color, 0.88);
  const sectionBorderRgb = lightenRgb(section.color, 0.6);

  for (let i = 0; i < sectionBars.length; i++) {
    const col = i % barsPerRow;
    const row = Math.floor(i / barsPerRow);
    const bx = x + col * (cfg.barW + cfg.barGap);
    const by = barsTopY + row * (cfg.barH + cfg.barGap);
    const bar = sectionBars[i]!;

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

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(cfg.barNumFontSize);
    doc.setTextColor(50, 50, 50);
    const numStr = String(i + 1);
    const numW = doc.getTextWidth(numStr);
    doc.text(numStr, bx + (cfg.barW - numW) / 2, by + cfg.barH * 0.38);

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
    await renderGroove(
      doc,
      section.groove,
      x + grooveX,
      y + grooveY,
      grooveW,
      grooveH,
    );
  }
}

export async function createStructurePdf({
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

  let ty = cfg.margin;
  if (title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(cfg.titleFontSize);
    doc.setTextColor(30, 30, 30);
    doc.text(title, cfg.margin, ty + 5);
    ty += 6;
  }

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

  const layouts = layoutSections(sections, bars, cfg, wrapText);

  let col = 0;
  const colY: number[] = new Array(cfg.numCols).fill(cfg.margin + headerH);
  const pageBottom = cfg.pageH - cfg.margin;

  for (const layout of layouts) {
    if (colY[col] + layout.totalH <= pageBottom) {
      const colX = cfg.margin + col * (colW + cfg.colGap);
      await renderSection(doc, layout, colX, colY[col], cfg);
      colY[col] += layout.totalH + cfg.sectionGapY;
    } else if (col + 1 < cfg.numCols) {
      col++;
      const colX = cfg.margin + col * (colW + cfg.colGap);
      await renderSection(doc, layout, colX, colY[col], cfg);
      colY[col] += layout.totalH + cfg.sectionGapY;
    } else {
      doc.addPage();
      for (let i = 0; i < cfg.numCols; i++) colY[i] = cfg.margin;
      col = 0;
      await renderSection(doc, layout, cfg.margin, colY[col], cfg);
      colY[col] += layout.totalH + cfg.sectionGapY;
    }
  }

  return doc;
}

export async function exportStructurePdf(options: ExportOptions) {
  const doc = await createStructurePdf(options);
  const filename = options.title
    ? `${options.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}_estrutura.pdf`
    : 'estrutura.pdf';
  doc.save(filename);
}
