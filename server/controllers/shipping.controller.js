// @flow

import axios from 'axios';
import httpStatus from 'http-status';

import { Cities, Departments, User, UserDoc, Order, OrderDoc } from '../models';
import APIError from '../helpers/APIError';
import config from '../config/config';

axios.defaults.baseURL = config.UAPAY_BASE_URL;

/**
 * Get list of cities for Nova Poshta
 *
 * GET /api/shipping/cities
 */
function cities(req: express$Request, res: express$Response, next: express$NextFunction) {
  Cities.find({}, { _id: 0, uk: 1, id: 1 })
    .sort({ departmentsCount: -1 })
    .then(cities => {
      if (!cities.length) {
        throw new Error('Error getting cities');
      }
      res.json({ data: cities });
    })
    .catch(error => {
      console.error(error);
      next(new APIError('Error getting list of cities from UAPAY NovaPoshta', httpStatus.SERVICE_UNAVAILABLE));
    });
}

/**
 * Calculate the shipping costs with Nova Poshta (UAPAY API)
 *
 * GET /api/shipping/costs
 *
 * @property {*} req.query - Express query parameters
 * @property {number} req.query.price // TODO: price and weight should be retrieved in the order as buyer cannot change those
 * @property {number} req.query.weight
 * @property {number} req.query.recipientOfficeID
 * @property {number} req.query.orderId
 */
async function costs(req: express$Request, res: express$Response, next: express$NextFunction) {
  const { recipientOfficeID, orderId, price, weight } = req.query;
  try {
    const recipientDepartment = await Departments.findOne({
      id: recipientOfficeID,
    });
    const order: OrderDoc = await Order.findById(orderId);

    if (!recipientDepartment || !order) {
      throw new APIError('Error retrieving the department(s)');
    }

    const seller: UserDoc = await User.findById(order.seller);
    const { shippingAddress: Sship } = seller;

    if (!Sship.city || !Sship.departmentNovaposhta) throw new Error('Seller is missing payment or shipping info');

    const costs = await getShippingCost(weight, price, Sship, {
      departmentNovaposhta: recipientDepartment.id,
      city: recipientDepartment.cityID,
    });

    res.json({ data: costs });
  } catch (error) {
    if (error.response && error.response.data) console.error(error.response.data);
    if (!(error instanceof APIError)) {
      console.error(error);
      return next(new APIError('Error calculating shipping costs', httpStatus.SERVICE_UNAVAILABLE));
    }
    next(error);
  }
}

export function getShippingCost(
  weight: number,
  price: string,
  senderShippingAddress: any,
  recipientShippingAddress: any
): Promise<string> {
  const { departmentNovaposhta: senderOfficeId, city: senderCityId } = senderShippingAddress;
  const { departmentNovaposhta: recipientOfficeId, city: recipientCityId } = recipientShippingAddress;
  return axios
    .get('/handlers/NovaPoshta/costs', {
      params: {
        productWeight: weight,
        productPrice: parseInt(price.replace('.', '')), // TODO: convert price properly to number
        senderOfficeId,
        senderCityId,
        recipientOfficeId,
        recipientCityId,
      },
      auth: {
        username: config.UAPAY_CLIENTID_ESCROW,
        password: config.UAPAY_KEY_ESCROW,
      },
    })
    .then(result => {
      if (!result || !result.data) throw new APIError('Error getting the costs from UAPAY');
      return parseFloat(result.data.data.handlerPrice / 100).toFixed(2);
    });
}

/**
 * Get list of departments of Nova Poshta for a city
 *
 * GET /api/shipping/departments/${city}
 *
 * @property {*} req - express session
 * @property {*} req.params - express session parameters
 * @property {MongoId} req.params.city
 */
async function departments(req: express$Request, res: express$Response, next: express$NextFunction) {
  Departments.find({ cityID: req.params.city }, { _id: 0, uk: 1, id: 1 })
    .then(departments => {
      if (!departments.length) {
        throw new Error('Error getting departments');
      }
      res.json({ data: departments });
    })
    .catch(error => {
      next(new APIError('Error getting list of departments from UAPAY NovaPoshta', httpStatus.SERVICE_UNAVAILABLE));
    });
}

export default {
  cities,
  costs,
  departments,
};
