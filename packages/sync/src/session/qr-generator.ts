/**
 * QR Code Generation for Session Sharing
 *
 * Generates QR codes that encode session connection information.
 * Users scan the QR code to join a sharing session.
 */

import type { QRSessionPayload, BootstrapSessionPayload } from '@gigwidget/core';

// We'll use the 'qrcode' package for generation
// This is a lightweight abstraction layer

export interface QRCodeOptions {
  /** Size in pixels */
  size?: number;
  /** Error correction level */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  /** Margin (quiet zone) in modules */
  margin?: number;
  /** Dark color (foreground) */
  darkColor?: string;
  /** Light color (background) */
  lightColor?: string;
}

const DEFAULT_OPTIONS: Required<QRCodeOptions> = {
  size: 256,
  errorCorrectionLevel: 'M',
  margin: 2,
  darkColor: '#000000',
  lightColor: '#ffffff',
};

/**
 * Check if a payload is a bootstrap-enabled payload
 */
export function isBootstrapPayload(
  payload: QRSessionPayload | BootstrapSessionPayload
): payload is BootstrapSessionPayload {
  return 'bootstrapVersion' in payload;
}

/**
 * Encode session payload for QR code
 *
 * Uses a compact JSON format to minimize QR code size.
 */
export function encodeSessionPayload(payload: QRSessionPayload | BootstrapSessionPayload): string {
  // Create compact version to reduce QR code size
  const compact: Record<string, unknown> = {
    s: payload.sessionId,
    t: payload.type,
    h: payload.hostId,
    n: payload.hostName,
    c: encodeConnectionInfo(payload.connectionInfo),
    m: payload.libraryManifest.map((entry) => ({
      i: entry.id,
      t: entry.title,
      a: entry.artist,
      n: entry.instruments,
    })),
    ts: payload.createdAt,
    ex: payload.expiresAt,
  };

  // Add bootstrap info if present
  if (isBootstrapPayload(payload)) {
    compact.bv = payload.bootstrapVersion;
    compact.bh = payload.bundleHash;
    compact.bs = payload.bundleSize;
    compact.ss = payload.songDataSize;
  }

  // Base64 encode for URL-safe transport
  return btoa(JSON.stringify(compact));
}

/**
 * Decode session payload from QR code data
 */
export function decodeSessionPayload(encoded: string): QRSessionPayload | BootstrapSessionPayload {
  const compact = JSON.parse(atob(encoded));

  const base: QRSessionPayload = {
    sessionId: compact.s,
    type: compact.t,
    hostId: compact.h,
    hostName: compact.n,
    connectionInfo: decodeConnectionInfo(compact.t, compact.c),
    libraryManifest: compact.m.map((entry: { i: string; t: string; a?: string; n: string[] }) => ({
      id: entry.i,
      title: entry.t,
      artist: entry.a,
      instruments: entry.n,
    })),
    createdAt: compact.ts,
    expiresAt: compact.ex,
  };

  // Return bootstrap payload if bootstrap info is present
  if (compact.bv !== undefined) {
    return {
      ...base,
      bootstrapVersion: compact.bv,
      bundleHash: compact.bh,
      bundleSize: compact.bs,
      songDataSize: compact.ss,
    } satisfies BootstrapSessionPayload;
  }

  return base;
}

function encodeConnectionInfo(info: QRSessionPayload['connectionInfo']): unknown {
  switch (info.type) {
    case 'webrtc':
      return { s: info.signalingServer, r: info.roomId, p: info.password };
    case 'bluetooth':
      return { u: info.serviceUUID, c: info.characteristicUUID, d: info.deviceName };
    case 'local-network':
      return { a: info.addresses, p: info.port, t: info.token };
  }
}

function decodeConnectionInfo(type: string, compact: unknown): QRSessionPayload['connectionInfo'] {
  const c = compact as Record<string, unknown>;
  switch (type) {
    case 'webrtc':
      return {
        type: 'webrtc',
        signalingServer: c.s as string,
        roomId: c.r as string,
        password: c.p as string | undefined,
      };
    case 'bluetooth':
      return {
        type: 'bluetooth',
        serviceUUID: c.u as string,
        characteristicUUID: c.c as string,
        deviceName: c.d as string,
      };
    case 'local-network':
      return {
        type: 'local-network',
        addresses: c.a as string[],
        port: c.p as number,
        token: c.t as string,
      };
    default:
      throw new Error(`Unknown connection type: ${type}`);
  }
}

/**
 * Generate a URL for the bootstrap join page
 */
export function generateBootstrapUrl(
  payload: BootstrapSessionPayload,
  baseUrl: string = 'https://gigwidget.app'
): string {
  const encoded = encodeSessionPayload(payload);
  return `${baseUrl}/join#${encoded}`;
}

/**
 * Generate QR code as data URL
 *
 * Requires 'qrcode' package to be installed.
 */
export async function generateQRCodeDataURL(
  payload: QRSessionPayload | BootstrapSessionPayload,
  options: QRCodeOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const encoded = encodeSessionPayload(payload);

  // Dynamic import to keep bundle size down when not used
  const QRCode = await import('qrcode');

  return QRCode.toDataURL(encoded, {
    width: opts.size,
    errorCorrectionLevel: opts.errorCorrectionLevel,
    margin: opts.margin,
    color: {
      dark: opts.darkColor,
      light: opts.lightColor,
    },
  });
}

/**
 * Generate QR code as SVG string
 */
export async function generateQRCodeSVG(
  payload: QRSessionPayload | BootstrapSessionPayload,
  options: QRCodeOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const encoded = encodeSessionPayload(payload);

  const QRCode = await import('qrcode');

  return QRCode.toString(encoded, {
    type: 'svg',
    width: opts.size,
    errorCorrectionLevel: opts.errorCorrectionLevel,
    margin: opts.margin,
    color: {
      dark: opts.darkColor,
      light: opts.lightColor,
    },
  });
}

/**
 * Generate QR code to canvas element
 */
export async function generateQRCodeToCanvas(
  canvas: HTMLCanvasElement,
  payload: QRSessionPayload | BootstrapSessionPayload,
  options: QRCodeOptions = {}
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const encoded = encodeSessionPayload(payload);

  const QRCode = await import('qrcode');

  await QRCode.toCanvas(canvas, encoded, {
    width: opts.size,
    errorCorrectionLevel: opts.errorCorrectionLevel,
    margin: opts.margin,
    color: {
      dark: opts.darkColor,
      light: opts.lightColor,
    },
  });
}

/**
 * Estimate QR code data size for a session
 *
 * Useful for warning users if manifest is too large.
 */
export function estimateQRCodeSize(payload: QRSessionPayload | BootstrapSessionPayload): {
  bytes: number;
  tooLarge: boolean;
} {
  const encoded = encodeSessionPayload(payload);
  const bytes = encoded.length;

  // QR codes can hold up to ~2953 bytes at error correction level L
  // We use level M, which holds ~2331 bytes
  const maxBytes = 2000; // Conservative limit

  return {
    bytes,
    tooLarge: bytes > maxBytes,
  };
}
