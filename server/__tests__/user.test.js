// @flow

import mongoose from 'mongoose';
import request from 'supertest';
import httpStatus from 'http-status';
import path from 'path';
import jwt from 'jsonwebtoken';
import superagent from 'superagent';
import mockSuperagent from 'superagent-mock';

import app from '../index';
import config from '../config/config';
import { Verification, User, UserDoc } from '../models';
import { createUserAndLogin, beforeAllTests } from './utils';

/**
 * root level hooks
 */
afterAll(done => {
  // required because https://github.com/Automattic/mongoose/issues/1251#issuecomment-65793092
  mongoose.models = {};
  mongoose.modelSchemas = {};
  mongoose.connection.close();
  done();
});

const validPhoneNumber = '0977414301';
const validPhoneNumber2 = '0977414302';
const mailjetServerEndPoint = 'https://api.mailjet.com/v3.1';
let superagentMock;
let mailJetParams;

describe('## User APIs', () => {
  beforeAll(beforeAllTests);

  beforeAll(() => {
    superagentMock = mockSuperagent(superagent, [
      {
        pattern: mailjetServerEndPoint,
        fixtures: (match, params) => {
          mailJetParams = params;
          return {};
        },
        post: (match, data) => ({ body: data }),
      },
    ]);
  });

  // $FlowFixMe
  let user: UserDoc = {
    username: 'firstperson',
    emailAddress: 'gianpa+test@gmail.com',
    mobileNumber: validPhoneNumber, // optional
    password: 'expressos',
  };

  const userShippingAddress = {
    shippingAddress: {
      firstName: 'Джанфранко',
      lastName: 'Палумбо',
      city: 'Львів',
      departmentNovaposhta: '1',
    },
  };

  const userPaymentInfo = {
    paymentInfoPayload:
      '2zNu7MwoGb5ovdnwctMmaCsTHRAJetjVertfZk3ta62znkhvtwAPeFZj2dngnAngXgqECAuEJAddghgVm6SWCJn584GVghQjf4uyqHRvPgw34PiCWx',
    short: true,
  };

  // $FlowFixMe
  let anotherUser: UserDoc = {
    username: 'anotherperson',
    emailAddress: 'gianpa+test2@gmail.com',
    mobileNumber: validPhoneNumber, // optional
    password: 'express2',
  };

  // $FlowFixMe
  let thirdUser: UserDoc = {
    username: 'thirdwheel',
    emailAddress: 'gianpa+thirdwheel@gmail.com',
    password: 'express3',
  };

  let forthUser: UserDoc = {
    username: 'forthuser',
    emailAddress: 'gianpa+forthuser@gmail.com',
    password: 'express4',
  };

  const fifthUser = {
    username: 'fifthuser',
    emailAddress: 'gianpa+fifthuser@gmail.com',
    password: 'express5',
    type: 'reseller',
  };

  // $FlowFixMe
  const invalidUserCredentials: UserDoc = {
    emailAddress: 'gianpa-react@gmail.com',
    password: 'IDontKnow',
  };

  let userId;
  let anotherUserId;
  let forthUserId;
  let jwtToken;
  let anotherJwtToken;
  let forthJwtToken;
  let activationToken;
  let resetToken;

  afterAll(() => {
    superagentMock.unset();
  });

  describe('# Create user and verify email address', () => {
    describe('# POST /api/users - ', () => {
      it('should create a new user (designer - by default)', () => {
        return request(app)
          .post('/api/users')
          .send(user)
          .expect(httpStatus.CREATED)
          .then(res => {
            const { data } = res.body;
            expect(typeof data._id).toBe('string');
            expect(data.accountStatus).toBe('notverified');
            expect(data.emailAddress).toBe(user.emailAddress);
            expect(data.followersCount).toBe(0);
            expect(data.followingCount).toBe(0);
            expect(data.ratingsTotal).toBe(0);
            expect(data.reviewsCount).toBe(0);
            expect(data.username).toBe(user.username);
            expect(data.types).toEqual(['designer']);
            expect(typeof res.body.token).toBe('string');
            expect(Object.keys(data).sort()).toMatchSnapshot();

            const emailMsg = mailJetParams.Messages[0];
            expect(emailMsg.Subject).toBe(
              'Підтвердження профілю - Welcome to Onova, verify your email address'
            );
            expect(emailMsg.To[0].Email).toBe(user.emailAddress);
            expect(emailMsg.From.Email).toBe('noreply@onova.co');

            userId = data._id;
          });
      });

      it('should create a new user (reseller)', () => {
        return request(app)
          .post('/api/users')
          .send(fifthUser)
          .expect(httpStatus.CREATED)
          .then(res => {
            const { data } = res.body;
            expect(typeof data._id).toBe('string');
            expect(data.accountStatus).toBe('notverified');
            expect(data.emailAddress).toBe(fifthUser.emailAddress);
            expect(data.followersCount).toBe(0);
            expect(data.followingCount).toBe(0);
            expect(data.ratingsTotal).toBe(0);
            expect(data.reviewsCount).toBe(0);
            expect(data.username).toBe(fifthUser.username);
            expect(data.types).toEqual(['reseller']);
            expect(typeof res.body.token).toBe('string');
            expect(Object.keys(data).sort()).toMatchSnapshot();

            const emailMsg = mailJetParams.Messages[0];
            expect(emailMsg.Subject).toBe(
              'Підтвердження профілю - Welcome to Drop, verify your email address'
            );
            expect(emailMsg.To[0].Email).toBe(fifthUser.emailAddress);
            expect(emailMsg.From.Email).toBe('noreply@drop.uno');
          });
      });

      it('should create a new user without mobile num', () => {
        return request(app)
          .post('/api/users')
          .send(thirdUser)
          .expect(httpStatus.CREATED)
          .then(res => {
            const { data } = res.body;
            expect(typeof data._id).toBe('string');
            expect(data.username).toBe(thirdUser.username);
            expect(data.emailAddress).toBe(thirdUser.emailAddress);
            expect(data.accountStatus).toBe('notverified');
            expect(data.followersCount).toBe(0);
            expect(data.followingCount).toBe(0);
            expect(typeof res.body.token).toBe('string');
            expect(Object.keys(data).sort()).toMatchSnapshot();
          });
      });

      it('should NOT create a user with an invalid username (space)', () => {
        const user1 = { emailAddress: 'u1@gmail.com', username: 'white space' };
        return request(app)
          .post('/api/users')
          .send({ ...user, ...user1 })
          .expect(httpStatus.BAD_REQUEST);
      });

      it('should NOT create a user with an invalid username (@ char)', () => {
        const user2 = { emailAddress: 'user2@gmail.com', username: 'at@sign' };
        return request(app)
          .post('/api/users')
          .send({ ...user, ...user2 })
          .expect(httpStatus.BAD_REQUEST);
      });

      it('should NOT create a user with an invalid username (cyrillic alphabet)', () => {
        const user3 = { emailAddress: 'user3@gmail.com', username: 'Кплнаше' };
        return request(app)
          .post('/api/users')
          .send({ ...user, ...user3 })
          .expect(httpStatus.BAD_REQUEST);
      });

      it('should create a user with a valid username (. dot)', () => {
        const user5 = {
          emailAddress: 'user5@gmail.com',
          username: 'user.user',
        };
        return request(app)
          .post('/api/users')
          .send({ ...user, ...user5 })
          .expect(httpStatus.CREATED);
      });

      it('should create and validate a user with email starting with onovaapp', () => {
        const user7 = {
          emailAddress: 'onovaapp+user7@gmail.com',
          username: 'onovaapp',
        };
        return request(app)
          .post('/api/users')
          .send({ ...user, ...user7 })
          .expect(httpStatus.CREATED)
          .then(({ body }) => {
            expect(body.data.accountStatus).toBe('verified');
          });
      });

      it('should create a user with a valid username (_ char)', () => {
        const user6 = { emailAddress: 'u6@gmail.com', username: 'under_score' };
        return request(app)
          .post('/api/users')
          .send({ ...user, ...user6 })
          .expect(httpStatus.CREATED);
      });

      it('should not create a user with the same email address', () => {
        return request(app)
          .post('/api/users')
          .send(user)
          .expect(httpStatus.BAD_REQUEST)
          .then(res => {
            expect(res.body.message).toBe(
              'An account with the same email address or username exists.'
            );
          });
      });

      it('should not create a user with a short password', () => {
        return request(app)
          .post('/api/users')
          .send({ ...user, password: '123' })
          .expect(httpStatus.BAD_REQUEST)
          .then(res => {
            expect(res.body.message).toBe(
              '"password" length must be at least 8 characters long'
            );
          });
      });
    });

    describe('# GET /api/auth/activate/:token (page)', () => {
      it('should activate the user', done => {
        Verification.findOne({ user: userId }, (err, verDoc) => {
          if (err) return done(err);
          if (!verDoc) return done('no verification token found');
          activationToken = verDoc.resetToken;
          request(app)
            .get(`/api/auth/activate/${activationToken}`)
            .expect(httpStatus.OK)
            .then(res => {
              expect(res.text).toContain('Профіль активовано');
              done();
            })
            .catch(done);
        });
      });

      it('should NOT reactivate the user', () => {
        return request(app)
          .get(`/api/auth/activate/${activationToken}`)
          .expect(httpStatus.OK)
          .then(res =>
            expect(res.text).toContain(
              'Виникла проблема при активації вашого профілю'
              // 'something wrong with the link you received'
            )
          );
      });

      it('an expired link should not work', () => {
        return request(app)
          .get(`/api/auth/activate/e700760eb3d6fc65`)
          .expect(httpStatus.OK)
          .then(res =>
            expect(res.text).toContain(
              'Виникла проблема при активації вашого профілю'
              // 'something wrong with the link you received'
            )
          );
      });
    });
  });

  describe('# POST /api/auth/login', () => {
    it('should NOT find the email', () => {
      return request(app)
        .post('/api/auth/login')
        .send(invalidUserCredentials)
        .expect(httpStatus.UNAUTHORIZED)
        .then(res => expect(res.body.message).toBe('invalid email'));
    });

    it('should NOT match the password', () => {
      return request(app)
        .post('/api/auth/login')
        .send({
          emailAddress: user.emailAddress,
          password: 'blahblah',
        })
        .expect(httpStatus.UNAUTHORIZED)
        .then(res => expect(res.body.message).toBe('invalid password'));
    });

    it('should get valid JWT token', done => {
      request(app)
        .post('/api/auth/login')
        .send({
          emailAddress: user.emailAddress,
          password: user.password,
        })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body).toHaveProperty('token');
          const token = body.token.split('JWT ')[1];
          expect(Object.keys(body).sort()).toMatchSnapshot();
          expect(Object.keys(body.data).sort()).toMatchSnapshot();
          jwt.verify(token, config.jwtSecret, (err, decoded) => {
            expect(err).toBeFalsy();
            expect(decoded.emailAddress).toBe(user.emailAddress);
            jwtToken = body.token;
            done();
          });
        })
        .catch(done);
    });
  });

  describe('# GET /api/users/:userId', () => {
    it("should get the user's details (public)", () => {
      return request(app)
        .get(`/api/users/${userId}`)
        .expect(httpStatus.OK)
        .then(res => {
          expect(res.body.username).toBe(user.username);
          expect(res.body.emailAddress).toBe(user.emailAddress);
          expect(res.body.followersCount).toBe(0);
          expect(res.body.followingCount).toBe(0);
          expect(Object.keys(res.body).sort()).toMatchSnapshot();
        });
    });

    it('should return error with message - When user does not exists', () => {
      return request(app)
        .get('/api/users/56c787ccc67fc16ccc1a5e92')
        .expect(httpStatus.BAD_REQUEST)
        .then(res => expect(res.body.message).toBe('Invalid user'));
    });
  });

  describe('# GET /api/users/?username=username', () => {
    it("should get the user's details (public) by username", () => {
      return request(app)
        .get(`/api/users/?username=${user.username}`)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.username).toBe(user.username);
          expect(body.emailAddress).toBe(user.emailAddress);
          expect(body.followersCount).toBe(0);
          expect(body.followingCount).toBe(0);
          expect(Object.keys(body).sort()).toMatchSnapshot();
        });
    });

    it('should return error with message - When user does not exists', () => {
      return request(app)
        .get('/api/users/?username=bananaz')
        .expect(httpStatus.BAD_REQUEST)
        .then(res => expect(res.body.message).toBe('Invalid user'));
    });
  });

  describe('# PUT /api/users/:userId', () => {
    let userWebToken;
    beforeAll(() => {
      return request(app)
        .post('/api/users-web')
        .expect(httpStatus.CREATED)
        .then(({ body }) => (userWebToken = body.token));
    });

    it("should remove the user's mobile number", () => {
      return request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', jwtToken)
        .send({ ...user, mobileNumber: '' })
        .expect(httpStatus.OK)
        .then(res => {
          expect(res.body.emailAddress).toBe(user.emailAddress);
          expect(res.body.mobileNumber).toBe('');
          expect(res.body.username).toBe(user.username);
          expect(res.body.accountStatus).toBe('verified');
        });
    });

    it("should update user's mobile number incl. +380", () => {
      return request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', jwtToken)
        .send({ ...user, mobileNumber: '+380977414301' })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.emailAddress).toBe(user.emailAddress);
          expect(body.mobileNumber).toBe('0977414301');
          expect(body.username).toBe(user.username);
          expect(body.accountStatus).toBe('verified');
        });
    });

    it("should update user's details", () => {
      user.mobileNumber = validPhoneNumber2;
      return request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', jwtToken)
        .send(user)
        .expect(httpStatus.OK)
        .then(res => {
          expect(res.body.emailAddress).toBe(user.emailAddress);
          expect(res.body.mobileNumber).toBe(validPhoneNumber2);
          expect(res.body.username).toBe(user.username);
          expect(res.body.accountStatus).toBe('verified');
        });
    });

    it('should NOT update a user with an invalid mobile number', () => {
      return request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', jwtToken)
        .send({ ...user, mobileNumber: '09774143011' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res =>
          expect(res.body.message).toContain(
            '"mobileNumber" does not seem to be a phone number'
          )
        );
    });

    it("should update user's bio", () => {
      const bio = 'born to make a make pretty clothes';
      return request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', jwtToken)
        .send({ ...user, bio })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.emailAddress).toBe(user.emailAddress);
          expect(body.bio).toBe(bio);
          expect(body.mobileNumber).toBe(user.mobileNumber);
          expect(body.username).toBe(user.username);
          expect(body.accountStatus).toBe('verified');
        });
    });

    it('should update a web user', () => {
      const { shippingAddress } = userShippingAddress;
      const userWeb = {
        emailAddress: 'hello@onova.co',
        mobileNumber: validPhoneNumber,
        ...userPaymentInfo,
        short: false,
        ...userShippingAddress,
      };
      return request(app)
        .put('/api/users-web/me')
        .set('Authorization', userWebToken)
        .send(userWeb)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          const shipInfo = body.shippingAddress;
          expect(body.emailAddress).toBe('hello@onova.co');
          expect(body.mobileNumber).toBe(validPhoneNumber);
          expect(body.paymentInfo.full.first_four).toBe('5168');
          expect(body.paymentInfo.full.last_four).toBe('6327');
          expect(body.displayName).toBe(
            `${shipInfo.firstName} ${shipInfo.lastName}`
          );
          expect(shipInfo.firstName).toBe(shippingAddress.firstName);
          expect(shipInfo.lastName).toBe(shippingAddress.lastName);
          expect(shipInfo.city).toBe(shippingAddress.city);
          expect(shipInfo.departmentNovaposhta).toBe(
            shippingAddress.departmentNovaposhta
          );
        });
    });

    it('should update only the password', done => {
      request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', jwtToken)
        .send({ password: 'express123' })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.emailAddress).toBe(user.emailAddress);
          expect(body.mobileNumber).toBe(user.mobileNumber);
          expect(body.username).toBe(user.username);
          expect(body.accountStatus).toBe('verified');
          return request(app)
            .post('/api/auth/login')
            .send({
              emailAddress: user.emailAddress,
              password: 'express123',
            })
            .expect(httpStatus.OK)
            .then(res => {
              expect(res.body).toHaveProperty('token');
              done();
            });
        })
        .catch(done);
    });

    it('should update user email and unverify it', () => {
      return request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', jwtToken)
        .send({ emailAddress: 'express123@gmail.com' })
        .expect(httpStatus.OK)
        .then(res => {
          user.emailAddress = res.body.emailAddress;
          expect(res.body.emailAddress).toBe('express123@gmail.com');
          expect(res.body.mobileNumber).toBe(user.mobileNumber);
          expect(res.body.username).toBe(user.username);
          expect(res.body.accountStatus).toBe('notverified');
        });
    });

    it("should update user's shipping info", () => {
      const tempuser = {
        ...user,
        ...userShippingAddress,
      };
      return request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', jwtToken)
        .send(tempuser)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          const { shippingAddress } = userShippingAddress;
          const shipInfo = body.shippingAddress;
          expect(body.emailAddress).toBe(tempuser.emailAddress);
          expect(body.mobileNumber).toBe(tempuser.mobileNumber);
          expect(body.username).toBe(tempuser.username);
          expect(shipInfo.firstName).toBe(shippingAddress.firstName);
          expect(shipInfo.lastName).toBe(shippingAddress.lastName);
          expect(shipInfo.city).toBe(shippingAddress.city);
          expect(shipInfo.departmentNovaposhta).toBe(
            shippingAddress.departmentNovaposhta
          );
        });
    });

    it("should update user's payment info", () => {
      const tempuser = {
        ...user,
        ...userPaymentInfo,
      };
      return request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', jwtToken)
        .send(tempuser)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.emailAddress).toBe(tempuser.emailAddress);
          expect(body.mobileNumber).toBe(tempuser.mobileNumber);
          expect(body.username).toBe(tempuser.username);
          expect(body.paymentInfo.short.first_four).toBe('5168');
          expect(body.paymentInfo.short.last_four).toBe('6327');
        });
    });

    it("should update user's pushToken", () => {
      const tempuser = {
        ...user,
        pushToken: 'randomStringWith1020Numbers',
      };
      return request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', jwtToken)
        .send({ pushToken: tempuser.pushToken })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.emailAddress).toBe(tempuser.emailAddress);
          expect(body.mobileNumber).toBe(tempuser.mobileNumber);
          expect(body.username).toBe(tempuser.username);
          expect(body.paymentInfo.short.first_four).toBe('5168');
          expect(body.paymentInfo.short.last_four).toBe('6327');
          expect(body.pushToken).toEqual(tempuser.pushToken);
        });
    });

    it("should update user's facebook access token", done => {
      const tempuser = {
        ...user,
        facebook: '101010101',
        accessToken: 'FBaccesssToen1020Numbers',
      };
      request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', jwtToken)
        .send({
          facebook: tempuser.facebook,
          accessToken: tempuser.accessToken,
        })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.emailAddress).toBe(tempuser.emailAddress);
          expect(body.username).toBe(tempuser.username);
          expect(body.facebook).toBe(tempuser.facebook);
          expect(body.tokens[0].accessToken).toBe(tempuser.accessToken);

          request(app)
            .get(`/api/users/${userId}/personal`)
            .set('Authorization', jwtToken)
            .expect(httpStatus.OK)
            .then(({ body }) => {
              expect(body.emailAddress).toBe(tempuser.emailAddress);
              expect(body.username).toBe(tempuser.username);
              expect(body.facebook).toBe(tempuser.facebook);
              expect(body.tokens[0].accessToken).toBe(tempuser.accessToken);
              done();
            });
        });
    });

    it('should update increase sharedCount', () => {
      return request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', jwtToken)
        .send({
          increaseShare: true,
        })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.emailAddress).toBe(user.emailAddress);
          expect(body.username).toBe(user.username);
          expect(body.sharedCount).toBe(1);
        });
    });

    it('should update the Card token (short) and masked card number (in base58)', () => {
      return request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', jwtToken)
        .send({ ...userPaymentInfo })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.paymentInfo.short.first_four).toBe('5168');
          expect(body.paymentInfo.short.last_four).toBe('6327');
          expect(body.paymentInfo.full).toBeUndefined();
        });
    });

    it('should update the Card token (full) and masked card number (in base58)', () => {
      return request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', jwtToken)
        .send({ ...userPaymentInfo, short: false })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.paymentInfo.short.first_four).toBe('5168');
          expect(body.paymentInfo.short.last_four).toBe('6327');
          expect(body.paymentInfo.full.first_four).toBe('5168');
          expect(body.paymentInfo.full.last_four).toBe('6327');
        });
    });
  });

  describe('# GET /api/users/', () => {
    it('should get personal info', () => {
      return request(app)
        .get(`/api/users/${userId}/personal`)
        .set('Authorization', jwtToken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          const { shippingAddress } = userShippingAddress;
          const shipInfo = body.shippingAddress;
          expect(body.username).toBe(user.username);
          expect(body.emailAddress).toBe(user.emailAddress);
          expect(Object.keys(body.paymentInfo).sort()).toMatchSnapshot(
            'paymentInfo'
          );
          expect(body.paymentInfo.short.first_four).toBe('5168');
          expect(body.paymentInfo.short.last_four).toBe('6327');
          expect(shipInfo.firstName).toBe(shippingAddress.firstName);
          expect(shipInfo.lastName).toBe(shippingAddress.lastName);
          expect(shipInfo.city).toBe(shippingAddress.city);
          expect(shipInfo.departmentNovaposhta).toBe(
            shippingAddress.departmentNovaposhta
          );
          expect(Object.keys(body).sort()).toMatchSnapshot('personal info');
        });
    });

    it('should get all users', () => {
      return request(app)
        .get('/api/users')
        .expect(httpStatus.OK)
        .then(res => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBe(6);
          expect(Object.keys(res.body[0]).sort()).toMatchSnapshot();
        });
    });

    it('should get all users (with limit)', () => {
      return request(app)
        .get('/api/users')
        .query({ limit: 10 })
        .expect(httpStatus.OK)
        .then(res => expect(Array.isArray(res.body)).toBe(true));
    });
  });

  describe('# GET /api/users/?u=<username>', () => {
    // $FlowFixMe
    const people: Array<UserDoc> = [
      {
        username: 'johnone',
        emailAddress: 'gianpa+john@gmail.com',
        password: 'express2',
      },
      {
        username: 'johntwo',
        emailAddress: 'gianpa+two@gmail.com',
        password: 'express2',
      },
      {
        username: 'johnperson',
        emailAddress: 'gianpa+person@gmail.com',
        password: 'express2',
      },
      {
        username: 'maria',
        emailAddress: 'maria@gmail.com',
        password: 'express2',
      },
    ];

    beforeAll(async () => {
      for (let i = 0; i < people.length; i++) {
        try {
          const u = await createUserAndLogin(people[i]);
          people[i]._id = u.user._id;
          people[i].jwtToken = u.jwtToken;
          if (u instanceof Error) throw u;
        } catch (err) {
          console.error(err);
        }
      }

      // delete user `maria`
      const m = await request(app)
        .delete(`/api/users/${people[3]._id.toString()}`)
        .set('Authorization', people[3].jwtToken)
        .expect(httpStatus.OK);
      expect(m.body.emailAddress).toBe(people[3].emailAddress);
      expect(m.body.username).toBe(people[3].username);

      // update profile pic of `johntwo`
      await request(app)
        .put(`/api/users/${people[1]._id.toString()}`)
        .set('Authorization', people[1].jwtToken)
        .attach('profilePic', path.join(__dirname, 'images/profilepic.jpg'))
        .field('displayName', 'displayName the second john')
        .field('bio', 'bio the second john')
        .expect(httpStatus.OK);
    });

    it('should NOT search by `u` and `username`', () => {
      return request(app)
        .get('/api/users?u=johntwo&username=johnuser')
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toContain(
            '"u" must not exist simultaneously with [username]'
          )
        );
    });

    it('should get all users which username contains `johntwo`', () => {
      return request(app)
        .get('/api/users?u=johntwo')
        .expect(httpStatus.OK)
        .then(res => {
          expect(res.body.length).toBe(1);
          expect(res.body[0].username).toBe(people[1].username);
          expect(Object.keys(res.body[0]).sort()).toMatchSnapshot();
        });
    });

    it('should get all users which username contains `person`', () => {
      return request(app)
        .get('/api/users?u=person')
        .expect(httpStatus.OK)
        .then(res => {
          expect(res.body.length).toBe(2);
          expect(res.body[0].username).toBe(user.username);
        });
    });

    it('should get all users which username contains `john`', () => {
      return request(app)
        .get('/api/users?u=john')
        .expect(httpStatus.OK)
        .then(res => {
          expect(res.body.length).toBe(3);
          expect(res.body[0].username).toBe(people[0].username);
        });
    });

    it('should NOT find deleted users', () => {
      return request(app)
        .get('/api/users?u=maria')
        .expect(httpStatus.OK)
        .then(res => expect(res.body.length).toBe(0));
    });
  });

  describe('# DELETE /api/users/:userId', () => {
    beforeAll(() => {
      return createUserAndLogin(anotherUser).then(({ user }) => {
        anotherUserId = user._id.toString();
      });
    });

    it('should delete user', () => {
      return request(app)
        .delete(`/api/users/${userId}`)
        .set('Authorization', jwtToken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.emailAddress).toBe(user.emailAddress);
          expect(body.mobileNumber).toBe(user.mobileNumber);
          expect(body.username).toBe(user.username);
          expect(body).toHaveProperty('deletedAt');
        });
    });

    // it('should not get users which username`s contains `віктор`', async () => {
    //   return request(app)
    //     .get('/api/users?u=віктор')
    //     .expect(httpStatus.BAD_REQUEST)
    //     .then();
    // });

    it('first user should not delete another user', () => {
      return request(app)
        .delete(`/api/users/${anotherUserId}`)
        .set('Authorization', jwtToken)
        .expect(httpStatus.UNAUTHORIZED);
    });

    it('should get error when deleting invalid user', () => {
      return request(app)
        .delete(`/api/users/59f91cac9b4645049289f6f`)
        .set('Authorization', jwtToken)
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe('Invalid user');
        });
    });
  });

  describe('# PUT /api/users/:userId', () => {
    beforeAll(() => {
      return createUserAndLogin(forthUser)
        .then(({ user, jwtToken: token }) => {
          forthUserId = user._id.toString();
          forthJwtToken = token;
        })
        .catch(err => {
          console.error(err);
        });
    });

    it('should NOT update an user`s email to an existing one', () => {
      return request(app)
        .put(`/api/users/${forthUserId}`)
        .set('Authorization', forthJwtToken)
        .send({ ...forthUser, emailAddress: anotherUser.emailAddress })
        .expect(httpStatus.BAD_REQUEST)
        .then(res =>
          expect(res.body.message).toBe(
            'An account with the same email address exists.'
          )
        );
    });

    it('should NOT update an user`s upper case email (existing)', () => {
      return request(app)
        .put(`/api/users/${forthUserId}`)
        .set('Authorization', forthJwtToken)
        .send({ ...forthUser, emailAddress: 'Gianpa+test2@gmail.com' })
        .expect(httpStatus.BAD_REQUEST)
        .then(res =>
          expect(res.body.message).toBe(
            'An account with the same email address exists.'
          )
        );
    });

    it("should NOT update an user's username to an existing one", () => {
      return request(app)
        .put(`/api/users/${forthUserId}`)
        .set('Authorization', forthJwtToken)
        .send({
          emailAddress: 'newemail@example.com',
          username: anotherUser.username,
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe(
            'An account with the same username exists.'
          );
          user.username = 'firstperson';
        });
    });
  });

  describe('# POST /api/auth/login', () => {
    it('should get another valid JWT token', () => {
      return request(app)
        .post('/api/auth/login')
        .send({
          emailAddress: anotherUser.emailAddress,
          password: anotherUser.password,
        })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body).toHaveProperty('token');
          anotherJwtToken = body.token;
        });
    });
  });

  describe('# PUT /api/users/:userId', () => {
    const bio =
      'Авторський крій, геометричні форми, апелювання до японських дизайнерів.';
    const socials = ' www.instagram.com/ga.eva.wear www.facebook.com/gaevawear';

    it("should upload the user's profile pic", () => {
      return request(app)
        .put(`/api/users/${anotherUserId}`)
        .set('Authorization', anotherJwtToken)
        .attach('profilePic', path.join(__dirname, 'images/profilepic.jpg'))
        .expect(httpStatus.OK)
        .then(res =>
          expect(res.body.profilePic).toBe(
            'https://assets.onova.co/users/5b091babdde06965f6580a6b-1527323596437.jpg'
          )
        );
    });

    it("should NOT update another user's details", () => {
      return request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', anotherJwtToken)
        .send(user)
        .expect(httpStatus.UNAUTHORIZED);
    });

    it("should update my user's details", () => {
      anotherUser.shippingAddress = {
        departmentNovaposhta: '#25',
      };
      return request(app)
        .put(`/api/users/${anotherUserId}`)
        .set('Authorization', anotherJwtToken)
        .send(anotherUser)
        .expect(httpStatus.OK)
        .then(res =>
          expect(res.body.shippingAddress.departmentNovaposhta).toBe('#25')
        );
    });

    it("should allow to delete the bio and displayName user's details", () => {
      return request(app)
        .put(`/api/users/${anotherUserId}`)
        .set('Authorization', anotherJwtToken)
        .send({ ...anotherUser, bio: '', displayName: '' })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.bio).toBe('');
          expect(body.displayName).toBe('');
        });
    });

    it("should save the bio and socials user's details", () => {
      return request(app)
        .put(`/api/users/${anotherUserId}`)
        .set('Authorization', anotherJwtToken)
        .send({ bio: bio + socials })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.bio).toBe(bio + socials);
          expect(body.socials.facebook).toBe(
            'https://www.facebook.com/gaevawear'
          );
          expect(body.socials.instagram).toBe(
            'https://www.instagram.com/ga.eva.wear'
          );
        });
    });

    it('should update to only one social URL v1', () => {
      return request(app)
        .put(`/api/users/${anotherUserId}`)
        .set('Authorization', anotherJwtToken)
        .send({ bio: bio + ' www.facebook.com/gaevawear' })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.bio).toBe(bio + ' www.facebook.com/gaevawear');
          expect(body.socials.facebook).toBe(
            'https://www.facebook.com/gaevawear'
          );
          expect(body.socials.instagram).toBeUndefined();
        });
    });

    it('should update to only one social URL v2', () => {
      return request(app)
        .put(`/api/users/${anotherUserId}`)
        .set('Authorization', anotherJwtToken)
        .send({ bio: bio + ' https://www.facebook.com/updated' })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.bio).toBe(bio + ' https://www.facebook.com/updated');
          expect(body.socials.facebook).toBe(
            'https://www.facebook.com/updated'
          );
          expect(body.socials.instagram).toBeUndefined();
        });
    });

    it('should update to only one social URL v3', () => {
      return request(app)
        .put(`/api/users/${anotherUserId}`)
        .set('Authorization', anotherJwtToken)
        .send({ bio: bio + ' facebook.com/updated' })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.bio).toBe(bio + ' facebook.com/updated');
          expect(body.socials.facebook).toBe('https://facebook.com/updated');
          expect(body.socials.instagram).toBeUndefined();
        });
    });

    it("should save the bio and displayName user's details", () => {
      return request(app)
        .put(`/api/users/${anotherUserId}`)
        .set('Authorization', anotherJwtToken)
        .send({ ...anotherUser, bio: 'a', displayName: 'b' })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.bio).toBe('a');
          expect(body.socials).toBeUndefined();
          expect(body.displayName).toBe('b');
        });
    });

    it("should keep the bio and displayName user's details", () => {
      return request(app)
        .put(`/api/users/${anotherUserId}`)
        .set('Authorization', anotherJwtToken)
        .send({ ...anotherUser })
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.bio).toBe('a');
          expect(body.displayName).toBe('b');
        });
    });
  });

  describe('# GET /api/auth/random-number', () => {
    it('should fail to get random number because of missing Authorization', () => {
      return request(app)
        .get('/api/auth/random-number')
        .expect(httpStatus.UNAUTHORIZED);
    });

    it('should fail to get random number because of wrong token', () => {
      return request(app)
        .get('/api/auth/random-number')
        .set('Authorization', 'JWT inValidToken')
        .expect(httpStatus.UNAUTHORIZED);
    });

    it('should get a random number', () => {
      return request(app)
        .get('/api/auth/random-number')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(res => expect(typeof res.body.num).toBe('number'));
    });
  });

  describe('# GET /api/auth/get-token', () => {
    it('should get a JWT Token for requesting card id', () => {
      return request(app)
        .get('/api/auth/get-token')
        .expect(httpStatus.OK)
        .then(res => expect(typeof res.body.data).toBe('string'));
    });

    it('should get a JWT Token for requesting a shortCard id', () => {
      return request(app)
        .get('/api/auth/get-token?shortCard=true')
        .expect(httpStatus.OK)
        .then(res => expect(typeof res.body.data).toBe('string'));
    });
  });

  describe('Password reset', () => {
    it('# POST /api/auth/reset - should request a password reset via email', () => {
      return request(app)
        .post('/api/auth/reset')
        .send({ emailAddress: anotherUser.emailAddress })
        .expect(httpStatus.OK)
        .then(res => {
          expect(res.body.message).toBe('Password reset email sent.');
        });
    });

    describe('# POST /api/auth/reset/:token (page)', () => {
      it('should reset the user`s password', done => {
        User.findOne(
          { emailAddress: anotherUser.emailAddress },
          (err, existingUser) => {
            if (err) {
              return done(err);
            }

            Verification.findOne({ user: existingUser._id }, (err, verDoc) => {
              if (err) return done(err);
              if (!verDoc) return done('no verification token found');
              resetToken = verDoc.resetToken;
              request(app)
                .post(`/api/auth/reset/${verDoc.resetToken}`)
                .send({ password: 'americano', passwordagain: 'americano' })
                .expect(httpStatus.OK)
                .then(res => {
                  // expect(res.text).toContain('Your password has been updated');
                  expect(res.text).toContain('Ваш пароль оновлено');
                  anotherUser.password = 'americano';
                  done();
                })
                .catch(done);
            });
          }
        );
      });

      it('should NOT reset the user`s password', () => {
        return request(app)
          .post(`/api/auth/reset/${resetToken}`)
          .send({ password: 'americano', passwordagain: 'americano' })
          .expect(httpStatus.BAD_REQUEST)
          .then(res =>
            expect(res.text).toContain(
              'Виникла проблема при зміні паролю'
              // 'There was an issue resetting your password'
            )
          );
      });

      it('should NOT reset the user`s password with an invalid reset token', () => {
        return request(app)
          .post(`/api/auth/reset/12343375d1`)
          .send({ password: 'americano', passwordagain: 'americano' })
          .expect(httpStatus.BAD_REQUEST)
          .then(res =>
            expect(res.body.message).toBe(
              '"token" length must be 16 characters long'
            )
          );
      });
    });

    it('# POST /api/auth/login - should authenticate again', () => {
      return request(app)
        .post('/api/auth/login')
        .send({
          emailAddress: anotherUser.emailAddress,
          password: anotherUser.password,
        })
        .expect(httpStatus.OK)
        .then(res => expect(res.body).toHaveProperty('token'));
    });
  });
});
