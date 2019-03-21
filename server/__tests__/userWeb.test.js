// @flow

import mongoose from 'mongoose';
import request from 'supertest';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';

import app from '../index';
import { beforeAllTests } from './utils';
import config from '../config/config';

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
    describe('# POST & GET /api/users-web', () => {
      let user1Id;
      it('should create a new web user', done => {
        request(app)
          .post('/api/users-web')
          .expect(httpStatus.CREATED)
          .then(res => {
            let { data, token } = res.body;
            expect(typeof data._id).toBe('string');
            expect(data._id).toHaveLength(24);
            expect(typeof token).toBe('string');
            expect(token).toContain('JWT ');
            expect(Object.keys(data).sort()).toMatchSnapshot();
            user1Id = data._id;
            user1token = token;
            token = token.split('JWT ')[1];
            jwt.verify(token, config.jwtSecret, (err, decoded) => {
              expect(err).toBeFalsy();
              expect(decoded.type).toBe('web');
              done();
            });
          });
      });

      it('should get a user info with valid JWT token', () => {
        return request(app)
          .get(`/api/users-web/${user1Id}`)
          .set('Authorization', user1token)
          .expect(httpStatus.OK)
          .then(({ body }) => {
            expect(typeof body._id).toBe('string');
            expect(body._id).toHaveLength(24);
            expect(Object.keys(body).sort()).toMatchSnapshot();
          });
      });

      it('should NOT get a user info with valid JWT token', () => {
        return request(app)
          .get('/api/users-web/5c935290d006f476bacd072f')
          .set('Authorization', user1token)
          .expect(httpStatus.NOT_FOUND)
          .then(({ body }) => expect(body.message).toBe('No UserWeb found'));
      });

      it.skip('should get my user info with valid JWT token', () => {
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

      it.skip('should get my user info with valid an expired token', done => {
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
