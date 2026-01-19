# MDWeb Specifications

## Overview
MDWeb is a mobile-optimized web app for searching and viewing markdown files with fast full-text search and excellent CJK (Chinese/Japanese/Korean) support.

## Core Features

### 1. Full-Text Search
- Query text content across all markdown files in a directory
- Uses **delta indexing** with persistent cache for fast startup
- CJK character support (Chinese characters indexed individually)
- Returns results sorted by relevance
- Pagination (15 results per page)
- Shows matched lines with line numbers

### 2. File Lookup
- Search by exact filename (end query with `.md`)
- Instantly opens file content without showing search results

### 3. File Viewer
- Display markdown file content as plain text (preserves formatting)
- Back button to return to search results
- Responsive design with mobile-first approach

### 4. Indexing
- **Cold start**: Full index build on first run
- **Hot start**: Load from cache (instant if files unchanged)
- **Delta indexing**: Only re-indexes modified/new files
- Detects and removes deleted files from index
- Tracks file modification times (mtime) for change detection

## UI/UX

### Mobile (iOS Safari optimized)
- Single column layout
- Large touch targets
- Full-screen viewer for content
- Back navigation
- Keyboard support (Enter to search)

### Desktop
- Two-column layout (search results + content)
- Results panel takes ~40% width
- Viewer panel takes ~60% width

## API Endpoints

### POST `/api/search`
Search text content in all markdown files.

**Request:**
```json
{
  "query": "search term",
  "page": 1
}
```

**Response:**
```json
{
  "results": [
    {
      "path": "/path/to/file.md",
      "name": "file.md",
      "hits": [
        {
          "lineNum": 5,
          "content": "matched line content"
        }
      ]
    }
  ],
  "page": 1,
  "totalPages": 10,
  "total": 150
}
```

### GET `/api/file-by-name?name=filename.md`
Retrieve specific file by name.

**Response:**
```json
{
  "content": "file contents...",
  "path": "/path/to/file.md",
  "name": "filename.md"
}
```

### GET `/api/file?path=/path/to/file.md`
Retrieve file by path.

**Response:**
```json
{
  "content": "file contents...",
  "path": "/path/to/file.md",
  "name": "filename.md"
}
```

## Configuration

### CLI Options
```bash
node server.js --port 3000 --server localhost --data /path/to/data
```

- `--port` (default: 3000) - Server port
- `--server` (default: localhost) - Server bind address
- `--data` (default: data/) - Data directory path (absolute or relative)

## Caching & Performance

### Cache Files
- `.mdindex.cache` - Serialized index data
- `.mdindex.mtime` - File modification times

### Search Performance
- First search: ~instant (index already in memory)
- Subsequent searches: milliseconds
- Handles thousands of files efficiently
- CJK queries perform at same speed as ASCII

## Technical Stack
- **Frontend**: HTML5, vanilla JavaScript
- **Backend**: Node.js + Express
- **Indexing**: In-memory inverted index with delta sync
- **Storage**: File system (markdown files only)

## File Structure
```
mdweb/
├── server.js          # Express server
├── indexer.js         # Search indexing engine
├── package.json       # Dependencies
├── public/
│   ├── index.html     # Web UI
│   └── favicon.svg    # App icon
└── data/              # Markdown files (user provided)
```
