import express from 'express';
import validate from 'express-validation';
import passport from 'passport';

import paramValidation from '../config/validation/report.validation';
import reportCtrl from '../controllers/report.controller';

// loads Authenticated user document in `req.user`
const requireAuth = passport.authenticate('jwt', { session: false });

const router = express.Router();

router
  .route('/')

  // POST /api/report
  .post(validate(paramValidation.createReport), requireAuth, reportCtrl.create);

export default router;
