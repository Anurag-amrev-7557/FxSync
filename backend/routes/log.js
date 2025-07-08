import express from 'express';
const router = express.Router();

router.post('/sync-diagnostics', (req, res) => {
  console.log('Sync diagnostics:', req.body);
  res.sendStatus(200);
});

router.post('/drift', (req, res) => {
  console.log('Drift correction:', req.body);
  res.sendStatus(200);
});

export default router; 