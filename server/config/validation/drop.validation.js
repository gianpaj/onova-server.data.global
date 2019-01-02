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
  // GET /api/v2/drops/:uuid
  // DELETE /api/v2/drops/:uuid
  uuid: {
    params: {
      uuid: validation.uuid.required(),
    },
  },

  // GET /api/v2/drops?limit=&username=
  getDrops: {
    query: Joi.object({
      limit: Joi.number()
        .min(1)
        .max(100),
      username: validation.username.min(3).required(),
      // lastId: validation.objectId,
    }),
  },

  // POST /api/v2/drops
  create: {
    body: {
      products: Joi.array()
        .items(
          Joi.object({
            categoryIds: validation.categoriesOrTypes.required(),
            description: validation.description.required(),
            photos: validation.photos.required(),
            price: validation.price.required(),
            tags: validation.tags,
            typeIds: validation.categoriesOrTypes.required(),
          })
        )
        .required(),
      // currency: Joi.string().valid('UAH'), // 'UAH' by default
      date: Joi.date().min(new Date(new Date().setHours(0, 0, 0, 0))),
      // description: validation.description.required(),
      latitude: Joi.number()
        .min(-90)
        .max(90)
        .required(),
      longitude: Joi.number()
        .min(-180)
        .max(180)
        .required(),
    },
  },
};
