import express from 'express';
import validate from 'express-validation';
import passport from 'passport';

import paramValidation from '../config/validation/user.validation';
import userWebCtrl from '../controllers/userWeb.controller';

const requireAuth = passport.authenticate('jwt', { session: false });
const router = express.Router();

/**
 * Authorization Required middleware.
 */
function isAuthorized(req, res, next) {
  if (req.user._id.toString() !== req.params.userId) {
    const err = new APIError('Unauthorized', 401);
    return next(err);
  }
  next();
}

router
  .route('/')
  // POST /api/users-web - Create new web user (anonymous)
  .post(userWebCtrl.create);

// router
//   .route('/me')
//   // GET /api/users-web/ - Get current user
//   .get(
//     requireAuth,
//     // isAuthorized,
//     userWebCtrl.getMe
//   );

// // PUT /api/users-web/:userId - Update user - Protected route
// .put(
//   validate(paramValidation.updateUser),
//   requireAuth,
//   isAuthorized,
//   userWebCtrl.update
// );

export default router;
