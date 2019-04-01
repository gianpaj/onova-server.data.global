// @flow

import express from 'express';
import type { $Request, $Response, NextFunction } from 'express';
import logger from 'morgan';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import compress from 'compression';
import methodOverride from 'method-override';
import cors from 'cors';
import httpStatus from 'http-status';
import winston from 'winston';
import expressWinston from 'express-winston';
import expressValidation from 'express-validation';
import helmet from 'helmet';
import passport from 'passport';
import Agenda from 'agenda';
import * as Sentry from '@sentry/node';
require('winston-daily-rotate-file');

import winstonInstance, { winstonDailyRotateConfig } from './winston';
import routes from '../routes';
import routesV2 from '../routes/indexV2';
import config from './config';
import APIError from '../helpers/APIError';
import EscrowRunner from '../runners/escrow.runner';
import ShippingRunner from '../runners/shipping.runner';

const debug = require('debug')('server-data:index');

const jobDb = `mongodb://${config.mongo.host}:${config.mongo.port}/${
  config.mongo.jobDb
}`;

export const agenda = new Agenda({ db: { address: jobDb } });

if (config.env === 'test') {
  agenda.on('ready', () => {
    agenda.purge((err, numRemoved) => {
      if (err) return console.error(err);
      debug('jobs removed', numRemoved);
      agenda.start();
      ensureAgendaIndexes();
    });
  });
} else {
  agenda.on('ready', () => {
    agenda.start();
    ensureAgendaIndexes();
  });
}

function ensureAgendaIndexes() {
  // for profile drops feed
  // and
  // for my feed of drops
  agenda._collection.createIndex(
    { name: 1, 'data.product.seller': 1 },
    { background: true }
  );
  // for PUSH_MSG
  agenda._collection.createIndex(
    { message: 1, targetUser: 1, triggeredBy: 1 },
    { background: true }
  );
}

/**
 * Escrow manager to cancel unpaid orders, notify of status updates on payments and shipping
 */
new EscrowRunner();

/**
 * Shipping manager to updates users on the status of their shipping. From order ready to ship to finilised.
 */
new ShippingRunner();

/**
 * API keys and Passport configuration.
 */
require('./passport');

const app = express();

if (config.env === 'development') {
  app.use(logger('dev'));
}

if (config.env === 'production') {
  Sentry.init({ dsn: config.SENTRY_DSN });

  // The request handler must be the first middleware on the app
  app.use(Sentry.Handlers.requestHandler());
}

// parse body params and attache them to req.body
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(cookieParser());
app.use(compress());
app.use(methodOverride());

app.use(passport.initialize());

// secure apps by setting various HTTP headers
app.use(helmet());

// enable CORS - Cross Origin Resource Sharing
app.use(cors());

// used for simple activation email confirmation page
app.set('views', './server/views');
app.set('view engine', 'pug');

// tell Express to use the remote IP address
app.set('trust proxy', true);

// enable detailed API console logging in dev env
if (config.env === 'development') {
  expressWinston.requestWhitelist.push('body');
  expressWinston.responseWhitelist.push('body');
  app.use(
    expressWinston.logger({
      winstonInstance,
      meta: true, // optional: log meta data about request (defaults to true)
      msg:
        'HTTP {{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms',
      colorize: true, // Color the status code (default green, 3XX cyan, 4XX yellow, 5XX red).
    })
  );
}
if (config.env === 'test') {
  expressWinston.requestWhitelist.push('body');
  expressWinston.responseWhitelist.push('body');
}

if (config.env === 'production') {
  app.use(
    expressWinston.logger({
      transports: [
        new winston.transports.DailyRotateFile({
          ...winstonDailyRotateConfig,
          filename: 'access-%DATE%.log',
        }),
      ],
    })
  );
}

// mount all routes on /api path
app.use('/api', routes);
app.use('/api/v2', routesV2);

// if error is not an instanceOf APIError, convert it.
app.use((err: any, req: $Request, res: $Response, next: NextFunction) => {
  if (err instanceof expressValidation.ValidationError) {
    // validation error contains errors which is an array of error each containing message[]
    const unifiedErrorMessage = err.errors
      .map(error => error.messages.join('. '))
      .join(' and ');
    const error = new APIError(unifiedErrorMessage, err.status, true);
    return next(error);
  } else if (!(err instanceof APIError)) {
    const apiError = new APIError(err.message, err.status, err.isPublic);
    return next(apiError);
  }
  return next(err);
});

// catch 404 and forward to error handler
app.use((req: $Request, res: $Response, next: NextFunction) => {
  const err = new APIError('API not found', httpStatus.NOT_FOUND, false);
  return next(err);
});

// log error in winston transports in development
if (config.env === 'development') {
  app.use(
    expressWinston.errorLogger({
      winstonInstance,
    })
  );
} else if (config.env === 'production') {
  // The error handler must be before any other error middleware
  app.use(Sentry.Handlers.errorHandler());

  // log errors to files
  app.use(
    expressWinston.errorLogger({
      transports: [
        new winston.transports.DailyRotateFile({
          ...winstonDailyRotateConfig,
          filename: 'error-%DATE%.log',
          json: true,
        }),
      ],
      exceptionHandlers: [
        new winston.transports.File({ filename: 'exceptions.log' }),
      ],
    })
  );
}

// error handler, send stacktrace only during development
// eslint-disable-next-line no-unused-vars
app.use((err: any, req: $Request, res: $Response, next: NextFunction) =>
  res.status(err.status).json({
    ok: false,
    message: err.isPublic ? err.message : httpStatus[err.status],
    stack: config.env === 'development' ? err.stack : {},
  })
);

export default app;
