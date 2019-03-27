import Joi from 'joi';
import validate from 'express-validation';

import validation, { joiCustom } from '../../helpers/validation';
const myCustomJoi = Joi.extend(joiCustom);

// assign options
validate.options({
  allowUnknownBody: false,
  allowUnknownHeaders: false,
  allowUnknownQuery: false,
  allowUnknownParams: false,
  allowUnknownCookies: false,
});

export default {
  // GET /api/users (for mentions)
  listUsers: {
    query: Joi.object()
      .keys({
        // to search users
        u: validation.username,
        // to get 1 user
        username: validation.username,
        limit: Joi.number()
          .min(1)
          .max(50),
      })
      .nand('u', 'username'),
  },

  // POST /api/users
  createUser: {
    body: {
      username: validation.username.required(),
      mobileNumber: myCustomJoi.string().phoneNumber(),
      emailAddress: Joi.string()
        .email()
        .required(),
      password: Joi.string()
        .min(8)
        .max(50)
        .required(),
      pushToken: Joi.string(),
      platform: Joi.string().valid(['android', 'ios']),
    },
  },

  // UPDATE /api/users/:userId
  updateUser: {
    body: {
      bio: Joi.string()
        .empty('')
        .max(300),
      displayName: Joi.string()
        .empty('')
        .max(30),
      username: validation.username,
      mobileNumber: myCustomJoi
        .string()
        .empty('')
        .phoneNumber(),
      emailAddress: Joi.string().email(),
      password: Joi.string()
        .min(8)
        .max(50),
      pushToken: Joi.string(),
      platform: Joi.string().valid(['android', 'ios']),
      // temp - we are not validating month is valid, etc.
      paymentInfoPayload: Joi.string()
        .min(90)
        .alphanum(),
      shippingAddress: {
        firstName: Joi.string(),
        lastName: Joi.string(),
        fathersName: Joi.string(),
        city: Joi.string(),
        departmentNovaposhta: Joi.string(),
      },
      facebook: Joi.string(),
      increaseShare: Joi.boolean(),
      accessToken: Joi.string().when('facebook', {
        is: Joi.exist(),
        then: Joi.required(),
      }),
    },
    params: {
      userId: validation.objectId.required(),
    },
  },

  // UPDATE /api/users-web/me
  updateUserWeb: {
    body: {
      mobileNumber: myCustomJoi
        .string()
        .empty('')
        .phoneNumber(),
      emailAddress: Joi.string().email(),
      paymentInfoPayload: Joi.string()
        .min(90)
        .alphanum(),
      shippingAddress: {
        firstName: Joi.string(),
        lastName: Joi.string(),
        city: Joi.string(),
        departmentNovaposhta: Joi.string(),
      },
    },
  },

  notif: {
    query: {
      limit: Joi.number()
        .min(1)
        .max(50),
      lastId: validation.objectId,
    },
  },
};
