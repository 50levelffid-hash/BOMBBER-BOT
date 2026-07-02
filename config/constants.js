module.exports = {
    // Bot Configuration
    BOT_TOKEN: process.env.BOT_TOKEN,
    ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [],
    
    // MongoDB Configuration
    MONGODB_URI: process.env.MONGODB_URI,
    DB_NAME: process.env.DB_NAME || 'otp_bomber_bot',
    
    // Referral Configuration
    REFERRAL_COOLDOWN: parseInt(process.env.REFERRAL_COOLDOWN) || 60,
    REFERRAL_BONUS: parseInt(process.env.REFERRAL_BONUS) || 5,
    
    // Bombing Configuration
    UNLIMITED_PRICE: parseInt(process.env.UNLIMITED_PRICE) || 20,
    MINUTE_PRICE: parseInt(process.env.MINUTE_PRICE) || 1,
    MAX_MINUTE_PRICE: parseInt(process.env.MAX_MINUTE_PRICE) || 10,
    
    // API Configuration
    API_TIMEOUT: parseInt(process.env.API_TIMEOUT) || 2000,
    MAX_CONCURRENT_REQUESTS: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 2000,
    
    // Colors for join buttons
    BUTTON_COLORS: {
        JOIN: '#1E90FF',  // Dodger Blue
        VERIFY: '#32CD32', // Lime Green
        RED: '#FF4444'     // Red
    }
};
