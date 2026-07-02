const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
    referrerId: {
        type: Number,
        required: true,
        index: true
    },
    refereeId: {
        type: Number,
        required: true,
        unique: true
    },
    referralCode: {
        type: String,
        required: true,
        index: true
    },
    bonusAmount: {
        type: Number,
        default: 5
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'completed'
    }
});

// Index for efficient queries
referralSchema.index({ referrerId: 1, timestamp: -1 });
referralSchema.index({ refereeId: 1 });

module.exports = mongoose.model('Referral', referralSchema);