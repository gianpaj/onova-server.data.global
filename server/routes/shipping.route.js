import express from 'express';
import validate from 'express-validation';

import paramValidation from '../config/validation/shipping.validation';
import shippingCtrl from '../controllers/shipping.controller';

const router = express.Router();

router
  .route('/cities')
  // GET /api/shipping/cities - Get list of cities for Nova Poshta
  .get(shippingCtrl.cities);

router
  .route('/departments/:city')
  // GET /api/shipping/departments - Get list of departments of Nova Poshta for a city
  .get(validate(paramValidation.departments), shippingCtrl.departments);

router
  .route('/costs')
  // GET /api/shipping/costs - Get shipping costs
  .get(validate(paramValidation.costs), shippingCtrl.costs);

export default router;
