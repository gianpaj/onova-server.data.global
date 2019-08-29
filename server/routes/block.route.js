import express from 'express';
import validate from 'express-validation';
import passport from 'passport';

import paramValidation from '../config/validation/block.validation';
import blockCtrl from '../controllers/block.controller';

// loads Authenticated user document in `req.user`
const requireAuth = passport.authenticate('jwt', { session: false });

const router = express.Router();

router
  .route('/')

  // POST /api/block
  .post(validate(paramValidation.createBlock), requireAuth, blockCtrl.create);

export default router;
