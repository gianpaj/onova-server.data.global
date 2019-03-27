// @flow

import express from 'express';
import httpStatus from 'http-status';
import validate from 'express-validation';

import paramValidation from '../config/validation/order.validation';
import authCtrl from '../controllers/auth.controller';
import orderCtrl from '../controllers/order.controller';
import APIError from '../helpers/APIError';

const router = express.Router();

/**
 * Authorization Required middleware.
 */
function isAuthorized(req, res, next) {
  if (
    req.user._id.toString() !== req.order.buyer._id.toString() &&
    req.user._id.toString() !== req.order.seller._id.toString()
  ) {
    const err = new APIError('Unauthorized', httpStatus.UNAUTHORIZED);
    return next(err);
  }
  next();
}

function isAuthorizedBuyer(req, res, next) {
  if (req.user._id.toString() !== req.order.buyer._id.toString()) {
    const err = new APIError('Unauthorized', httpStatus.UNAUTHORIZED);
    return next(err);
  }
  next();
}

// ALL Protected routes
router
  .route('/')
  // GET /api/orders - Get list of orders of the user who requested (via JWT)
  .get(authCtrl.requireAuth, orderCtrl.list)

  // POST /api/orders - Create new order
  .post(
    validate(paramValidation.create),
    authCtrl.requireAuth,
    orderCtrl.create
  );

router
  .route('/:orderId')
  // GET /api/orders/:orderId - Get a single order
  .get(
    validate(paramValidation.orderId),
    authCtrl.requireAuth,
    isAuthorized,
    orderCtrl.get
  )

  // PUT /api/orders/:orderId - Update order
  .put(
    validate(paramValidation.orderId),
    authCtrl.requireAuth,
    isAuthorized,
    orderCtrl.update
  );

router
  .route('/:orderId/pay')
  // POST /api/orders/:orderId/pay - Start payment
  .post(
    validate(paramValidation.pay),
    authCtrl.requireAuth,
    isAuthorizedBuyer,
    orderCtrl.pay
  );

router
  .route('/:orderId/paymentStatus')
  // GET /api/orders/:orderId/paymentStatus - Get payment from UAPAY
  .get(
    validate(paramValidation.orderId),
    authCtrl.requireAuth,
    isAuthorizedBuyer,
    orderCtrl.paymentStatus
  );

// Load user when API with orderId route parameter is hit
router.param('orderId', orderCtrl.load);

export default router;
