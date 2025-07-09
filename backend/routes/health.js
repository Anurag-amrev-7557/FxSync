import { Router } from 'express';
const router = Router();

console.log('Health route loaded');

router.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default router; 