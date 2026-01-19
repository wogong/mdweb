import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeIndex, searchFiles } from './indexer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Parse CLI arguments
const args = process.argv.slice(2);
let PORT = process.env.PORT || 3000;
let SERVER = 'localhost';
let DATA_DIR = 'data';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    PORT = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--server' && args[i + 1]) {
    SERVER = args[i + 1];
    i++;
  } else if (args[i] === '--data' && args[i + 1]) {
    DATA_DIR = args[i + 1];
    i++;
  }
}

// Initialize database index
const dataPath = path.isAbsolute(DATA_DIR) ? DATA_DIR : path.join(__dirname, DATA_DIR);
const db = initializeIndex(dataPath, 24); // Rebuild cache every 24 hours

app.use(express.static('public'));
app.use(express.json());

// Search endpoint
app.post('/api/search', (req, res) => {
  try {
    const { query, page = 1 } = req.body;
    if (!query || query.trim().length === 0) {
      return res.json({ results: [], page: 1, totalPages: 0 });
    }

    const result = searchFiles(db, query, page);
    res.json(result);
  } catch (error) {
    console.error('Search error:', error);
    res.json({ results: [], page: 1, totalPages: 0 });
  }
});

// Find file by filename
app.get('/api/file-by-name', (req, res) => {
  try {
    const filename = req.query.name;
    if (!filename) {
      return res.status(400).json({ error: 'No filename provided' });
    }

    // Recursively search for file
    const findFile = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const found = findFile(fullPath);
          if (found) return found;
        } else if (entry.name === filename) {
          return fullPath;
        }
      }
      return null;
    };

    const dataPath = path.isAbsolute(DATA_DIR) ? DATA_DIR : path.join(__dirname, DATA_DIR);
    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({ error: 'Data directory not found' });
    }

    const filePath = findFile(dataPath);
    if (!filePath) {
      return res.status(404).json({ error: 'File not found' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({
      content,
      path: filePath,
      name: path.basename(filePath)
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// File content endpoint
app.get('/api/file', (req, res) => {
  try {
    let filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'No path provided' });
    }

    // Determine full path
    let fullPath;
    if (path.isAbsolute(filePath)) {
      // Absolute path from ripgrep
      fullPath = filePath;
    } else {
      // Relative path - join with data dir
      fullPath = path.join(__dirname, filePath);
    }

    // Security: normalize and check for directory traversal
    const normalizedPath = path.normalize(fullPath);
    const resolvedDataDir = path.resolve(__dirname, DATA_DIR);
    
    if (!normalizedPath.startsWith(resolvedDataDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const content = fs.readFileSync(normalizedPath, 'utf-8');
    
    res.json({ 
      content, 
      path: filePath,
      name: path.basename(filePath)
    });
  } catch (error) {
    res.status(404).json({ error: 'File not found' });
  }
});

app.listen(PORT, SERVER, () => {
  const url = SERVER === 'localhost' ? `http://localhost:${PORT}` : `http://${SERVER}:${PORT}`;
  console.log(`Server running at ${url}`);
});

// Health check push
const UPTIME_PUSH_URL = process.env.UPTIME_PUSH_URL;
const PUSH_INTERVAL = parseInt(process.env.PUSH_INTERVAL || '86400', 10); // Default 24 hours

if (UPTIME_PUSH_URL) {
  const pushHealth = async () => {
    try {
      const response = await fetch(UPTIME_PUSH_URL);
      if (response.ok) {
        console.log(`[${new Date().toLocaleString()}] Health check pushed`);
      } else {
        console.error(`Health check failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Health check push error:', error.message);
    }
  };

  // Push immediately on startup
  pushHealth();

  // Then push at regular intervals
  setInterval(pushHealth, PUSH_INTERVAL * 1000);
  console.log(`Health check scheduled every ${PUSH_INTERVAL} seconds`);
}
