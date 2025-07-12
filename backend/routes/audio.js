import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { addSessionFile } from '../managers/fileManager.js';
import dotenv from 'dotenv';
import * as mm from 'music-metadata';

dotenv.config();

// Polyfill __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

const AUDIO_URL = process.env.AUDIO_URL || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const AUDIO_BASE_PATH = process.env.AUDIO_BASE_PATH || '/audio';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
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

// Endpoint to get all metadata (including cover image as base64) for an audio file
router.get('/metadata/:filename(*)', async (req, res) => {
  const { filename } = req.params;
  // Security: prevent directory traversal
  if (filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(__dirname, '../', filename);
  console.log('Looking for file:', filePath); // Debug log
  try {
    const metadata = await mm.parseFile(filePath);
    let cover = null;
    if (metadata.common.picture && metadata.common.picture[0]) {
      const pic = metadata.common.picture[0];
      console.log('Cover data type:', typeof pic.data, 'Is Buffer:', Buffer.isBuffer(pic.data));
      
      // Ensure we have valid image data
      if (pic.data && pic.format && /^image\//.test(pic.format)) {
        let base64Data;
        if (Buffer.isBuffer(pic.data)) {
          base64Data = pic.data.toString('base64');
        } else if (Array.isArray(pic.data)) {
          base64Data = Buffer.from(pic.data).toString('base64');
        } else {
          console.log('Unexpected data type for cover:', typeof pic.data);
          base64Data = null;
        }
        
        if (base64Data && base64Data.length > 0) {
          cover = {
            format: pic.format,
            data: base64Data,
          };
          console.log('Cover data length:', base64Data.length);
        }
      }
    }
    res.json({
      format: metadata.format,
      common: metadata.common,
      native: metadata.native,
      cover,
    });
  } catch (err) {
    console.error('Error reading audio file:', err);
    res.status(500).json({ error: 'Error reading audio file', details: err.message });
  }
});

// Upload endpoint
router.post('/upload', upload.single('music'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const clientId = req.body.clientId || req.query.clientId || 'unknown';
  const sessionId = req.body.sessionId || req.query.sessionId || 'unknown';
  addSessionFile(sessionId, clientId, req.file.filename);
  // Return the file URL to the client
  const fileUrl = `${AUDIO_BASE_PATH}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, filename: req.file.filename });
});

// Serve uploaded files
router.use('/uploads', express.static(uploadsDir));

// List all tracks (user uploads + samples)
router.get('/all-tracks', (req, res) => {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const samplesDir = path.join(uploadsDir, 'samples');
  let tracks = [];

  // Helper to add tracks from a directory
  function addTracksFromDir(dir, type, urlPrefix) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      if (file.endsWith('.mp3')) {
        tracks.push({
          title: file.replace(/\.mp3$/i, ''),
          url: `${AUDIO_BASE_PATH}${urlPrefix}/${file}`,
          type
        });
      }
    });
  }

  // User uploads (exclude samples subdir)
  addTracksFromDir(uploadsDir, 'user', '/uploads');
  // Sample tracks
  addTracksFromDir(samplesDir, 'sample', '/uploads/samples');

  res.json(tracks);
});

export default router; 