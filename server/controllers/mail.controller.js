// @flow

import mailjet from 'node-mailjet';
import crypto from 'crypto';

import { User, UserDoc, Verification, UserWeb } from '../models';
import config from '../config/config';
import { prepareMessage } from '../helpers/job';

const mailjetClient = mailjet.connect(
  config.mailjet.apikeyPublic,
  config.mailjet.apikeyPrivate
);

/**
 * Send email via Mailjet to verify the account
 *
 * @param {string} emailTo
 * @param {User} user
 */
function sendVerificationEmail(emailTo: string, user: UserDoc): Promise<any> {
  const subject =
    'Підтвердження профілю - Welcome to Onova, verify your email address';

  // FIXME: create token in Verification model pre save Mongoose hook
  const token = crypto.randomBytes(8).toString('hex');

  // generate link
  return Verification.create({
    user: user._id,
    resetToken: token,
  })
    .then(() => {
      if (config.env === 'test') return;

      const vars = {
        confirmation_link: `https://onova.co/api/auth/activate/${token}`,
        displayName: user.username,
      };

      const request = mailjetClient.post('send', { version: 'v3.1' }).request({
        Messages: [
          {
            From: {
              Email: 'noreply@onova.co',
              Name: 'Onova',
            },
            To: [{ Email: emailTo }],
            Variables: vars,
            TemplateID: 343433,
            TemplateLanguage: true,
            Subject: subject,
          },
        ],
      });

      request
        // .then(res => {
        // console.log(res.body);
        // })
        .catch(err => {
          console.error(err.ErrorMessage);
        });
    })
    .catch(e => console.error(e));
}

/**
 * Send email via Mailjet to re-verify the account
 */
function resendVerificationEmail(emailTo: string, user: Object): void {
  const subject = 'Verify your new email address';

  // FIXME: create token in Verification model pre save Mongoose hook
  const token = crypto.randomBytes(8).toString('hex');

  // generate link
  Verification.create({
    user: user._id,
    resetToken: token,
  })
    .then(() => {
      if (config.env === 'test') return;

      const vars = {
        confirmation_link: `https://onova.co/api/auth/activate/${token}`,
        displayName: user.username,
      };

      const request = mailjetClient.post('send', { version: 'v3.1' }).request({
        Messages: [
          {
            From: {
              Email: 'noreply@onova.co',
              Name: 'Onova',
            },
            To: [{ Email: emailTo }],
            Variables: vars,
            Subject: subject,
            TemplateLanguage: true,
            TextPart:
              'Hi {{var:displayName}},\n\nPlease verify your new email address.\n\nClick here to confirm it: {{var:confirmation_link}}.\n\nCheers, The Onova Team.',
            HTMLPart:
              'Hi {{var:displayName}},<p>Please verify your new email address.</p><p>Click here to confirm it: {{var:confirmation_link}}</p><p>Cheers, The Onova Team.</p>',
          },
        ],
      });

      request
        .then(res => {
          console.log(res.body);
        })
        .catch(err => {
          console.error(err.ErrorMessage);
        });
    })
    .catch(e => console.error(e));
}

/**
 * Send email via Mailjet to reset the account's password
 */
function sendResetEmail(emailTo: string, user: Object): void {
  const subject = 'Відновлення пароля';

  // FIXME: create token in Verification model pre save Mongoose hook
  const token = crypto.randomBytes(8).toString('hex');

  // generate link
  Verification.create({
    user: user._id,
    resetToken: token,
  })
    .then(() => {
      if (config.env === 'test') return;

      const vars = {
        reset_link: `https://onova.co/api/auth/reset/${token}`,
        displayName: user.username,
      };

      const request = mailjetClient.post('send', { version: 'v3.1' }).request({
        Messages: [
          {
            From: {
              Email: 'noreply@onova.co',
              Name: 'Onova',
            },
            To: [{ Email: emailTo }],
            Variables: vars,
            Subject: subject,
            TemplateID: 345696,
            TemplateLanguage: true,
            TemplateErrorDeliver: true,
            TemplateErrorReporting: {
              Email: 'gianfranco@onova.co',
              Name: 'gianfranco',
            },
          },
        ],
      });

      request
        .then(res => {
          console.log(res.body);
        })
        .catch(err => {
          console.error(err.ErrorMessage);
        });
    })
    .catch(e => console.error(e));
}

/**
 * Send emails for an order notification / update
 */
async function sendOrderUpdate({ notifI18n, targetUser, data, actionMsg }) {
  const SandboxMode = config.env === 'test';
  let user,
    text = notifI18n;

  const isWebUser = data.buyerType === 'UserWeb';

  if (isWebUser) {
    user = await UserWeb.findById(targetUser);
  } else {
    user = await User.findById(targetUser);
  }

  if (data.shippingStatus)
    text = prepareMessage(data.shippingStatus, data.trackingNumber);

  const vars = {
    displayName: user.displayName || user.username,
    updateText: text,
    ...(actionMsg ? { actionMsg } : {}),
  };

  return mailjetClient.post('send', { version: 'v3.1' }).request({
    Messages: [
      {
        From: {
          Email: 'noreply@onova.co',
          Name: 'Onova',
        },
        To: [{ Email: user.emailAddress }],
        Variables: vars,
        Subject: text,
        TemplateID: 670839,
        TemplateLanguage: true,
        TemplateErrorDeliver: true,
        TemplateErrorReporting: {
          Email: 'gianfranco@onova.co',
          Name: 'gianfranco',
        },
      },
    ],
    SandboxMode,
  });
}

export default {
  sendVerificationEmail,
  resendVerificationEmail,
  sendResetEmail,
  sendOrderUpdate,
};
