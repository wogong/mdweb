import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In-memory inverted index
class FileIndex {
  constructor() {
    this.files = new Map(); // filepath -> {name, content, mtime}
    this.wordIndex = new Map(); // word -> Set of file indices
    this.filesList = []; // ordered list of files for pagination
  }

  addFile(filepath, filename, content, mtime) {
    const fileIndex = this.filesList.length;
    this.files.set(filepath, { filename, content, mtime });
    this.filesList.push({ path: filepath, name: filename });

    // Index words
    const words = this.tokenize(content);
    for (const word of words) {
      if (!this.wordIndex.has(word)) {
        this.wordIndex.set(word, new Set());
      }
      this.wordIndex.get(word).add(fileIndex);
    }
  }

  removeFile(filepath) {
    const fileData = this.files.get(filepath);
    if (!fileData) return;

    const fileIndex = this.filesList.findIndex(f => f.path === filepath);
    if (fileIndex === -1) return;

    // Remove from wordIndex
    const words = this.tokenize(fileData.content);
    for (const word of words) {
      this.wordIndex.get(word)?.delete(fileIndex);
    }

    // Remove from files and list
    this.files.delete(filepath);
    this.filesList.splice(fileIndex, 1);

    // Rebuild indices after removing
    this._rebuildIndices();
  }

  _rebuildIndices() {
    // After removing a file, file indices change, so rebuild wordIndex
    const newWordIndex = new Map();
    for (let i = 0; i < this.filesList.length; i++) {
      const fileData = this.files.get(this.filesList[i].path);
      const words = this.tokenize(fileData.content);
      for (const word of words) {
        if (!newWordIndex.has(word)) {
          newWordIndex.set(word, new Set());
        }
        newWordIndex.get(word).add(i);
      }
    }
    this.wordIndex = newWordIndex;
  }

  tokenize(text) {
    const tokens = new Set();
    
    // CJK character matching (Chinese, Japanese, Korean)
    const cjkRegex = /[\u4E00-\u9FFF\u3040-\u309F\uAC00-\uD7AF]/g;
    const cjkMatches = text.match(cjkRegex) || [];
    cjkMatches.forEach(char => tokens.add(char));

    // Words (ASCII, etc)
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    words.forEach(w => tokens.add(w));

    return tokens;
  }

  search(query, page = 1, perPage = 15) {
    // Detect if query contains multiple CJK characters
    const cjkRegex = /[\u4E00-\u9FFF\u3040-\u309F\uAC00-\uD7AF]/g;
    const cjkChars = query.match(cjkRegex) || [];
    const isMultiCJK = cjkChars.length > 1;
    
    let matchedFiles = [];
    
    if (isMultiCJK) {
      // For multi-CJK queries, use strict phrase matching
      // Only match lines that contain the exact phrase
      matchedFiles = [];
      
      for (let idx = 0; idx < this.filesList.length; idx++) {
        const fileInfo = this.filesList[idx];
        const content = this.files.get(fileInfo.path).content;
        
        let count = 0;
        const lines = content.split('\n');
        for (const line of lines) {
          let searchPos = 0;
          while ((searchPos = line.indexOf(query, searchPos)) !== -1) {
            count++;
            searchPos += query.length;
          }
        }
        
        if (count > 0) {
          matchedFiles.push({
            index: idx,
            path: fileInfo.path,
            name: fileInfo.name,
            content: content,
            matches: count
          });
        }
      }
    } else {
      // For single character or ASCII queries, use token matching
      const queryTokens = this.tokenize(query);
      const matchingFileIndices = new Set();
      
      for (const token of queryTokens) {
        const indices = this.wordIndex.get(token) || new Set();
        indices.forEach(idx => matchingFileIndices.add(idx));
      }

      // Convert to array and sort by relevance
      matchedFiles = Array.from(matchingFileIndices).map(idx => ({
        index: idx,
        path: this.filesList[idx].path,
        name: this.filesList[idx].name,
        content: this.files.get(this.filesList[idx].path).content,
        matches: 0
      }));

      // Count matches per file
      for (const file of matchedFiles) {
        const lines = file.content.split('\n');
        for (const line of lines) {
          if (line.includes(query)) {
            file.matches++;
          }
        }
      }
    }

    matchedFiles.sort((a, b) => b.matches - a.matches);

    // Extract hits - only show lines containing the exact query
    const results = matchedFiles.map(file => {
      const lines = file.content.split('\n');
      const hits = [];
      lines.forEach((line, idx) => {
        if (line.includes(query)) {
          hits.push({
            lineNum: idx + 1,
            content: line.trim()
          });
        }
      });

      return {
        path: file.path,
        name: file.name,
        hits: hits.slice(0, 3)
      };
    });

    // Paginate
    const totalPages = Math.ceil(results.length / perPage);
    const pageNum = Math.max(1, Math.min(page, totalPages));
    const start = (pageNum - 1) * perPage;

    return {
      results: results.slice(start, start + perPage),
      page: pageNum,
      totalPages,
      total: results.length
    };
  }

  serialize() {
    const data = {
      files: Array.from(this.files.entries()),
      filesList: this.filesList
    };
    return JSON.stringify(data);
  }

  deserialize(json) {
    const data = JSON.parse(json);
    this.files = new Map(data.files);
    this.filesList = data.filesList;
    this._rebuildIndices();
  }
}

let index = null;
let lastRebuildTime = 0;
let rebuildSchedule = null;

export function initializeIndex(dataDir, autoRebuildHours = 24) {
  if (index) return index;

  index = new FileIndex();
  
  // Generate unique cache filenames based on data directory
  const dataDirHash = require('crypto')
    .createHash('md5')
    .update(path.resolve(dataDir))
    .digest('hex')
    .slice(0, 8);
  
  const cacheFile = path.join(__dirname, `.mdindex.cache.${dataDirHash}`);
  const mTimeFile = path.join(__dirname, `.mdindex.mtime.${dataDirHash}`);

  // Try to load from cache
  let currentFiles = new Map();
  let needsRebuild = false;

  // Collect current files with mtimes
  collectFiles(dataDir, currentFiles);

  // Check if cache exists and is valid
  if (fs.existsSync(cacheFile) && fs.existsSync(mTimeFile)) {
    try {
      const cachedMTimes = JSON.parse(fs.readFileSync(mTimeFile, 'utf-8'));
      
      // Check if any files changed
      let changed = false;
      if (Object.keys(cachedMTimes).length !== currentFiles.size) {
        changed = true;
      } else {
        for (const [filepath, mtime] of currentFiles) {
          if (cachedMTimes[filepath] !== mtime) {
            changed = true;
            break;
          }
        }
      }

      if (!changed) {
        // Load from cache
        console.log('Loading index from cache...');
        const cached = fs.readFileSync(cacheFile, 'utf-8');
        index.deserialize(cached);
        lastRebuildTime = Date.now();
        console.log(`Loaded ${index.filesList.length} files from cache`);
        
        // Schedule daily rebuild
        if (autoRebuildHours > 0) {
          scheduleRebuild(dataDir, autoRebuildHours);
        }
        return index;
      }
    } catch (e) {
      needsRebuild = true;
    }
  }

  // Rebuild or update
  if (needsRebuild || !fs.existsSync(cacheFile)) {
    console.log('Building search index...');
    index.files.clear();
    index.filesList = [];
    index.wordIndex.clear();
  } else {
    console.log('Delta indexing...');
    // Load old cache first
    try {
      const cached = fs.readFileSync(cacheFile, 'utf-8');
      index.deserialize(cached);
    } catch (e) {
      index.files.clear();
      index.filesList = [];
      index.wordIndex.clear();
    }
  }

  // Index new/changed files
  const mTimes = {};
  const oldMTimes = fs.existsSync(mTimeFile) 
    ? JSON.parse(fs.readFileSync(mTimeFile, 'utf-8')) 
    : {};

  for (const [filepath, mtime] of currentFiles) {
    mTimes[filepath] = mtime;

    // Check if file changed
    if (oldMTimes[filepath] !== mtime) {
      try {
        if (index.files.has(filepath)) {
          index.removeFile(filepath);
        }
        const content = fs.readFileSync(filepath, 'utf-8');
        index.addFile(filepath, path.basename(filepath), content, mtime);
      } catch (e) {
        console.error(`Error indexing ${filepath}:`, e.message);
      }
    }
  }

  // Remove deleted files
  for (const filepath of Object.keys(oldMTimes)) {
    if (!currentFiles.has(filepath)) {
      index.removeFile(filepath);
      console.log(`Removed ${filepath} from index`);
    }
  }

  // Save cache
  try {
    fs.writeFileSync(cacheFile, index.serialize());
    fs.writeFileSync(mTimeFile, JSON.stringify(mTimes));
    lastRebuildTime = Date.now();
    console.log(`Indexed ${index.filesList.length} files`);
  } catch (e) {
    console.error('Error saving cache:', e.message);
  }

  // Schedule daily rebuild
  if (autoRebuildHours > 0) {
    scheduleRebuild(dataDir, autoRebuildHours);
  }

  return index;
}

function collectFiles(dir, files) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(fullPath, files);
      } else if (entry.name.endsWith('.md')) {
        const stat = fs.statSync(fullPath);
        files.set(fullPath, stat.mtimeMs);
      }
    }
  } catch (e) {
    // Ignore errors
  }
}

export function searchFiles(db, query, page = 1) {
  if (!query || query.trim().length === 0) {
    return { results: [], page: 1, totalPages: 0, total: 0 };
  }
  return db.search(query.trim(), page);
}

function scheduleRebuild(dataDir, intervalHours) {
  // Cancel existing schedule
  if (rebuildSchedule) {
    clearInterval(rebuildSchedule);
  }

  const intervalMs = intervalHours * 60 * 60 * 1000;
  const nextRebuildTime = new Date(lastRebuildTime + intervalMs);
  
  console.log(`Cache rebuild scheduled every ${intervalHours} hours (next: ${nextRebuildTime.toLocaleString()})`);

  rebuildSchedule = setInterval(() => {
    rebuildIndexCache(dataDir);
  }, intervalMs);
}

function rebuildIndexCache(dataDir) {
  if (!index) return;

  console.log(`\n[${new Date().toLocaleString()}] Starting scheduled cache rebuild...`);
  const start = Date.now();

  try {
    // Generate unique cache filenames based on data directory
    const dataDirHash = require('crypto')
      .createHash('md5')
      .update(path.resolve(dataDir))
      .digest('hex')
      .slice(0, 8);
    
    const cacheFile = path.join(__dirname, `.mdindex.cache.${dataDirHash}`);
    const mTimeFile = path.join(__dirname, `.mdindex.mtime.${dataDirHash}`);

    // Collect current files
    const currentFiles = new Map();
    collectFiles(dataDir, currentFiles);

    // Check for changes
    let hasChanges = false;
    const oldMTimes = fs.existsSync(mTimeFile) 
      ? JSON.parse(fs.readFileSync(mTimeFile, 'utf-8')) 
      : {};

    // Check for new/modified files
    for (const [filepath, mtime] of currentFiles) {
      if (oldMTimes[filepath] !== mtime) {
        hasChanges = true;
        if (index.files.has(filepath)) {
          index.removeFile(filepath);
        }
        const content = fs.readFileSync(filepath, 'utf-8');
        index.addFile(filepath, path.basename(filepath), content, mtime);
      }
    }

    // Check for deleted files
    for (const filepath of Object.keys(oldMTimes)) {
      if (!currentFiles.has(filepath)) {
        hasChanges = true;
        index.removeFile(filepath);
      }
    }

    if (hasChanges) {
      // Save updated cache
      const mTimes = {};
      for (const [filepath, mtime] of currentFiles) {
        mTimes[filepath] = mtime;
      }
      
      fs.writeFileSync(cacheFile, index.serialize());
      fs.writeFileSync(mTimeFile, JSON.stringify(mTimes));
      
      const elapsed = Date.now() - start;
      console.log(`Cache rebuilt successfully (${index.filesList.length} files, ${elapsed}ms)`);
    } else {
      const elapsed = Date.now() - start;
      console.log(`No changes detected (${elapsed}ms)`);
    }

    lastRebuildTime = Date.now();
  } catch (e) {
    console.error('Error during cache rebuild:', e.message);
  }
}
