# Spotify Party Jam Web 🎵

A collaborative Spotify music picker web application designed for parties, road trips, and social gatherings.

Unlike native Spotify Jam, **guests do NOT need the Spotify app or a Spotify account** to pick music! Any guest on the same Wi-Fi network can simply scan a QR code on their smartphone or visit the room link to search for songs, add them to the queue, and collaboratively reorder the lineup.

All music plays directly on the host's active Spotify device (Laptop, Phone, Smart TV, or Sonos/Echo speaker). Guests cannot pause, skip, or hijack playback volume, keeping the party music steady and under the host's control.

---

## 🌟 Key Features

- **No Spotify Account Needed for Guests**: Guests join via a lightweight mobile web browser. Zero login or installation friction.
- **Smart Staged Collaborative Queue**:
  - Drag-and-drop or use Up/Down arrow buttons to rearrange songs in the queue.
  - Delete songs if someone changes their mind.
  - Automatically buffers the next song to your Spotify player just in time so playback is continuous and gapless.
- **Direct Mode Option**: Toggle between "Smart Staged Queue" (reorderable) and "Instant Queue" (pushes immediately to Spotify).
- **Live Search**: Instant track and artist search powered by Spotify's library, with album art, duration, and 30-second audio previews.
- **Now Playing Banner**: Live animated progress bar, album artwork, artist names, and active speaker indicator across all phones.
- **Multi-Device Host Login**: Take control from your phone or tablet while music plays on the desktop/living room speaker! Log in with a 4-digit Host PIN or scan the golden Host Pass QR code.
- **Host-Only Playback Controls**: Play, Pause, Next Track (Skip), and Previous Track buttons exclusively for the host, secured with session tokens.
- **Mobile Resilience & Instant 0ms Reloads**: Optimized with Gzip compression, immutable asset caching, and screen-wake auto-reconnect listeners so phones stay connected even when locked or switching tabs.
- **Device Lock & Anti-Drift Enforcement**: Lock playback to your chosen speaker/device (e.g. Desktop, Echo, Soundbar). If you connect headphones/TWS or open Spotify on your phone, playback automatically returns to the party speaker.
- **No Playback Controls for Guests**: Prevents guests from accidentally skipping songs or pausing the music.

---

## 🚀 Quick Start Guide

### 1. Requirements
- Node.js (v18 or higher installed).
- Spotify Premium account (required by Spotify API for queue playback).

### 2. Setup Spotify Developer Credentials (2 Minutes)
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in.
2. Click **Create App**.
   - **App name**: `Party Jam` (or anything you like)
   - **App description**: `Music picker for guests`
   - **Redirect URIs**: `http://127.0.0.1:5000/api/auth/callback`
   - **Which API/SDKs are you planning to use?**: Select **Web API**.
3. Save the app and copy your **Client ID** and **Client Secret**.

### 3. Start the Application
You can configure credentials directly via the web setup screen or in a `.env` file in the `server` directory:

```bash
# Start the server (from the project root)
npm start
```

Then open your browser to:
👉 **`http://127.0.0.1:5000`**

- If first time, enter your `Client ID` and `Client Secret` into the friendly setup form and click **Save Configuration**.
- Click **Start Party (Login with Spotify)**.
- Authorize your Spotify account.
- Your Room will open with your 4-letter room code and a large QR code for your guests!

### 4. Guests Joining
- Make sure guests are connected to the same Wi-Fi network as the host computer.
- Guests point their phone camera at the QR code on the host's screen.
- Guests choose a nickname (or stay anonymous) and start adding songs!

---

## 🐳 Running with Docker

You can run the application either using **Docker Compose** or directly using the **standalone Docker image**.

### Option A: Using Docker Image Directly (Without Compose)
1. **Build the image**:
   ```bash
   docker build -t spotify-jam-web .
   ```

2. **Run the container**:
   ```bash
   # On Windows PowerShell:
   docker run -d -p 5000:5000 -v ${PWD}/server/.env:/app/server/.env --name spotify-jam spotify-jam-web

   # On Linux/macOS:
   docker run -d -p 5000:5000 -v $(pwd)/server/.env:/app/server/.env --name spotify-jam spotify-jam-web
   ```

3. Open `http://127.0.0.1:5000` in your browser!

*(Note: If you prefer passing Spotify credentials directly via flags instead of mounting `.env`, add `-e SPOTIFY_CLIENT_ID="..." -e SPOTIFY_CLIENT_SECRET="..."` to the `docker run` command).*

### Option B: Using Docker Compose
```bash
# Build and run in the background
docker compose up -d --build

# View logs
docker compose logs -f

# Stop the container
docker compose down
```

---

## ☁️ Running over Cloudflare Tunnel (Internet Access)

Want friends to join from cellular data (5G/4G) or other locations without being on the same local Wi-Fi? You can expose the app securely using **Cloudflare Tunnel**.

### Method 1: Cloudflare Quick Tunnel (Free, No Domain or Account Needed!)
Cloudflare can automatically generate a secure `https://*.trycloudflare.com` public address for your party:

**With Docker Compose:**
```bash
docker compose --profile quick-tunnel up -d
```
Then view your public tunnel URL in the logs:
```bash
docker compose logs cloudflare-quick
```
Look for the link ending in `.trycloudflare.com` (e.g. `https://your-party-name.trycloudflare.com`).

**Without Docker (Using cloudflared binary):**
```bash
cloudflared tunnel --url http://127.0.0.1:5000
```

### Method 2: Cloudflare Named Tunnel (Using Your Own Domain)
If you manage your domain on Cloudflare Zero Trust:
1. In Cloudflare Zero Trust Dashboard, create a tunnel pointing to `http://spotify-jam:5000` (or `http://127.0.0.1:5000`).
2. Add your tunnel token to `.env`:
   ```bash
   CLOUDFLARE_TUNNEL_TOKEN="your_token_here"
   PUBLIC_URL="https://party.yourdomain.com"
   ```
3. Run with Docker Compose:
   ```bash
   docker compose --profile tunnel up -d
   ```

### Important: Spotify Developer Dashboard Configuration
When using Cloudflare Tunnel, make sure to add both URLs under **Redirect URIs** in your [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):
- `http://127.0.0.1:5000/api/auth/callback` (for local access)
- `https://your-tunnel-url.com/api/auth/callback` (for public internet access)

The server automatically detects whether you're accessing locally or through Cloudflare Tunnel and uses the matching callback and QR code links!

---

## 📁 Project Structure

```
spotify-jam-web/
├── server/
│   ├── server.js            # Express API, Socket.IO real-time hub & static host
│   ├── spotifyService.js    # Spotify OAuth, Search, Playback & Queue integration
│   ├── roomManager.js       # Room state, collaborative queue & auto-feed poller
│   ├── package.json
│   └── .env.example
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── HostView.jsx   # Host controls, QR code, speaker selector, mode toggle
│   │   │   ├── GuestView.jsx  # Mobile-first search and collaborative queue
│   │   │   ├── NowPlaying.jsx # Live progress and album cover display
│   │   │   ├── TrackCard.jsx  # Track result card with preview and add button
│   │   │   ├── QueueItem.jsx  # Queue item with reorder and delete controls
│   │   │   └── SetupView.jsx  # Interactive Spotify App setup assistant
│   │   ├── App.jsx            # Router and socket synchronization
│   │   ├── socket.js          # Socket.io connection helper
│   │   ├── main.jsx
│   │   └── index.css          # Dark-mode styling with Tailwind CSS
│   ├── dist/                  # Pre-built production frontend
│   └── package.json
├── package.json               # Root scripts
└── README.md
```
