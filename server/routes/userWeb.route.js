import express from 'express';
import validate from 'express-validation';

import paramValidation from '../config/validation/user.validation';
import userWebCtrl from '../controllers/userWeb.controller';
import authCtrl from '../controllers/auth.controller';

const router = express.Router();

router
  .route('/')
  // POST /api/users-web - Create new web user (anonymous)
  .post(userWebCtrl.create);

router
  .route('/me')
  // GET /api/users-web/ - Get current user
  .get(
    authCtrl.requireAuth,
    // isAuthorized,
    userWebCtrl.getMe
  )

  // PUT /api/users-web/me - Update current user
  .put(
    validate(paramValidation.updateUserWeb),
    authCtrl.requireAuth,
    // isAuthorized,
    userWebCtrl.update
  );

export default router;
