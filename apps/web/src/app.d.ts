/// <reference types="@sveltejs/kit" />

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  /**
   * Bootstrap context for P2P app transfer.
   * Set by the bootstrap page when the app is loaded via QR code scan.
   */
  interface BootstrapContext {
    /** Compressed app bundle (already loaded into DOM) */
    appBundle?: ArrayBuffer;
    /** Compression type used for the bundle */
    compression?: 'brotli' | 'gzip' | 'none';
    /** Session payload from QR code */
    payload?: import('@gigwidget/core').BootstrapSessionPayload;
    /** Encoded song data blob */
    songData?: ArrayBuffer;
    /** Existing WebRTC data channel to reuse */
    dataChannel?: RTCDataChannel;
    /** Existing peer connection to reuse */
    peerConnection?: RTCPeerConnection;
    /** Whether bootstrap is complete */
    bootstrapComplete?: boolean;
  }

  interface Window {
    __GIGWIDGET_BOOTSTRAP_CONTEXT__?: BootstrapContext;
  }
}

export {};
