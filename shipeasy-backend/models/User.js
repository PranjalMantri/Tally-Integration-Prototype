import mongoose from "mongoose"

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  orgId: {
    type: String,
    required: true
  },
  tallyAgentKey: {
    type: String,
    unique: true,
  }
}, {
  timestamps: true
});

export default mongoose.model('User', userSchema);
