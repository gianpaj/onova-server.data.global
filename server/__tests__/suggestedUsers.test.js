// @flow

import mongoose from 'mongoose';
import request from 'supertest';
import httpStatus from 'http-status';
import path from 'path';

import { SuggestedUsers } from '../models';

import app from '../index';
import { beforeAllTests, createUserAndLogin, followUser } from './utils';

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

/* TODO: flow - :: extends UserDoc */
type User = {
  _id: MongoId,
  token: string,
};

let users: Array<User> = [
  {
    username: 'user0',
    emailAddress: 'gianpa+test0@gmail.com',
    password: 'expressos',
  },
  {
    username: 'user1',
    emailAddress: 'gianpa+test1@gmail.com',
    password: 'express2',
  },
  {
    username: 'user2',
    emailAddress: 'gianpa+test2@gmail.com',
    password: 'express3',
  },
  {
    username: 'user3',
    emailAddress: 'gianpa+test3@gmail.com',
    password: 'express4',
  },
];

let user4;

describe('## Suggested Users APIs', () => {
  beforeAll(beforeAllTests);

  // let users: Array<{ _id: MongoId, token: string }>;

  // create 4 users (one not verified) and follow
  beforeAll(async () => {
    const usersAndTokens = await Promise.all(users.map(createUserAndLogin));
    users = usersAndTokens.map(user => ({
      ...user.user,
      token: user.jwtToken,
    }));

    const { body } = await request(app)
      .post('/api/users')
      .send({
        username: 'user4',
        emailAddress: 'gianpa+test4@gmail.com',
        password: 'express5',
      })
      .expect(httpStatus.CREATED);
    user4 = body.data;

    await Promise.all([
      request(app)
        .put(`/api/users/${users[2]._id}`)
        .set('Authorization', users[2].token)
        .attach('profilePic', path.join(__dirname, 'images/profilepic.jpg'))
        .expect(httpStatus.OK),
      followUser(users[0].token, users[1]._id),
      followUser(users[0].token, users[3]._id),
      // followUser(users[1].token, users[0]._id),
      followUser(users[1].token, users[2]._id),
      followUser(users[1].token, users[3]._id),
      followUser(users[1].token, user4._id),
      followUser(users[2].token, users[3]._id),
    ]);

    /**
     * | from  |            | target |
     * | ----- | ---------- | ------ |
     * | user0 | follows -> | user1  |
     * | user0 | follows -> | user3  |
     * | user1 | follows -> | user2  |
     * | user1 | follows -> | user3  |
     * | user1 | follows -> | user4  |
     * | user2 | follows -> | user3  |
     */
  });

  it('should return an empty list of suggested sellers', () => {
    return request(app)
      .get('/api/suggested-users/')
      .set('Authorization', users[2].token)
      .expect(httpStatus.OK)
      .then(({ body }) => {
        expect(body.data).toHaveLength(0);
        expect(body.new).toBe(true);
      });
  });

  it('should save and return an empty list of suggested sellers', async () => {
    await request(app)
      .get('/api/suggested-users/')
      .set('Authorization', users[3].token)
      .expect(httpStatus.OK)
      .then(({ body }) => {
        expect(body.data).toHaveLength(0);
        expect(body.new).toBe(true);
      });
    await request(app)
      .get('/api/suggested-users/')
      .set('Authorization', users[3].token)
      .expect(httpStatus.OK)
      .then(({ body }) => {
        expect(body.data).toHaveLength(0);
        expect(body.new).toBe(false);
      });
  });

  it('should return a list of suggested sellers', () => {
    return request(app)
      .get('/api/suggested-users/')
      .set('Authorization', users[0].token)
      .expect(httpStatus.OK)
      .then(({ body }) => {
        expect(body.data).toHaveLength(1);
        const [firstSuggestion] = body.data;
        expect(firstSuggestion._id.username).toBe('user2');
        expect(Object.keys(firstSuggestion._id).sort()).toEqual(['_id', 'amIAFollower', 'profilePic', 'username']);
        expect(firstSuggestion.numOfConns).toBe(1);
        expect(body.new).toBe(true);
      });
  });

  it('should return a cached list of suggested sellers', () => {
    return request(app)
      .get('/api/suggested-users/')
      .set('Authorization', users[0].token)
      .expect(httpStatus.OK)
      .then(({ body }) => {
        expect(Object.keys(body.data[0]._id).sort()).toEqual(['_id', 'amIAFollower', 'profilePic', 'username']);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].numOfConns).toBe(1);
        expect(body.new).toBe(false);
      });
  });

  it('should return a fresh list of suggested users without the previously discarded', async () => {
    try {
      // fake Suggested users have been deleted by TTL collection expiring
      const deletedSuggested = await SuggestedUsers.deleteOne({
        user: users[0]._id,
      });
      expect(deletedSuggested.n).toBe(1);
      const res = await request(app)
        .get('/api/suggested-users/')
        .set('Authorization', users[0].token)
        .expect(httpStatus.OK);

      expect(res.body.new).toBe(true);
      expect(res.body.data).toHaveLength(0);
    } catch (error) {
      console.error(error);
    }
  });
});
