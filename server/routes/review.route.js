import express from 'express';
import validate from 'express-validation';
import passport from 'passport';

import paramValidation from '../config/validation/review.validation';
import reviewCtrl from '../controllers/review.controller';
import userCtrl from '../controllers/user.controller';

// loads Authenticated user document in `req.user`
const requireAuth = passport.authenticate('jwt', { session: false });

const router = express.Router();

router
  .route('/:userId/reviews')

  // GET /api/users/:userId/reviews - Get users's reviews
  .get(requireAuth, reviewCtrl.list)

  // POST /api/users/:userId/reviews - Create users's review
  .post(validate(paramValidation.createReview), requireAuth, reviewCtrl.create);

// Load user when API with userId route parameter is hit
router.param('userId', validate(paramValidation.userIdParam), userCtrl.load);

export default router;
