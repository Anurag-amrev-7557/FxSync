import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { addSessionFile } from '../managers/fileManager.js';
import dotenv from 'dotenv';
import * as mm from 'music-metadata';
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

const coversDir = path.join(uploadsDir, 'covers');
if (!fs.existsSync(coversDir)) {
  fs.mkdirSync(coversDir, { recursive: true });
}
const samplesDir = path.join(uploadsDir, 'samples');
const sampleCoversDir = path.join(samplesDir, 'covers');
if (!fs.existsSync(sampleCoversDir)) {
  fs.mkdirSync(sampleCoversDir, { recursive: true });
}

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Use clientId and timestamp to make filename unique
    let clientId = 'unknown';
    if (req.body && req.body.clientId) {
      clientId = req.body.clientId;
    } else if (req.query && req.query.clientId) {
      clientId = req.query.clientId;
    }
    const ext = path.extname(file.originalname);
    cb(null, `${clientId}-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

router.get('/audio-url', (req, res) => {
  res.json({ url: AUDIO_URL });
});

// Upload endpoint
router.post('/upload', upload.single('music'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const clientId = req.body.clientId || req.query.clientId || 'unknown';
  const sessionId = req.body.sessionId || req.query.sessionId || 'unknown';
  addSessionFile(sessionId, clientId, req.file.filename);
  // Extract album art
  let albumArtUrl = null;
  try {
    const metadata = await mm.parseFile(req.file.path);
    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const pic = metadata.common.picture[0];
      const coverPath = path.join(coversDir, req.file.filename + '.jpg');
      await sharp(pic.data).jpeg().toFile(coverPath);
      albumArtUrl = `${AUDIO_BASE_PATH}/uploads/covers/${req.file.filename}.jpg`;
    }
  } catch (err) {
    // Ignore extraction errors
  }
  // Return the file URL and album art to the client
  const fileUrl = `${AUDIO_BASE_PATH}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, filename: req.file.filename, albumArtUrl });
});

// Serve uploaded files and covers
router.use('/uploads', express.static(uploadsDir));
router.use('/covers', express.static(coversDir));

// List all tracks (user uploads + samples)
router.get('/all-tracks', (req, res) => {
  let tracks = [];
  // Helper to add tracks from a directory
  function addTracksFromDir(dir, type, urlPrefix, coversPrefix) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      if (file.endsWith('.mp3')) {
        // Try to find a cover image
        let albumArtUrl = null;
        const coverPath = path.join(dir, coversPrefix || 'covers', file + '.jpg');
        if (fs.existsSync(coverPath)) {
          albumArtUrl = `${AUDIO_BASE_PATH}${urlPrefix}/${coversPrefix || 'covers'}/${file}.jpg`;
        }
        tracks.push({
          title: file.replace(/\.mp3$/i, ''),
          url: `${AUDIO_BASE_PATH}${urlPrefix}/${file}`,
          type,
          albumArtUrl
        });
      }
    });
  }
  // User uploads (exclude samples subdir)
  addTracksFromDir(uploadsDir, 'user', '/uploads', 'covers');
  // Sample tracks
  addTracksFromDir(samplesDir, 'sample', '/uploads/samples', 'covers');
  res.json(tracks);
});

export default router;