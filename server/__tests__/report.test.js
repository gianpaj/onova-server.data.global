// @flow

import mongoose from 'mongoose';
import request from 'supertest';
import httpStatus from 'http-status';

import app from '../index';
import { createUserAndLogin, createProduct, beforeAllTests } from './utils';

const reportFields = ['createdAt', '_id', 'text', 'reporter'];

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

describe('## Report methods', () => {
  beforeAll(beforeAllTests);

  let firstPerson = {
    username: 'firstperson',
    emailAddress: 'gianpa+test@gmail.com',
    password: 'expressos',
  };

  const product = {
    categoryIds: [2],
    typeIds: [3],
    description: 'nice boots',
    price: '1100.99',
    photos: [
      'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
    ],
  };

  let users = [
    {
      username: 'user1',
      emailAddress: 'gianpa+user1@gmail.com',
      password: 'express2',
    },
    {
      username: 'user2',
      emailAddress: 'gianpa+user2@gmail.com',
      password: 'express2',
    },
    {
      username: 'user3',
      emailAddress: 'gianpa+user3@gmail.com',
      password: 'express2',
    },
    {
      username: 'user4',
      emailAddress: 'gianpa+user4@gmail.com',
      password: 'express2',
    },
    {
      username: 'user5',
      emailAddress: 'gianpa+user5@gmail.com',
      password: 'express2',
    },
  ];

  let nonActiveUser = {
    username: 'thirdperson',
    emailAddress: 'gianpa+test3@gmail.com',
    password: 'expressos',
  };

  // create 6 users + 1 non verified
  beforeAll(async () => {
    for (let i = 0; i < users.length; i++) {
      const { user, jwtToken } = await createUserAndLogin(users[i]);
      users[i]._id = user._id;
      users[i].jwtToken = jwtToken;
    }

    const { user, jwtToken } = await createUserAndLogin(firstPerson);
    firstPerson._id = user._id;
    firstPerson.jwtToken = jwtToken;

    const p1 = await createProduct(product, jwtToken);
    const product2 = { ...product };
    product.uuid = p1.uuid;
    const p2 = await createProduct(product2, users[0].jwtToken);
    users[0].uuid = p2.uuid;

    await request(app)
      .post('/api/users')
      .send(nonActiveUser)
      .expect(httpStatus.CREATED)
      .then(({ body }) => {
        expect(body.data.username).toBe(nonActiveUser.username);
        expect(body.data.accountStatus).toBe('notverified');
        expect(body.token).toHaveLength(436);
        nonActiveUser.jwtToken = body.token;
      });
  });

  it('should NOT report a user if am not verified', () => {
    return request(app)
      .post('/api/report')
      .set('Authorization', nonActiveUser.jwtToken)
      .send({ user: users[0]._id, text: 'they are a bad user' })
      .expect(httpStatus.BAD_REQUEST)
      .then(({ body }) =>
        expect(body.message).toBe(
          'Please verify your account before making a report'
        )
      );
  });

  it('should report a user', () => {
    return request(app)
      .post('/api/report')
      .set('Authorization', firstPerson.jwtToken)
      .send({ user: users[0]._id, text: 'they are a bad user' })
      .expect(httpStatus.CREATED)
      .then(({ body }) => {
        expect(body.data.text).toBe('they are a bad user');
        expect(Object.keys(body.data).sort()).toEqual(
          [...reportFields, 'user'].sort()
        );
      });
  });

  it('should NOT report the same user again', () => {
    return request(app)
      .post('/api/report')
      .set('Authorization', firstPerson.jwtToken)
      .send({ user: users[0]._id, text: 'they are a bad user' })
      .expect(httpStatus.BAD_REQUEST)
      .then(({ body }) => expect(body.message).toBe('Duplicate report'));
  });

  it('should NOT report myself', () => {
    return request(app)
      .post('/api/report')
      .set('Authorization', firstPerson.jwtToken)
      .send({ user: firstPerson._id, text: 'i am bad boy' })
      .expect(httpStatus.BAD_REQUEST)
      .then(({ body }) => expect(body.message).toBe('Cannot report yourself'));
  });

  it('should report a user OR a product', () => {
    return request(app)
      .post('/api/report')
      .set('Authorization', firstPerson.jwtToken)
      .send({ text: 'everything is terrible' })
      .expect(httpStatus.BAD_REQUEST)
      .then(({ body }) => {
        expect(body.message).toBe('Report a user or product');
      });
  });

  it('should report a product', () => {
    return request(app)
      .post('/api/report')
      .set('Authorization', firstPerson.jwtToken)
      .send({ product: users[0].uuid, text: 'bad product' })
      .expect(httpStatus.CREATED)
      .then(({ body }) => {
        expect(body.data.text).toBe('bad product');
        expect(Object.keys(body.data).sort()).toEqual(
          [...reportFields, 'product'].sort()
        );
      });
  });

  it('should NOT report my product', () => {
    return request(app)
      .post('/api/report')
      .set('Authorization', firstPerson.jwtToken)
      .send({ product: product.uuid, text: 'bad product' })
      .expect(httpStatus.BAD_REQUEST)
      .then(({ body }) => {
        expect(body.message).toBe('Cannot report your product');
      });
  });
});
