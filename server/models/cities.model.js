import mongoose from 'mongoose';

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

export default mongoose.model('cities', CitiesSchema);
