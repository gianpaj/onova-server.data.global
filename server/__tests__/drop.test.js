// @flow

import mongoose from 'mongoose';
import request from 'supertest';
import shortid from 'shortid';
import httpStatus from 'http-status';
import addDays from 'date-fns/add_days';

import { User, Drop, Product, Notification, DropDoc } from '../models';

import config from '../config/config';
import app from '../index';
import {
  beforeAllTests,
  clearJobs,
  createUserAndLogin,
  findJobs,
  followUser,
} from './utils';
import { i18n } from '../controllers/drop.controller';

// if server.push is NOT running
const schedulerIsRunning = process.env.SCHEDULER_IS_RUNNING !== 'true';

if (!schedulerIsRunning) {
  console.warn('skipping tests with scheduler (server.push)');
}

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
type UserTestDoc = {
  _id: MongoId,
  token: string,
};

let users: Array<UserTestDoc> = [
  {
    username: 'user0',
    emailAddress: 'gianpa+test0@gmail.com',
    password: 'express0',
  },
  {
    username: 'user1',
    emailAddress: 'gianpa+test1@gmail.com',
    password: 'express1',
  },
  {
    username: 'user2',
    emailAddress: 'gianpa+test2@gmail.com',
    password: 'express2',
  },
  {
    username: 'user3',
    emailAddress: 'gianpa+test3@gmail.com',
    password: 'express3',
  },
];

const nonActiveUser = {
  username: 'thirdperson',
  emailAddress: 'gianpa+nonactive@gmail.com',
  password: 'expressos',
};

let nonActiveUserJwtToken;

const admin = {
  username: 'gianpaj',
  emailAddress: 'gianpa@gmail.com',
  password: 'expressos',
};

let adminJwtToken;

const product = {
  categoryIds: [1, 2, 3],
  typeIds: [1, 2, 3],
  tags: ['winter', 'spring2007'], // optional
  description: 'nice boots',
  price: '1100.99',
  photos: [
    'https://storage.googleapis.com/temp-uploads.onova.co/tmp/1545329733068.jpg',
    'https://storage.googleapis.com/temp-uploads.onova.co/tmp/1545329733069.jpg',
  ],
};

describe('## Drops feed APIs', () => {
  beforeAll(beforeAllTests);

  // create 4 users + a non-active user
  beforeAll(async () => {
    await clearJobs();

    const usersAndTokens = await Promise.all(users.map(createUserAndLogin));
    users = usersAndTokens.map(user => ({
      ...user.user,
      token: user.jwtToken,
    }));

    await Promise.all([
      request(app)
        .put(`/api/users/${users[2]._id}`)
        .set('Authorization', users[2].token)
        .send({ shippingAddress: {} })
        .expect(httpStatus.OK),
      request(app)
        .post('/api/users')
        .send(nonActiveUser)
        .expect(httpStatus.CREATED)
        .then(({ body }) => (nonActiveUserJwtToken = body.token)),
      request(app)
        .post('/api/users')
        .send(admin)
        .expect(httpStatus.CREATED)
        .then(({ body }) => (adminJwtToken = body.token)),
      User.updateOne({ _id: users[3]._id }, { $unset: { paymentInfo: '' } }),
    ]);

    /**
     * | from  |            | target |
     * | ----- | ---------- | ------ |
     * | user0 | follows -> | user1  |
     * | user1 | follows -> | user0  |
     */
    await Promise.all([
      followUser(users[0].token, users[1]._id),
      followUser(users[1].token, users[0]._id),
    ]);
  });

  describe('# GET /api/v2/drops/:uuid', () => {
    let drops;
    beforeAll(async () => {
      await Drop.deleteMany({});
      drops = await createManyDrops(2, users[0].token);
    });

    it('should get one drop', () => {
      return request(app)
        .get(`/api/v2/drops/${drops[0].uuid}`)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(Object.keys(body.data).sort()).toMatchSnapshot();
          expect(Object.keys(body.data.seller).sort()).toMatchSnapshot();
          expect(shortid.isValid(body.data.uuid)).toBe(true);
          expect(body.data.posted).toBe(false);
          expect(body.data.products).toHaveLength(1);
          expect(Object.keys(body.data.products[0]).sort()).toEqual([
            '_id',
            'photoURIs',
          ]);
        });
    });

    it('should get NOT non-existant drop', () => {
      return request(app)
        .get('/api/v2/drops/IDONTEXIST')
        .expect(httpStatus.NOT_FOUND)
        .then(({ body }) => {
          expect(body.message).toBe('Drop not found');
        });
    });
  });

  describe('# GET /api/v2/drops/:uuid', () => {
    let drops;
    beforeAll(async () => {
      await Drop.deleteMany({});
      drops = await createManyDrops(1, users[0].token);
    });

    it('should NOT delete an invalid drop', () => {
      return request(app)
        .delete('/api/v2/drops/SkXbwQxyQ')
        .set('Authorization', adminJwtToken)
        .expect(httpStatus.NOT_FOUND)
        .then(({ body }) => expect(body.message).toBe('Drop not found'));
    });

    it('should NOT delete one drop (if not an admin)', () => {
      return request(app)
        .delete(`/api/v2/drops/${drops[0].uuid}`)
        .set('Authorization', users[0].token)
        .expect(httpStatus.UNAUTHORIZED)
        .then(({ body }) => expect(body).toMatchObject({}));
    });

    it('should delete one drop (admin only)', () => {
      return request(app)
        .delete(`/api/v2/drops/${drops[0].uuid}`)
        .set('Authorization', adminJwtToken)
        .expect(httpStatus.NO_CONTENT)
        .then(({ body }) => expect(body).toMatchObject({}));
    });
  });

  describe('# POST /api/v2/drops', () => {
    beforeEach(() =>
      Promise.all([Drop.deleteMany({}), Product.deleteMany({}), clearJobs()])
    );

    it('should NOT make a drop with a item price to low', () => {
      return request(app)
        .post('/api/v2/drops')
        .set('Authorization', users[1].token)
        .send({
          date: new Date(),
          products: [
            { ...product, price: (config.settings.minPrice - 10).toString() },
          ],
          longitude: 23.9573617,
          latitude: 49.8134431,
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toContain(
            'Invalid product price. The minimum price is'
          )
        );
    });

    it('should NOT create a drop with invalid item images', () => {
      return request(app)
        .post('/api/v2/drops')
        .set('Authorization', users[1].token)
        .send({
          date: new Date(),
          products: [{ ...product, photos: ['http://asdfasd'] }],
          longitude: 23.9573617,
          latitude: 49.8134431,
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toContain('Invalid photos'));
    });

    it(`should NOT create a drop if seller is not verified`, () => {
      return request(app)
        .post('/api/v2/drops')
        .set('Authorization', nonActiveUserJwtToken)
        .send({
          date: new Date(),
          products: [product],
          longitude: 23.9573617,
          latitude: 49.8134431,
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(res => {
          expect(res.body.message).toBe(
            'Please verify your account before creating a drop'
          );
        });
    });

    it(`should NOT create a drop if seller doesn't have a shipping address`, () => {
      return request(app)
        .post('/api/v2/drops')
        .set('Authorization', users[2].token)
        .send({
          date: new Date(),
          products: [product],
          longitude: 23.9573617,
          latitude: 49.8134431,
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toContain('Please enter your shipping address')
        );
    });

    it(`should NOT create a drop if seller doesn't have a payment info`, () => {
      return request(app)
        .post('/api/v2/drops')
        .set('Authorization', users[3].token)
        .send({
          products: [product],
          longitude: 23.9573617,
          latitude: 49.8134431,
          date: new Date(),
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toContain('Please enter your payment info')
        );
    });

    it('should NOT create a drop in the past (previous day)', () => {
      return request(app)
        .post('/api/v2/drops')
        .set('Authorization', users[0].token)
        .send({
          date: new Date(+new Date() - 23 * 60 * 60 * 1000),
          products: [product],
          longitude: 23.9573617,
          latitude: 49.8134431,
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toContain('must be larger than or equal')
        );
    });

    it('should NOT create a drop an item after 3 months from today', () => {
      return request(app)
        .post('/api/v2/drops')
        .set('Authorization', users[0].token)
        .send({
          date: addDays(new Date(Date.now()), 91),
          products: [product],
          longitude: 23.9573617,
          latitude: 49.8134431,
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toContain('Cannot create a drop 90 days')
        );
    });

    it('should NOT create a drop without coordinates', () => {
      return request(app)
        .post('/api/v2/drops')
        .set('Authorization', users[0].token)
        .send({
          date: addDays(new Date(Date.now()), 91),
          products: [product],
          longitude: 23.9573617,
          latitude: 49.8134431,
        })
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toContain('Cannot create a drop 90 days')
        );
    });

    it('should create a drop immediately with one product', async () => {
      await request(app)
        .post('/api/v2/drops')
        .set('Authorization', users[1].token)
        .send({
          date: new Date(),
          products: [product],
          longitude: 23.9573617,
          latitude: 49.8134431,
        })
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          const d = body.data;
          expect(Object.keys(d).sort()).toMatchSnapshot('drop');
          expect(d.posted).toBe(true);
          expect(d.products).toHaveLength(1);
          expect(d.seller).toHaveLength(24); // Object Id
          expect(!isNaN(Date.parse(d.createdAt))).toBe(true);
          expect(!isNaN(Date.parse(d.updatedAt))).toBe(true);
          expect(shortid.isValid(d.uuid)).toBe(true);
        });
      // check that the drop items have been posted
      return request(app)
        .get('/api/products/')
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(Array.isArray(body.data));
          expect(body.data).toHaveLength(1);
          const p = body.data[0];
          expect(p.status).toBe('forsale');
          expect(p.locality).toBe('Lviv');
          expect(Object.keys(p).sort()).toMatchSnapshot('product');
        });
    });

    it('should schedule a drop with one product', async done => {
      const drop = await request(app)
        .post('/api/v2/drops')
        .set('Authorization', users[1].token)
        .send({
          date: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now,
          products: [product],
          longitude: 23.9573617,
          latitude: 49.8134431,
        })
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          const d = body.data;
          expect(d.posted).toBe(false);
          expect(d.products).toHaveLength(1);
          expect(d.seller).toHaveLength(24); // Object Id
          expect(!isNaN(Date.parse(d.createdAt))).toBe(true);
          expect(!isNaN(Date.parse(d.updatedAt))).toBe(true);
          expect(shortid.isValid(d.uuid)).toBe(true);
          return d;
        });
      // check that the drop item is not listed
      await request(app)
        .get('/api/products/')
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(Array.isArray(body.data));
          expect(body.data).toHaveLength(0);
        });

      await request(app)
        .post(`/api/v2/drops/${drop.uuid}/subscribe`)
        .set('Authorization', users[0].token)
        .expect(httpStatus.CREATED)
        .then(({ body }) => expect(body.data.subscribers).toHaveLength(1));

      const waitFor = 15 * 1000; // seconds
      const interval = Math.floor(waitFor / 100);
      let totalTime = interval;

      // Check every 150ms for up to 15 seconds
      const timer = setInterval(async () => {
        totalTime += interval;

        // job to list the drop has been scheduled
        const scheduled = await findJobs(config.JOBNAMES.SCHEDULE, {
          'data.uuid': drop.uuid,
        });

        if (scheduled.length) {
          expect(scheduled).toHaveLength(1);
          done();
          clearInterval(timer);
          return;
        }

        if (totalTime >= waitFor) {
          clearInterval(timer);
          throw new Error('timeout');
        }
      }, interval);
    });

    it('should post a drop with one product', async done => {
      const drop = await request(app)
        .post('/api/v2/drops')
        .set('Authorization', users[1].token)
        .send({
          date: new Date(Date.now() + 4 * 1000), // 4 seconds from now,
          products: [product],
          longitude: 23.9573617,
          latitude: 49.8134431,
        })
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          const d = body.data;
          expect(d.posted).toBe(false);
          expect(d.products).toHaveLength(1);
          expect(d.seller).toHaveLength(24); // Object Id
          expect(!isNaN(Date.parse(d.createdAt))).toBe(true);
          expect(!isNaN(Date.parse(d.updatedAt))).toBe(true);
          expect(shortid.isValid(d.uuid)).toBe(true);
          return d;
        });
      // check that the drop item is not listed
      await request(app)
        .get('/api/products/')
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(Array.isArray(body.data));
          expect(body.data).toHaveLength(0);
        });

      const waitFor = 15 * 1000; // 15 seconds
      const interval = Math.floor(waitFor / 100);
      let totalTime = interval;

      // Check every 150ms for up to 15 seconds
      const timer = setInterval(async () => {
        totalTime += interval;

        // check the job has run
        const { body } = await request(app)
          .get('/api/products/')
          .expect(httpStatus.OK);

        const notif = await Notification.findOne({
          notifI18n: i18n.listedDrop,
        });

        if (body.data.length && notif) {
          expect(body.data).toHaveLength(1);
          expect(body.data[0].dropId).toEqual(drop._id);

          // Check:
          // - a Notification has been created to the seller
          // - a Push notification has been scheduled to the seller
          const jobs = await findJobs(config.JOBNAMES.PUSH_DROP_LISTED);
          expect(jobs).toHaveLength(1);
          expect(jobs[0].message).toBe(i18n.listedDrop);

          done();
          clearInterval(timer);
          return;
        }
        if (totalTime >= waitFor) {
          clearInterval(timer);
          throw new Error('timeout');
        }
      }, interval);
    });

    it('should notify the seller (once) for a number of items in one Drop', async done => {
      const drop = await request(app)
        .post('/api/v2/drops')
        .set('Authorization', users[1].token)
        .send({
          date: new Date(Date.now() + 4 * 1000), // 4 seconds from now,
          products: [product, product],
          longitude: 23.9573617,
          latitude: 49.8134431,
        })
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          const d = body.data;
          expect(d.posted).toBe(false);
          expect(d.products).toHaveLength(2);
          expect(d.seller).toHaveLength(24); // Object Id
          expect(!isNaN(Date.parse(d.createdAt))).toBe(true);
          expect(!isNaN(Date.parse(d.updatedAt))).toBe(true);
          expect(shortid.isValid(d.uuid)).toBe(true);
          return d;
        });
      // check that the drop item is not listed
      await request(app)
        .get('/api/products/')
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(Array.isArray(body.data));
          expect(body.data).toHaveLength(0);
        });

      const waitFor = 15 * 1000; // 15 seconds
      const interval = Math.floor(waitFor / 100);
      let totalTime = interval;

      // Check every 150ms for up to 15 seconds
      const timer = setInterval(async () => {
        totalTime += interval;

        // check the job has run
        const { body } = await request(app)
          .get('/api/products/')
          .expect(httpStatus.OK);

        const notif = await Notification.findOne({
          notifI18n: i18n.listedDrop,
        });

        if (body.data.length && notif) {
          expect(body.data).toHaveLength(2);
          expect(body.data[0].dropId).toEqual(drop._id);

          // Check:
          // - a Notification has been created to the seller
          // - a Push notification has been scheduled to the seller
          const jobs = await findJobs(config.JOBNAMES.PUSH_DROP_LISTED);
          expect(jobs).toHaveLength(1);
          expect(jobs[0].message).toBe(i18n.listedDrop);

          done();
          clearInterval(timer);
          return;
        }
        if (totalTime >= waitFor) {
          clearInterval(timer);
          throw new Error('timeout');
        }
      }, interval);
    });

    it('should drop items in order', async done => {
      await request(app)
        .post('/api/v2/drops')
        .set('Authorization', users[1].token)
        .send({
          date: new Date(Date.now() + 4 * 1000), // 4 seconds from now,
          products: [
            { ...product, description: 'firstfirst' },
            { ...product, description: 'secondsecond' },
          ],
          longitude: 23.9573617,
          latitude: 49.8134431,
        })
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          const d = body.data;
          expect(d.posted).toBe(false);
          expect(d.products).toHaveLength(2);
          expect(d.seller).toHaveLength(24); // Object Id
          expect(!isNaN(Date.parse(d.createdAt))).toBe(true);
          expect(!isNaN(Date.parse(d.updatedAt))).toBe(true);
          expect(shortid.isValid(d.uuid)).toBe(true);
        });

      // if (!schedulerIsRunning) return done();

      const waitFor = 15 * 1000; // seconds
      const interval = Math.floor(waitFor / 100);
      let totalTime = interval;

      // Check every 150ms for up to 15 seconds
      const timer = setInterval(async () => {
        totalTime += interval;

        const { body } = await request(app)
          .get('/api/products/')
          .expect(httpStatus.OK);

        if (body.data.length) {
          expect(body.data).toHaveLength(2);
          expect(body.data.map(p => p.description)).toEqual([
            'firstfirst',
            'secondsecond',
          ]);
          done();
          clearInterval(timer);
          return;
        }
        if (totalTime >= waitFor) {
          clearInterval(timer);
          throw new Error('timeout');
        }
      }, interval);
    });
  });

  describe('# GET /api/v2/drops?username', () => {
    beforeAll(() => Drop.deleteMany({}));
    beforeAll(() => Promise.all([createManyDrops(2, users[0].token)]));

    it('should get user 0 scheduled drops', () => {
      return request(app)
        .get(`/api/v2/drops/?username=${users[0].username}`)
        .set('Authorization', users[0].token)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data[0].amISubscribed).toBe(false);
          expect(body.data).toHaveLength(2);
        });
    });

    it("should get NOT non-existant user's drops", () => {
      return request(app)
        .get('/api/v2/drops/?username=IDONTEXIST')
        .set('Authorization', users[0].token)
        .expect(httpStatus.NOT_FOUND)
        .then(({ body }) => {
          expect(body.message).toBe('User not found');
        });
    });
  });

  describe('# GET /api/feed/drops', () => {
    beforeEach(async () => {
      await Promise.all([
        Drop.deleteMany({}),
        Product.deleteMany({}),
        clearJobs(),
      ]);
      await Promise.all([
        createManyDrops(1, users[0].token),
        createManyDrops(1, users[1].token),
      ]);
    });

    it('should NOT get my feed of drops without auth', () => {
      return request(app)
        .get('/api/feed/drops')
        .expect(httpStatus.UNAUTHORIZED);
    });

    it("should get an empty list if my followers haven't posted anything", () => {
      return request(app)
        .get('/api/feed/drops')
        .set('Authorization', users[2].token)
        .expect(httpStatus.OK)
        .then(({ body }) => expect(body.data).toHaveLength(0));
    });

    it("should get user's 0 drop feed", () => {
      return request(app)
        .get('/api/feed/drops')
        .set('Authorization', users[0].token)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          // console.log(JSON.stringify(body, null, 2));
          expect(body.data).toHaveLength(1);
          const drop = body.data[0];
          expect(Object.keys(drop).sort()).toMatchSnapshot();
          expect(Object.keys(drop.seller).sort()).toMatchSnapshot();
          expect(shortid.isValid(drop.uuid)).toBe(true);
          expect(drop.posted).toBe(false);
          expect(drop.amISubscribed).toBe(false);
          expect(drop.products).toHaveLength(1);
          expect(drop.subscribers).toHaveLength(0);
          expect(Object.keys(drop.products[0]).sort()).toEqual([
            '_id',
            'photoURIs',
          ]);
        });
    });
  });

  describe('# POST /api/v2/drops/:uuid/subscribe', () => {
    let drops;
    beforeAll(async () => {
      await Promise.all([
        Drop.deleteMany({}),
        Product.deleteMany({}),
        clearJobs(),
      ]);
      drops = await createManyDrops(1, users[0].token);
    });

    it('should NOT subscribe to my own drop', () => {
      return request(app)
        .post(`/api/v2/drops/${drops[0].uuid}/subscribe`)
        .set('Authorization', users[0].token)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toBe('Cannot subscribe your own drop')
        );
    });

    it('should subscribe to a drop', async () => {
      await request(app)
        .post(`/api/v2/drops/${drops[0].uuid}/subscribe`)
        .set('Authorization', users[1].token)
        .expect(httpStatus.CREATED)
        .then(({ body }) => expect(body.data.subscribers).toHaveLength(1));

      await request(app)
        .get('/api/feed/drops')
        .set('Authorization', users[1].token)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data).toHaveLength(1);
          expect(body.data[0].amISubscribed).toBe(true);
        });

      const waitFor = 15 * 1000; // seconds
      const interval = Math.floor(waitFor / 100);
      let totalTime = interval;

      // Check every 150ms for up to 15 seconds
      const timer = setInterval(async () => {
        totalTime += interval;

        // job to notify me
        const subscriptions = await findJobs(
          config.JOBNAMES.DROP_SUBSCRIPTION,
          {
            'data.uuid': drops[0].uuid,
          }
        );

        if (subscriptions.length) {
          expect(subscriptions).toHaveLength(1);
          done();
          clearInterval(timer);
          return;
        }

        if (totalTime >= waitFor) {
          clearInterval(timer);
          throw new Error('timeout');
        }
      }, interval);
    });

    it('should NOT subscribe to the same drop twice', () => {
      return request(app)
        .post(`/api/v2/drops/${drops[0].uuid}/subscribe`)
        .set('Authorization', users[1].token)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toBe("You're already subscribed")
        );
    });
  });

  describe('# POST /api/v2/drops/:uuid/unsubscribe', () => {
    let drops;
    beforeAll(async () => {
      await Promise.all([
        Drop.deleteMany({}),
        Product.deleteMany({}),
        clearJobs(),
      ]);
      drops = await createManyDrops(1, users[0].token);
    });

    it('should NOT unsubscribe to my own drop', () => {
      return request(app)
        .post(`/api/v2/drops/${drops[0].uuid}/unsubscribe`)
        .set('Authorization', users[0].token)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toBe('Cannot unsubscribe your own drop')
        );
    });

    it('should unsubscribe to a drop', async () => {
      await request(app)
        .post(`/api/v2/drops/${drops[0].uuid}/subscribe`)
        .set('Authorization', users[1].token)
        .expect(httpStatus.CREATED)
        .then(({ body }) => expect(body.data.subscribers).toHaveLength(1));
      await request(app)
        .post(`/api/v2/drops/${drops[0].uuid}/unsubscribe`)
        .set('Authorization', users[1].token)
        .expect(httpStatus.OK)
        .then(({ body }) => expect(body.data.subscribers).toHaveLength(0));

      const waitFor = 15 * 1000; // seconds
      const interval = Math.floor(waitFor / 100);
      let totalTime = interval;

      // Check every 150ms for up to 15 seconds
      const timer = setInterval(async () => {
        totalTime += interval;

        // job to notify me
        const subscriptions = await findJobs(
          config.JOBNAMES.DROP_SUBSCRIPTION,
          {
            'data.uuid': drops[0].uuid,
          }
        );

        if (subscriptions.length) {
          expect(subscriptions).toHaveLength(0);
          done();
          clearInterval(timer);
          return;
        }

        if (totalTime >= waitFor) {
          clearInterval(timer);
          throw new Error('timeout');
        }
      }, interval);
    });

    it('should NOT unsubscribe to the same drop twice', () => {
      return request(app)
        .post(`/api/v2/drops/${drops[0].uuid}/unsubscribe`)
        .set('Authorization', users[1].token)
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) => expect(body.message).toBe("You're not subscribed"));
    });
  });

  describe('# GET /api/feed/drops?lastId=', () => {
    let _ids = [];
    beforeAll(async () => {
      try {
        const allDrops = await createManyDrops(105, users[0].token);
        _ids = allDrops.map(p => p._id);
      } catch (err) {
        console.error(err);
      }
    });

    let lastId;
    const limit = 50; // current default

    it("should get the Drop's feed with limit", () => {
      return request(app)
        .get(`/api/feed/drops/?limit=${limit}`)
        .set('Authorization', users[1].token)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data).toHaveLength(limit);
          expect(body.data.map(p => p._id)).toEqual(_ids.slice(0, limit));
          lastId = body.data[body.data.length - 1]._id;
        });
    });

    it('should load more load more', () => {
      return request(app)
        .get(`/api/feed/drops/?lastId=${lastId}&limit=5`)
        .set('Authorization', users[1].token)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data).toHaveLength(5);
          expect(body.data.map(p => p._id)).toEqual(_ids.splice(limit, 5));
          lastId = body.data[body.data.length - 1]._id;
        });
    });

    it('should load more again', () => {
      return request(app)
        .get(`/api/feed/drops/?lastId=${lastId}&limit=5`)
        .set('Authorization', users[1].token)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(body.data).toHaveLength(5);
          expect(body.data.map(p => p._id)).toEqual(_ids.splice(limit, 5));
          lastId = body.data[body.data.length - 1]._id;
        });
    });
    it('should not load more with a missing lastId', () => {
      return request(app)
        .get(`/api/feed/drops?lastId=5ff999999147a8bd32ea35f6`)
        .set('Authorization', users[1].token)
        .expect(httpStatus.NOT_FOUND)
        .then(({ body }) => expect(body.message).toBe('Drop not found.'));
    });
  });
});

/**
 * Create many drops in the future (not immediately posted)
 */
async function createManyDrops(num: number, jwtToken: string) {
  const product = {
    categoryIds: [1, 2, 3],
    typeIds: [1, 2, 3],
    tags: ['winter', 'spring2007'], // optional
    description: 'nice boots',
    price: '1100.99',
    photos: [
      'https://storage.googleapis.com/temp-uploads.onova.co/tmp/1545329733068.jpg',
      'https://storage.googleapis.com/temp-uploads.onova.co/tmp/1545329733069.jpg',
    ],
  };

  const d = {
    date: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now,
    products: [product],
    longitude: 23.9573617,
    latitude: 49.8134431,
  };

  const res = [];
  for (let i = 0; i < num; i++) {
    res.push(await createDrop(d, jwtToken));
  }

  return res.reverse();
}

function createDrop(drop: DropDoc, jwtToken: string) {
  return request(app)
    .post('/api/v2/drops')
    .set('Authorization', jwtToken)
    .send(drop)
    .expect(httpStatus.CREATED)
    .then(res => {
      if (!res.body.data) console.error(res.body);
      return res.body.data;
    });
}
