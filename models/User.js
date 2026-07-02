const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: {
        type: Number,
        required: true,
        unique: true,
        index: true
    },
    username: {
        type: String,
        default: ''
    },
    firstName: {
        type: String,
        default: ''
    },
    credits: {
        type: Number,
        default: 0
    },
    totalAttacks: {
        type: Number,
        default: 0
    },
    lastDaily: {
        type: Date,
        default: null
    },
    dailyUnlimited: {
        type: Date,
        default: null
    },
    lastReferralTime: {
        type: Date,
        default: null
    },
    referralCode: {
        type: String,
        unique: true,
        sparse: true
    },
    referredBy: {
        type: Number,
        default: null
    },
    usedReferral: {
        type: Boolean,
        default: false
    },
    isBanned: {
        type: Boolean,
        default: false
    },
    customHeaders: {
        type: Map,
        of: String,
        default: {}
    },
    scannerEnabled: {
        type: Boolean,
        default: false
    },
    scannerData: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
userSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Generate referral code if not exists
userSchema.pre('save', async function(next) {
    if (!this.referralCode) {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code;
        let exists = true;
        while (exists) {
            code = '';
            for (let i = 0; i < 6; i++) {
                code += characters.charAt(Math.floor(Math.random() * characters.length));
            }
            const existing = await this.constructor.findOne({ referralCode: code });
            if (!existing) exists = false;
        }
        this.referralCode = code;
    }
    next();
});

module.exports = mongoose.model('User', userSchema);