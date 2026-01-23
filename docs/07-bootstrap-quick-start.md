# Bootstrap Quick Start

This guide explains how to use the P2P Bootstrap System to share the app and songs with new users who don't have Gigwidget installed.

## For Hosts (Sharing Your Songs)

### Step 1: Start a Bootstrap Session

1. Open Gigwidget on your device
2. Go to the **Session** page
3. Tap **Start Session**
4. Enable **Bootstrap Mode** (allows new users to receive the app)
5. Select which songs to share (or share all)

### Step 2: Display the QR Code

Once the session is active, a QR code will be displayed. This QR code contains:
- Session connection information
- App bundle metadata (size, hash)
- Song manifest (list of available songs)

### Step 3: Have Others Scan

New users scan the QR code with their phone's camera. They don't need any app installed - the QR code leads to a web page that handles everything.

### What Happens Next

1. The joining device loads a small bootstrap page (~12KB)
2. A WebRTC connection is established to your device
3. The full app (~1-2MB) is transferred directly to them
4. All shared songs are transferred
5. They're now running Gigwidget with all your songs!

---

## For Joiners (Receiving the App)

### Step 1: Scan the QR Code

Use your phone's camera to scan the QR code shown on the host's device. This works on:
- iPhone (built-in camera app)
- Android (built-in camera or Google Lens)
- Any QR scanner app

### Step 2: Open the Link

Tap the link that appears. It will open in your browser and show:
- Host's name
- List of songs being shared
- Connection status

### Step 3: Wait for Transfer

The page will show progress as data transfers:
1. **Connecting** - Establishing peer connection
2. **Downloading app** - Receiving the Gigwidget app
3. **Downloading songs** - Receiving song data
4. **Loading** - Starting the app

### Step 4: Start Using Gigwidget

Once complete, the full app loads with all the shared songs. You can:
- View and edit songs
- Continue syncing with the host
- Use the app completely offline

---

## Network Requirements

### What You Need

| Device | Requirement |
|--------|-------------|
| Host | WiFi or mobile data (for signaling only) |
| Joiner | WiFi or mobile data (for signaling + initial page) |

### What's P2P (No Internet After Connection)

Once connected, these work without internet:
- App bundle transfer
- Song data transfer
- Real-time collaboration
- All ongoing sync

### Signaling Servers

The initial connection uses public signaling servers:
- `wss://signaling.yjs.dev`
- `wss://y-webrtc-signaling-eu.herokuapp.com`

These only exchange connection metadata (~few KB), not your actual data.

---

## Troubleshooting

### "Connection Failed"

1. Make sure both devices have internet (at least briefly)
2. Try moving closer together
3. Check if the session has expired
4. Have the host create a new session

### "Transfer Stuck"

1. Poor network conditions can slow transfers
2. Wait - the app handles retries automatically
3. If stuck for >1 minute, tap "Try Again"

### "Hash Mismatch Error"

Data was corrupted during transfer. This is rare but can happen with poor connections. Simply retry the transfer.

### QR Code Won't Scan

1. Ensure good lighting on the QR code
2. Hold your camera steady
3. Try zooming in slightly
4. Make sure the entire QR code is visible

---

## Tips for Best Results

### For Hosts

1. **Stable Connection**: Use WiFi if possible for faster transfers
2. **Keep Screen On**: Don't let your device sleep during transfer
3. **Stay Close**: Being in the same room helps WebRTC connect faster
4. **Limit Songs**: Fewer songs = faster transfer for first-time users

### For Joiners

1. **Use WiFi**: The initial app download is ~1-2MB
2. **Be Patient**: First connection takes 10-30 seconds
3. **Keep Browser Open**: Don't switch apps during transfer
4. **Add to Home Screen**: After loading, add Gigwidget to your home screen for easy access

---

## After Bootstrap

### You're Now Synced!

Both devices are connected and syncing in real-time. Any changes either person makes will appear on the other device instantly.

### Leaving the Session

Either party can leave at any time:
- The host can end the session
- Joiners can disconnect

Songs you received remain on your device even after disconnecting.

### Future Sessions

Once you have the app, you don't need bootstrap mode for future sessions. Regular QR code sharing works instantly since you already have the app installed.

---

## Developer Notes

### Enabling Bootstrap in Code

```typescript
const sessionManager = new SessionManager({ user });

const payload = await sessionManager.createSession(songManifest, {
  type: 'webrtc',
  enableBootstrap: true,
  appBundle: await loadAppBundle(),
  songDocs: getSongDocuments(),
});
```

### Loading the App Bundle

The app bundle is generated during build:

```typescript
async function loadAppBundle(): Promise<ArrayBuffer> {
  const response = await fetch('/_app/immutable/bootstrap-bundle.gz');
  return response.arrayBuffer();
}
```

### Checking Bootstrap Mode

```typescript
import { getSessionStore } from '$lib/stores/sessionStore.svelte';

const store = getSessionStore();
if (store.hasBootstrapContext()) {
  // App was loaded via bootstrap
  const ctx = store.getBootstrapContext();
}
```

---

## FAQ

**Q: How much data is transferred?**
A: The app bundle is ~1-2MB compressed. Song data varies based on how many songs are shared.

**Q: Does this work offline?**
A: You need internet briefly for the initial connection. After that, everything is P2P.

**Q: Is my data secure?**
A: Yes. Data is transferred directly between devices using WebRTC encryption. Nothing goes through servers.

**Q: What if the host's phone dies?**
A: The transfer would stop. The joiner can scan again once the host is back.

**Q: Can I bootstrap to multiple people at once?**
A: Yes! The host can serve the app to multiple joiners simultaneously.
