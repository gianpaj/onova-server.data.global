// @flow

import jwt from 'jsonwebtoken';
import httpStatus from 'http-status';
import passport from 'passport';
const debug = require('debug')('server-data:index');

import { User, Verification } from '../models';
import mailCtrl from './mail.controller';
import APIError from '../helpers/APIError';
import config from '../config/config';

/**
 * POST /api/auth/login
 *
 * Returns jwt token if valid emailAddress and password are valid
 *
 * @param req
 * @param res
 * @param next
 * @returns {*}
 */
function login(req, res, next) {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      const APIerr = new APIError(err.message, httpStatus.UNAUTHORIZED);
      return next(APIerr);
    }
    if (!user) {
      debug(info);
      const APIerr = new APIError(
        'Authentication error',
        httpStatus.UNAUTHORIZED
      );
      return next(APIerr);
    }
    //?
    req.logIn(user, err => {
      if (err) {
        return next(err);
      }
      const payload = {
        _id: user._id,
        accountStatus: user.accountStatus,
        displayName: user.displayName,
        emailAddress: user.emailAddress,
        profilePic: user.profilePic,
        username: user.username,
      };
      return res.json({
        token: `JWT ${generateToken(payload)}`,
        data: payload,
      });
    });
  })(req, res, next);
}

/**
 * Responds with a http error or adds user into req.user
 *
 * @param req
 * @param res
 * @param next
 * @returns {*}
 */
function requireAuth(req, res, next) {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (info) {
      let message;
      if (info.name === 'TokenExpiredError') {
        message = 'jwt expired';
      } else {
        message = `Unauthorized ${info.type} user`;
      }
      const APIerr = new APIError(message, httpStatus.UNAUTHORIZED);
      return next(APIerr);
    }
    if (err || !user) {
      const APIerr = new APIError('Unauthorized', httpStatus.UNAUTHORIZED);
      return next(APIerr);
    }
    req.user = user;
    next();
  })(req, res, next);
}

// Generate JWT
function generateToken(payload) {
  const options = {};
  if (config.env === 'test') options.expiresIn = 20; // seconds
  // expiresIn: "2 days",
  return jwt.sign(payload, config.jwtSecret, options);
}

/**
 * GET /api/auth/random-number - (Protected route)
 *
 * Will return random number only if jwt token is provided in header.
 *
 * @param req
 * @param res
 * @returns {*}
 */
function getRandomNumber(req, res) {
  // req.user is assigned by 'passport-jwt' middleware if a valid token is provided
  return res.json({
    data: req.user,
    num: Math.random() * 100,
  });
}

/**
 * GET /api/auth/activate/:token
 *
 * @param {any} req
 * @param {any} res
 * @returns {*}
 */
function activate(req, res) {
  const token = req.params.token;

  Verification.findOne({ resetToken: token })
    .populate('user')
    .exec((err, verDoc) => {
      if (err) throw err;
      const data = {
        title: 'Onova - Email confirmation',
      };
      if (!verDoc || !verDoc.user) {
        // data.heading = 'There was an issue activating your account';
        data.heading = 'Виникла проблема при активації вашого профілю';
        // data.paragraph =
        //   'There was something wrong with the link you received. Note that it expires after 72 hours. Please request a new one from the App or email <a href="mailto:support@onova.co">support@onova.co</a> for support.';
        data.paragraph =
          'Щось не так з посиланням котре ви отримали. Воно стає недійсне через 72 години. Будь ласка спробуйте ще раз з додатку, або напишіть нам на <a href="mailto:support@onova.co">support@onova.co</a>';
        // TODO: update email if link is for Drop
      } else if (verDoc.user.accountStatus == 'notverified') {
        const { username, types } = verDoc.user;

        if (types.includes('reseller')) {
          data.title = 'Drop - Email confirmation';
        }
        data.heading = 'Профіль активовано!';
        data.paragraph = `${username}, Можеш користуватись додатком на повну (${
          verDoc.user.emailAddress
        }).`;

        //if token exists, activate user
        verDoc.user.accountStatus = 'verified';
        verDoc.user.save();

        verDoc.remove();
      } else if (verDoc.user.accountStatus == 'verified') {
        // const { username } = verDoc.user;
        // data.heading = 'Account is already activated!';
        data.heading = 'Ваш профіль активовано!!';
        // data.paragraph = `Double hi five ${username}! Your account is already activated (${
        //   verDoc.user.emailAddress
        // }).`;
        data.paragraph = `Вітання, ваш профіль активовано (${
          verDoc.user.emailAddress
        }).`;
      }
      return res.render('activation', data);
    });
}

/**
 * GET /api/auth/reset/:token
 *
 * @param {any} req
 * @param {any} res
 * @returns {*}
 */
function resetPage(req, res) {
  const token = req.params.token;

  Verification.findOne({ resetToken: token })
    .populate('user')
    .exec((err, verDoc) => {
      if (err) throw err;
      const data = {
        // title: 'Onova - Password reset',
        title: 'Онова - Заміна паролю',
        // .heading: 'Enter your new password',
        heading: 'Зміна паролю',
        // paragraph: 'Please enter your password twice:',
        paragraph: 'Введи новий пароль двічі:',
        show_form: true,
      };
      if (!verDoc || !verDoc.user) {
        // data.heading = 'There was an issue resetting your password';
        data.heading = 'Виникла проблема при зміні паролю';
        // data.paragraph =
        //   'There was something wrong with the link you received. Note that it expires after 72 hours. Please request a new one from the App or email <a href="mailto:support@onova.co">support@onova.co</a> for support.';
        data.paragraph =
          'Щось не так з посиланням котре ви отримали. Воно стає недійсне через 72 години. Будь ласка спробуйте ще раз з додатку, або напишіть нам на <a href="mailto:support@onova.co">support@onova.co</a>';
        data.show_form = false;
      } else if (verDoc.user.types.includes('reseller')) {
        data.title = 'Drop - Заміна паролю';
      }
      return res.render('pass-reset', data);
    });
}

// TODO: combine this resetFormSubmit and resetPage functions
/**
 * POST /api/auth/reset/:token - submit form
 *
 * @param {any} req
 * @param {any} res
 * @returns {*}
 */
function resetFormSubmit(req, res) {
  const data = {
    // title: 'Onova - Password reset',
    title: 'Онова - Заміна паролю',
    // heading: 'Enter your new password',
    heading: 'Зміна паролю',
    show_form: false,
  };
  if (req.body.password !== req.body.passwordagain) {
    // data.paragraph =
    //   '<div class="alert alert-danger" role="alert">Your passwords did not match.</div>';
    data.paragraph =
      '<div class="alert alert-danger" role="alert">Ваші паролі не співпали.</div>';
    data.show_form = true;
    return res.render('pass-reset', data);
  }
  const { token } = req.params;

  Verification.findOne({ resetToken: token })
    .populate('user')
    .exec((err, verDoc) => {
      if (err) throw err;
      if (!verDoc || !verDoc.user) {
        // data.heading = 'There was an issue resetting your password';
        data.heading = 'Виникла проблема при зміні паролю';
        return res.status(httpStatus.BAD_REQUEST).render('pass-reset', data);
      }
      if (verDoc.user.types.includes('reseller')) {
        data.title = 'Drop - Заміна паролю';
      }
      data.heading = '';
      data.paragraph = 'Ваш пароль оновлено.';
      // data.paragraph = 'Hi five! Your password has been updated.';

      verDoc.user.password = req.body.password;
      verDoc.user.status = 'verified';

      verDoc.user.save(err => {
        if (err) {
          return next(err);
        }
        verDoc.remove();
        return res.render('pass-reset', data);
      });
    });
}

/**
 * POST /api/auth/reset
 *
 * Send email via Mailjet to reset the account's password
 */
function requestPassReset(req, res) {
  User.findOne({ emailAddress: req.body.emailAddress }, (err, existingUser) => {
    if (err) return next(err);
    if (!existingUser) {
      console.log(
        "attempted to reset a user's password with no results:",
        req.body.emailAddress
      );
      return res.json({ message: 'Password reset email sent.' });
    }
    mailCtrl.sendResetEmail(req.body.emailAddress, existingUser);

    res.json({ message: 'Password reset email sent.' });
  });
}

/**
 * GET /api/auth/get-token - (Unprotected route)
 *
 * Token to request a card id to UAPAY via webview.
 * Because it's easier to generate on the server than RN client (no crypto node core module)
 */
function getTokenForRequestingCardId(req, res, next) {
  jwt.sign(
    {
      params: {
        clientId: config.UAPAY_CLIENTID_P2P,
        method: req.query.shortCard ? 'createShortCard' : 'createCard',
        enableRedirectResponse: false,
      },
    },
    config.UAPAY_SECRET_P2P,
    (err, jws) => {
      if (err) {
        console.log(err);
        const APIerr = new APIError(err, httpStatus.SERVICE_UNAVAILABLE);
        return next(APIerr);
      }
      res.json({ data: jws });
    }
  );
}

export default {
  login,
  getRandomNumber,
  activate,
  generateToken,
  requestPassReset,
  requireAuth,
  resetPage,
  resetFormSubmit,
  getTokenForRequestingCardId,
};
