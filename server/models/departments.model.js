import mongoose from 'mongoose';

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

export default mongoose.model('departments', DepartmentsSchema);
