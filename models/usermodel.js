const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const userSchema = new Schema({
  name: {
    type: String,
  },
  email: {
    type: String,
    unique: true,
    requireed: true,
    lowercase: true,
  },
  username: {
    type: String,
    unique: true,
    requireed: true,
  },
  password: {
    type: String,
    requireed: true,
  },
});


module.exports = mongoose.model('User',userSchema);