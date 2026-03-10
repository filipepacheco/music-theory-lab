import jsPDF from 'jspdf';
import type { StructureBar, StructureSection } from '@/types';

interface ExportOptions {
  title: string;
  artist: string;
  sections: StructureSection[];
  bars: StructureBar[];
}

const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN = 12;

const BAR_SIZE = 5.5;
const BAR_GAP = 1;
const SECTION_GAP_Y = 4;
const COMMENT_GAP = 3;
const COL_GAP = 6;
const NUM_COLS = 2;
const COL_W = (PAGE_W - MARGIN * 2 - COL_GAP * (NUM_COLS - 1)) / NUM_COLS;

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
  totalH: number;
}

function calcLayout(doc: jsPDF, section: StructureSection, sectionBars: StructureBar[]): SectionLayout {
  const barsPerRow = section.barsPerRow ?? Math.floor((COL_W * 0.45) / (BAR_SIZE + BAR_GAP));
  const rowCount = Math.ceil(sectionBars.length / barsPerRow);
  const colCount = Math.min(sectionBars.length, barsPerRow);
  const gridW = colCount * (BAR_SIZE + BAR_GAP) - BAR_GAP;
  const barsH = rowCount * (BAR_SIZE + BAR_GAP) - BAR_GAP;

  const commentMaxW = Math.max(15, COL_W - gridW - COMMENT_GAP);
  const commentLines = section.comment
    ? doc.setFont('helvetica', 'italic').setFontSize(7).splitTextToSize(section.comment, commentMaxW)
    : [];
  const commentH = commentLines.length * 3;

  const totalH = 5 + Math.max(barsH, commentH);

  return { section, sectionBars, barsPerRow, gridW, barsH, commentLines, totalH };
}

function renderSection(doc: jsPDF, layout: SectionLayout, x: number, y: number) {
  const { section, sectionBars, barsPerRow, gridW, commentLines } = layout;
  const [r, g, b] = hexToRgb(section.color);
  const [lr, lg, lb] = lightenColor(section.color, 0.85);

  // Badge
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  const badgeText = section.name;
  const badgeW = doc.getTextWidth(badgeText) + 4;
  doc.setFillColor(lr, lg, lb);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, badgeW, 4, 0.8, 0.8, 'FD');
  doc.setTextColor(r, g, b);
  doc.text(badgeText, x + 2, y + 2.8);

  // Bar count
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(160, 160, 160);
  doc.text(`${sectionBars.length}c`, x + badgeW + 1.5, y + 2.8);

  const barsTopY = y + 5;

  // Bars grid
  const [blr, blg, blb] = lightenColor(section.color, 0.88);
  const [bdr, bdg, bdb] = lightenColor(section.color, 0.6);

  for (let i = 0; i < sectionBars.length; i++) {
    const col = i % barsPerRow;
    const row = Math.floor(i / barsPerRow);
    const bx = x + col * (BAR_SIZE + BAR_GAP);
    const by = barsTopY + row * (BAR_SIZE + BAR_GAP);

    doc.setFillColor(blr, blg, blb);
    doc.setDrawColor(bdr, bdg, bdb);
    doc.setLineWidth(0.15);
    doc.roundedRect(bx, by, BAR_SIZE, BAR_SIZE, 0.6, 0.6, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(50, 50, 50);
    const numStr = String(i + 1);
    const numW = doc.getTextWidth(numStr);
    doc.text(numStr, bx + (BAR_SIZE - numW) / 2, by + 3.2);

    const bar = sectionBars[i]!;
    if (bar.timeSignature !== '4/4') {
      doc.setFontSize(4);
      doc.setTextColor(130, 130, 130);
      const tsW = doc.getTextWidth(bar.timeSignature);
      doc.text(bar.timeSignature, bx + (BAR_SIZE - tsW) / 2, by + 5);
    }
  }

  // Comment beside bars
  if (commentLines.length > 0) {
    const commentX = x + gridW + COMMENT_GAP;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(commentLines, commentX, barsTopY + 2.5);
  }
}

export function exportStructurePdf({ title, artist, sections, bars }: ExportOptions) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const barMap = new Map(bars.map((b) => [b.id, b]));

  let headerH = 0;

  // -- Title --
  let ty = MARGIN;
  if (title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(30, 30, 30);
    doc.text(title, MARGIN, ty + 5);
    ty += 6;
  }
  if (artist) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(artist, MARGIN, ty + 3.5);
    ty += 5;
  }
  if (title || artist) {
    ty += 1;
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, ty, PAGE_W - MARGIN, ty);
    ty += 4;
  }
  headerH = ty - MARGIN;

  // -- Pre-calculate layouts --
  const layouts: SectionLayout[] = [];
  for (const section of sections) {
    const sectionBars = section.barIds
      .map((bid) => barMap.get(bid))
      .filter(Boolean) as StructureBar[];
    if (sectionBars.length === 0) continue;
    layouts.push(calcLayout(doc, section, sectionBars));
  }

  // -- Flow sections into columns (fill left first, then right) --
  let col = 0;
  const colY: number[] = new Array(NUM_COLS).fill(MARGIN + headerH);
  const pageBottom = PAGE_H - MARGIN;

  for (const layout of layouts) {
    // Try current column first
    if (colY[col] + layout.totalH <= pageBottom) {
      const colX = MARGIN + col * (COL_W + COL_GAP);
      renderSection(doc, layout, colX, colY[col]);
      colY[col] += layout.totalH + SECTION_GAP_Y;
    } else if (col + 1 < NUM_COLS) {
      // Current column full - move to next column
      col++;
      const colX = MARGIN + col * (COL_W + COL_GAP);
      renderSection(doc, layout, colX, colY[col]);
      colY[col] += layout.totalH + SECTION_GAP_Y;
    } else {
      // All columns full - new page, reset to first column
      doc.addPage();
      for (let i = 0; i < NUM_COLS; i++) colY[i] = MARGIN;
      col = 0;
      renderSection(doc, layout, MARGIN, colY[col]);
      colY[col] += layout.totalH + SECTION_GAP_Y;
    }
  }

  // -- Download --
  const filename = title
    ? `${title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}_estrutura.pdf`
    : 'estrutura.pdf';
  doc.save(filename);
}
