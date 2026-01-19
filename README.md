# MDWeb

Fast, mobile-optimized markdown search and viewer with excellent CJK support.

**Key Features:**
- ⚡ Lightning-fast full-text search (delta indexing + persistent cache)
- 📱 Mobile-first design (iOS Safari optimized)
- 🇨🇳 Native CJK support (Chinese, Japanese, Korean)
- 🔎 Search by content or exact filename
- 📄 Plain text viewer with line numbers

## Quick Start

### Installation

```bash
npm install
```

### Usage

```bash
# Start with default settings (localhost:3000, ./data directory)
npm start

# Custom configuration
node server.js --port 8080 --server 0.0.0.0 --data /path/to/documents
```

Then open `http://localhost:3000` in your browser.

### Docker

#### Using docker-compose (recommended)

```bash
docker-compose up
```

Opens at `http://localhost:3000`. Add your markdown files to `./data/`.

#### Using Docker directly

```bash
docker run -p 3000:3000 -v /path/to/markdown:/data ghcr.io/wogong/mdweb:latest
```

#### Build locally

```bash
docker build -t mdweb .
docker run -p 3000:3000 -v /path/to/markdown:/data mdweb
```

### Cache Refresh

The search index cache is automatically rebuilt every 24 hours while the server runs. This keeps your data fresh without restarting the container.

To customize the rebuild interval, modify `server.js`:
```javascript
const db = initializeIndex(dataPath, 24); // 24 hours
```

Change `24` to any number of hours you prefer (e.g., `12` for twice daily, `0` to disable).

### First Run

The first startup builds a full index of your markdown files. Subsequent startups load from cache instantly.

```
Building search index...
Indexed 1,234 files
Server running at http://localhost:3000
```

## Usage

### Search Text Content

Type your query and hit **Go**:
```
machine learning
深度学习
```

Results show matched files with line numbers and hit context.

### Find File by Name

Queries ending with `.md` trigger filename search:
```
notes.md
todo.md
```

Opens the file directly without showing results.

### Browse Results

- Click any result to view the file
- **← Back** to return to results
- Navigate pages with **Prev/Next** buttons

## Performance

### Startup Time
- **Cold start** (first run): ~seconds (depends on file count)
- **Hot start** (cache hit): ~instant
- **Delta start** (files changed): Only re-indexes changed files

### Search Speed
All searches return in milliseconds, regardless of collection size.

### CJK Handling
Chinese, Japanese, and Korean characters are indexed individually for optimal search performance. Type any Chinese character to find all matches.

## Configuration

### Environment Variables
```bash
PORT=3000                                    # Server port
UPTIME_PUSH_URL=https://...                  # Health check push URL (optional)
PUSH_INTERVAL=86400                          # Seconds between health checks (default: 24h)
```

### Command Line Options
```bash
--port PORT        # Server port (default: 3000)
--server HOST      # Bind address (default: localhost)
--data PATH        # Data directory (default: ./data)
```

Examples:
```bash
# Public on network
node server.js --server 0.0.0.0 --port 8080

# Custom data directory
node server.js --data ~/Documents/notes

# Dropbox integration
node server.js --data ~/Dropbox/markdown
```

## File Structure

```
mdweb/
├── server.js           # Express API server
├── indexer.js          # Search index engine
├── package.json        # Node dependencies
├── public/
│   ├── index.html      # Web UI (vanilla JS)
│   └── favicon.svg     # App icon
├── data/               # Your markdown files here
├── .mdindex.cache      # Search index cache (auto-generated)
└── .mdindex.mtime      # File timestamps (auto-generated)
```

## API

### Search Content
```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"machine learning","page":1}'
```

### Get File by Name
```bash
curl "http://localhost:3000/api/file-by-name?name=notes.md"
```

### Get File by Path
```bash
curl "http://localhost:3000/api/file?path=/path/to/file.md"
```

## Mobile Optimization

MDWeb is designed for iOS Safari and other mobile browsers:

- Touch-friendly UI with large buttons
- Optimized keyboard behavior
- Full-screen content viewer
- Responsive layout (single column on mobile, two columns on desktop)
- No external dependencies for UI

## Caching & Data Persistence

MDWeb uses persistent caching to speed up subsequent startups:

- **`.mdindex.cache.*`** - Serialized search index (per data directory)
- **`.mdindex.mtime.*`** - File modification timestamps (per data directory)

Each `--data` directory gets its own cache files (identified by MD5 hash). This allows running multiple instances with different data sources.

On startup:
1. Compares current files with cached mtimes
2. If unchanged, loads index instantly
3. If changed, re-indexes only modified files
4. Detects and removes deleted files

**Note:** Cache files are automatically generated and can be safely deleted (they'll be rebuilt).

## Requirements

- Node.js 16+
- ~50MB RAM for 10,000 files
- Modern browser (Chrome, Safari, Firefox, Edge)

## Limitations

- Markdown files only (`.md` extension)
- Entire index stored in RAM
- Single-server only (no clustering)

## Development

### File Watching (Optional)

To auto-rebuild index on file changes, install a file watcher:

```bash
npm install -D nodemon
npx nodemon server.js --watch data
```

### See Also

- [Full Specifications](./specs.md)
- [MDWeb GitHub](https://github.com/wogong/mdweb)

## License

MIT
