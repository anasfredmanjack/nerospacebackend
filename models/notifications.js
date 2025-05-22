// models/notifications.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sub‐schema for each notification item
const NotificationItemSchema = new Schema({
  type:   { type: String, required: true, trim: true },
  desc:   { type: String, required: true, trim: true },
  read:   { type: Boolean, default: false }
}, {
  _id: true,
  timestamps: true    // adds createdAt & updatedAt per notification
});

// Sub‐schema for each login record
const LoginRecordSchema = new Schema({
  ip:        { type: String, required: true },
  userAgent: { type: String, required: true },
  timestamp: { type: Date,   default: Date.now }
}, {
  _id: false         // no _id for login records
});

// Root schema holding both arrays
const NotificationsSchema = new Schema({
  address: {
    type:      String,
    required:  true,
    unique:    true,   // one doc per wallet
    trim:      true,
    lowercase: true,
    index:     true
  },
  items:        [ NotificationItemSchema ],   // notifications
  loginHistory: [ LoginRecordSchema ]         // login events
}, {
  timestamps: true    // adds createdAt/updatedAt on the root doc
});

module.exports = mongoose.model('Notifications', NotificationsSchema);
