import express from 'express';

import dropRoutes from './drop.route';

const router = express.Router();

router.use('/drops', dropRoutes);

export default router;
