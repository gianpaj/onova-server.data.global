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

describe('## UserWeb APIs', () => {
  beforeAll(beforeAllTests);

  let user1token;

  describe('# Create Web user', () => {
    describe('# POST /api/users-web', () => {
      it('should create a new web user', () => {
        return request(app)
          .post('/api/users-web')
          .expect(httpStatus.CREATED)
          .then(res => {
            const { data, token } = res.body;
            expect(typeof data._id).toBe('string');
            expect(data._id).toHaveLength(24);
            expect(typeof token).toBe('string');
            expect(token).toContain('JWT ');
            expect(Object.keys(data).sort()).toMatchSnapshot();

            user1token = token;
          });
      });

      it('should get my user info with valid JWT token', () => {
        return request(app)
          .get('/api/users-web/me')
          .set('Authorization', user1token)
          .expect(httpStatus.OK)
          .then(({ body }) => {
            expect(typeof body.data._id).toBe('string');
            expect(body.data._id).toHaveLength(24);
            expect(Object.keys(body.data).sort()).toMatchSnapshot();
          });
      });

      it('should get my user info with valid an expired token', done => {
        setTimeout(() => {
          request(app)
            .get('/api/users-web/me')
            .set('Authorization', user1token)
            .expect(httpStatus.UNAUTHORIZED)
            .then(({ body }) => {
              expect(body.message).toBe('jwt expired');
              done();
            });
        }, 2500);
      });
    });
  });
});
