// @flow

import request from 'supertest';
import httpStatus from 'http-status';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

import app from '../index';

import {
  beforeAllTests,
  createOrder,
  createProduct,
  createUserAndLogin,
} from './utils';

const mock = new MockAdapter(axios);

const kyiv = '8d5a980d-391c-11dd-90d9-001a92567626';

const photos = {
  photos: [
    'https://storage.googleapis.com/temp-uploads.onova.co/1533146500579-.jpeg',
  ],
};

describe('## Shipping', () => {
  beforeAll(beforeAllTests);

  let user1 = {
    username: 'userone',
    emailAddress: 'userone@gmail.com',
    password: 'expressos',
  };

  let user2 = {
    username: 'usertwo',
    emailAddress: 'usertwo@gmail.com',
    password: 'expressos',
  };

  let user1JwtToken, user2JwtToken;

  // create 2 users
  beforeAll(async () => {
    const { user: resUser1, jwtToken: token1 } = await createUserAndLogin(
      user1
    );
    user1._id = resUser1._id;
    user1JwtToken = token1;
    const { user: resUser2, jwtToken: token2 } = await createUserAndLogin(
      user2
    );
    user2._id = resUser2._id;
    user2JwtToken = token2;
  });

  describe('# GET /api/shipping/cities', () => {
    it('should get the list of cities', () => {
      return request(app)
        .get('/api/shipping/cities')
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(Object.keys(body.data[0]).sort()).toMatchSnapshot();
          expect(body.data).toHaveLength(1173);
        });
    });
  });

  describe('# GET /api/shipping/departments/${city}', () => {
    it('should get the list of departments', () => {
      return request(app)
        .get(`/api/shipping/departments/${kyiv}`)
        .expect(httpStatus.OK)
        .then(({ body }) => {
          expect(Object.keys(body.data[0]).sort()).toMatchSnapshot();
          expect(body.data).toHaveLength(261);
        });
    });

    it('should NOT get the list of departments for an invalid city', () => {
      return request(app)
        .get(`/api/shipping/departments/8d5a980d-391c-11dd-90d9-001a92567699`)
        .expect(httpStatus.SERVICE_UNAVAILABLE)
        .then(res =>
          expect(res.body.message).toContain(
            'Error getting list of departments'
          )
        );
    });

    it('should NOT get the list of departments for an invalid city uuid', () => {
      return request(app)
        .get(`/api/shipping/departments/8d5a980d-391c-11dd-90d9`)
        .expect(httpStatus.BAD_REQUEST)
        .then(res =>
          expect(res.body.message).toBe('"city" must be a valid GUID')
        );
    });
  });

  describe('# GET /api/shipping/costs', () => {
    const productDoc = {
      categoryIds: [2],
      typeIds: [1],
      description: 'my old panties',
      price: '99900.59',
      ...photos,
    };

    let orderId, orderProdUUID;

    beforeAll(() => {
      return createProduct(productDoc, user1JwtToken).then(product =>
        createOrder({ ...product, ...productDoc }, user2JwtToken).then(o => {
          expect(o.priceOfItem).toBe(productDoc.price);
          // orderProdUUID = product.uuid;
          orderId = o.id;
        })
      );
    });

    // Відділення №1: вул. Червонопрапорна, 34 (Корчувате)
    const recipientOfficeID = '1ec09d88-e1c2-11e3-8c4a-0050568002cf';

    it('should NOT get the shipping costs without recipientOfficeID', () => {
      const product = {
        price: '300.99',
        weight: 3000,
      };
      return request(app)
        .get(
          `/api/shipping/costs?price=${product.price}&weight=${
            product.weight
          }&orderId=${orderId}`
        )
        .expect(httpStatus.BAD_REQUEST)
        .then(res =>
          expect(res.body.message).toBe('"recipientOfficeID" is required')
        );
    });

    it('should get the shipping costs', () => {
      const product = {
        price: '300.99',
        weight: 3000,
      };

      mock
        .onGet('/handlers/NovaPoshta/costs')
        .reply(200, { data: { handlerPrice: 2500 } });
      return request(app)
        .get(
          `/api/shipping/costs?price=${product.price}&weight=${
            product.weight
          }&orderId=${orderId}&recipientOfficeID=${recipientOfficeID}`
        )
        .expect(httpStatus.OK)
        .then(({ body }) => expect(body.data).toBe('25.00'));
    });
  });
});
