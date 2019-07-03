// @flow

import express from 'express';
import passport from 'passport';
import httpStatus from 'http-status';
import validate from 'express-validation';
const debug = require('debug')('server-data:index');

import photosCtrl from '../controllers/photos.controller';
import paramValidation from '../config/validation/photos.validation';
import photos from '../helpers/photos';

const requireAuth = passport.authenticate('jwt', { session: false });
const router = express.Router();

// const metaReader = sharp()
//   .metadata()
//   .then(info => {
//     console.log(info);
//   });

// $FlowFixMe
router.route('/upload').post(photos.uploadMulter.single('photo'), requireAuth, photosCtrl.tempUploadProductImage);

// $FlowFixMe
router.route('/upload-chat-images').post(photosCtrl.uploadChatImage.single('photo'), requireAuth, (req, res, next) => {
  debug('chat image uploaded to:', req.file.path);
  res.status(httpStatus.CREATED).json({ data: req.file });
});

router.route('/upload-to-vk').post(validate(paramValidation.uploadToVK), photosCtrl.uploadToVK, requireAuth);

export default router;
