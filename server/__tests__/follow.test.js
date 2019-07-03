// @flow

import mongoose from 'mongoose';
import request from 'supertest';
import httpStatus from 'http-status';

import app from '../index';
import { User } from '../models';
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

describe('## Follow APIs', () => {
  beforeAll(beforeAllTests);

  let user = {
    username: 'firstperson',
    emailAddress: 'gianpa+test@gmail.com',
    password: 'expressos',
    pushToken: 'firstpersonsPushToken',
    platform: 'ios',
  };

  let anotherUser = {
    username: 'anotherperson',
    emailAddress: 'gianpa+test2@gmail.com',
    password: 'express2',
    pushToken: 'anotherPushToken',
    platform: 'ios',
  };

  let thirdUser = {
    username: 'thirdwheel',
    emailAddress: 'gianpa+thirdwheel@gmail.com',
    password: 'express3',
    pushToken: 'thirdPushToken',
    platform: 'android',
  };

  let forthUser = {
    username: 'forthwheel',
    emailAddress: 'gianpa+forth@gmail.com',
    password: 'express3',
    pushToken: 'forthPushToken',
    platform: 'android',
  };

  let userId;
  let anotherUserId;
  let thirdUserId;
  let forthUserId;
  let thirdJwtToken;
  let firstJwtToken;
  let anotherJwtToken;
  // let forthUserIdJwtToken;
  let firstUserFollowersCounter = 0;
  let firstUserFollowingCounter = 0;

  // create 2 users/sellers
  beforeAll(async () => {
    await createUserAndLogin(user).then(({ user, jwtToken }) => {
      userId = user._id.toString();
      firstJwtToken = jwtToken;
    });
    await createUserAndLogin(anotherUser).then(({ user, jwtToken }) => {
      anotherUserId = user._id.toString();
      anotherJwtToken = jwtToken;
    });
    await createUserAndLogin(forthUser).then(({ user, jwtToken }) => {
      forthUserId = user._id.toString();
      // forthUserIdJwtToken = jwtToken;
    });
    return await createUserAndLogin(thirdUser).then(({ user, jwtToken }) => {
      thirdUserId = user._id.toString();
      thirdJwtToken = jwtToken;
    });
  });

  describe('# POST /api/users/:userId/follow', () => {
    it('should follow another user', () => {
      return request(app)
        .post(`/api/users/${anotherUserId}/follow`)
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          expect(body.data.follower).toBe(userId);
          expect(body.data.following).toBe(anotherUserId);
          expect(Object.keys(body.data).sort()).toMatchSnapshot();
          firstUserFollowingCounter++;
        });
    });

    it('should not follow the same user more than once', () => {
      return request(app)
        .post(`/api/users/${anotherUserId}/follow`)
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.BAD_REQUEST)
        .then(res => expect(res.body.message).toContain('Duplicate follower<->following'));
    });

    describe('check followers/following counters', () => {
      beforeAll(() => {
        return request(app)
          .post(`/api/users/${thirdUserId}/follow`)
          .set('Authorization', firstJwtToken)
          .expect(httpStatus.CREATED)
          .then(res => {
            expect(res.body.data.follower).toBe(userId);
            firstUserFollowingCounter++;
          });
      });

      it('should increase the followers count of the target user', () => {
        return request(app)
          .get(`/api/users/${userId}`)
          .expect(httpStatus.OK)
          .then(({ body }) => {
            expect(body.username).toBe(user.username);
            expect(body.emailAddress).toBe(user.emailAddress);
            expect(body.followersCount).toBe(firstUserFollowersCounter);
            expect(body.followingCount).toBe(firstUserFollowingCounter);
          });
      });

      it('should increase the followers count of the subject user', () => {
        return request(app)
          .get(`/api/users/${thirdUserId}`)
          .expect(httpStatus.OK)
          .then(({ body }) => {
            expect(body.username).toBe(thirdUser.username);
            expect(body.emailAddress).toBe(thirdUser.emailAddress);
            expect(body.followersCount).toBe(1);
            expect(body.followingCount).toBe(0);
          });
      });
    });

    it('should not follow an invalid user', () => {
      return request(app)
        .post('/api/users/1123123/follow')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.BAD_REQUEST)
        .then(res => expect(res.body.message).toContain('must be 24 characters long'));
    });

    it('should not follow a user it doesn`t exist', () => {
      return request(app)
        .post('/api/users/5aaaac09336c6735ff0346f9/follow')
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.BAD_REQUEST)
        .then(res => expect(res.body.message).toContain('Error following a user'));
    });

    it('should not follow itself', () => {
      return request(app)
        .post(`/api/users/${anotherUserId}/follow`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.BAD_REQUEST)
        .then(res => expect(res.body.message).toBe('Cannot follow thyself'));
    });

    it('should follow back', () => {
      return request(app)
        .post(`/api/users/${userId}/follow`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          expect(body.data.follower).toBe(anotherUserId);
          expect(body.data.following).toBe(userId);
          expect(body.data).toHaveProperty('dateCreated');
          firstUserFollowersCounter++;
        });
    });
  });

  describe('# POST /api/users/:userId/unfollow', () => {
    it('should unfollow another user', () => {
      return request(app)
        .post(`/api/users/${anotherUserId}/unfollow`)
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data.follower).toBe(userId);
          expect(body.data.following).toBe(anotherUserId);
          expect(Object.keys(body.data).sort()).toMatchSnapshot();
          firstUserFollowingCounter--;
        });
    });

    it('should not unfollow an invalid user', () => {
      return request(app)
        .post('/api/users/2123412d/unfollow')
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.BAD_REQUEST)
        .then(res => expect(res.body.message).toContain('must be 24 characters long'));
    });

    it('should not unfollow a user that doesn`t exist', () => {
      return request(app)
        .post('/api/users/5aaaac09336c6735ff0346f9/unfollow')
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.BAD_REQUEST)
        .then(res => expect(res.body.message).toBe('Error unfollowing a user'));
    });

    it('should not unfollow itself', () => {
      return request(app)
        .post(`/api/users/${anotherUserId}/unfollow`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.BAD_REQUEST)
        .then(res => expect(res.body.message).toBe('Cannot unfollow thyself'));
    });
  });

  describe('# GET /api/users/:userId/followers', () => {
    // ThirdU -- follows --> User
    beforeAll(() => followUser(thirdJwtToken, anotherUserId));

    it('should get all the followers of user and if amIAFollower', () => {
      return request(app)
        .get(`/api/users/${userId}/followers`)
        .set('Authorization', thirdJwtToken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(Array.isArray(body.data)).toBe(true);
          expect(body.data.length).toBe(firstUserFollowersCounter);
          expect(body.data[0].amIAFollower).toBe(true);
          expect(Object.keys(body.data[0]).sort()).toMatchSnapshot();
        });
    });
  });

  describe('# GET /api/users/:userId/following', () => {
    // AnotherUser -- follows --> ThirdUser
    // firstUser -- follows --> forthUser (and delete user from DB; not setting `accountStatus` as 'deleted')
    beforeAll(async () => {
      await followUser(firstJwtToken, forthUserId);
      firstUserFollowingCounter++;
      // wait until the push notification has been sent.
      // that's send asynchronously and /follow endpoint returns before the createNotification() returns
      setTimeout(() => {
        User.deleteOne({ _id: forthUserId });
        firstUserFollowingCounter--;
      }, 100);

      return followUser(anotherJwtToken, thirdUserId);
    });

    it('should get a list of who the user is following and if amIAFollower', () => {
      return request(app)
        .get(`/api/users/${userId}/following`)
        .set('Authorization', anotherJwtToken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(Array.isArray(body.data)).toBe(true);
          expect(body.data.length).toBe(firstUserFollowingCounter);
          expect(body.data[0].amIAFollower).toBe(true);
          expect(Object.keys(body.data[0]).sort()).toMatchSnapshot();
        });
    });
  });

  describe('# GET /api/users/:userId/follow', () => {
    beforeAll(() => followUser(firstJwtToken, anotherUserId));

    it('should get that i am following a user', () => {
      return request(app)
        .get(`/api/users/${anotherUserId}/follow`)
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data.follower).toBe(userId);
          expect(body.data.following).toBe(anotherUserId);
          expect(Object.keys(body.data).sort()).toMatchSnapshot();
        });
    });

    it('should get that i am not following a user', () => {
      return request(app)
        .get(`/api/users/5aaaac09336c6735ff0346f9/follow`)
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.NOT_FOUND)
        .then(res => expect(res.body.message).toContain('Not following'));
    });

    it('should not able to check if your`re following yourself', () => {
      return request(app)
        .get(`/api/users/${userId}/follow`)
        .set('Authorization', firstJwtToken)
        .expect(httpStatus.BAD_REQUEST)
        .then(res => expect(res.body.message).toContain('Cannot follow thyself'));
    });
  });
});
