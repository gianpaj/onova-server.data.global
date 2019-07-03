// @flow

import express from 'express';
import validate from 'express-validation';
import passport from 'passport';
import httpStatus from 'http-status';

import paramValidation from '../config/validation/drop.validation';
import dropCtrl from '../controllers/drop.controller';
import APIError from '../helpers/APIError';

const requireAuth = passport.authenticate('jwt', { session: false });
const router = express.Router();

function optionalAuth(req, res, next) {
  if (req.headers.authorization) {
    return requireAuth(req, res, next);
  }
  next();
}

/**
 * Authorization Required middleware.
 */
function isAdmin(req, res, next) {
  if (!['alex', 'onova', 'gianpaj'].includes(req.user.username)) {
    return next(new APIError('Unauthorized', httpStatus.UNAUTHORIZED));
  }
  next();
}

router
  .route('/:uuid')
  // GET /api/v2/drops/:uuid - get single drop
  .get(validate(paramValidation.uuid), dropCtrl.get)

  // DELETE /api/v2/drops/:uuid - delete a drop (only Admins)
  .delete(validate(paramValidation.uuid), requireAuth, isAdmin, dropCtrl.remove);

router
  .route('/:uuid/subscribe')

  // GET /api/v2/drops/:uuid/subscribe - Subscribe to a drop
  .post(validate(paramValidation.uuid), requireAuth, dropCtrl.subscribe);

router
  .route('/:uuid/unsubscribe')

  // GET /api/v2/drops/:uuid/unsubscribe - Unsubscribe to a drop
  .post(validate(paramValidation.uuid), requireAuth, dropCtrl.unsubscribe);

router
  .route('/')
  // GET /api/v2/drops - get a user's drops
  .get(validate(paramValidation.getDrops), optionalAuth, dropCtrl.list)

  // POST /api/v2/drops - create a drop
  .post(validate(paramValidation.create), requireAuth, dropCtrl.create);

// Load a drop when API with uuid route parameter is hit
router.param('uuid', dropCtrl.load);

export default router;
