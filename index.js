const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const logger = require('./utils/logger');
const { connectDB } = require('./config/database');

// Load environment variables
dotenv.config();

// Initialize Express app for health checks
const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'active',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Start Express server
app.listen(PORT, () => {
    logger.info(`✅ Health check server running on port ${PORT}`);
});

// Initialize Telegram Bot
const token = process.env.BOT_TOKEN;
if (!token) {
    logger.error('❌ BOT_TOKEN is required!');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
logger.info('🤖 Bot initialized');

// Connect to MongoDB
connectDB();

// Import handlers
const { setupCommandHandlers } = require('./handlers/commandHandler');
const { setupCallbackHandlers } = require('./handlers/callbackHandler');
const { setupMessageHandlers } = require('./handlers/messageHandler');

// Setup all handlers
setupCommandHandlers(bot);
setupCallbackHandlers(bot);
setupMessageHandlers(bot);

// Error handling
bot.on('error', (error) => {
    logger.error('❌ Bot error:', error);
});

bot.on('polling_error', (error) => {
    logger.error('❌ Polling error:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('🛑 Shutting down gracefully...');
    mongoose.disconnect();
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('🛑 Shutting down gracefully...');
    mongoose.disconnect();
    bot.stopPolling();
    process.exit(0);
});

module.exports = { bot, app };