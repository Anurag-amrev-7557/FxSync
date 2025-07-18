import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { addSessionFile } from '../managers/fileManager.js';
import dotenv from 'dotenv';
import { body, query, validationResult } from 'express-validator';
import * as mm from 'music-metadata';
import crypto from 'crypto';
import { promises as fsp } from 'fs';
import sharp from 'sharp';
dotenv.config();

const router = express.Router();

const AUDIO_URL = process.env.AUDIO_URL || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const AUDIO_BASE_PATH = process.env.AUDIO_BASE_PATH || '/audio';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Ensure album_art directory exists
const albumArtDir = path.join(uploadsDir, 'album_art');
if (!fs.existsSync(albumArtDir)) {
  fs.mkdirSync(albumArtDir, { recursive: true });
}

// Path for metadata cache
const TRACK_METADATA_CACHE_PATH = path.join(uploadsDir, '.track_metadata_cache.json');
const TRACK_METADATA_DB_PATH = path.join(uploadsDir, '.track_metadata_db.json');

// Helper to sanitize clientId for filenames
function safeClientId(id) {
  if (typeof id !== 'string') return 'unknown';
  const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return sanitized.length > 0 ? sanitized : 'unknown';
}

// Helper to get file info for cache validation
function getFileInfo(dir, file) {
  const stat = fs.statSync(path.join(dir, file));
  return {
    name: file,
    mtimeMs: stat.mtimeMs,
    size: stat.size
  };
}

// Helper to load/save metadata DB
async function loadMetadataDB() {
  try {
    const data = await fsp.readFile(TRACK_METADATA_DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}
async function saveMetadataDB(db) {
  try {
    await fsp.writeFile(TRACK_METADATA_DB_PATH, JSON.stringify(db), 'utf8');
  } catch (e) {}
}

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Use sanitized clientId and timestamp to make filename unique
    let clientId = 'unknown';
    if (req.body && req.body.clientId) {
      clientId = safeClientId(req.body.clientId);
    } else if (req.query && req.query.clientId) {
      clientId = safeClientId(req.query.clientId);
    }
    const ext = path.extname(file.originalname);
    cb(null, `${clientId}-${Date.now()}${ext}`);
  }
});

// Restrict uploads to .mp3 files only and max size 10MB
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.mp3') {
      return cb(new Error('Only .mp3 files are allowed'));
    }
    cb(null, true);
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

router.get('/audio-url', (req, res) => {
  res.json({ url: AUDIO_URL });
});

// Upload endpoint with input validation
router.post(
  '/upload',
  [
    upload.single('music'),
    // Accept clientId/sessionId from either body or query
    body('clientId').optional().isString().isLength({ min: 1, max: 64 }).matches(/^[a-zA-Z0-9_-]+$/),
    body('sessionId').optional().isString().isLength({ min: 1, max: 64 }).matches(/^[a-zA-Z0-9_-]+$/),
    query('clientId').optional().isString().isLength({ min: 1, max: 64 }).matches(/^[a-zA-Z0-9_-]+$/),
    query('sessionId').optional().isString().isLength({ min: 1, max: 64 }).matches(/^[a-zA-Z0-9_-]+$/),
  ],
  async (req, res) => {
    // Handle file size limit error
    if (req.fileValidationError) {
      return res.status(400).json({ error: req.fileValidationError });
    }
    if (req.file && req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large. Max size is 10MB.' });
    }
    // Check for express-validator errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded or invalid file type' });
    }
    const clientId = req.body.clientId || req.query.clientId || 'unknown';
    const sessionId = req.body.sessionId || req.query.sessionId || 'unknown';
    addSessionFile(sessionId, clientId, req.file.filename);
    // Extract metadata and save to DB
    let albumArtUrl = null;
    let albumArtFilename = null;
    try {
      const metadata = await mm.parseFile(req.file.path);
      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const pic = metadata.common.picture[0];
        // Save album art as a file (jpg or png)
        const ext = pic.format.includes('png') ? 'png' : 'jpg';
        albumArtFilename = `${req.file.filename.replace(/\.mp3$/i, '')}_art.${ext}`;
        const albumArtPath = path.join(albumArtDir, albumArtFilename);
        // Clean up old album art if exists
        const db = await loadMetadataDB();
        if (db[req.file.filename]?.albumArtFilename) {
          try { await fsp.unlink(path.join(albumArtDir, db[req.file.filename].albumArtFilename)); } catch (e) {}
        }
        await fsp.writeFile(albumArtPath, pic.data);
        // Optionally, convert to jpg for consistency
        if (ext === 'png') {
          const jpgPath = albumArtPath.replace(/\.png$/, '.jpg');
          await sharp(albumArtPath).jpeg().toFile(jpgPath);
          await fsp.unlink(albumArtPath);
          albumArtFilename = albumArtFilename.replace(/\.png$/, '.jpg');
        }
        albumArtUrl = `${AUDIO_BASE_PATH}/uploads/album_art/${albumArtFilename}`;
      }
    } catch (e) {}
    const db = await loadMetadataDB();
    db[req.file.filename] = {
      title: req.file.originalname.replace(/\.mp3$/i, ''),
      albumArtUrl,
      albumArtFilename,
      uploaded: Date.now()
    };
    await saveMetadataDB(db);
    // Return the file URL to the client
    const fileUrl = `${AUDIO_BASE_PATH}/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, filename: req.file.filename });
  }
);

// Serve uploaded files with CORS headers and strong HTTP caching
const ONE_YEAR = 365 * 24 * 60 * 60; // seconds
router.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Or restrict to your frontend origin
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  // Set strong caching for audio files
  res.header('Cache-Control', `public, max-age=${ONE_YEAR}, immutable`);
  next();
}, express.static(uploadsDir, {
  etag: true,
  maxAge: ONE_YEAR * 1000, // ms
  immutable: true
}));

// Serve /uploads/samples with same caching and CORS
const samplesDir = path.join(uploadsDir, 'samples');
router.use('/uploads/samples', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cache-Control', `public, max-age=${ONE_YEAR}, immutable`);
  next();
}, express.static(samplesDir, {
  etag: true,
  maxAge: ONE_YEAR * 1000,
  immutable: true
}));

// Serve album art statically
router.use('/uploads/album_art', express.static(albumArtDir, {
  etag: true,
  maxAge: ONE_YEAR * 1000,
  immutable: true
}));

// List all tracks (user uploads + samples) using metadata DB and album art URLs
router.get('/all-tracks', async (req, res) => {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const samplesDir = path.join(uploadsDir, 'samples');
  const db = await loadMetadataDB();
  async function getMp3Files(dir) {
    try {
      const files = await fsp.readdir(dir);
      return files.filter(f => f.endsWith('.mp3'));
    } catch (e) { return []; }
  }
  const [userFiles, sampleFiles] = await Promise.all([
    getMp3Files(uploadsDir),
    getMp3Files(samplesDir)
  ]);
  const userTracks = userFiles.map(file => ({
    title: (db[file]?.title) || file.replace(/\.mp3$/i, ''),
    url: `${AUDIO_BASE_PATH}/uploads/${file}`,
    type: 'user',
    albumArt: db[file]?.albumArtUrl || null
  }));
  const sampleTracks = sampleFiles.map(file => ({
    title: file.replace(/\.mp3$/i, ''),
    url: `${AUDIO_BASE_PATH}/uploads/samples/${file}`,
    type: 'sample',
    albumArt: null // Could be precomputed if needed
  }));
  res.json([...userTracks, ...sampleTracks]);
});

export default router;