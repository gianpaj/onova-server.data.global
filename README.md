# Onova API server

Functionality:

- Authentication & Authorization
- REST API
- Image upload to Google Cloud Storage

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

We're using Google Cloud Engine:

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

## Import NovaPoshta cities and departments into MongoDB

1. Start MongoDB

2. Import the cities (TODO: import the cities via the Nodejs script)

```bash
http "https://api.escrowbox.uapay.ua/api/handlers/NovaPoshta/cities" --auth-type basic --auth 'USER:PASS' -b --output cities.json
# remove the "data: " so what's left is an an array of objects
mongoimport -d onova-data -c cities cities.json --jsonArray --drop
# output
2018-10-11T12:33:15.248+0300	connected to: localhost
2018-10-11T12:33:15.249+0300	dropping: onova-data.cities
2018-10-11T12:33:15.356+0300	imported 1181 documents
```

3. Enter Auth details in `loadDepartments.js`

4. Load the departments for every city, and delete the cities without any departments

```
node loadDepartments.js
# output
connected to mongodb://localhost:27017/onova-data
loading cities
current cities: 1145
current cities with departments: 0
citiesToLoad: 1145
Пустомити
Очаків
Нікольське
Березанка(Миколаївська обл.)
Мангуш
Нова Одеса
Баштанка
Казанка
Веселинове
Новий Буг
[]
...
done loading
latestCities: 1138
citiesToDelete: 7
```

NOTE: there are 155 cities that do not have any Nova Poshta departments

5. Add these collections (cities, departments) to `onova-data-test`

```
mongodump --host localhost -d onova-data -c cities
2018-10-11T13:00:52.620+0300 writing onova-data.cities to
2018-10-11T13:00:52.627+0300 done dumping onova-data.cities (838 documents)

mongodump --host localhost -d onova-data -c departments
2018-10-11T13:00:57.975+0300 writing onova-data.departments to
2018-10-11T13:00:57.989+0300 done dumping onova-data.departments (2118 documents)
```

```
mongorestore dump/onova-data -d onova-data-test --drop
2018-10-11T13:09:25.706+0300 the --db and --collection args should only be used when restoring from a BSON file. Other uses are deprecated and will not exist in the future; use --nsInclude instead
2018-10-11T13:09:25.706+0300 building a list of collections to restore from dump/onova-data dir
2018-10-11T13:09:25.741+0300 reading metadata for onova-data-test.departments from dump/onova-data/departments.metadata.json
2018-10-11T13:09:25.759+0300 reading metadata for onova-data-test.cities from dump/onova-data/cities.metadata.json
2018-10-11T13:09:25.807+0300 restoring onova-data-test.departments from dump/onova-data/departments.bson
2018-10-11T13:09:25.853+0300 restoring onova-data-test.cities from dump/onova-data/cities.bson
2018-10-11T13:09:25.869+0300 no indexes to restore
2018-10-11T13:09:25.869+0300 finished restoring onova-data-test.cities (838 documents)
2018-10-11T13:09:25.886+0300 restoring indexes for collection onova-data-test.departments from metadata
2018-10-11T13:09:25.960+0300 finished restoring onova-data-test.departments (2118 documents)
2018-10-11T13:09:25.960+0300 done
```

6. Add these collections to production as well

```
mongorestore --host localhost --port 9999 -d onova-data -c cities dump/onova-data/cities.bson --drop
mongorestore --host localhost --port 9999 -d onova-data -c departments dump/onova-data/departments.bson --drop
```

### Verify if the just-loaded cities or departments have been updated

1.  Export the departments collection without \_id field

        mongoexport --host localhost -d onova-data -c departments | sed '/"_id":/s/"_id":[^,]*,//' | sed '/"__v":/s/"__v"*,//' > dep-before.json

2.  Drop the existing collection
3.  Load the "new" departments into MongoDB
4.  Export the new departments without \_id field

        mongoexport --host localhost -d onova-data -c departments | sed '/"_id":/s/"_id":[^,]*,//' | sed '/"__v":/s/"__v"*,//' > dep-today.json

5.  Sort the json files (or sort at `mongoexport` stage)

        sort dep-before.json > dep-before-sorted.json
        sort dep-today.json > dep-today-sorted.json

6.  Compare with `diff` or a GUI tool like Beyond Compare

        diff dep-before-sorted.json dep-today-sorted.json

7.  Get the number of new departments

        diff -u dep-before-sorted.json dep-today-sorted.json | grep -E "^\+" | wc -l

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
