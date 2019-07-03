// @flow

import mongoose from 'mongoose';
import request from 'supertest';
import httpStatus from 'http-status';

import app from '../index';
import { beforeAllTests, createUserAndLogin, createProduct, createOrder, followUser } from './utils';
import { UserDoc, ProductDoc } from '../models';

const blockFields = ['createdAt', '_id', 'sourceUser', 'targetUser'];

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

describe('## Block methods', () => {
  beforeAll(beforeAllTests);

  // $FlowFixMe
  let firstUser: UserDoc = {
    username: 'firstUser',
    emailAddress: 'gianpa+test@gmail.com',
    password: 'expressos',
  };

  // $FlowFixMe
  const product: ProductDoc = {
    categoryIds: [2],
    typeIds: [3],
    description: 'nice boots',
    price: '1100.99',
    photos: ['https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg'],
  };

  // $FlowFixMe
  let users: Array<UserDoc> = [
    {
      username: 'user0',
      emailAddress: 'gianpa+user0@gmail.com',
      password: 'express2',
    },
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
  ];

  // create 4 users
  // create 4 products
  beforeAll(async () => {
    try {
      for (let i = 0; i < users.length; i++) {
        const { user, jwtToken } = await createUserAndLogin(users[i]);
        users[i]._id = user._id;
        users[i].jwtToken = jwtToken;
      }

      const { user, jwtToken } = await createUserAndLogin(firstUser);
      firstUser._id = user._id;
      firstUser.jwtToken = jwtToken;
      firstUser.following = 0;

      // firstUser posts an item
      const p1 = await createProduct(product, jwtToken);
      firstUser.productUuid = p1.uuid;

      // user[0] posts an item
      const p2 = await createProduct(product, users[0].jwtToken);
      users[0].productUuid = p2.uuid;
      users[0].followers = 0;

      // user[1] creates 2 x products
      const p3 = await createProduct(product, users[1].jwtToken);
      users[1].productUuid = p3.uuid;
      users[1].followers = 0;
      const p4 = await createProduct(product, users[1].jwtToken);

      // firstUser -- follows --> user 0
      await followUser(firstUser.jwtToken, users[0]._id);
      firstUser.following++;
      users[0].followers++;

      // firstUser -- follows --> user 1
      await followUser(firstUser.jwtToken, users[1]._id);
      firstUser.following++;
      users[1].followers++;

      // user 0 -- follows --> firstUser
      await followUser(users[0].jwtToken, firstUser._id);
      users[0].following++;
      firstUser.followers++;

      // user 0 -- follows --> user 1
      await followUser(users[0].jwtToken, users[1]._id);
      users[1].following++;
      firstUser.followers++;

      // firstUser -- orders --> product from user 0
      // $FlowFixMe
      const o = await createOrder({ ...product, uuid: p2.uuid }, firstUser.jwtToken);
      await request(app)
        .put(`/api/orders/${o.id}`)
        .set('Authorization', firstUser.jwtToken)
        .send({ status: 'cancelled', reason: 'it`s already sold' })
        .expect(httpStatus.OK);
      // firstUser -- orders --> product from user 1
      // $FlowFixMe
      const o2 = await createOrder({ ...product, uuid: p3.uuid }, firstUser.jwtToken);
      await request(app)
        .put(`/api/orders/${o2.id}`)
        .set('Authorization', firstUser.jwtToken)
        .send({ status: 'cancelled', reason: 'it`s already sold' })
        .expect(httpStatus.OK);
      // user 0 -- orders --> product from user 1
      // $FlowFixMe
      const o3 = await createOrder({ ...product, uuid: p4.uuid }, users[0].jwtToken);
      await request(app)
        .put(`/api/orders/${o3.id}`)
        .set('Authorization', users[0].jwtToken)
        .send({ status: 'cancelled', reason: 'it`s already sold' })
        .expect(httpStatus.OK);
    } catch (error) {
      console.error(error);
    }
  });

  // firstUser -- blocks -> user[0]
  it('should block a user', () => {
    return request(app)
      .post('/api/block')
      .set('Authorization', firstUser.jwtToken)
      .send({ targetUser: users[0]._id })
      .expect(httpStatus.CREATED)
      .then(({ body }) => {
        firstUser.following--;
        users[0].followers--;
        expect(body.data.targetUser).toBe(users[0]._id);
        expect(Object.keys(body.data).sort()).toEqual(blockFields.sort());
      });
  });

  it('should NOT block a user again', () => {
    return request(app)
      .post('/api/block')
      .set('Authorization', firstUser.jwtToken)
      .send({ targetUser: users[0]._id })
      .expect(httpStatus.BAD_REQUEST)
      .then(({ body }) => expect(body.message).toBe('Duplicate block'));
  });

  it('should NOT unfollow a blocked user', () => {
    return request(app)
      .post(`/api/users/${firstUser._id.toString()}/unfollow`)
      .set('Authorization', users[0].jwtToken)
      .expect(httpStatus.BAD_REQUEST)
      .then(({ body }) => expect(body.message).toBe('Error unfollowing a user'));
  });

  it('should NOT follow a blocked user', () => {
    return request(app)
      .post(`/api/users/${firstUser._id.toString()}/follow`)
      .set('Authorization', users[0].jwtToken)
      .expect(httpStatus.BAD_REQUEST)
      .then(({ body }) => {
        expect(body.message).toBe('Error following a user');
      });
  });

  it('should NOT block myself', () => {
    return request(app)
      .post('/api/block')
      .set('Authorization', firstUser.jwtToken)
      .send({ targetUser: firstUser._id })
      .expect(httpStatus.BAD_REQUEST)
      .then(({ body }) => expect(body.message).toBe('Cannot block yourself'));
  });

  it('should NOT block an missing user', () => {
    return request(app)
      .post('/api/block')
      .set('Authorization', firstUser.jwtToken)
      .send({ targetUser: '5afc66be741c953ef07a618a' })
      .expect(httpStatus.NOT_FOUND)
      .then(({ body }) => expect(body.message).toBe('User not found'));
  });

  it('should get the firstUser`s feed without the user 0`s item', () => {
    return request(app)
      .get('/api/feed/flat')
      .set('Authorization', firstUser.jwtToken)
      .expect(httpStatus.OK)
      .then(({ body }) => {
        expect(body.data).toHaveLength(3);
        expect(body.data[0].seller._id).toBe(users[1]._id);
        expect(body.data[1].seller._id).toBe(users[1]._id);
        expect(body.data[2].seller._id).toBe(firstUser._id);
      });
  });

  it('should get the user 0`s feed without the firstUser`s item', () => {
    return request(app)
      .get('/api/feed/flat')
      .set('Authorization', users[0].jwtToken)
      .expect(httpStatus.OK)
      .then(({ body }) => {
        expect(body.data).toHaveLength(3);
        expect(body.data[0].seller._id).toBe(users[1]._id);
        expect(body.data[1].seller._id).toBe(users[1]._id);
        expect(body.data[2].seller._id).toBe(users[0]._id);
      });
  });

  it('should search products without the firstUser`s item', () => {
    return request(app)
      .get('/api/search?typeIds=3')
      .set('Authorization', users[0].jwtToken)
      .expect(httpStatus.OK)
      .then(({ body }) => {
        expect(body.data[0].seller._id).toBe(users[1]._id);
        expect(body.data[1].seller._id).toBe(users[1]._id);
        expect(body.data[2].seller._id).toBe(users[0]._id);
        expect(body.data).toHaveLength(3);
      });
  });

  it('should search products without the user 0`s item', () => {
    return request(app)
      .get('/api/search?typeIds=3')
      .set('Authorization', firstUser.jwtToken)
      .expect(httpStatus.OK)
      .then(({ body }) => {
        expect(body.data[0].seller._id).toBe(users[1]._id);
        expect(body.data[1].seller._id).toBe(users[1]._id);
        expect(body.data[2].seller._id).toBe(firstUser._id);
        expect(body.data).toHaveLength(3);
      });
  });

  it("should NOT get user 0's products items", () => {
    return request(app)
      .get(`/api/products?userid=${users[0]._id.toString()}`)
      .set('Authorization', firstUser.jwtToken)
      .expect(httpStatus.OK)
      .then(({ body }) => expect(body.data).toHaveLength(0));
  });

  it('should get who is firstUser following except user 0', () => {
    return request(app)
      .get(`/api/users/${firstUser._id.toString()}/following`)
      .set('Authorization', firstUser.jwtToken)
      .expect(httpStatus.OK)
      .then(({ body }) => {
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data).toHaveLength(firstUser.following);
        expect(body.data[0].username).toBe('user1');
      });
  });

  it('should get who is user 0 following except firstUser', () => {
    return request(app)
      .get(`/api/users/${users[0]._id.toString()}/following`)
      .set('Authorization', users[0].jwtToken)
      .expect(httpStatus.OK)
      .then(({ body }) => {
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data[0].username).toBe('user1');
      });
  });

  it('should get the followers of user 0 except firstUser', () => {
    return request(app)
      .get(`/api/users/${users[0]._id.toString()}/followers`)
      .set('Authorization', users[0].jwtToken)
      .expect(httpStatus.OK)
      .then(({ body }) => {
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data).toHaveLength(users[0].followers);
      });
  });

  it('should get firstUser`s orders except user 0', () => {
    return request(app)
      .get('/api/orders')
      .set('Authorization', firstUser.jwtToken)
      .expect(httpStatus.OK)
      .then(({ body }) => {
        expect(body.data[0].seller.username).toBe('user1');
        expect(body.data).toHaveLength(1);
      });
  });

  it('should get user 0`s orders except firstUser', () => {
    return request(app)
      .get('/api/orders')
      .set('Authorization', users[0].jwtToken)
      .expect(httpStatus.OK)
      .then(({ body }) => {
        expect(body.data[0].seller.username).toBe('user1');
        expect(body.data).toHaveLength(1);
      });
  });

  it('should NOT allowed to create an order when blocking the buyer', () => {
    return request(app)
      .post('/api/orders')
      .set('Authorization', users[0].jwtToken)
      .send({ product: firstUser.productUuid })
      .expect(httpStatus.BAD_REQUEST)
      .then(({ body }) => expect(body.message).toBe('This product is not longer for sale or is reserved.'));
  });

  it.skip('should NOT allowed to create an order when blocking the seller', () => {
    return request(app)
      .post('/api/orders')
      .set('Authorization', firstUser.jwtToken)
      .send({ product: users[0].productUuid })
      .expect(httpStatus.BAD_REQUEST)
      .then(({ body }) => expect(body.message).toBe('This product is not longer for sale or is reserved.'));
  });
});
