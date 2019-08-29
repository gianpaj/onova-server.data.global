import express from 'express';
import passport from 'passport';

import suggestedUsersCtrl from '../controllers/suggestedUsers.controller';

// loads Authenticated user document in `req.user`
const requireAuth = passport.authenticate('jwt', { session: false });

const router = express.Router();

router
  .route('/')

  // GET /api/suggested-users - List my suggested users
  .get(requireAuth, suggestedUsersCtrl.list);

// DELETE /api/suggested-users/:uuid - Discard a suggested user
// .delete(
//   validate(paramValidation.discard),
//   requireAuth,
//   suggestedUsersCtrl.discard
// );

export default router;
