// @flow

import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import LocalStrategy from 'passport-local';
// import FacebookStrategy from 'passport-facebook';
import passport from 'passport';
// import VKontakteTokenStrategy from 'passport-vkontakte-token';

import { User, UserDoc, UserWeb, UserWebDoc } from '../models';
import config from './config';

// Configure Passport authenticated session persistence.
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user);
  });
});

// Setting up local login strategy
passport.use(
  new LocalStrategy(
    { usernameField: 'emailAddress' },
    (email, password, done) => {
      // mongoose changes the email to lowercase
      User.findOne({ emailAddress: email.toLowerCase() })
        .then((user: UserDoc) => {
          if (!user) {
            return done(new Error('invalid email'));
          }

          user.comparePassword(password, (err, isMatch) => {
            if (err) return done(err);

            if (isMatch) return done(null, user);

            return done(new Error('invalid password'));
          });
        })
        .catch(err => done(err, false));
    }
  )
);

// Setting JWT strategy options
const jwtOptions = {
  // Telling Passport to check authorization headers for JWT
  jwtFromRequest: ExtractJwt.fromAuthHeaderWithScheme('JWT'),
  // Telling Passport where to find the secret
  secretOrKey: config.jwtSecret,
};

// Setting up JWT login strategy
passport.use(
  new JwtStrategy(jwtOptions, (jwt_payload, done) => {
    if (!jwt_payload.type) {
      User.findById(jwt_payload._id)
        .then((user: UserDoc) => {
          if (!user) return done(null, false, { type: 'user' });
          done(null, user);
        })
        .catch(err => done(err, false));
    } else if (jwt_payload.type == 'web') {
      UserWeb.findById(jwt_payload._id)
        .then((user: UserWebDoc) => {
          if (!user) return done(null, false, { type: 'web' });
          done(null, { ...user.toJSON(), type: 'web' });
        })
        .catch(err => done(err, false, { type: 'web' }));
    }
  })
);

/*
When enabled add index (in user.model.js)

UserSchema.index({ facebook: 1 }, { unique: true, sparse: true });

passport.use(
  new FacebookStrategy(
    {
      clientID: config.FACEBOOK_APP_ID,
      clientSecret: config.FACEBOOK_APP_SECRET,
      callbackURL: 'http://localhost:3000/auth/facebook/return', // development
      // callbackURL: 'https://onova.co/auth/facebook/return', // prod
      passReqToCallback: true,
    },
    (req, accessToken, refreshToken, profile, done) => {
      if (req.user) {
        User.findOne({ facebook: profile.id }, (err, existingUser) => {
          if (err) return done(err);

          if (existingUser) {
            console.error('error');
            // req.flash('errors', {
            //   msg:
            //     'There is already a Facebook account that belongs to you. Sign in with that account or delete it, then link it with your current account.',
            // });
            return done(err);
          }

          User.findById(req.user.id, (err, user) => {
            if (err) return done(err);

            user.facebook = profile.id;
            user.tokens.push({ kind: 'fb', accessToken });
            user.save(err => {
              req.flash('info', { msg: 'Facebook account has been linked.' });
              done(err, user);
            });
          });
        });
      }
      // registering with Facebook (not allowed)
      // } else {
      //   User.findOne({ facebook: profile.id }, (err, existingUser) => {
      //     if (err) return done(err);

      //     if (existingUser) {
      //       return done(null, existingUser);
      //     }

      //     User.findOne(
      //       { emailAddress: profile._json.email },
      //       (err, existingEmailUser) => {
      //         if (err) return done(err);

      //         if (existingEmailUser) {
      //           req.flash('errors', {
      //             msg:
      //               'There is already an account using this email address. Sign in to that account and link it with Facebook manually from Account Settings.',
      //           });
      //           done(err);
      //         } else {
      //           const user = new User();
      //           user.emailAddress = profile._json.email;
      //           user.facebook = profile.id;
      //           user.tokens.push({ kind: 'fb', accessToken });

      //           user.save(err => {
      //             done(err, user);
      //           });
      //         }
      //       }
      //     );
      //   });
      // }
    }
  )
);
/*

/*
passport.use(
  new VKontakteTokenStrategy(
    {
      clientID: config.VK_APP_ID,
      clientSecret: config.VK_SECRET_KEY,
      passReqToCallback: true,
    },
    function(req, accessToken, refreshToken, profile, next) {
      // console.log(accessToken);
      // console.log(refreshToken);
      // console.log(profile);
      // User.findOne({ 'vkontakte.id': profile.id })
      //   .then(user => {
      //     console.log(user);
      //   })
      //   .catch(err => next(err));
    }
  )
);
*/
