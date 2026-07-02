const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
    channelId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    channelName: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    requiredForReferral: {
        type: Boolean,
        default: true
    },
    addedBy: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Channel', channelSchema);