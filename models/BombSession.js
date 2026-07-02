const mongoose = require('mongoose');

const bombSessionSchema = new mongoose.Schema({
    userId: {
        type: Number,
        required: true,
        index: true
    },
    phone: {
        type: String,
        required: true
    },
    duration: {
        type: Number,
        required: true
    },
    cost: {
        type: Number,
        required: true
    },
    isUnlimited: {
        type: Boolean,
        default: false
    },
    startTime: {
        type: Date,
        default: Date.now
    },
    endTime: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'stopped', 'failed'],
        default: 'active'
    },
    stats: {
        sms: { type: Number, default: 0 },
        calls: { type: Number, default: 0 },
        whatsapp: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
    },
    sessionId: {
        type: String,
        required: true,
        unique: true
    }
});

// Index for active sessions
bombSessionSchema.index({ userId: 1, status: 1 });
bombSessionSchema.index({ startTime: -1 });

module.exports = mongoose.model('BombSession', bombSessionSchema);
