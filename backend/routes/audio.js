import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { addSessionFile, getSessionFiles, removeSessionFiles } from '../managers/fileManager.js';
import dotenv from 'dotenv';
import { body, query, validationResult } from 'express-validator';
import * as mm from 'music-metadata';
import crypto from 'crypto';
import { promises as fsp } from 'fs';
import sharp from 'sharp';
import pkg from 'busboy';
const Busboy = pkg.default;
dotenv.config();

const router = express.Router();

const AUDIO_URL =
  process.env.AUDIO_URL || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
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
async function getFileInfo(dir, file) {
  const stat = await fsp.stat(path.join(dir, file));
  return {
    name: file,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
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
  },
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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

router.get('/audio-url', (req, res) => {
  res.json({ url: AUDIO_URL });
});

// Advanced streaming upload with Busboy
router.post('/upload', async (req, res) => {
  const { default: Busboy } = await import('busboy');
  const busboy = Busboy({
    headers: req.headers,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  let uploadError = null;
  let fileSaved = false;
  let filePath = '';
  let fileName = '';
  let clientId = req.query.clientId || 'unknown';
  let sessionId = req.query.sessionId || 'unknown';
  let fileWritePromise = null;

  busboy.on('file', (fieldname, file, fileInfo) => {
    const { filename, mimeType } = fileInfo;
    console.log('Received file:', { fieldname, filename, mimeType });
    // Validate file type early
    if (path.extname(filename).toLowerCase() !== '.mp3') {
      uploadError = 'Only .mp3 files are allowed';
      file.resume(); // Discard the stream
      return;
    }
    fileName = `${sessionId}-${clientId}-${Date.now()}${path.extname(filename)}`;
    filePath = path.join(uploadsDir, fileName);
    const writeStream = fs.createWriteStream(filePath);

    // Track file write completion
    fileWritePromise = new Promise((resolve, reject) => {
      writeStream.on('close', () => {
        fileSaved = true;
        addSessionFile(sessionId, clientId, fileName);
        resolve();
      });
      writeStream.on('error', (err) => {
        uploadError = err.message;
        reject(err);
      });
    });

    file.pipe(writeStream);
  });

  busboy.on('error', (err) => {
    uploadError = err.message;
  });

  busboy.on('finish', async () => {
    if (fileWritePromise) {
      try {
        await fileWritePromise;
      } catch (e) {
        // uploadError already set
      }
    }
    console.log('Upload finished', { fileSaved, uploadError, fileName });
    if (uploadError) {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(400).json({ error: uploadError });
    }
    if (!fileSaved) {
      return res.status(400).json({ error: 'No valid file uploaded' });
    }
    res.json({ url: `${AUDIO_BASE_PATH}/uploads/${fileName}`, filename: fileName });
  });

  req.pipe(busboy);
});

// Serve uploaded files with CORS headers and strong HTTP caching
const ONE_YEAR = 365 * 24 * 60 * 60; // seconds
router.use(
  '/uploads',
  (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*'); // Or restrict to your frontend origin
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    // Set strong caching for audio files
    res.header('Cache-Control', `public, max-age=${ONE_YEAR}, immutable`);
    next();
  },
  express.static(uploadsDir, {
    etag: true,
    maxAge: ONE_YEAR * 1000, // ms
    immutable: true,
  })
);

// Serve /uploads/samples with same caching and CORS
const samplesDir = path.join(uploadsDir, 'samples');
router.use(
  '/uploads/samples',
  (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    res.header('Cache-Control', `public, max-age=${ONE_YEAR}, immutable`);
    next();
  },
  express.static(samplesDir, {
    etag: true,
    maxAge: ONE_YEAR * 1000,
    immutable: true,
  })
);

// Serve album art statically
router.use(
  '/uploads/album_art',
  express.static(albumArtDir, {
    etag: true,
    maxAge: ONE_YEAR * 1000,
    immutable: true,
  })
);

// Endpoint to delete all user-uploaded files for a session
router.post('/clear-session-files', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  const uploadsDir = path.join(process.cwd(), 'uploads');
  let deleted = 0;
  try {
    const files = await fsp.readdir(uploadsDir);
    for (const file of files) {
      if (file.startsWith(`${sessionId}-`) && !file.startsWith('samples/')) {
        const filePath = path.join(uploadsDir, file);
        if (
          await fsp
            .access(filePath)
            .then(() => true)
            .catch(() => false)
        ) {
          await fsp.unlink(filePath);
          deleted++;
        }
      }
    }
    res.json({ success: true, deleted });
  } catch (e) {
    res.status(500).json({ error: 'Failed to read uploads directory' });
  }
});

// List all tracks (user uploads + samples) using metadata DB and album art URLs
router.get('/all-tracks', async (req, res) => {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const samplesDir = path.join(uploadsDir, 'samples');
  const db = await loadMetadataDB();
  async function getMp3Files(dir) {
    try {
      const files = await fsp.readdir(dir);
      return files.filter((f) => f.endsWith('.mp3'));
    } catch (e) {
      return [];
    }
  }
  const [userFiles, sampleFiles] = await Promise.all([
    getMp3Files(uploadsDir),
    getMp3Files(samplesDir),
  ]);
  const userTracks = userFiles.map((file) => ({
    title: db[file]?.title || file.replace(/\.mp3$/i, ''),
    url: `${AUDIO_BASE_PATH}/uploads/${file}`,
    type: 'user',
    albumArt: db[file]?.albumArtUrl || null,
  }));
  const sampleTracks = sampleFiles.map((file) => ({
    title: file.replace(/\.mp3$/i, ''),
    url: `${AUDIO_BASE_PATH}/uploads/samples/${file}`,
    type: 'sample',
    albumArt: null, // Could be precomputed if needed
  }));
  res.json([...userTracks, ...sampleTracks]);
});

export default router;
