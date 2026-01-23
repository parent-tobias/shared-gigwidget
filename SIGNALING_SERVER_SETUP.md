# WebRTC Signaling Server Setup

## Local Development

For local development and testing P2P features, you need a local signaling server.

### Installation

```bash
npm install -g y-websocket-server
```

### Running the Server

```bash
# Run on port 4444 (default)
y-websocket-server --port 4444

# Or with custom port
y-websocket-server --port 1234
```

The server will output:
```
y-websocket-server listening on:
ws://localhost:4444
```

### Testing Locally

1. Start the signaling server:
   ```bash
   y-websocket-server --port 4444
   ```

2. Start the Gigwidget dev server:
   ```bash
   cd apps/web
   npm run dev
   ```

3. Open the app in your browser (http://localhost:5173 or similar)

4. Try the P2P features - the app will automatically detect localhost and use the local signaling server

### Testing on Multiple Devices (Local Network)

If testing on multiple devices on the same network:

1. Find your machine's local IP:
   ```bash
   # macOS/Linux
   ifconfig | grep "inet "
   
   # Windows
   ipconfig
   ```
   Look for something like `192.168.1.x`

2. Start the signaling server (it listens on all interfaces):
   ```bash
   y-websocket-server --port 4444
   ```

3. On other devices, visit: `http://192.168.1.xxx:5173` (replace with your IP)

4. The app will use `wss://192.168.1.xxx:4444` for WebRTC signaling

## Production Deployment

For production on Vercel, you need a deployed signaling server since Vercel is serverless.

### Option 1: Deploy to Railway (Recommended)

Railway makes it easy to deploy Node.js applications:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Create a new Railway project
railway init

# Deploy y-websocket-server
railway add y-websocket-server
railway up
```

Then update the signaling server URL in `sessionStore.svelte.ts`:

```typescript
// Production servers
signalingServers = [
  'wss://your-railway-project.railway.app', // Your deployed server
  'wss://signaling.yjs.dev', // Fallback
];
```

### Option 2: Deploy to Heroku

```bash
# Create Procfile
echo "web: y-websocket-server --port $PORT" > Procfile

# Deploy
git push heroku main
```

### Option 3: Deploy to Render

1. Connect your GitHub repo to Render
2. Create a new Web Service
3. Set build command: `npm install -g y-websocket-server`
4. Set start command: `y-websocket-server --port ${PORT}`

### Environment Variables

For production, you might want to use environment variables:

```typescript
// In sessionStore.svelte.ts
const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_SERVER || 'wss://signaling.yjs.dev';

signalingServers = [
  SIGNALING_SERVER,
  'wss://signaling.yjs.dev', // Fallback
];
```

Create `.env.local` for development:
```
VITE_SIGNALING_SERVER=ws://localhost:4444
```

## Troubleshooting

### "WebSocket connection failed"
- Ensure signaling server is running
- Check the port is correct (default 4444)
- For local network: use your machine's IP address, not localhost
- Check firewall isn't blocking the port

### Connection works but peers don't appear
- Verify both devices can reach the signaling server
- Check browser console for connection errors
- Ensure both are using the same signaling server URL

### "Connection lost" after a while
- Local y-websocket-server might have timeout issues
- Use a deployed server for longer sessions
- Consider implementing reconnection logic

## Testing with ngrok (Alternative)

If you need to test the local server from outside your network:

```bash
# Install ngrok
npm install -g ngrok

# Start ngrok tunnel to your signaling server
ngrok http 4444

# Use the ngrok URL in your app
# Example: wss://abc123.ngrok.io
```

## Future: Supabase Realtime

Once you integrate Supabase, you can use their realtime database for signaling instead of WebRTC, eliminating the need for a signaling server.

See `docs/03-architecture.md` for Supabase integration plans.
