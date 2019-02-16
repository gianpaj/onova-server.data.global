import Joi from 'joi';

const isTestEnv = process.env.NODE_ENV === 'test';

// require and configure dotenv, will load vars in .env file in process.env
if (isTestEnv) {
  console.warn('running on `test` environment');
  require('dotenv').config({ path: '.env.test' });
} else {
  require('dotenv').config();
}

const nonRequiredForDev = {
  is: Joi.string().equal('development'),
  then: Joi.required(),
};

// define validation for all the env vars
const envVarsSchema = Joi.object({
  NODE_ENV: Joi.string()
    .allow(['development', 'production', 'test', 'stage'])
    .default('development'),
  PORT: Joi.number().default(4040),
  MONGOOSE_DEBUG: Joi.boolean().when('NODE_ENV', {
    is: Joi.string().equal('development'),
    then: Joi.boolean().default(true),
    otherwise: Joi.boolean().default(false),
  }),
  JWT_SECRET: Joi.string()
    .required()
    .description('JWT Secret required to sign'),
  SALT_ROUNDS: Joi.string()
    .required()
    .description('The salt to be used in password encryption by bcrypt'),
  MONGO_HOST: Joi.string()
    .required()
    .description('MongoDB host'),
  MONGO_DB: Joi.string()
    .required()
    .description('MongoDB database'),
  MONGO_JOB_DB: Joi.string()
    .required()
    .description('MongoDB database for the agenda for push notifications'),
  MONGO_PORT: Joi.number().default(27017),
  // MONGO_USER: Joi.string(),
  // MONGO_PASS: Joi.string(),
  MJ_APIKEY_PUBLIC: Joi.string()
    .required()
    .description('Mailjet API public key'),
  MJ_APIKEY_PRIVATE: Joi.string()
    .required()
    .description('Mailjet API private key'),
  CLOUD_BUCKET: Joi.string()
    .required()
    .description('Google Cloud Storage bucket'),
  CHATKIT_INSTANCE: Joi.string()
    .description('Chatkit instanceLocator')
    .when('NODE_ENV', nonRequiredForDev),
  CHATKIT_KEY: Joi.string()
    .description('Chatkit key')
    .when('NODE_ENV', nonRequiredForDev),
  SLACK_WEBHOOK_URL: Joi.string()
    .required()
    .description('Slack Webhook URL (for reporting)'),
  FACEBOOK_APP_ID: Joi.string().description(
    "Facebook APP ID for Posting item on sellers' walls [not using]"
  ),
  FACEBOOK_APP_SECRET: Joi.string().description(
    'Facebook APP Secret [not using]'
  ),
  VK_APP_ID: Joi.string()
    .description("VK APP ID for Auth to post item on sellers' walls")
    .when('NODE_ENV', nonRequiredForDev),
  VK_SECRET_KEY: Joi.string()
    .description('VK APP Secret')
    .when('NODE_ENV', nonRequiredForDev),
  SEGMENT: Joi.string()
    .required()
    .description('Segment.com Analytics write key'),
  SENTRY_DSN: Joi.string()
    .required()
    .description('Sentry key'),
  UAPAY_CLIENTID_P2P: Joi.string()
    .required()
    .description(
      'UAPAY param for JWT clientId for P2P - to a request card token'
    ),
  UAPAY_SECRET_P2P: Joi.string()
    .required()
    .description('UAPAY JWT secret for P2P'),
  UAPAY_CLIENTID_ESCROW: Joi.string()
    .required()
    .description('UAPAY API Client ID for EscrowBow'),
  UAPAY_KEY_ESCROW: Joi.string()
    .required()
    .description('UAPAY API Key for Escrowbox'),
  UAPAY_BASE_URL: Joi.string()
    .required()
    .description('UAPAY API URL'),
})
  .unknown()
  .required();

const { error, value: envVars } = Joi.validate(process.env, envVarsSchema);
if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export default {
  ...envVars,
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  mongooseDebug: envVars.MONGOOSE_DEBUG,
  jwtSecret: envVars.JWT_SECRET,
  saltRounds: envVars.SALT_ROUNDS,
  mongo: {
    host: envVars.MONGO_HOST,
    db: envVars.MONGO_DB,
    jobDb: envVars.MONGO_JOB_DB,
    port: envVars.MONGO_PORT,
    // user: encodeURIComponent(envVars.MONGO_USER),
    // pass: encodeURIComponent(envVars.MONGO_PASS),
  },
  mailjet: {
    apikeyPublic: envVars.MJ_APIKEY_PUBLIC,
    apikeyPrivate: envVars.MJ_APIKEY_PRIVATE,
  },

  chatkit: {
    instanceLocator: envVars.CHATKIT_INSTANCE,
    key: envVars.CHATKIT_KEY,
  },
  // hard coded settings
  JOBNAMES: {
    DROP_SUBSCRIPTION: 'drop-subscription',
    SCHEDULE: 'listing-schedule',
    PUSH_COMMENT: 'send-push-comment',
    PUSH_DROP_LISTED: 'send-push-drop-listed',
    PUSH_FOLLOW: 'send-push-follow',
    PUSH_MSG: 'send-push-msg', // person to person
    PUSH_ORDER: 'send-push-order',
    SYSTEM_MSG: 'send-system-message',
    RECURRING: {
      CHECKOUT: 'checkout',
      CANCEL_PAID_ORDERS: 'cancel-paid-orders',
      PUSH_ORDER_CONFIRM_REMINDER: 'send-push-order-confirmation-reminder',
      SHIPPING_STATUS_STARTER: 'shipping-status-starter',
    },
    SHIPPING_STATUS_CHECKER: 'shipping-status-checker',
  },
  settings: {
    // Reserves products for 15 minutes.
    // TODO: 0 to disable
    // When time is reached, the order is cancelled. And Product is set back to 'forsale'.
    holdProductFor: 60 * 15, // mins

    // Wait the seller to confirm the order for 48 hours.
    // When time is reached, the pending order is cancelled. And Product is set back to 'forsale'.
    cancelPaidOrdersAfter: 60 * 60 * 48, // hours

    remindToConfirmOrderEvery: '6 hours',

    checkShippingStatusEvery: '15 minutes',

    MAX_DAYS_TRACKING_NUMBER_VALID_FOR: 7, // calendar days (included)

    minPrice: 150,
  },
  DEFAULT_FOLLOW: true,
};
