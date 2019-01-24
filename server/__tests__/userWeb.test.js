// @flow

import mongoose from 'mongoose';
import request from 'supertest';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';

import app from '../index';
import { UserWebDoc } from '../models';
import { beforeAllTests } from './utils';

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

describe('## UserWeb APIs', () => {
  beforeAll(beforeAllTests);

  // $FlowFixMe
  let user: UserWebDoc = {
    username: 'firstperson',
    emailAddress: 'gianpa+test@gmail.com',
    mobileNumber: validPhoneNumber, // optional
  };

  let userId1, user1token;

  describe('# Create user', () => {
    describe('# POST /api/users-web', () => {
      it('should create a new web user', () => {
        return request(app)
          .post('/api/users-web')
          .send(user)
          .expect(httpStatus.CREATED)
          .then(res => {
            const { data, token } = res.body;
            console.log(res.body);
            expect(typeof data._id).toBe('string');
            expect(data._id).toHaveLength(24);
            expect(typeof token).toBe('string');
            expect(token).toContain('JWT ');
            expect(Object.keys(data).sort()).toMatchSnapshot();

            userId1 = data._id;
            user1token = token;
          });
      });
    });
  });
});
