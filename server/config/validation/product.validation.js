import Joi from 'joi';
import validate from 'express-validation';

import validation from '../../helpers/validation';

// assign options
validate.options({
  allowUnknownBody: false,
  allowUnknownHeaders: false,
  allowUnknownQuery: false,
  allowUnknownParams: false,
  allowUnknownCookies: false,
});

export default {
  // POST /api/products
  createProduct: {
    body: Joi.object({
      categoryIds: validation.categoriesOrTypes.required(),
      currency: Joi.string().valid('UAH'), // 'UAH' by default
      description: validation.description.required(),
      photos: validation.photos.required(),
      price: validation.price.required(),
      tags: validation.tags,
      typeIds: validation.categoriesOrTypes,
      latitude: Joi.number()
        .min(-90)
        .max(90),
      longitude: Joi.number()
        .min(-180)
        .max(180),
    }).and('latitude', 'longitude'),
  },

  // GET /api/products/:uuid
  // DELETE /api/products/:uuid
  productUUIDParam: {
    params: {
      uuid: validation.uuid,
    },
  },

  // PUT /api/products/:uuid
  putProduct: {
    params: {
      uuid: validation.uuid,
    },
    body: {
      categoryIds: validation.categoriesOrTypes,
      description: validation.description,
      photos: validation.photos,
      price: validation.price,
      tags: validation.tags,
      typeIds: validation.categoriesOrTypes,
    },
  },

  // GET /api/products
  getProducts: {
    query: Joi.object({
      categoryIds: validation.categoriesOrTypes,
      lastId: validation.objectId,
      limit: Joi.number()
        .min(1)
        .max(200),
      sellerType: validation.sellerType,
      tags: validation.tags.unique(),
      userid: validation.objectId,
      username: validation.username.min(3),
    }).nand('username', 'userid'),
  },
};
