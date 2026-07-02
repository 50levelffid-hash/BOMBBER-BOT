// Inline keyboard for bomb duration selection
const getBombDurationKeyboard = () => {
    return {
        inline_keyboard: [
            [
                { text: '⏱️ 1 Min', callback_data: 'bomb_duration_1' },
                { text: '⏱️ 2 Min', callback_data: 'bomb_duration_2' },
                { text: '⏱️ 3 Min', callback_data: 'bomb_duration_3' }
            ],
            [
                { text: '⏱️ 5 Min', callback_data: 'bomb_duration_5' },
                { text: '⏱️ 10 Min', callback_data: 'bomb_duration_10' },
                { text: '⏱️ 30 Min', callback_data: 'bomb_duration_30' }
            ],
            [
                { text: '⏱️ 60 Min', callback_data: 'bomb_duration_60' },
                { text: '⭐ 1 Day Unlimited', callback_data: 'bomb_duration_1440' }
            ]
        ]
    };
};

// Inline keyboard for confirmation
const getConfirmKeyboard = (duration, phone) => {
    return {
        inline_keyboard: [
            [
                { text: '✅ Confirm', callback_data: `bomb_confirm_${duration}_${phone}` },
                { text: '❌ Cancel', callback_data: 'bomb_cancel' }
            ]
        ]
    };
};

// Inline keyboard for settings
const settingsKeyboard = {
    inline_keyboard: [
        [
            { text: '📋 View Settings', callback_data: 'settings_view' }
        ],
        [
            { text: '🔍 Add Scanner', callback_data: 'settings_scanner' }
        ],
        [
            { text: '📝 Modify Headers', callback_data: 'settings_headers' }
        ],
        [
            { text: '🔙 Back', callback_data: 'settings_back' }
        ]
    ]
};

// Inline keyboard for channel manager
const channelManagerKeyboard = {
    inline_keyboard: [
        [
            { text: '➕ Add Channel', callback_data: 'channel_add' }
        ],
        [
            { text: '➖ Remove Channel', callback_data: 'channel_remove' }
        ],
        [
            { text: '📋 View Channels', callback_data: 'channel_view' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_back' }
        ]
    ]
};

// Inline keyboard for scanner manager
const scannerManagerKeyboard = {
    inline_keyboard: [
        [
            { text: '➕ Add Scanner', callback_data: 'scanner_add' }
        ],
        [
            { text: '➖ Remove Scanner', callback_data: 'scanner_remove' }
        ],
        [
            { text: '📋 View Scanners', callback_data: 'scanner_view' }
        ],
        [
            { text: '🔄 Global Headers', callback_data: 'scanner_headers' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_back' }
        ]
    ]
};

// Inline keyboard for broadcast
const broadcastKeyboard = {
    inline_keyboard: [
        [
            { text: '📝 Text', callback_data: 'broadcast_text' }
        ],
        [
            { text: '🖼️ Photo', callback_data: 'broadcast_photo' }
        ],
        [
            { text: '🎥 Video', callback_data: 'broadcast_video' }
        ],
        [
            { text: '🔙 Back', callback_data: 'admin_back' }
        ]
    ]
};

// Inline keyboard for payment
const getPaymentKeyboard = (userId) => {
    return {
        inline_keyboard: [
            [
                { text: '✅ Accept', callback_data: `pay_accept_${userId}` },
                { text: '❌ Not Accept', callback_data: `pay_reject_${userId}` }
            ]
        ]
    };
};

module.exports = {
    getBombDurationKeyboard,
    getConfirmKeyboard,
    settingsKeyboard,
    channelManagerKeyboard,
    scannerManagerKeyboard,
    broadcastKeyboard,
    getPaymentKeyboard
};
