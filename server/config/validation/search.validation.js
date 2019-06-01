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
  // GET /api/search/
  search: {
    query: {
      categoryIds: validation.categoriesOrTypes,
      description: Joi.string()
        .min(3)
        .max(50),
      lastId: validation.objectId,
      limit: Joi.number()
        .min(1)
        .max(50),
      sellerType: validation.sellerType,
      tag: validation.tag,
      typeIds: validation.categoriesOrTypes,
    },
  },
};
