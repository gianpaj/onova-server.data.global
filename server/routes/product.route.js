// @flow

import express from 'express';
import validate from 'express-validation';
import passport from 'passport';

import paramValidation from '../config/validation/product.validation';
import productCtrl from '../controllers/product.controller';
import APIError from '../helpers/APIError';

const requireAuth = passport.authenticate('jwt', { session: false });
const router = express.Router();

/**
 * Authorization Required middleware.
 */
function isAuthorized(req, res, next) {
  if (req.user._id.toString() !== req.product.seller._id.toString()) {
    const err = new APIError('Unauthorized', 401);
    return next(err);
  }
  next();
}

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
  // GET /api/products - Get list of products 'forsale'
  .get(validate(paramValidation.getProducts), conditionalAuth, productCtrl.list)

  // POST /api/products - Create new product
  .post(validate(paramValidation.createProduct), requireAuth, productCtrl.create);

router
  .route('/:uuid')
  // GET /api/products/:uuid - Get product
  .get(validate(paramValidation.productUUIDParam), productCtrl.get)

  // PUT /api/products/:uuid - Update product
  .put(validate(paramValidation.putProduct), requireAuth, isAuthorized, productCtrl.update)

  // DELETE /api/products/:uuid - Delete product - Protected route
  .delete(validate(paramValidation.productUUIDParam), requireAuth, isAuthorized, productCtrl.remove);

// Load product when API with uuid route parameter is hit
router.param('uuid', productCtrl.load);

export default router;
