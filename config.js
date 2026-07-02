// config.js
require('dotenv').config();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN || "8212356485:AAGeN3peo9uHPG8eCLFRuWjs12hCVC-jNs4",
  ADMIN_IDS: (process.env.ADMIN_IDS || "6346250222").split(',').map(Number),
  MONGODB_URL: process.env.MONGODB_URL || "mongodb+srv://sahajada07:Sahajada123@cluster0.vynn0ht.mongodb.net/?appName=Cluster0",
  DB_NAME: process.env.DB_NAME || "otp_bomber",
};