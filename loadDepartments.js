const axios = require('axios');
const mongoose = require('mongoose');
const throat = require('throat');

const http = axios.create({
  baseURL: 'https://api.escrowbox.uapay.ua/api',
  headers: {
    'Cache-Control': 'no-cache',
  },
  auth: {
    username: '__USER_PROD__',
    password: '__PASS_PROD__',
  },
});

const CitiesSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      index: true,
    },
    uk: String,
  },
  { collection: 'cities' }
);

const City = mongoose.model('cities', CitiesSchema);

const DepartmentsSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
  },
  uk: {
    type: String,
    required: true,
    index: true,
  },
  maxWeight: Number,
  cityID: {
    type: String,
    required: true,
    index: true,
  },
});

const Department = mongoose.model('departments', DepartmentsSchema);

async function main() {
  console.log('loading cities');
  // find all the cities in which we haven't loaded the departments from
  const departments = await Department.find({}, { cityID: 1 });
  let currentCities = departments.map(depart => depart.cityID);
  console.log('current cities:', await City.countDocuments());
  currentCities = new Set(currentCities);
  console.log('current cities with departments:', currentCities.size);
  const citiesToLoad = await City.find({
    id: { $nin: Array.from(currentCities) },
  }); // .limit(10);
  console.log('citiesToLoad:', citiesToLoad.length);
  // await Department.collection.deleteMany({}, { safe: true });

  let i = 0;
  const promises = citiesToLoad.map(
    throat(5, async city => {
      let data;
      i++;
      try {
        const res = await http.get(
          `/handlers/NovaPoshta/cities/${city.id}/offices`
        );
        if (!res.data || !res.data.data || !res.data.data.length) {
          console.log(res);
          if (!res.data.data) console.error('error with city id:', city.id);
          return Promise.resolve();
        }
        data = res.data.data;
        const departmentsOnCity = await Department.findOne({ cityID: city.id });
        if (departmentsOnCity) return;
        console.log(`${i}/${citiesToLoad.length}`, city.uk);
      } catch (error) {
        console.error(error);
        return Promise.resolve();
      }

      // TODO: update the number of departments for the city

      return await Department.insertMany(
        data.map(o => ({ ...o, cityID: city.id }))
      );
      // console.log(res[0]);
    })
  );
  await Promise.all(promises);
  console.log('done loading');

  const updatedDepartments = await Department.find({}, { cityID: 1 });
  let latestCities = updatedDepartments.map(depart => depart.cityID);
  latestCities = new Set(latestCities);
  console.log('latestCities:', latestCities.size);
  let citiesToDelete = await City.find({
    id: { $nin: Array.from(latestCities) },
  }); // .limit(10);
  citiesToDelete = citiesToDelete.map(c => c._id);

  // remove cities that do not have any Nova Poshta departments
  console.log('citiesToDelete:', citiesToDelete.length);
  await City.deleteMany({ _id: { $in: citiesToDelete } });
  process.exit(0);
}

let mongoURI = `mongodb://localhost:27017/onova-data`;

const options = {
  keepAlive: 1,
  useNewUrlParser: true,
};

mongoose.connect(mongoURI, options).then(
  () => {
    console.log(`connected to ${mongoURI}`);
    main();
  },
  err => {
    throw new Error(`unable to connect to: ${mongoURI} - ${err}`);
  }
);
