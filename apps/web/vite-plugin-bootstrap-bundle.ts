/**
 * Vite Plugin: Bootstrap Bundle Generator
 *
 * Generates a single compressed bundle file that can be served
 * to bootstrap clients via P2P WebRTC.
 *
 * The bundle contains the full app HTML with all JS/CSS inlined,
 * compressed with gzip for efficient transfer.
 */

import type { Plugin, ResolvedConfig } from 'vite';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { join, resolve } from 'path';
import { createHash } from 'crypto';

export interface BootstrapBundleOptions {
  /** Output directory relative to build output */
  outputDir?: string;
  /** Output filename (without extension) */
  outputName?: string;
  /** Whether to generate a manifest file with bundle info */
  generateManifest?: boolean;
}

const DEFAULT_OPTIONS: Required<BootstrapBundleOptions> = {
  outputDir: '_app/immutable',
  outputName: 'bootstrap-bundle',
  generateManifest: true,
};

export function bootstrapBundle(options: BootstrapBundleOptions = {}): Plugin {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let config: ResolvedConfig;
  let buildDir: string;

  return {
    name: 'gigwidget-bootstrap-bundle',
    apply: 'build',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
      buildDir = resolve(config.root, config.build.outDir);
    },

    async closeBundle() {
      console.log('\n[bootstrap-bundle] Generating bootstrap bundle...');

      try {
        // Read the built index.html
        const indexPath = join(buildDir, 'index.html');
        if (!existsSync(indexPath)) {
          console.warn('[bootstrap-bundle] index.html not found, skipping bundle generation');
          return;
        }

        let html = readFileSync(indexPath, 'utf-8');

        // Inline all JS and CSS
        html = await inlineAssets(html, buildDir);

        // Convert to buffer
        const htmlBuffer = Buffer.from(html, 'utf-8');

        // Create output directory
        const outputDir = join(buildDir, opts.outputDir);
        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }

        // Write uncompressed bundle (for reference)
        const rawPath = join(outputDir, `${opts.outputName}.html`);
        writeFileSync(rawPath, htmlBuffer);

        // Write gzip compressed bundle
        const gzipPath = join(outputDir, `${opts.outputName}.gz`);
        await compressFile(rawPath, gzipPath);

        // Calculate hashes
        const rawHash = computeHash(htmlBuffer);
        const gzipBuffer = readFileSync(gzipPath);
        const gzipHash = computeHash(gzipBuffer);

        // Generate manifest
        if (opts.generateManifest) {
          const manifest = {
            version: Date.now(),
            raw: {
              path: `${opts.outputDir}/${opts.outputName}.html`,
              size: htmlBuffer.length,
              hash: rawHash,
            },
            gzip: {
              path: `${opts.outputDir}/${opts.outputName}.gz`,
              size: gzipBuffer.length,
              hash: gzipHash,
            },
            generatedAt: new Date().toISOString(),
          };

          const manifestPath = join(outputDir, 'bootstrap-manifest.json');
          writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
          console.log(`[bootstrap-bundle] Manifest written to ${manifestPath}`);
        }

        console.log(`[bootstrap-bundle] Bundle generated:`);
        console.log(`  Raw:  ${formatSize(htmlBuffer.length)} -> ${rawPath}`);
        console.log(`  Gzip: ${formatSize(gzipBuffer.length)} -> ${gzipPath}`);
        console.log(`  Compression ratio: ${((1 - gzipBuffer.length / htmlBuffer.length) * 100).toFixed(1)}%`);
      } catch (err) {
        console.error('[bootstrap-bundle] Failed to generate bundle:', err);
      }
    },
  };
}

/**
 * Inline JS and CSS assets into HTML
 */
async function inlineAssets(html: string, buildDir: string): Promise<string> {
  // Inline CSS
  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="([^"]+)"[^>]*>/g,
    (_match, href) => {
      const cssPath = join(buildDir, href);
      if (existsSync(cssPath)) {
        const css = readFileSync(cssPath, 'utf-8');
        return `<style>${css}</style>`;
      }
      return _match;
    }
  );

  // Inline JS modules
  html = html.replace(
    /<script\s+type="module"\s+src="([^"]+)"[^>]*><\/script>/g,
    (_match, src) => {
      const jsPath = join(buildDir, src);
      if (existsSync(jsPath)) {
        const js = readFileSync(jsPath, 'utf-8');
        // Convert module to regular script for inline execution
        return `<script type="module">${js}</script>`;
      }
      return _match;
    }
  );

  // Inline regular JS
  html = html.replace(
    /<script\s+src="([^"]+)"[^>]*><\/script>/g,
    (_match, src) => {
      const jsPath = join(buildDir, src);
      if (existsSync(jsPath)) {
        const js = readFileSync(jsPath, 'utf-8');
        return `<script>${js}</script>`;
      }
      return _match;
    }
  );

  return html;
}

/**
 * Compress a file with gzip
 */
async function compressFile(inputPath: string, outputPath: string): Promise<void> {
  const gzip = createGzip({ level: 9 });
  const source = createReadStream(inputPath);
  const destination = createWriteStream(outputPath);

  await pipeline(source, gzip, destination);
}

/**
 * Compute SHA-256 hash of data
 */
function computeHash(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Format bytes as human-readable size
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default bootstrapBundle;
