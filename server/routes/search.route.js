// @flow
import express from 'express';
import validate from 'express-validation';
import passport from 'passport';

import paramValidation from '../config/validation/search.validation';
import searchCtrl from '../controllers/search.controller';

// loads Authenticated user document in `req.user`
const requireAuth = passport.authenticate('jwt', { session: false });

const router = express.Router();

/**
 * Only check authentication and load user as `req.user` object if the header is sent.
 * This is needed to get the products except the ones from whom user is blocking
 */
function conditionalAuth(req, res, next) {
  if (req.get('Authorization')) {
    return requireAuth(req, res, next);
  }
  next();
}

router
  .route('/')

  // GET /api/search
  .get(validate(paramValidation.search), conditionalAuth, searchCtrl.get);

export default router;
