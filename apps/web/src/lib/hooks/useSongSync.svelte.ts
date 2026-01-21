/**
 * Svelte 5 hook for managing Yjs document sync for a song.
 *
 * Uses y-indexeddb for local persistence and optionally connects
 * to remote peers via WebRTC or Supabase.
 */

import * as Y from 'yjs';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export interface SongSyncState {
  status: SyncStatus;
  peerCount: number;
  content: string;
  error: string | null;
}

export interface SongSyncActions {
  setContent: (content: string) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  forceSync: () => Promise<void>;
}

/**
 * Creates a reactive song sync state using Yjs for real-time collaboration.
 *
 * @param songId - The unique song ID (used for doc naming)
 * @param initialContent - Initial content if doc is new
 * @returns Tuple of [state, actions]
 */
export function useSongSync(
  songId: string,
  initialContent: string = ''
): [SongSyncState, SongSyncActions] {
  // Reactive state using Svelte 5 runes
  let status = $state<SyncStatus>('offline');
  let peerCount = $state(0);
  let content = $state(initialContent);
  let error = $state<string | null>(null);

  // Yjs document and providers
  let doc: Y.Doc | null = null;
  let text: Y.Text | null = null;
  let indexeddbProvider: any = null;
  let webrtcProvider: any = null;

  // Initialize the Yjs document
  async function init() {
    if (doc) return;

    doc = new Y.Doc();
    text = doc.getText('content');

    // Set initial content if text is empty
    if (text.length === 0 && initialContent) {
      text.insert(0, initialContent);
    }

    // Sync content state with Y.Text
    content = text.toString();

    // Listen to changes
    text.observe(() => {
      content = text?.toString() ?? '';
    });

    // Set up local persistence with y-indexeddb
    try {
      const { IndexeddbPersistence } = await import('@gigwidget/sync');
      indexeddbProvider = new IndexeddbPersistence(`song-${songId}`, doc);

      indexeddbProvider.on('synced', () => {
        // Update content after loading from IndexedDB
        content = text?.toString() ?? '';
        if (status === 'offline') {
          status = 'synced';
        }
      });
    } catch (err) {
      console.error('Failed to initialize IndexedDB persistence:', err);
      error = 'Failed to initialize local storage';
    }
  }

  // Connect to remote peers
  async function connect() {
    if (!doc) {
      await init();
    }

    status = 'syncing';

    try {
      const { WebrtcProvider } = await import('@gigwidget/sync');

      webrtcProvider = new WebrtcProvider(`song-${songId}`, doc!, {
        signaling: ['wss://signaling.yjs.dev'],
      });

      webrtcProvider.awareness.on('change', () => {
        peerCount = webrtcProvider.awareness.getStates().size - 1; // Exclude self
      });

      webrtcProvider.on('synced', () => {
        status = 'synced';
      });

      webrtcProvider.on('status', ({ connected }: { connected: boolean }) => {
        if (connected) {
          status = 'synced';
        }
      });
    } catch (err) {
      console.error('Failed to connect to peers:', err);
      error = 'Failed to connect to peers';
      status = 'error';
    }
  }

  // Disconnect from peers
  function disconnect() {
    if (webrtcProvider) {
      webrtcProvider.destroy();
      webrtcProvider = null;
    }
    peerCount = 0;
    status = 'offline';
  }

  // Update content
  function setContent(newContent: string) {
    if (!text || !doc) return;

    doc.transact(() => {
      text!.delete(0, text!.length);
      text!.insert(0, newContent);
    });
  }

  // Force sync
  async function forceSync() {
    if (!webrtcProvider) {
      await connect();
    }
  }

  // Cleanup on destroy
  $effect(() => {
    init();

    return () => {
      disconnect();
      if (indexeddbProvider) {
        indexeddbProvider.destroy();
        indexeddbProvider = null;
      }
      if (doc) {
        doc.destroy();
        doc = null;
        text = null;
      }
    };
  });

  // Create reactive state object
  const state = {
    get status() {
      return status;
    },
    get peerCount() {
      return peerCount;
    },
    get content() {
      return content;
    },
    get error() {
      return error;
    },
  };

  const actions: SongSyncActions = {
    setContent,
    connect,
    disconnect,
    forceSync,
  };

  return [state, actions];
}
