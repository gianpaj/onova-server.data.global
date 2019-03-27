import Joi from 'joi';

export default {
  // POST /api/auth/login
  login: {
    body: {
      emailAddress: Joi.string()
        .email()
        .required(),
      password: Joi.string().required(),
    },
  },

  // GET /api/auth/activate/:token
  activate: {
    params: {
      token: Joi.string()
        .hex()
        .length(16)
        .required(),
    },
  },

  cardToken: {
    query: {
      shortCard: Joi.bool(),
    },
  },

  // POST /api/auth/reset
  requestReset: {
    body: {
      emailAddress: Joi.string()
        .email()
        .required(),
    },
  },

  // POST /api/auth/reset/:token
  resetForm: {
    params: {
      token: Joi.string()
        .hex()
        .length(16)
        .required(),
    },
    body: {
      password: Joi.string()
        .min(8)
        .max(50)
        .required(),
      passwordagain: Joi.string()
        .min(8)
        .max(50)
        .required(),
    },
  },
};
