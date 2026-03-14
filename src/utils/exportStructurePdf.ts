import jsPDF from 'jspdf';
import type { StructureBar, StructureSection } from '@/types';

export type PdfFormat = 'a4' | 'ipad-air';

interface ExportOptions {
  title: string;
  artist: string;
  bpm?: number;
  sections: StructureSection[];
  bars: StructureBar[];
  format?: PdfFormat;
}

interface FormatConfig {
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
}

const FORMATS: Record<PdfFormat, FormatConfig> = {
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
  },
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function lightenColor(hex: string, amount: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [
    Math.min(255, r + (255 - r) * amount),
    Math.min(255, g + (255 - g) * amount),
    Math.min(255, b + (255 - b) * amount),
  ];
}

interface SectionLayout {
  section: StructureSection;
  sectionBars: StructureBar[];
  barsPerRow: number;
  gridW: number;
  barsH: number;
  commentLines: string[];
  commentBeside: boolean;
  totalH: number;
}

function calcLayout(
  doc: jsPDF,
  section: StructureSection,
  sectionBars: StructureBar[],
  cfg: FormatConfig,
): SectionLayout {
  const colW =
    (cfg.pageW - cfg.margin * 2 - cfg.colGap * (cfg.numCols - 1)) /
    cfg.numCols;

  const barsPerRow =
    section.barsPerRow ??
    Math.floor((colW * 0.45) / (cfg.barW + cfg.barGap));
  const rowCount = Math.ceil(sectionBars.length / barsPerRow);
  const colCount = Math.min(sectionBars.length, barsPerRow);
  const gridW = colCount * (cfg.barW + cfg.barGap) - cfg.barGap;
  const barsH = rowCount * (cfg.barH + cfg.barGap) - cfg.barGap;

  const availableBesideW = colW - gridW - cfg.commentGap;
  const commentBeside = availableBesideW >= cfg.commentBesideMinW;
  const commentMaxW = commentBeside ? availableBesideW : colW;

  const commentLines = section.comment
    ? doc
        .setFont('helvetica', 'italic')
        .setFontSize(cfg.commentFontSize)
        .splitTextToSize(section.comment, commentMaxW)
    : [];
  const commentH = commentLines.length * cfg.commentLineHeight;

  let totalH: number;
  if (commentBeside) {
    totalH = cfg.barsTopOffset + Math.max(barsH, commentH);
  } else {
    totalH =
      cfg.barsTopOffset +
      barsH +
      (commentLines.length > 0 ? 2 + commentH : 0);
  }

  return {
    section,
    sectionBars,
    barsPerRow,
    gridW,
    barsH,
    commentLines,
    commentBeside,
    totalH,
  };
}

function renderSection(
  doc: jsPDF,
  layout: SectionLayout,
  x: number,
  y: number,
  cfg: FormatConfig,
) {
  const { section, sectionBars, barsPerRow, gridW, commentLines, commentBeside, barsH } = layout;
  const [r, g, b] = hexToRgb(section.color);
  const [lr, lg, lb] = lightenColor(section.color, 0.85);

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
  const sectionFillRgb = lightenColor(section.color, 0.88);
  const sectionBorderRgb = lightenColor(section.color, 0.6);

  const dotCounts: Record<string, number> = {
    '4/4': 8,
    '3/4': 6,
    '2/4': 4,
    '6/8': 6,
  };

  for (let i = 0; i < sectionBars.length; i++) {
    const col = i % barsPerRow;
    const row = Math.floor(i / barsPerRow);
    const bx = x + col * (cfg.barW + cfg.barGap);
    const by = barsTopY + row * (cfg.barH + cfg.barGap);
    const bar = sectionBars[i]!;

    // Per-bar color or section color
    const barColor = bar.color ?? section.color;
    const [blr, blg, blb] = bar.color
      ? lightenColor(bar.color, 0.88)
      : sectionFillRgb;
    const [bdr, bdg, bdb] = bar.color
      ? lightenColor(bar.color, 0.6)
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
    const dotCount = dotCounts[bar.timeSignature] ?? 8;
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
  const barMap = new Map(bars.map((b) => [b.id, b]));
  const colW =
    (cfg.pageW - cfg.margin * 2 - cfg.colGap * (cfg.numCols - 1)) /
    cfg.numCols;

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
  const layouts: SectionLayout[] = [];
  for (const section of sections) {
    const sectionBars = section.barIds
      .map((bid) => barMap.get(bid))
      .filter(Boolean) as StructureBar[];
    if (sectionBars.length === 0) continue;
    layouts.push(calcLayout(doc, section, sectionBars, cfg));
  }

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
