import express from 'express';
import validate from 'express-validation';
import passport from 'passport';

import paramValidation from '../config/validation/user.validation';
import followCtrl from '../controllers/follow.controller';

// loads Authenticated user document in `req.user`
const requireAuth = passport.authenticate('jwt', { session: false });

const router = express.Router();

router
  .route('/:userId/followers')
  // GET /api/users/:userId/followers - Get list of followers of a specific user
  .get(requireAuth, followCtrl.listFollowers);

router
  .route('/:userId/following')
  // GET /api/users/:userId/following - Get list of users a specific user is following
  .get(requireAuth, followCtrl.listFollowing);

router
  .route('/:userId/follow')

  // GET /api/users/:userId/follow - Get follow document to check if the requestor is following :userId
  .get(requireAuth, followCtrl.get)

  // GET /api/users/:userId/follow - Follow user
  .post(requireAuth, followCtrl.follow);

router
  .route('/:userId/unfollow')

  // GET /api/users/:userId/follow - Unfollow user
  .post(requireAuth, followCtrl.unfollow);

// Load user when API with userId route parameter is hit
router.param('userId', validate(paramValidation.updateUser));

export default router;
