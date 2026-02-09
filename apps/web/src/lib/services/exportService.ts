/**
 * Export Service
 *
 * Handles exporting songs as ChordPro text files (.chopro) and PDF.
 * Supports single song, multi-song zip, and multi-page PDF exports.
 */

import type { Song } from '@gigwidget/core';

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = 'chordpro' | 'pdf';
export type ExportSortOrder = 'as-is' | 'alphabetical' | 'set-order';

export interface ExportOptions {
  format: ExportFormat;
  includeChordDiagrams?: boolean;
  sortOrder?: ExportSortOrder;
}

export interface ExportSongData {
  song: Song;
  content: string; // ChordPro content (already transposed if applicable)
}

// ============================================================================
// Helpers
// ============================================================================

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function extractChordsFromContent(content: string): string[] {
  const chordMatches = content.matchAll(/\[([^\]]+)\]/g);
  const chords = new Set<string>();
  for (const match of chordMatches) {
    const name = match[1].trim();
    if (name && !name.includes(':')) {
      chords.add(name);
    }
  }
  return Array.from(chords);
}

// ============================================================================
// Data Loading
// ============================================================================

export async function prepareSongDataForExport(
  songIds: string[],
  sortOrder: ExportSortOrder,
  setOrder?: string[],
): Promise<ExportSongData[]> {
  const { SongRepository, ArrangementRepository } = await import('@gigwidget/db');

  const items: ExportSongData[] = [];

  for (const songId of songIds) {
    const song = await SongRepository.getById(songId);
    if (!song) continue;

    const arrangements = await ArrangementRepository.getBySong(songId);
    const content = arrangements[0]?.content || '';

    items.push({ song, content });
  }

  // Apply sort
  if (sortOrder === 'alphabetical') {
    items.sort((a, b) => a.song.title.localeCompare(b.song.title));
  } else if (sortOrder === 'set-order' && setOrder) {
    items.sort((a, b) => {
      const ai = setOrder.indexOf(a.song.id);
      const bi = setOrder.indexOf(b.song.id);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });
  }
  // 'as-is' keeps the original songIds order

  return items;
}

// ============================================================================
// ChordPro Export
// ============================================================================

export function exportSingleChordPro(data: ExportSongData): void {
  const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8' });
  const filename = sanitizeFilename(data.song.title) + '.chopro';
  triggerDownload(blob, filename);
}

export async function exportMultipleChordPro(
  items: ExportSongData[],
  zipName?: string,
): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const usedNames = new Set<string>();
  for (const item of items) {
    let baseName = sanitizeFilename(item.song.title);
    let name = baseName;
    let counter = 1;
    while (usedNames.has(name)) {
      name = `${baseName} (${counter++})`;
    }
    usedNames.add(name);
    zip.file(`${name}.chopro`, item.content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = sanitizeFilename(zipName || 'songs') + '.zip';
  triggerDownload(blob, filename);
}

// ============================================================================
// PDF Export
// ============================================================================

// Layout constants (Letter size, points)
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_L = 40;
const MARGIN_T = 50;
const MARGIN_B = 40;
const MARGIN_R_NORMAL = 40;
const MARGIN_R_DIAGRAMS = 130;

const TITLE_SIZE = 16;
const ARTIST_SIZE = 11;
const META_SIZE = 9;
const SECTION_LABEL_SIZE = 10;
const CHORD_SIZE = 9;
const LYRIC_SIZE = 10;

const LINE_GAP = 3; // gap between chord+lyric line pairs
const SECTION_GAP = 10;
const HEADER_BOTTOM_GAP = 16;

// Chord diagram constants
const DIAGRAM_W = 70;
const DIAGRAM_H = 80;
const DIAGRAM_GAP = 8;
const DIAGRAM_LABEL_SIZE = 8;

export async function exportSinglePdf(
  data: ExportSongData,
  options: ExportOptions,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

  await renderSongToPdf(doc, data, options, true);

  const filename = sanitizeFilename(data.song.title) + '.pdf';
  doc.save(filename);
}

export async function exportMultiplePdf(
  items: ExportSongData[],
  options: ExportOptions,
  pdfName?: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

  for (let i = 0; i < items.length; i++) {
    if (i > 0) doc.addPage();
    await renderSongToPdf(doc, items[i], options, true);
  }

  const filename = sanitizeFilename(pdfName || 'songs') + '.pdf';
  doc.save(filename);
}

// ============================================================================
// PDF Rendering Engine
// ============================================================================

interface PdfCursor {
  y: number;
  doc: InstanceType<typeof import('jspdf').jsPDF>;
  marginRight: number;
}

function checkPageBreak(cursor: PdfCursor, needed: number): void {
  if (cursor.y + needed > PAGE_H - MARGIN_B) {
    cursor.doc.addPage();
    cursor.y = MARGIN_T;
  }
}

async function renderSongToPdf(
  doc: InstanceType<typeof import('jspdf').jsPDF>,
  data: ExportSongData,
  options: ExportOptions,
  isFirstPage: boolean,
): Promise<void> {
  const marginRight = options.includeChordDiagrams ? MARGIN_R_DIAGRAMS : MARGIN_R_NORMAL;
  const contentWidth = PAGE_W - MARGIN_L - marginRight;
  const cursor: PdfCursor = { y: MARGIN_T, doc, marginRight };

  // --- Metadata header ---
  const { song } = data;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(TITLE_SIZE);
  doc.text(song.title, MARGIN_L, cursor.y);
  cursor.y += TITLE_SIZE + 2;

  if (song.artist) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(ARTIST_SIZE);
    doc.text(song.artist, MARGIN_L, cursor.y);
    cursor.y += ARTIST_SIZE + 2;
  }

  const metaParts: string[] = [];
  if (song.key) metaParts.push(`Key: ${song.key}`);
  if (song.tempo) metaParts.push(`Tempo: ${song.tempo}`);
  if (metaParts.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(META_SIZE);
    doc.text(metaParts.join('  |  '), MARGIN_L, cursor.y);
    cursor.y += META_SIZE + 2;
  }

  cursor.y += HEADER_BOTTOM_GAP;

  // --- Parse ChordPro content ---
  const { ChordProParser } = await import('chordsheetjs');
  const parser = new ChordProParser();
  const parsed = parser.parse(data.content);

  // Walk through body paragraphs
  for (const paragraph of parsed.bodyParagraphs) {
    const sectionType = paragraph.type;

    // Section label
    if (sectionType && sectionType !== 'none') {
      const label = sectionType.charAt(0).toUpperCase() + sectionType.slice(1);
      checkPageBreak(cursor, SECTION_GAP + SECTION_LABEL_SIZE + 4);
      cursor.y += SECTION_GAP;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(SECTION_LABEL_SIZE);
      doc.text(label, MARGIN_L, cursor.y);
      cursor.y += SECTION_LABEL_SIZE + 4;
    }

    for (const line of paragraph.lines) {
      // Collect chord-lyric pairs from this line
      const pairs: { chord: string; lyric: string }[] = [];
      let hasChords = false;

      for (const item of line.items) {
        if ('chords' in item && 'lyrics' in item) {
          // ChordLyricsPair
          const chord = (item as any).chords || '';
          const lyric = (item as any).lyrics || '';
          pairs.push({ chord, lyric });
          if (chord) hasChords = true;
        } else if ('name' in item && (item as any).isSectionDelimiter?.()) {
          // Section delimiter tag — already handled at paragraph level
        } else if ('name' in item && (item as any).isMetaTag?.()) {
          // Skip metadata tags
        } else if ('content' in item && typeof (item as any).content === 'string') {
          // Comment
          const commentText = (item as any).content;
          if (commentText) {
            checkPageBreak(cursor, LYRIC_SIZE + LINE_GAP);
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(LYRIC_SIZE);
            doc.text(commentText, MARGIN_L, cursor.y);
            cursor.y += LYRIC_SIZE + LINE_GAP;
          }
        }
      }

      if (pairs.length === 0) continue;

      // Calculate line height
      const lineHeight = hasChords
        ? CHORD_SIZE + 2 + LYRIC_SIZE + LINE_GAP
        : LYRIC_SIZE + LINE_GAP;

      checkPageBreak(cursor, lineHeight);

      // Render chords row
      if (hasChords) {
        doc.setFont('courier', 'bold');
        doc.setFontSize(CHORD_SIZE);

        let x = MARGIN_L;
        for (const pair of pairs) {
          if (pair.chord) {
            doc.text(pair.chord, x, cursor.y);
          }
          // Advance x by the lyric width (so chords align above their lyrics)
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(LYRIC_SIZE);
          const lyricWidth = pair.lyric ? doc.getTextWidth(pair.lyric) : 0;
          doc.setFont('courier', 'bold');
          doc.setFontSize(CHORD_SIZE);
          const chordWidth = pair.chord ? doc.getTextWidth(pair.chord) : 0;
          x += Math.max(lyricWidth, chordWidth + 4);
        }
        cursor.y += CHORD_SIZE + 2;
      }

      // Render lyrics row
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(LYRIC_SIZE);

      const fullLyric = pairs.map(p => p.lyric || '').join('');
      if (fullLyric.trim()) {
        let x = MARGIN_L;
        for (const pair of pairs) {
          const text = pair.lyric || '';
          if (text) {
            doc.text(text, x, cursor.y);
            x += doc.getTextWidth(text);
          } else {
            // No lyrics but had a chord — advance by chord width
            doc.setFont('courier', 'bold');
            doc.setFontSize(CHORD_SIZE);
            x += pair.chord ? doc.getTextWidth(pair.chord) + 4 : 0;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(LYRIC_SIZE);
          }
        }
      }
      cursor.y += LYRIC_SIZE + LINE_GAP;
    }
  }

  // --- Chord diagrams (right margin) ---
  if (options.includeChordDiagrams) {
    const chords = extractChordsFromContent(data.content);
    if (chords.length > 0) {
      await renderChordDiagrams(doc, chords, data.song);
    }
  }
}

async function renderChordDiagrams(
  doc: InstanceType<typeof import('jspdf').jsPDF>,
  chordNames: string[],
  song: Song,
): Promise<void> {
  // We'll render chord diagrams in the right margin of the first page
  const diagramX = PAGE_W - MARGIN_R_DIAGRAMS + 10;
  let diagramY = MARGIN_T;
  let currentPage = 1;
  const totalPages = doc.getNumberOfPages();

  // Switch to first page of this song for diagrams
  doc.setPage(totalPages - doc.getNumberOfPages() + 1);

  try {
    const { SVGuitarChord } = await import('svguitar');

    for (const chordName of chordNames) {
      // Check if we need to move to next page for diagrams
      if (diagramY + DIAGRAM_H + DIAGRAM_LABEL_SIZE > PAGE_H - MARGIN_B) {
        // Move to next page if available, otherwise skip remaining diagrams
        if (currentPage < totalPages) {
          currentPage++;
          doc.setPage(currentPage);
          diagramY = MARGIN_T;
        } else {
          break;
        }
      }

      // Draw chord label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(DIAGRAM_LABEL_SIZE);
      doc.text(chordName, diagramX + DIAGRAM_W / 2, diagramY, { align: 'center' });
      diagramY += DIAGRAM_LABEL_SIZE + 2;

      // Draw a simple text-based chord diagram placeholder
      // (SVGuitarChord requires a DOM container, so for PDF we draw a simple grid)
      drawChordGrid(doc, diagramX, diagramY, DIAGRAM_W - 10, DIAGRAM_H - DIAGRAM_LABEL_SIZE - DIAGRAM_GAP);

      diagramY += DIAGRAM_H - DIAGRAM_LABEL_SIZE + DIAGRAM_GAP;
    }
  } catch (err) {
    console.error('Failed to render chord diagrams:', err);
    // Fallback: just list chord names
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Chords: ' + chordNames.join(', '), diagramX, diagramY);
  }

  // Restore to last page
  doc.setPage(totalPages);
}

function drawChordGrid(
  doc: InstanceType<typeof import('jspdf').jsPDF>,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  // Draw a simple 4-string, 4-fret chord grid
  const strings = 4;
  const frets = 4;
  const stringSpacing = w / (strings - 1);
  const fretSpacing = h / frets;

  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.5);

  // Nut (top bar)
  doc.setLineWidth(2);
  doc.line(x, y, x + w, y);
  doc.setLineWidth(0.5);

  // Fret lines
  for (let f = 1; f <= frets; f++) {
    const fy = y + f * fretSpacing;
    doc.line(x, fy, x + w, fy);
  }

  // String lines
  for (let s = 0; s < strings; s++) {
    const sx = x + s * stringSpacing;
    doc.line(sx, y, sx, y + h);
  }
}
