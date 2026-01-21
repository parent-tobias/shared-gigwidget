/**
 * Song scraper for ozbcoz.com
 *
 * Searches and imports ChordPro songs from the ozbcoz.com ukulele songbook.
 * Uses a CORS proxy for browser-based fetching.
 */

// Public CORS proxies (fallback chain)
const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
];

const OZBCOZ_BASE = 'https://ozbcoz.com/Songs/';

export interface OzbcozSearchResult {
  id: string;
  title: string;
  artist?: string;
  key?: string;
  pageNumber?: string;
  url: string;
}

export interface OzbcozSongDetail {
  id: string;
  title: string;
  artist?: string;
  writer?: string;
  key?: string;
  tempo?: number;
  content: string; // ChordPro format
  youtubeUrl?: string;
}

/**
 * Fetch with CORS proxy fallback
 */
async function fetchWithProxy(url: string): Promise<string> {
  // Try direct fetch first (might work in some environments)
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (response.ok) {
      return await response.text();
    }
  } catch {
    // Fall through to proxy
  }

  // Try each proxy in order
  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = proxy + encodeURIComponent(url);
      const response = await fetch(proxyUrl);
      if (response.ok) {
        return await response.text();
      }
    } catch {
      // Try next proxy
    }
  }

  throw new Error(`Failed to fetch ${url} - all proxies failed`);
}

/**
 * Parse the song listing page HTML to extract search results
 */
function parseSongListHtml(html: string): OzbcozSearchResult[] {
  const results: OzbcozSearchResult[] = [];

  // Match song links: song.php?ID=1234,soprano pattern
  // Format: <a href="song.php?ID=6691,soprano">'Round The Bay Of Mexico</a> [G] (2346)
  const songLinkRegex = /<a\s+href="song\.php\?ID=(\d+),([^"]+)"[^>]*>([^<]+)<\/a>\s*(?:\[([A-G][#b]?m?)\])?\s*(?:\((\d+)\))?/gi;

  let match;
  while ((match = songLinkRegex.exec(html)) !== null) {
    const [, id, , title, key, pageNumber] = match;

    // Try to extract artist from surrounding context
    // Often formatted as: Title - Artist or just Title
    const cleanTitle = title.trim();
    let songTitle = cleanTitle;
    let artist: string | undefined;

    // Check if title contains " - " for artist separation
    const dashIndex = cleanTitle.lastIndexOf(' - ');
    if (dashIndex > 0) {
      songTitle = cleanTitle.substring(0, dashIndex).trim();
      artist = cleanTitle.substring(dashIndex + 3).trim();
    }

    results.push({
      id,
      title: songTitle,
      artist,
      key: key || undefined,
      pageNumber: pageNumber || undefined,
      url: `${OZBCOZ_BASE}song.php?ID=${id},soprano`,
    });
  }

  return results;
}

/**
 * Parse individual song page HTML to extract ChordPro content
 */
function parseSongPageHtml(html: string, id: string): OzbcozSongDetail {
  // Extract title
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                     html.match(/<title>([^<]+)<\/title>/i);
  let title = titleMatch ? titleMatch[1].trim() : 'Unknown';

  // Clean up title (remove "- ozbcoz.com" suffix if present)
  title = title.replace(/\s*[-–]\s*ozbcoz\.com.*$/i, '').trim();

  // Extract artist
  const artistMatch = html.match(/(?:Artist|By)[:\s]*([^<\n]+)/i);
  const artist = artistMatch ? artistMatch[1].trim() : undefined;

  // Extract writer
  const writerMatch = html.match(/(?:Writer|Written by)[:\s]*([^<\n]+)/i);
  const writer = writerMatch ? writerMatch[1].trim() : undefined;

  // Extract key
  const keyMatch = html.match(/(?:Key)[:\s]*([A-G][#b]?m?)/i);
  const key = keyMatch ? keyMatch[1] : undefined;

  // Extract tempo
  const tempoMatch = html.match(/(?:Tempo|BPM)[:\s]*(\d+)/i);
  const tempo = tempoMatch ? parseInt(tempoMatch[1], 10) : undefined;

  // Extract YouTube URL
  const youtubeMatch = html.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/i);
  const youtubeUrl = youtubeMatch ? `https://www.youtube.com/watch?v=${youtubeMatch[1]}` : undefined;

  // Extract the actual song content
  // The content is typically in a <pre> tag or specific div
  let content = '';

  // Try to find ChordPro content in various containers
  const preMatch = html.match(/<pre[^>]*class="[^"]*chordpro[^"]*"[^>]*>([\s\S]*?)<\/pre>/i);
  if (preMatch) {
    content = preMatch[1];
  } else {
    // Try generic pre tag
    const genericPreMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (genericPreMatch) {
      content = genericPreMatch[1];
    } else {
      // Try div with song content
      const divMatch = html.match(/<div[^>]*class="[^"]*song[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (divMatch) {
        content = divMatch[1];
      }
    }
  }

  // Clean up HTML entities and tags in content
  content = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

  // If content is empty, try to reconstruct from visible chord/lyric structure
  if (!content) {
    content = extractChordProFromStructuredHtml(html);
  }

  // Build ChordPro header if not already present
  if (!content.includes('{title:') && !content.includes('{t:')) {
    const header = buildChordProHeader(title, artist, key, tempo);
    content = header + '\n' + content;
  }

  return {
    id,
    title,
    artist,
    writer,
    key,
    tempo,
    content,
    youtubeUrl,
  };
}

/**
 * Extract ChordPro content from structured HTML with separate chord/lyric lines
 */
function extractChordProFromStructuredHtml(html: string): string {
  const lines: string[] = [];

  // Look for table rows with chord and lyric cells
  // Pattern: <tr><td class="chord">G</td>...</tr><tr><td class="lyric">word</td>...</tr>
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  const rows: string[][] = [];
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const cells: string[] = [];
    let cellMatch;
    const rowContent = rowMatch[1];
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  // Process rows in pairs (chord row + lyric row)
  for (let i = 0; i < rows.length; i += 2) {
    const chordRow = rows[i];
    const lyricRow = rows[i + 1] || [];

    // Merge chords into lyrics
    let line = '';
    for (let j = 0; j < Math.max(chordRow.length, lyricRow.length); j++) {
      const chord = chordRow[j] || '';
      const lyric = lyricRow[j] || '';

      if (chord) {
        line += `[${chord}]`;
      }
      line += lyric;
    }

    if (line.trim()) {
      lines.push(line);
    }
  }

  return lines.join('\n');
}

/**
 * Build ChordPro header directives
 */
function buildChordProHeader(title: string, artist?: string, key?: string, tempo?: number): string {
  const parts: string[] = [];

  parts.push(`{title: ${title}}`);

  if (artist) {
    parts.push(`{artist: ${artist}}`);
  }

  if (key) {
    parts.push(`{key: ${key}}`);
  }

  if (tempo) {
    parts.push(`{tempo: ${tempo}}`);
  }

  return parts.join('\n');
}

/**
 * Search for songs on ozbcoz.com
 */
export async function searchOzbcozSongs(query: string): Promise<OzbcozSearchResult[]> {
  // The site uses client-side filtering, so we fetch the full list and filter locally
  const url = `${OZBCOZ_BASE}index.php?sort=ttl`;
  const html = await fetchWithProxy(url);
  const allResults = parseSongListHtml(html);

  // Filter results by query
  const queryLower = query.toLowerCase();
  return allResults.filter(song =>
    song.title.toLowerCase().includes(queryLower) ||
    (song.artist && song.artist.toLowerCase().includes(queryLower))
  );
}

/**
 * Get full song details including ChordPro content
 */
export async function getOzbcozSongDetail(songId: string): Promise<OzbcozSongDetail> {
  const url = `${OZBCOZ_BASE}song.php?ID=${songId},soprano`;
  const html = await fetchWithProxy(url);
  return parseSongPageHtml(html, songId);
}

/**
 * Convert ozbcoz song detail to our Song model format
 */
export function convertToGigwidgetSong(detail: OzbcozSongDetail, _userId: string): {
  title: string;
  artist?: string;
  key?: string;
  tempo?: number;
  content: string;
  tags: string[];
} {
  return {
    title: detail.title,
    artist: detail.artist || detail.writer,
    key: detail.key as any, // Will be validated by the model
    tempo: detail.tempo,
    content: detail.content,
    tags: ['imported', 'ozbcoz'],
  };
}
