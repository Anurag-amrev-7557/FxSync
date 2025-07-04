import express from 'express';
const router = express.Router();

const AUDIO_URL = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

router.get('/audio-url', (req, res) => {
  res.json({ url: AUDIO_URL });
});

export default router; 