const mongoose = require('mongoose');

const protectedNumberSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    addedBy: {
        type: Number,
        required: true
    },
    reason: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ProtectedNumber', protectedNumberSchema);