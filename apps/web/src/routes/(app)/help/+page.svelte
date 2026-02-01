<script lang="ts">
  import { browser } from '$app/environment';

  let activeSection = $state<string>('overview');

  const sections = [
    { id: 'overview', title: 'Overview', icon: '🎵' },
    { id: 'songs', title: 'Managing Songs', icon: '📝' },
    { id: 'collections', title: 'Collections & Setlists', icon: '📁' },
    { id: 'importing', title: 'Importing Songs', icon: '📥' },
    { id: 'sessions', title: 'Live Sessions', icon: '🎸' },
    { id: 'editing', title: 'Editing Songs', icon: '✏️' },
    { id: 'sync', title: 'Cloud Sync', icon: '☁️' },
  ];

  function scrollToSection(id: string) {
    activeSection = id;
    if (browser) {
      const element = document.getElementById(id);
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
</script>

<svelte:head>
  <title>Help - Gigwidget</title>
</svelte:head>

<div class="help-page">
  <aside class="help-sidebar">
    <h2>Help Topics</h2>
    <nav>
      {#each sections as section}
        <button
          class="nav-item"
          class:active={activeSection === section.id}
          onclick={() => scrollToSection(section.id)}
        >
          <span class="icon">{section.icon}</span>
          <span>{section.title}</span>
        </button>
      {/each}
    </nav>
  </aside>

  <main class="help-content">
    <header class="help-header">
      <h1>Gigwidget Help & Documentation</h1>
      <p>Learn how to use Gigwidget to organize and perform your music</p>
    </header>

    <section id="overview" class="help-section">
      <h2>🎵 Overview</h2>
      <p>
        Gigwidget is a chord sheet organizer and performance tool for musicians. It helps you
        manage your song library, organize setlists, and share music in real-time during
        rehearsals or performances.
      </p>

      <h3>Key Features</h3>
      <ul>
        <li><strong>Offline-First</strong> - All your songs are stored locally on your device</li>
        <li><strong>Cloud Sync</strong> - Optionally sync across devices via your account</li>
        <li><strong>Live Sessions</strong> - Share songs in real-time with your band using QR codes or join links</li>
        <li><strong>Collections & Setlists</strong> - Organize songs into folders or ordered performance lists</li>
        <li><strong>Transpose</strong> - Change song keys on the fly</li>
        <li><strong>ChordPro Format</strong> - Industry-standard format for chord sheets</li>
      </ul>

      <h3>Quick Start</h3>
      <ol>
        <li>Create an account or use offline mode</li>
        <li>Add songs manually or import from ChordPro files</li>
        <li>Organize songs into collections or setlists</li>
        <li>Start a session to share with your band</li>
      </ol>
    </section>

    <section id="songs" class="help-section">
      <h2>📝 Managing Songs</h2>

      <h3>Adding Songs</h3>
      <p>There are several ways to add songs to your library:</p>

      <div class="method">
        <h4>Create Manually</h4>
        <ol>
          <li>Go to Library → Click "+ New Song"</li>
          <li>Enter song title, artist, key, and tempo</li>
          <li>Write or paste your chord sheet in ChordPro format</li>
          <li>Click "Save"</li>
        </ol>
      </div>

      <div class="method">
        <h4>Import from File</h4>
        <p>Import ChordPro (.cho, .chopro, .txt) files:</p>
        <ol>
          <li>Go to Library → Click "Import"</li>
          <li>Select one or more ChordPro files</li>
          <li>Songs are automatically parsed and added to your library</li>
        </ol>
      </div>

      <h3>Viewing Songs</h3>
      <ul>
        <li><strong>Browse</strong> - View all songs in your library</li>
        <li><strong>Search</strong> - Filter by title, artist, or key</li>
        <li><strong>Sort</strong> - Order by title, artist, key, or date added</li>
        <li><strong>Click</strong> a song to open the viewer</li>
      </ul>

      <h3>Song Details</h3>
      <p>Each song can have the following metadata:</p>
      <ul>
        <li><strong>Title</strong> - Song name (required)</li>
        <li><strong>Artist</strong> - Composer or performer</li>
        <li><strong>Key</strong> - Original key signature</li>
        <li><strong>Tempo</strong> - BPM (beats per minute)</li>
        <li><strong>Tags</strong> - Keywords for organization (e.g., "jazz", "ballad", "upbeat")</li>
        <li><strong>Visibility</strong> - Private (just you) or Public (discoverable by others)</li>
      </ul>
    </section>

    <section id="collections" class="help-section">
      <h2>📁 Collections & Setlists</h2>

      <h3>What's the Difference?</h3>
      <div class="comparison">
        <div class="compare-item">
          <h4>Collections</h4>
          <p>Organize songs by category, genre, or any grouping you want.</p>
          <ul>
            <li>No specific order</li>
            <li>Great for "Jazz Standards", "Country Songs", etc.</li>
            <li>Can be sorted/filtered when viewing</li>
          </ul>
        </div>

        <div class="compare-item">
          <h4>Setlists</h4>
          <p>Ordered lists for performances or rehearsals.</p>
          <ul>
            <li>Specific song order (drag to reorder)</li>
            <li>Perfect for gigs or practice sessions</li>
            <li>Numbered for easy reference</li>
          </ul>
        </div>
      </div>

      <h3>Creating a Collection/Setlist</h3>
      <ol>
        <li>Go to Collections → Click "+ New"</li>
        <li>Enter a name and optional description</li>
        <li>Check "Setlist" if you want ordered songs</li>
        <li>Check "Public" to make it discoverable by others</li>
        <li>Click "Create"</li>
      </ol>

      <h3>Adding Songs</h3>
      <ol>
        <li>Open the collection/setlist</li>
        <li>Click "+ Add Songs"</li>
        <li>Search and select songs from your library</li>
        <li>For setlists: drag songs to reorder</li>
      </ol>

      <h3>Managing Collections</h3>
      <p>As the owner, you can:</p>
      <ul>
        <li><strong>Edit</strong> - Change name or description (pencil icon)</li>
        <li><strong>Delete</strong> - Remove the collection (trash icon, songs are not deleted)</li>
        <li><strong>Toggle Visibility</strong> - Make public or private (lock/globe icon)</li>
        <li><strong>Search & Sort</strong> - Filter songs or change sort order</li>
      </ul>
    </section>

    <section id="importing" class="help-section">
      <h2>📥 Importing Songs</h2>

      <h3>ChordPro Format</h3>
      <p>
        Gigwidget uses the ChordPro format, an industry-standard text format for chord sheets.
        ChordPro files are plain text with special directives for chords and metadata.
      </p>

      <div class="code-example">
        <h4>Example ChordPro File:</h4>
        <pre><code>{`{title: Amazing Grace}
{artist: John Newton}
{key: G}

{start_of_verse}
[G]Amazing [G7]grace how [C]sweet the [G]sound
That saved a [D]wretch like [D7]me
I [G]once was [G7]lost but [C]now I'm [G]found
Was [Em]blind but [D]now I [G]see
{end_of_verse}`}</code></pre>
      </div>

      <h3>Supported Directives</h3>
      <ul>
        <li><code>{`{title: ...}`}</code> or <code>{`{t: ...}`}</code> - Song title</li>
        <li><code>{`{artist: ...}`}</code> or <code>{`{a: ...}`}</code> - Artist name</li>
        <li><code>{`{key: ...}`}</code> - Musical key</li>
        <li><code>{`{tempo: ...}`}</code> - BPM</li>
        <li><code>{`{comment: ...}`}</code> or <code>{`{c: ...}`}</code> - Performance notes</li>
        <li><code>{`{start_of_verse}`}</code> / <code>{`{end_of_verse}`}</code> - Section markers</li>
        <li><code>{`{start_of_chorus}`}</code> / <code>{`{end_of_chorus}`}</code> - Chorus sections</li>
        <li><code>[Chord]</code> - Inline chord notation</li>
      </ul>

      <h3>Where to Find ChordPro Files</h3>
      <ul>
        <li><strong>ChordPro.org</strong> - Official format documentation and examples</li>
        <li><strong>Ultimate Guitar</strong> - Export as ChordPro (Pro feature)</li>
        <li><strong>OnSong</strong> - Export your library as ChordPro</li>
        <li><strong>SongBook</strong> - Supports ChordPro import/export</li>
        <li><strong>Manual Conversion</strong> - Convert any chord chart to ChordPro format</li>
      </ul>

      <h3>Importing Steps</h3>
      <ol>
        <li>Prepare your ChordPro files (.cho, .chopro, or .txt)</li>
        <li>In Gigwidget: Library → Import</li>
        <li>Select files (can select multiple)</li>
        <li>Gigwidget parses metadata and content automatically</li>
        <li>Review and edit songs if needed</li>
      </ol>
    </section>

    <section id="sessions" class="help-section">
      <h2>🎸 Live Sessions</h2>

      <p>
        Sessions let you share songs with your band in real-time using peer-to-peer connections.
        Perfect for rehearsals, jams, or gigs where everyone needs the same charts.
      </p>

      <h3>Creating a Session (Host)</h3>
      <ol>
        <li>Select songs or a collection to share</li>
        <li>Click "Share" or "Start Session"</li>
        <li>Choose what to share:
          <ul>
            <li><strong>Entire Library</strong> - Share all your songs</li>
            <li><strong>Selected Collection</strong> - Share just one collection/setlist</li>
          </ul>
        </li>
        <li>A QR code appears - band members scan to join</li>
      </ol>

      <h3>Joining a Session (Joiner)</h3>

      <div class="method">
        <h4>Option 1: Scan QR Code</h4>
        <ol>
          <li>Open Gigwidget on your device</li>
          <li>Click "Join Session"</li>
          <li>Scan the QR code shown by the host</li>
          <li>You'll see the host's shared songs</li>
        </ol>
      </div>

      <div class="method">
        <h4>Option 2: Paste Join Code</h4>
        <ol>
          <li>Get the join code from the host</li>
          <li>Click "Join Session" → "Enter Code"</li>
          <li>Paste the code and click "Join"</li>
          <li>You'll connect to the session</li>
        </ol>
      </div>

      <h3>During a Session</h3>

      <h4>Host Features:</h4>
      <ul>
        <li><strong>Real-time Transpose</strong> - Change key, everyone follows</li>
        <li><strong>Edit Songs</strong> - Changes sync to all viewers</li>
        <li><strong>End Session</strong> - Disconnects all joiners</li>
        <li><strong>View Participants</strong> - See who's connected</li>
      </ul>

      <h4>Joiner Features:</h4>
      <ul>
        <li><strong>Browse Shared Songs</strong> - See the host's library or collection</li>
        <li><strong>View Songs</strong> - Songs load on-demand (not downloaded)</li>
        <li><strong>Follow Transpose</strong> - Automatically matches host's key changes</li>
        <li><strong>Receive Edits</strong> - See updates when host edits a song</li>
        <li><strong>Leave Anytime</strong> - Click "Leave Session" to disconnect</li>
      </ul>

      <h3>How It Works</h3>
      <ul>
        <li><strong>Peer-to-Peer</strong> - Direct connection between devices (no server)</li>
        <li><strong>On-Demand Loading</strong> - Song content loads when you open it</li>
        <li><strong>Temporary</strong> - Sessions don't persist; songs aren't permanently saved</li>
        <li><strong>Local Network or Internet</strong> - Works both ways</li>
      </ul>

      <div class="tip">
        <strong>💡 Tip:</strong> For best performance, ensure all devices are on the same Wi-Fi
        network. Sessions also work over the internet but may be slower.
      </div>
    </section>

    <section id="editing" class="help-section">
      <h2>✏️ Editing Songs</h2>

      <h3>Opening the Editor</h3>
      <ol>
        <li>Open any song from your library</li>
        <li>Click "Edit" button</li>
        <li>Make your changes</li>
        <li>Click "Save" when done</li>
      </ol>

      <h3>Editing Features</h3>

      <h4>Song Information</h4>
      <ul>
        <li>Click the info icon to edit title, artist, key, tempo, and tags</li>
        <li>Changes sync to cloud if you're logged in</li>
      </ul>

      <h4>Content Editor</h4>
      <ul>
        <li>Full ChordPro syntax support</li>
        <li>Chord autocomplete (type [C, [G, etc.)</li>
        <li>Preview mode shows formatted output</li>
        <li>Undo/redo support</li>
      </ul>

      <h4>Transpose</h4>
      <ul>
        <li>Click transpose button (up/down arrows)</li>
        <li>Select number of semitones (+/- 11)</li>
        <li>Toggle between sharps (#) and flats (♭)</li>
        <li>In sessions: host transpose syncs to all joiners</li>
      </ul>

      <h3>Viewer Options</h3>
      <ul>
        <li><strong>Maximize</strong> - Full-screen view for performance</li>
        <li><strong>Theme</strong> - Light or dark mode</li>
        <li><strong>Chord Display</strong> - Show chords above lyrics or in sidebar</li>
        <li><strong>Compact View</strong> - Reduce spacing for more content</li>
      </ul>

      <div class="warning">
        <strong>⚠️ Note:</strong> Song edits made during a session sync in real-time to all
        viewers. Save thoughtfully when hosting a session.
      </div>
    </section>

    <section id="sync" class="help-section">
      <h2>☁️ Cloud Sync</h2>

      <h3>How Sync Works</h3>
      <p>
        Gigwidget stores all your data locally first, then optionally syncs to the cloud when
        you create an account. This means:
      </p>
      <ul>
        <li><strong>Offline First</strong> - Works without internet</li>
        <li><strong>Automatic Sync</strong> - Changes sync when online</li>
        <li><strong>Multi-Device</strong> - Access your library from any device</li>
        <li><strong>Bidirectional</strong> - Newer changes win on conflict</li>
      </ul>

      <h3>What Syncs</h3>
      <ul>
        <li>✅ Songs and arrangements</li>
        <li>✅ Collections and setlists</li>
        <li>✅ Profile and preferences</li>
        <li>✅ Custom instruments</li>
        <li>✅ Avatar</li>
        <li>❌ Sessions (temporary, not synced)</li>
      </ul>

      <h3>Account Features</h3>
      <ul>
        <li><strong>Free Tier</strong> - Unlimited songs, basic features</li>
        <li><strong>Sign Up</strong> - Email or social login</li>
        <li><strong>Privacy</strong> - Your songs are private by default</li>
        <li><strong>Public Collections</strong> - Optionally share collections with others</li>
      </ul>

      <h3>Managing Your Data</h3>

      <h4>Export</h4>
      <p>Export your library as ChordPro files:</p>
      <ol>
        <li>Settings → Export Library</li>
        <li>Choose format (individual files or ZIP)</li>
        <li>Download to your device</li>
      </ol>

      <h4>Delete Account</h4>
      <p>To delete your account and all cloud data:</p>
      <ol>
        <li>Settings → Account</li>
        <li>Scroll to "Danger Zone"</li>
        <li>Click "Delete Account"</li>
        <li>Confirm deletion</li>
      </ol>
      <p class="warning-text">
        This deletes cloud data but keeps local data. To fully wipe, clear browser data.
      </p>
    </section>

    <footer class="help-footer">
      <h3>Still Need Help?</h3>
      <p>
        Report issues or request features on our
        <a href="https://github.com/anthropics/gigwidget/issues" target="_blank" rel="noopener">
          GitHub Issues page
        </a>
      </p>
      <p class="version">Gigwidget v1.0</p>
    </footer>
  </main>
</div>

<style>
  .help-page {
    display: grid;
    grid-template-columns: 280px 1fr;
    height: 100%;
    overflow: hidden;
  }

  .help-sidebar {
    background-color: var(--color-bg-secondary);
    border-right: 1px solid var(--color-border);
    overflow-y: auto;
    padding: var(--spacing-lg);
  }

  .help-sidebar h2 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 var(--spacing-md);
    color: var(--color-text);
  }

  .help-sidebar nav {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background: none;
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text);
    text-align: left;
    cursor: pointer;
    transition: all var(--transition-fast);
    font-size: 0.875rem;
  }

  .nav-item:hover {
    background-color: var(--color-surface);
  }

  .nav-item.active {
    background-color: var(--color-primary);
    color: white;
  }

  .nav-item .icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .help-content {
    overflow-y: auto;
    padding: var(--spacing-xl) var(--spacing-xxl);
    max-width: 800px;
  }

  .help-header {
    margin-bottom: var(--spacing-xxl);
  }

  .help-header h1 {
    font-size: 2rem;
    font-weight: 700;
    margin: 0 0 var(--spacing-sm);
  }

  .help-header p {
    color: var(--color-text-muted);
    font-size: 1.125rem;
  }

  .help-section {
    margin-bottom: var(--spacing-xxl);
    scroll-margin-top: var(--spacing-lg);
  }

  .help-section h2 {
    font-size: 1.75rem;
    font-weight: 600;
    margin: 0 0 var(--spacing-md);
    padding-bottom: var(--spacing-sm);
    border-bottom: 2px solid var(--color-border);
  }

  .help-section h3 {
    font-size: 1.25rem;
    font-weight: 600;
    margin: var(--spacing-lg) 0 var(--spacing-sm);
  }

  .help-section h4 {
    font-size: 1rem;
    font-weight: 600;
    margin: var(--spacing-md) 0 var(--spacing-xs);
  }

  .help-section p {
    line-height: 1.6;
    margin-bottom: var(--spacing-md);
  }

  .help-section ul,
  .help-section ol {
    margin-bottom: var(--spacing-md);
    padding-left: var(--spacing-lg);
  }

  .help-section li {
    margin-bottom: var(--spacing-xs);
    line-height: 1.6;
  }

  .method {
    background-color: var(--color-bg-secondary);
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-md);
  }

  .method h4 {
    margin-top: 0;
  }

  .comparison {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-md);
  }

  .compare-item {
    background-color: var(--color-bg-secondary);
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
  }

  .compare-item h4 {
    margin-top: 0;
    color: var(--color-primary);
  }

  .code-example {
    background-color: var(--color-surface);
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    margin: var(--spacing-md) 0;
  }

  .code-example h4 {
    margin-top: 0;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .code-example pre {
    margin: 0;
    overflow-x: auto;
  }

  .code-example code {
    font-family: 'Courier New', monospace;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--color-text);
  }

  .tip {
    background-color: rgba(59, 130, 246, 0.1);
    border-left: 3px solid #3b82f6;
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    margin: var(--spacing-md) 0;
  }

  .warning {
    background-color: rgba(245, 158, 11, 0.1);
    border-left: 3px solid #f59e0b;
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    margin: var(--spacing-md) 0;
  }

  .warning-text {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .help-footer {
    margin-top: var(--spacing-xxl);
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
    text-align: center;
  }

  .help-footer h3 {
    font-size: 1.125rem;
    margin-bottom: var(--spacing-sm);
  }

  .help-footer a {
    color: var(--color-primary);
    text-decoration: none;
  }

  .help-footer a:hover {
    text-decoration: underline;
  }

  .version {
    margin-top: var(--spacing-md);
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  @media (max-width: 768px) {
    .help-page {
      grid-template-columns: 1fr;
    }

    .help-sidebar {
      display: none;
    }

    .help-content {
      padding: var(--spacing-lg) var(--spacing-md);
    }

    .comparison {
      grid-template-columns: 1fr;
    }
  }
</style>
