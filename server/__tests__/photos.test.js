// @flow

import request from 'supertest';
import httpStatus from 'http-status';
import path from 'path';
import rimraf from 'rimraf';

import app from '../index';

import { beforeAllTests, createUserAndLogin } from './utils';

const TEMP_PATH = '/tmp/*.jpg';

let user = {
  username: 'userOne',
  emailAddress: 'userOne+test@gmail.com',
  password: 'userOneP4$$',
};

let jwtToken;

describe('## Photo Upload APIs', () => {
  beforeAll(beforeAllTests);

  // create 1 user
  beforeAll(() =>
    createUserAndLogin(user).then(({ user: resUser, jwtToken: token }) => {
      jwtToken = token;
    })
  );

  describe('# POST /api/photos/upload', () => {
    beforeAll(done =>
      rimraf(TEMP_PATH, err => {
        if (err) throw err;
        done();
      })
    );

    it('should NOT accept a small image', () => {
      return request(app)
        .post('/api/photos/upload')
        .set('Authorization', jwtToken)
        .attach('photo', path.join(__dirname, 'images/boots-too-small.jpg'))
        .expect(httpStatus.BAD_REQUEST)
        .then(({ body }) =>
          expect(body.message).toContain(
            'Image too small. Min width and height 1440 px'
          )
        );
    });

    it('should upload a square and not resize it', () => {
      return request(app)
        .post('/api/photos/upload')
        .set('Authorization', jwtToken)
        .attach('photo', path.join(__dirname, 'images/boots-larger.jpeg'))
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          const { data } = body;
          expect(data).toContain(
            'https://storage.googleapis.com/temp-uploads.onova.co/'
          );
          // expect(data.format).toBe('jpeg');
          // expect(data.width).toBe(1440);
          // expect(data.height).toBe(1440);
          // expect(data.path).toMatch(/^\/.*.jpg$/);
          // expect(data.premultiplied).toBe(false);
        });
    });

    it('should upload a portrait image and resize to 3:4', () => {
      return request(app)
        .post('/api/photos/upload')
        .set('Authorization', jwtToken)
        .attach('photo', path.join(__dirname, 'images/1440x2160.jpg'))
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          const { data } = body;
          expect(data).toContain(
            'https://storage.googleapis.com/temp-uploads.onova.co/'
          );
          // expect(data.format).toBe('jpeg');
          // expect(data.width).toBe(1440);
          // expect(data.height).toBe(1920);
          // expect(data.cropOffsetLeft).toBe(0);
          // expect(data.cropOffsetTop).toBe(-210);
        });
    });

    it('should upload a landscape image and resize to 4:3', () => {
      return request(app)
        .post('/api/photos/upload')
        .set('Authorization', jwtToken)
        .attach('photo', path.join(__dirname, 'images/2559x1440.jpg'))
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          const { data } = body;
          expect(data).toContain(
            'https://storage.googleapis.com/temp-uploads.onova.co/'
          );
          // expect(data.format).toBe('jpeg');
          // expect(data.width).toBe(1920);
          // expect(data.height).toBe(1440);
          // expect(data.cropOffsetLeft).toBe(0);
          // expect(data.cropOffsetTop).toBe(0);
        });
    });

    it('should upload a another image and resize to less than 3:4', () => {
      return request(app)
        .post('/api/photos/upload')
        .set('Authorization', jwtToken)
        .attach('photo', path.join(__dirname, 'images/1440x1707.jpg'))
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          const { data } = body;
          expect(data).toContain(
            'https://storage.googleapis.com/temp-uploads.onova.co/'
          );
          // expect(data.format).toBe('jpeg');
          // expect(data.width).toBe(1440);
          // expect(data.height).toBe(1707);
          // expect(data.premultiplied).toBe(false);
        });
    });
  });

  describe('# POST /api/photos/upload-chat-images', () => {
    // let pathImage1;
    it('should upload a chat image', () => {
      return request(app)
        .post('/api/photos/upload-chat-images')
        .set('Authorization', jwtToken)
        .attach('photo', path.join(__dirname, 'images/boots-larger.jpeg'))
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          const { data } = body;
          expect(data.originalname).toBe('boots-larger.jpeg');
          expect(data.fieldname).toBe('photo');
          expect(data.encoding).toBe('7bit');
          expect(data.mimetype).toBe('image/jpeg');
          expect(data['thumb.jpeg'].path).toContain(
            'storage.googleapis.com/chat-images.onova.co/'
          );
          expect(data['thumb.jpeg'].filename).toContain('thumb');
          expect(data['.jpeg'].path).toContain(
            'storage.googleapis.com/chat-images.onova.co/'
          );
          expect(data['.jpeg'].filename).toContain('-.jpeg');
          // pathImage1 = data['.jpeg'].path;
          expect(Object.keys(data).sort()).toEqual([
            '.jpeg',
            'encoding',
            'fieldname',
            'mimetype',
            'originalname',
            'thumb.jpeg',
          ]);
        });
    });
  });

  describe('# POST /api/photos/upload-to-vk', () => {
    it('should upload multiple product image when scheduling a post to VK', () => {
      return request(app)
        .post('/api/photos/upload-to-vk')
        .send({
          photos: [
            'https://storage.googleapis.com/temp-uploads.onova.co/1533751234690.jpg',
            'https://storage.googleapis.com/temp-uploads.onova.co/1533751687162.jpg',
          ],
          upload_url:
            'https://pu.vk.com/c849424/upload.php?act=do_add&mid=184591202&aid=-14&gid=0&hash=0b70b5d3a85c5dd69e2923283318effd&rhash=2b42cb02fe37c08e68412e788aa1d88e&swfupload=1&api=1&wallphoto=1',
        })
        .set('Authorization', jwtToken)
        .expect(httpStatus.CREATED)
        .then(({ body }) => {
          const { data } = body;
          expect(data.length).toBe(2);
          expect(typeof data[0].photo).toBe('string');
          expect(data[0].photo.length).toBeGreaterThan(5);
          expect(Object.keys(data[0]).sort()).toEqual([
            'hash',
            'photo',
            'server',
          ]);
        });
    });
  });
});
