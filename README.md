# Onova Global API server (`server.data.global`)

> Part of [Onova](https://www.onova.co/), a mobile marketplace for second-hand and sustainable clothing that [Gianfranco Palumbo](https://github.com/gianpaj) and Alex Kostinskyi built in Lviv, Ukraine. The company ran until September 2019. This repository is an archive and is not maintained.

A copy of [server.data](https://github.com/gianpaj/onova-server.data) split off in January 2019 to become an international version of Onova. The plan was to open Ukrainian brands to buyers in Europe. In August 2019 it began to swap the Ukrainian providers for international ones: Stripe for payments and Shippo for shipping. Neither integration was finished before the company wound down.

| | |
|---|---|
| First Onova commit | 2017-10-20 (history shared with server.data until 2019-01-02) |
| Last commit | 2019-08-29 |
| Commits | 1,314 by Gianfranco |
| Code | about 20,800 lines of JavaScript |
| Tests | 21 test files, about 370 test cases |

### Onova repositories

- [onova-mobileapp](https://github.com/gianpaj/onova-mobileapp): the Onova and Drop iOS and Android apps
- [onova-server.data](https://github.com/gianpaj/onova-server.data): the REST API
- [onova-server.data.global](https://github.com/gianpaj/onova-server.data.global): the API fork for an international version
- [onova-server.push](https://github.com/gianpaj/onova-server.push): push notifications
- [onova-server.chat](https://github.com/gianpaj/onova-server.chat): order messages in buyer–seller chats
- [onova-webapp-drop](https://github.com/gianpaj/onova-webapp-drop): the Drop web app
- [onova-forest-admin](https://github.com/gianpaj/onova-forest-admin): the back office
- [onova-automl-server](https://github.com/gianpaj/onova-automl-server): an image classifier prototype

---

## Original README

Functionality:

- Authentication & Authorization
- REST API
- Image upload to Google Cloud Storage
- Stripe payments (WIP)
- Shippo integration (WIP)

Based on [Express ES6 REST API Starter](https://github.com/kunalkapadia/express-mongoose-es6-rest-api).

## Overview

This is a boilerplate application for building REST APIs in Node.js using ES6 and Express with Code Coverage and JWT Authentication. Helps you stay productive by following best practices.

Heavily inspired from [Egghead.io - How to Write an Open Source JavaScript Library](https://egghead.io/courses/how-to-write-an-open-source-javascript-library).

### Features

| Feature                                                                                             | Summary                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ES6 via [Babel](https://babeljs.io/)                                                                |                                                                                                                                                                                                                                                                                                              |
| Authentication via [JsonWebToken](https://www.npmjs.com/package/jsonwebtoken)                       |                                                                                                                                                                                                                                                                                                              |
| Code Linting                                                                                        | JavaScript code linting is done using [ESLint](http://eslint.org) - a pluggable linter tool for identifying and reporting on patterns in JavaScript. Uses ESLint with [eslint-config-prettier](https://github.com/prettier/eslint-config-prettier). Prettier is a Prettier is an opinionated code formatter. |
| Auto server restart                                                                                 | Restart the server using [nodemon](https://github.com/remy/nodemon) in real-time anytime an edit is made, with babel compilation and eslint.                                                                                                                                                                 |
| Logs debugging via [debug](https://www.npmjs.com/package/debug)                                     | Instead of inserting and deleting `console.log` you can replace it with the `debug()` function and just leave it there. You can then selectively debug portions of your code by setting `DEBUG` env variable. If `DEBUG` env variable is not set, nothing is displayed to the console.                       |
| Promisified Code via [bluebird](https://github.com/petkaantonov/bluebird)                           | We love promise, don't we ? All our code is promisified and even so our tests via [supertest-as-promised](https://www.npmjs.com/package/supertest-as-promised).                                                                                                                                              |
| API parameter validation via [express-validation](https://www.npmjs.com/package/express-validation) | Validate body, params, query, headers and cookies of a request (via middleware) and return a response with errors; if any of the configured validation rules fail. You won't anymore need to make your route handler dirty with such validations.                                                            |
| Secure app via [helmet](https://github.com/helmetjs/helmet)                                         | Helmet helps secure Express apps by setting various HTTP headers.                                                                                                                                                                                                                                            |
| Uses [yarn](https://yarnpkg.com) over npm                                                           | Uses new released yarn package manager by facebook. You can read more about it [here](https://code.facebook.com/posts/1840075619545360)                                                                                                                                                                      |

- CORS support via [cors](https://github.com/expressjs/cors)
- Uses [http-status](https://www.npmjs.com/package/http-status) to set http status code. It is recommended to use `httpStatus.INTERNAL_SERVER_ERROR` instead of directly using `500` when setting status code.
- Has `.editorconfig` which helps developers define and maintain consistent coding styles between different editors and IDEs.

## Getting Started

Install yarn:

```sh
npm install -g yarn
```

Install dependencies:

```sh
yarn
```

Set environment vars:

```sh
cp .env.example .env
```

Create Google Cloud Storage credentials file (ask Gianfranco):

```sh
Onova-3a339323d16a.json
```

Start server:

```sh
# Start server
yarn dev:start

# set DEBUG env var to get debugging logs
DEBUG=server-data:* yarn start

# Debug Mongoose
DEBUG=server-data:* MONGOOSE_DEBUG=true yarn dev:start
```

Start with HTTPS and different port:

```sh
HTTPS=true PORT=4000 yarn dev:start
```

Refer [debug](https://www.npmjs.com/package/debug) to know how to selectively turn on logs.

Tests:

```sh
# Run all the tests (written in ES6)
yarn test

# Run all the tests along with code coverage
yarn test:coverage

# Run all the tests on file change
yarn test:watch

# Run individual test files
npm run test:one server/__tests__/order.test.js

# Enable debug() output
DEBUG=server-data:* npm run test:one server/__tests__/order.test.js

# Run tests that require the job scheduler (like drop.test.js)
cd ../server.push
NODE_ENV=test yarn dev:start
```

Lint:

```sh
# Lint code with ESLint
yarn lint
```

### Prod Deployment

We're using AWS Lightsail:

- https://onova.co/api/

e.g. https://onova.co/api/health-check

```sh
# 1. install production dependencies only
yarn --production

# 2. compile to ES5 AND start node app
yarn start
```

## Generate SQLite DB for Reverse Geocoding (`db.sqlite`)

1. Clone git Node library for offline geocoding

```bash
git clone git@github.com:lucaspiller/offline-geocoder.git
```

2. Run script

```bash
cd offline-geocoder/scripts/
./generate_geonames.sh
```

```output
Downloading cities from Geonames...
--2018-11-29 20:55:18--  http://download.geonames.org/export/dump/cities1000.zip
Resolving download.geonames.org... 188.40.33.19
Connecting to download.geonames.org|188.40.33.19|:80... connected.
HTTP request sent, awaiting response... 200 OK
Length: 7744485 (7.4M) [application/zip]
Saving to: 'cities1000.zip'

cities1000.zip                   100%[============================================================>]   7.38M  1.25MB/s   in 6.0s
....

2018-11-29 20:55:26 (319 KB/s) - 'countryInfo.txt' saved [31642/31642]


Generating...
Created db.sqlite with 132399 features.
```

## Logging

Universal logging library [winston](https://www.npmjs.com/package/winston) is used for logging. It has support for multiple transports. A transport is essentially a storage device for your logs. Each instance of a winston logger can have multiple transports configured at different levels. For example, one may want error logs to be stored in a persistent remote location (like a database), but all logs output to the console or a local file. We just log to the console for simplicity, you can configure more transports as per your requirement.

### API logging

Logs detailed info about each api request to console during development.
![Detailed API logging](https://cloud.githubusercontent.com/assets/4172932/12563354/f0a4b558-c3cf-11e5-9d8c-66f7ca323eac.JPG)

### Error logging

Logs stacktrace of error to console along with other details. You should ideally store all error messages persistently.
![Error logging](https://cloud.githubusercontent.com/assets/4172932/12563361/fb9ef108-c3cf-11e5-9a58-3c5c4936ae3e.JPG)

## Code Coverage

Get code coverage summary on executing `yarn test:coverage`

(old screenshot)
![Code Coverage Text Summary](https://cloud.githubusercontent.com/assets/4172932/12827832/a0531e70-cba7-11e5-9b7c-9e7f833d8f9f.JPG)
