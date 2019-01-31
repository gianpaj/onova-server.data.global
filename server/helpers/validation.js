// @flow

import Joi from 'joi';
import libphonenumber from 'google-libphonenumber';
const PhoneUtil = libphonenumber.PhoneNumberUtil.getInstance();

const hashtag = /^[a-zA-Z\u0400-\u04FF0-9]+$/;
const price = /^\d+(\.\d{1,2})?$/;
const shortid = /^[a-zA-Z0-9_-]{7,14}$/;
const username = /^[a-zA-Z0-9_.]+$/;

const tag = Joi.string()
  .regex(hashtag)
  .min(1)
  .max(30);

/**
 * Regexes used to validate inputs and DB schema
 */
export default {
  objectId: Joi.string()
    .hex()
    .length(24),
  hashtag,
  categoriesOrTypes: Joi.array()
    .unique()
    .min(1)
    .max(5)
    .items(
      Joi.number()
        .min(0)
        .max(5)
    )
    .single(),
  description: Joi.string()
    .min(7)
    .max(300),
  photos: Joi.array()
    .unique()
    .min(1)
    .max(6)
    .items(Joi.string().uri())
    .single(),
  price: Joi.string()
    .regex(price)
    .invalid('0')
    .invalid('0.00'),
  tag,
  tags: Joi.array()
    .max(30)
    .items(tag)
    .single(),
  uuid: Joi.string().regex(shortid),
  shortid,
  username: Joi.string()
    .regex(username)
    .min(3)
    .max(30),
};

/**
 * Allows you to do `Joi.string().phoneNumber()`
 *
 * @param {Object} joi Joi instance provided by Joi
 * @return {Object} Joi plugin object
 */
export const joiCustom = joi => ({
  base: joi.string(),
  name: 'string',
  language: {
    phonenumber: 'does not seem to be a phone number',
  },
  rules: [
    {
      name: 'phoneNumber',
      params: {
        opts: joi
          .object()
          .keys({
            /**
             * We will use specified country code (phoneNumber('BE')) or 'US' if no
             * country code provided in phone number (0494...). Numbers with country
             * code (+3249...) will use the data from the number and not the default.
             */
            defaultCountry: joi.string(),
            format: joi.only('e164', 'international', 'national', 'rfc3966'),
          })
          .default({ defaultCountry: 'UA' })
          .min(1),
      },
      validate(params, value, state, options) {
        const number = PhoneUtil.parseAndKeepRawInput(
          value,
          params.opts.defaultCountry
        );
        if (
          PhoneUtil.isValidNumberForRegion(number, params.opts.defaultCountry)
        )
          return value;

        // Generate an error, state and options need to be passed
        return this.createError(
          'string.phonenumber',
          { value },
          state,
          options
        );
      },
    },
  ],
});
