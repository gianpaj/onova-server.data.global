// @flow
import express from 'express';
import validate from 'express-validation';
import passport from 'passport';

import paramValidation from '../config/validation/feed.validation';
import feedCtrl from '../controllers/feed.controller';
import dropCtrl from '../controllers/drop.controller';

// loads Authenticated user document in `req.user`
const requireAuth = passport.authenticate('jwt', { session: false });

const router = express.Router();

router
  .route('/flat')

  // GET /api/feed/flat - simple time-based feed
  .get(validate(paramValidation.getFlatFeed), requireAuth, feedCtrl.flat);

router
  .route('/drops')
  // GET /api/feed/drops
  .get(requireAuth, dropCtrl.myFeed);

export default router;
