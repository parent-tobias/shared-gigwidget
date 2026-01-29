/**
 * Bootstrap Signaling Handler
 *
 * Handles raw WebRTC signaling for the bootstrap process.
 * This is separate from y-webrtc because the join page uses raw SDP signaling.
 *
 * Flow:
 * 1. Host subscribes to session topic on signaling server
 * 2. Join page sends SDP offer
 * 3. Host creates RTCPeerConnection, answers, and establishes data channel
 * 4. Bootstrap data transfer happens over this raw WebRTC connection
 * 5. After bootstrap, the loaded app joins via y-webrtc for ongoing sync
 */

import { BOOTSTRAP_CHANNEL_LABEL } from '../bootstrap/index.js';

export interface BootstrapSignalingOptions {
  sessionId: string;
  signalingServer: string;
  onDataChannel: (channel: RTCDataChannel, peerId: string) => void;
  onError?: (error: Error) => void;
}

export class BootstrapSignaling {
  private ws: WebSocket | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private readonly sessionId: string;
  private readonly signalingServer: string;
  private readonly onDataChannel: (channel: RTCDataChannel, peerId: string) => void;
  private readonly onError?: (error: Error) => void;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private destroyed = false;

  constructor(options: BootstrapSignalingOptions) {
    this.sessionId = options.sessionId;
    this.signalingServer = options.signalingServer;
    this.onDataChannel = options.onDataChannel;
    this.onError = options.onError;
  }

  /**
   * Connect to signaling server and start listening for join requests
   */
  async connect(): Promise<void> {
    if (this.destroyed) return;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.signalingServer);

        this.ws.onopen = () => {
          console.log('[BootstrapSignaling] Connected to signaling server');
          // Subscribe to session topic
          this.send({
            type: 'subscribe',
            topics: [this.sessionId],
          });
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (event) => {
          console.error('[BootstrapSignaling] WebSocket error:', event);
          this.onError?.(new Error('Signaling connection error'));
        };

        this.ws.onclose = () => {
          console.log('[BootstrapSignaling] WebSocket closed');
          if (!this.destroyed && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  private send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);

      if (msg.type === 'publish') {
        const data = msg.data || JSON.parse(msg.message || '{}');
        const from = msg.from || msg.clientId || 'unknown';
        this.handleSignalingMessage(data, from);
      }
    } catch (err) {
      console.error('[BootstrapSignaling] Failed to parse message:', err);
    }
  }

  private async handleSignalingMessage(msg: any, from: string): Promise<void> {
    console.log('[BootstrapSignaling] Received:', msg.type, 'from:', from);

    if (msg.type === 'offer') {
      await this.handleOffer(msg.sdp, from);
    } else if (msg.type === 'ice') {
      await this.handleIceCandidate(msg.candidate, from);
    }
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit, peerId: string): Promise<void> {
    console.log('[BootstrapSignaling] Handling offer from:', peerId);

    try {
      // Create new peer connection for this joiner
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      this.peerConnections.set(peerId, pc);

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.send({
            type: 'publish',
            topic: this.sessionId,
            data: { type: 'ice', candidate: event.candidate },
            to: peerId,
          });
        }
      };

      // Handle incoming data channels
      pc.ondatachannel = (event) => {
        console.log('[BootstrapSignaling] Data channel received:', event.channel.label);
        if (event.channel.label === BOOTSTRAP_CHANNEL_LABEL) {
          this.onDataChannel(event.channel, peerId);
        }
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log('[BootstrapSignaling] Connection state:', pc.connectionState, 'for peer:', peerId);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          this.cleanupPeer(peerId);
        }
      };

      // Set remote description (the offer)
      await pc.setRemoteDescription(sdp);

      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.send({
        type: 'publish',
        topic: this.sessionId,
        data: { type: 'answer', sdp: pc.localDescription },
        to: peerId,
      });

      console.log('[BootstrapSignaling] Sent answer to:', peerId);
    } catch (err) {
      console.error('[BootstrapSignaling] Failed to handle offer:', err);
      this.onError?.(err instanceof Error ? err : new Error('Failed to handle offer'));
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit, peerId: string): Promise<void> {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.error('[BootstrapSignaling] Failed to add ICE candidate:', err);
      }
    }
  }

  private cleanupPeer(peerId: string): void {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
  }

  /**
   * Disconnect from signaling and clean up all connections
   */
  destroy(): void {
    this.destroyed = true;

    // Close all peer connections
    for (const [peerId, pc] of this.peerConnections) {
      pc.close();
    }
    this.peerConnections.clear();

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
