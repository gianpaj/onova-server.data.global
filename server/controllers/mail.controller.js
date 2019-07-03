// @flow

import mailjet from 'node-mailjet';
import crypto from 'crypto';

import { User, UserDoc, Verification, UserWeb, OrderDoc } from '../models';
import config from '../config/config';
import { getOrderUpdateMessage } from '../helpers/job';

const SandboxMode = config.env === 'test';

const mailjetClient = mailjet.connect(config.mailjet.apikeyPublic, config.mailjet.apikeyPrivate);

const mailjetVersionObj = { version: 'v3.1' };

let mailjetOptions = {
  TemplateLanguage: true,
  TemplateErrorDeliver: true,
  TemplateErrorReporting: {
    Email: 'gianfranco@onova.co',
    Name: 'gianfranco',
  },
};

/**
 * Send email via Mailjet to verify the account
 *
 * @param {string} emailTo
 * @param {User} user
 */
function sendVerificationEmail(emailTo: string, user: UserDoc): Promise<any> {
  let subject = 'Підтвердження профілю - Welcome to Onova, verify your email address';
  let TemplateID = 343433;
  let domain = 'onova.co';
  mailjetOptions = {
    ...mailjetOptions,
    From: {
      Email: 'noreply@onova.co',
      Name: 'Onova',
    },
  };
  if (user.types.includes('reseller')) {
    subject = 'Підтвердження профілю - Welcome to Drop, verify your email address';
    TemplateID = 832474;
    domain = 'drop.uno';
    mailjetOptions = {
      ...mailjetOptions,
      From: {
        Email: 'noreply@drop.uno',
        Name: 'Drop',
      },
    };
  }

  // FIXME: create token in Verification model pre save Mongoose hook
  const token = crypto.randomBytes(8).toString('hex');

  // generate link
  return Verification.create({
    user: user._id,
    resetToken: token,
  })
    .then(() => {
      const vars = {
        confirmation_link: `https://${domain}/api/auth/activate/${token}`,
        displayName: user.username,
      };

      const request = mailjetClient.post('send', mailjetVersionObj).request({
        Messages: [
          {
            To: [{ Email: emailTo }],
            Variables: vars,
            TemplateID,
            Subject: subject,
            ...mailjetOptions,
          },
        ],
        SandboxMode,
      });

      return request.catch(err => {
        console.error(err.ErrorMessage);
        throw err;
      });
    })
    .catch(e => console.error(e));
}

/**
 * Send email via Mailjet to re-verify the account
 */
function resendVerificationEmail(emailTo: string, user: Object): void {
  const Subject = 'Verify your new email address';

  // FIXME: create token in Verification model pre save Mongoose hook
  const token = crypto.randomBytes(8).toString('hex');

  let domain = 'onova.co';
  if (user.types.includes('reseller')) domain = 'drop.uno';

  // generate link
  Verification.create({
    user: user._id,
    resetToken: token,
  })
    .then(() => {
      const Variables = {
        confirmation_link: `https://${domain}/api/auth/activate/${token}`,
        displayName: user.username,
      };

      return mailjetClient.post('send', mailjetVersionObj).request({
        Messages: [
          {
            To: [{ Email: emailTo }],
            Variables,
            Subject,
            TextPart:
              'Hi {{var:displayName}},\n\nPlease verify your new email address.\n\nClick here to confirm it: {{var:confirmation_link}}.\n\nCheers.',
            HTMLPart:
              'Hi {{var:displayName}},<p>Please verify your new email address.</p><p>Click here to confirm it: {{var:confirmation_link}}</p><p>Cheers.</p>',
            ...mailjetOptions,
          },
        ],
        SandboxMode,
      });
    })
    .catch(e => console.error(e));
}

/**
 * Send email via Mailjet to reset the password
 */
function sendResetEmail(emailTo: string, user: Object): void {
  const subject = 'Відновлення пароля';

  // FIXME: create token in Verification model pre save Mongoose hook
  const token = crypto.randomBytes(8).toString('hex');

  let TemplateID = 345696;
  let domain = 'onova.co';
  mailjetOptions = {
    ...mailjetOptions,
    From: {
      Email: 'noreply@onova.co',
      Name: 'Onova',
    },
  };

  if (user.types.includes('reseller')) {
    TemplateID = 832656;
    domain = 'drop.uno';
    mailjetOptions = {
      ...mailjetOptions,
      From: {
        Email: 'noreply@drop.uno',
        Name: 'Drop',
      },
    };
  }

  // generate link
  Verification.create({
    user: user._id,
    resetToken: token,
  })
    .then(() => {
      const vars = {
        reset_link: `https://${domain}/api/auth/reset/${token}`,
        displayName: user.username,
      };

      const request = mailjetClient.post('send', mailjetVersionObj).request({
        Messages: [
          {
            To: [{ Email: emailTo }],
            Variables: vars,
            Subject: subject,
            TemplateID,
            ...mailjetOptions,
          },
        ],
        SandboxMode,
      });

      return request.catch(err => {
        console.error(err.ErrorMessage);
      });
    })
    .catch(e => console.error(e));
}

/**
 * Send emails for an order notification / update
 */
async function sendOrderUpdate({
  actionMsg,
  order,
  notifI18n,
  targetUser,
}: {
  actionMsg: string,
  notifI18n: string,
  order: OrderDoc,
  targetUser: UserDoc,
}) {
  let user,
    text = notifI18n;

  const isWebUser = order.buyerType === 'UserWeb';

  // if we're emailing the buyer
  if (targetUser == order.buyer._id && isWebUser) {
    user = await UserWeb.findById(targetUser);
  } else {
    user = await User.findById(targetUser);
  }

  if (!user) {
    throw new Error('sendOrderUpdate: no user found for ' + targetUser);
  }

  let TemplateID = 670839;
  mailjetOptions = {
    ...mailjetOptions,
    From: {
      Email: 'noreply@onova.co',
      Name: 'Onova',
    },
  };

  if (order.seller.types.includes('reseller')) {
    TemplateID = 832563;
    mailjetOptions = {
      ...mailjetOptions,
      From: {
        Email: 'noreply@drop.uno',
        Name: 'Drop',
      },
    };
  }

  if (order.trackingNumber) text = getOrderUpdateMessage(order.shippingStatus, order.trackingNumber);

  const vars = {
    displayName: user.displayName || user.username,
    updateText: text,
    ...(actionMsg ? { actionMsg } : {}),
  };

  try {
    await mailjetClient.post('send', mailjetVersionObj).request({
      Messages: [
        {
          To: [{ Email: user.emailAddress }],
          Variables: vars,
          Subject: text,
          TemplateID,
          ...mailjetOptions,
        },
      ],
      SandboxMode,
    });
  } catch (error) {
    console.error(error.ErrorMessage);
    throw error;
  }
}

export default {
  sendVerificationEmail,
  resendVerificationEmail,
  sendResetEmail,
  sendOrderUpdate,
};
