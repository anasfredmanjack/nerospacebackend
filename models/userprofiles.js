const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserprofilesSchema = new Schema({
    address: {
        type: String,
        required: true,
        unique: true,          // ← enforce uniqueness
        trim: true,
        lowercase: true,
    },
    email: {
        type: String
    },
    preferences: [
        {
          platform: {
            type: String,
            required: true
          },
          category: {
            type: String,
            required: true
          }
        }
      ]

}, { timestamps: true });

const Userprofiles = mongoose.model('Userprofiles', UserprofilesSchema);
module.exports = Userprofiles;
