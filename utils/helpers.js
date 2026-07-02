const moment = require('moment');

/**
 * Format phone number
 */
const formatPhone = (phone) => {
    return phone.toString().replace(/\D/g, '').slice(-10);
};

/**
 * Validate phone number
 */
const isValidPhone = (phone) => {
    const formatted = formatPhone(phone);
    return /^[0-9]{10}$/.test(formatted);
};

/**
 * Get bomb duration message
 */
const getDurationMessage = (minutes) => {
    if (minutes === 1440) {
        return '⭐ 1 Day Unlimited';
    } else if (minutes < 60) {
        return `${minutes} Minute${minutes > 1 ? 's' : ''}`;
    } else {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (mins === 0) {
            return `${hours} Hour${hours > 1 ? 's' : ''}`;
        }
        return `${hours} Hour${hours > 1 ? 's' : ''} ${mins} Minute${mins > 1 ? 's' : ''}`;
    }
};

/**
 * Calculate bomb cost
 */
const calculateCost = (minutes) => {
    if (minutes === 1440) {
        return parseInt(process.env.UNLIMITED_PRICE) || 20;
    } else if (minutes <= 0) {
        return 0;
    } else if (minutes <= 10) {
        return minutes;
    } else {
        return parseInt(process.env.MAX_MINUTE_PRICE) || 10;
    }
};

/**
 * Check if user has unlimited plan
 */
const hasUnlimitedPlan = (user) => {
    if (!user || !user.dailyUnlimited) return false;
    return new Date(user.dailyUnlimited) > new Date();
};

/**
 * Format date
 */
const formatDate = (date) => {
    if (!date) return 'Never';
    return moment(date).format('DD MMM YYYY, HH:mm');
};

/**
 * Generate random string
 */
const generateRandomString = (length = 6) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

/**
 * Escape markdown
 */
const escapeMarkdown = (text) => {
    if (!text) return '';
    return text.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1');
};

module.exports = {
    formatPhone,
    isValidPhone,
    getDurationMessage,
    calculateCost,
    hasUnlimitedPlan,
    formatDate,
    generateRandomString,
    escapeMarkdown
};