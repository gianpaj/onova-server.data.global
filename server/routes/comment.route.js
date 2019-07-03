// @flow
import express from 'express';
import validate from 'express-validation';
import passport from 'passport';

import paramValidation from '../config/validation/comment.validation';
import productParamValidation from '../config/validation/product.validation';
import commentCtrl from '../controllers/comment.controller';
import productCtrl from '../controllers/product.controller';

// loads Authenticated user document in `req.user`
const requireAuth = passport.authenticate('jwt', { session: false });

const router = express.Router();

router
  .route('/:uuid/comment')

  // GET /api/products/:uuid/comment - Get product's comments
  .get(validate(productParamValidation.productUUIDParam), requireAuth, commentCtrl.get)

  // POST /api/products/:uuid/comment - Create product's comment
  .post(validate(paramValidation.createComment), requireAuth, commentCtrl.create);

router
  .route('/:uuid/comment/:commentId')

  // DELETE /api/products/:uuid/comment/:commentId - DELETE a product's comment
  .delete(validate(paramValidation.deleteComment), requireAuth, commentCtrl.remove);

// Load product when API with uuid route parameter is hit
router.param('uuid', productCtrl.loadWithComments);

export default router;
