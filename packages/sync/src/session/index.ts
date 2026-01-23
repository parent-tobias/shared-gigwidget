/**
 * Session management for ad-hoc P2P sharing
 */

export { SessionManager, type SessionManagerOptions, type CreateSessionOptions, type JoinSessionOptions } from './session-manager.js';

export {
  encodeSessionPayload,
  decodeSessionPayload,
  generateQRCodeDataURL,
  generateQRCodeSVG,
  generateQRCodeToCanvas,
  estimateQRCodeSize,
  generateBootstrapUrl,
  isBootstrapPayload,
  type QRCodeOptions,
} from './qr-generator.js';
