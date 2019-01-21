import mongoose from 'mongoose';
import util from 'util';
// import stream from 'getstream-node';

// config should be imported before importing any other file
import config from './config/config';
import app from './config/express';
import * as https from 'https';
import * as fs from 'fs';

const debug = require('debug')('server-data:index');

const mongoURI = `mongodb://${config.mongo.host}:${config.mongo.port}/${
  config.mongo.db
}`;

const options = {
  keepAlive: 1,
  useNewUrlParser: true,
  useCreateIndex: true,
  // socketTimeoutMS: 1000
};
mongoose.set('useFindAndModify', false);

mongoose
  .connect(
    mongoURI,
    options
  )
  .then(
    () => {
      console.log(`connected to ${mongoURI}`);
    },
    err => {
      throw new Error(`unable to connect to: ${mongoURI} - ${err}`);
    }
  );

// print mongoose logs in dev env
if (config.mongooseDebug) {
  mongoose.set('debug', (collectionName, method, query, doc) => {
    debug(`${collectionName}.${method}`, util.inspect(query, false, 20), doc);
  });
}

// if (config.env == 'production') {
//   // send the mongoose instance with registered models to StreamMongoose
//   stream.mongoose.setupMongoose(mongoose);
// }

// module.parent check is required to support jest watch
// https://github.com/mochajs/mocha/issues/1912
if (!module.parent) {
  // option for for development, for onova.co domains
  if (process.env.HTTPS) {
    const httpsOptions = {
      key: fs.readFileSync('./localhost.key'),
      cert: fs.readFileSync('./localhost.crt'),
    };
    https
      .createServer(httpsOptions, app)
      .listen(config.port, '0.0.0.0', () =>
        console.info(
          `**HTTPS** server started on port ${config.port} (${config.env})`
        )
      );
  } else {
    app.listen(config.port, '0.0.0.0', () =>
      console.info(`HTTP server started on port ${config.port} (${config.env})`)
    );
  }
}

export default app;
