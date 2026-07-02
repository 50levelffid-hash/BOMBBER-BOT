const User = require('../models/User');
const ProtectedNumber = require('../models/ProtectedNumber');
const Channel = require('../models/Channel');
const channelService = require('../services/channelService');
const { ADMIN_IDS } = require('../config/constants');
const { isValidPhone, calculateCost, getDurationMessage, hasUnlimitedPlan } = require('../utils/helpers');
const logger = require('../utils/logger');
const apiLoader = require('../utils/apiLoader');

// Store global states
if (!global.userStates) global.userStates = new Map();
if (!global.adminStates) global.adminStates = new Map();
if (!global.bombingSessions) global.bombingSessions = {};

const setupMessageHandlers = (bot) => {
    
    // Handle all text messages
    bot.on('message', async (msg) => {
        const userId = msg.chat.id;
        const text = msg.text;

        try {
            // Skip commands (handled separately)
            if (text && text.startsWith('/')) return;

            // Check if user is in a state
            const state = global.userStates?.get(userId);
            const adminState = global.adminStates?.get(userId);

            // === Bomb phone input ===
            if (state && state.step === 'bomb_phone') {
                const phone = text?.trim();
                if (!isValidPhone(phone)) {
                    return bot.sendMessage(
                        userId,
                        '❌ **Invalid phone number!**\nPlease send a 10-digit number.',
                        { parse_mode: 'Markdown' }
                    );
                }

                // Check if protected
                const protectedNum = await ProtectedNumber.findOne({ phone });
                if (protectedNum) {
                    return bot.sendMessage(
                        userId,
                        '⚠️ **This number is PROTECTED!**\nBombing not allowed.',
                        { parse_mode: 'Markdown' }
                    );
                }

                // Show duration options
                const user = await User.findOne({ userId });
                const isUnlimited = hasUnlimitedPlan(user);

                const durationKeyboard = {
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

                // Store phone in state
                state.phone = phone;
                global.userStates.set(userId, state);

                const costMsg = isUnlimited ? '⭐ **UNLIMITED PLAN ACTIVE - FREE**' : '';

                await bot.sendMessage(
                    userId,
                    `📱 **Target:** \`${phone}\`\n\n` +
                    `⏱️ **Select Duration:**\n\n` +
                    `${costMsg}\n` +
                    `💡 1-10 min: 1 credit/min\n` +
                    `💡 11-60 min: 10 credits\n` +
                    `💡 1 Day: 20 credits`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: durationKeyboard
                    }
                );

                return;
            }

            // === Scanner input ===
            if (state && state.step === 'scanner_input') {
                const user = await User.findOne({ userId });
                if (!user) return;

                user.scannerEnabled = true;
                user.scannerData = text;
                await user.save();

                await bot.sendMessage(
                    userId,
                    '✅ **Scanner bypass configured successfully!**',
                    { parse_mode: 'Markdown' }
                );
                global.userStates.delete(userId);
                return;
            }

            // === Headers input ===
            if (state && state.step === 'headers_input') {
                if (text === '/done') {
                    const user = await User.findOne({ userId });
                    if (!user) return;

                    const headers = state.headers || {};
                    user.customHeaders = headers;
                    await user.save();

                    await bot.sendMessage(
                        userId,
                        `✅ **Headers saved!**\n${Object.keys(headers).length} headers modified.`,
                        { parse_mode: 'Markdown' }
                    );
                    global.userStates.delete(userId);
                    return;
                }

                if (text.includes(':')) {
                    const [key, ...valueParts] = text.split(':');
                    const headerKey = key.trim();
                    const headerValue = valueParts.join(':').trim();

                    if (!state.headers) state.headers = {};
                    state.headers[headerKey] = headerValue;
                    global.userStates.set(userId, state);

                    await bot.sendMessage(
                        userId,
                        `✅ **Header added:**\n\`${headerKey}\`: \`${headerValue}\`\n\n` +
                        `Send more or /done to finish.`,
                        { parse_mode: 'Markdown' }
                    );
                } else {
                    await bot.sendMessage(
                        userId,
                        '❌ **Invalid format.**\nUse `header_name: header_value`',
                        { parse_mode: 'Markdown' }
                    );
                }
                return;
            }

            // === Admin: Channel add ===
            if (adminState && adminState.step === 'channel_add') {
                const channelId = text?.trim();
                if (!channelId) {
                    return bot.sendMessage(userId, '❌ Please send a valid channel username.');
                }

                const result = await channelService.addChannel(channelId, channelId, userId);
                await bot.sendMessage(userId, result.message);
                global.adminStates.delete(userId);
                return;
            }

            // === Admin: Channel remove ===
            if (adminState && adminState.step === 'channel_remove') {
                const index = parseInt(text?.trim()) - 1;
                if (isNaN(index)) {
                    return bot.sendMessage(userId, '❌ Please send a valid number.');
                }

                const channels = await channelService.getChannels();
                if (index < 0 || index >= channels.length) {
                    return bot.sendMessage(userId, '❌ Invalid channel number.');
                }

                const result = await channelService.removeChannel(channels[index].channelId);
                await bot.sendMessage(userId, result.message);
                global.adminStates.delete(userId);
                return;
            }

            // === Admin: Broadcast text ===
            if (adminState && adminState.step === 'broadcast_text') {
                const message = text;
                if (!message) {
                    return bot.sendMessage(userId, '❌ Please send a message to broadcast.');
                }

                const progressMsg = await bot.sendMessage(
                    userId,
                    '📤 **Broadcasting...**\nSending to all users...',
                    { parse_mode: 'Markdown' }
                );

                try {
                    const users = await User.find({ isBanned: false });
                    let sent = 0;

                    for (const user of users) {
                        try {
                            await bot.sendMessage(
                                user.userId,
                                `📢 **BROADCAST**\n\n${message}`,
                                { parse_mode: 'Markdown' }
                            );
                            sent++;
                            // Rate limit
                            if (sent % 10 === 0) {
                                await new Promise(resolve => setTimeout(resolve, 100));
                            }
                        } catch (error) {
                            // User blocked or bot not allowed
                            continue;
                        }
                    }

                    await bot.editMessageText(
                        `✅ **Broadcast complete!**\n📤 Sent to ${sent} users.`,
                        {
                            chat_id: userId,
                            message_id: progressMsg.message_id,
                            parse_mode: 'Markdown'
                        }
                    );
                } catch (error) {
                    logger.error('Broadcast error:', error);
                    await bot.sendMessage(userId, '❌ Error during broadcast.');
                }

                global.adminStates.delete(userId);
                return;
            }

            // === Admin: Broadcast photo ===
            if (adminState && adminState.step === 'broadcast_photo' && msg.photo) {
                const photoId = msg.photo[msg.photo.length - 1].file_id;
                const caption = msg.caption || '📢 **BROADCAST**';

                const progressMsg = await bot.sendMessage(
                    userId,
                    '📤 **Broadcasting photo...**\nSending to all users...',
                    { parse_mode: 'Markdown' }
                );

                try {
                    const users = await User.find({ isBanned: false });
                    let sent = 0;

                    for (const user of users) {
                        try {
                            await bot.sendPhoto(
                                user.userId,
                                photoId,
                                { caption, parse_mode: 'Markdown' }
                            );
                            sent++;
                            if (sent % 10 === 0) {
                                await new Promise(resolve => setTimeout(resolve, 100));
                            }
                        } catch (error) {
                            continue;
                        }
                    }

                    await bot.editMessageText(
                        `✅ **Photo broadcast complete!**\n📤 Sent to ${sent} users.`,
                        {
                            chat_id: userId,
                            message_id: progressMsg.message_id,
                            parse_mode: 'Markdown'
                        }
                    );
                } catch (error) {
                    logger.error('Photo broadcast error:', error);
                    await bot.sendMessage(userId, '❌ Error during broadcast.');
                }

                global.adminStates.delete(userId);
                return;
            }

            // === Admin: Broadcast video ===
            if (adminState && adminState.step === 'broadcast_video' && msg.video) {
                const videoId = msg.video.file_id;
                const caption = msg.caption || '📢 **BROADCAST**';

                const progressMsg = await bot.sendMessage(
                    userId,
                    '📤 **Broadcasting video...**\nSending to all users...',
                    { parse_mode: 'Markdown' }
                );

                try {
                    const users = await User.find({ isBanned: false });
                    let sent = 0;

                    for (const user of users) {
                        try {
                            await bot.sendVideo(
                                user.userId,
                                videoId,
                                { caption, parse_mode: 'Markdown' }
                            );
                            sent++;
                            if (sent % 10 === 0) {
                                await new Promise(resolve => setTimeout(resolve, 100));
                            }
                        } catch (error) {
                            continue;
                        }
                    }

                    await bot.editMessageText(
                        `✅ **Video broadcast complete!**\n📤 Sent to ${sent} users.`,
                        {
                            chat_id: userId,
                            message_id: progressMsg.message_id,
                            parse_mode: 'Markdown'
                        }
                    );
                } catch (error) {
                    logger.error('Video broadcast error:', error);
                    await bot.sendMessage(userId, '❌ Error during broadcast.');
                }

                global.adminStates.delete(userId);
                return;
            }

            // === Admin: Scanner add ===
            if (adminState && adminState.step === 'scanner_add') {
                if (!global.scanners) global.scanners = [];
                global.scanners.push(text);
                await bot.sendMessage(userId, '✅ **Scanner added successfully!**');
                global.adminStates.delete(userId);
                return;
            }

            // === Admin: Scanner remove ===
            if (adminState && adminState.step === 'scanner_remove') {
                const index = parseInt(text?.trim()) - 1;
                if (isNaN(index) || !global.scanners || index < 0 || index >= global.scanners.length) {
                    return bot.sendMessage(userId, '❌ Invalid scanner number.');
                }

                global.scanners.splice(index, 1);
                await bot.sendMessage(userId, '✅ **Scanner removed successfully!**');
                global.adminStates.delete(userId);
                return;
            }

            // === Admin: Scanner headers ===
            if (adminState && adminState.step === 'scanner_headers') {
                try {
                    const headers = JSON.parse(text);
                    global.globalHeaders = headers;
                    await bot.sendMessage(
                        userId,
                        `✅ **Global headers updated!**\n${JSON.stringify(headers, null, 2)}`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (error) {
                    await bot.sendMessage(
                        userId,
                        '❌ **Invalid JSON format.**\nPlease send valid JSON.',
                        { parse_mode: 'Markdown' }
                    );
                }
                global.adminStates.delete(userId);
                return;
            }

            // === Admin: Payment coins ===
            if (adminState && adminState.step === 'pay_coins') {
                const amount = parseInt(text?.trim());
                if (isNaN(amount) || amount <= 0) {
                    return bot.sendMessage(userId, '❌ Please send a valid number.');
                }

                const targetUserId = adminState.target;
                const user = await User.findOne({ userId: targetUserId });
                if (!user) {
                    return bot.sendMessage(userId, '❌ User not found!');
                }

                user.credits += amount;
                await user.save();

                await bot.sendMessage(
                    userId,
                    `✅ **Added ${amount} credits to user \`${targetUserId}\`**\n💰 New balance: ${user.credits}`,
                    { parse_mode: 'Markdown' }
                );

                try {
                    await bot.sendMessage(
                        targetUserId,
                        `✅ **Payment Approved!**\n\n💰 **${amount} credits** added to your account.\n` +
                        `💳 New balance: ${user.credits}\n\nUse /bomb to start bombing!`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (error) {
                    logger.warn('Could not notify user:', error);
                }

                global.adminStates.delete(userId);
                return;
            }

            // === Payment screenshot handler ===
            if (msg.photo && !adminState) {
                // Check if user was waiting for payment screenshot
                // This would be handled by the buy command flow
                const photoId = msg.photo[msg.photo.length - 1].file_id;
                const caption = `🧾 **New Payment Request**\n👤 User: ${userId}\n💰 Credits: 100\n💵 Amount: ₹100\n\n✅ Accept / ❌ Not Accept`;

                for (const adminId of ADMIN_IDS) {
                    try {
                        const sentMsg = await bot.sendPhoto(adminId, photoId, {
                            caption,
                            parse_mode: 'Markdown'
                        });

                        // Add accept/reject buttons
                        const keyboard = {
                            inline_keyboard: [
                                [
                                    { text: '✅ Accept', callback_data: `pay_accept_${userId}` },
                                    { text: '❌ Not Accept', callback_data: `pay_reject_${userId}` }
                                ]
                            ]
                        };

                        await bot.editMessageCaption(caption, {
                            chat_id: adminId,
                            message_id: sentMsg.message_id,
                            parse_mode: 'Markdown',
                            reply_markup: keyboard
                        });
                    } catch (error) {
                        logger.error('Error sending payment to admin:', error);
                    }
                }

                await bot.sendMessage(
                    userId,
                    '✅ **Screenshot sent to admin!**\nPlease wait for approval.',
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            // Default response for non-command messages
            if (text && !text.startsWith('/')) {
                // Check if user is trying to start a bomb
                // Only respond if user is not in any state
                if (!state && !adminState) {
                    await bot.sendMessage(
                        userId,
                        '👋 Welcome! Use the buttons below to get started.\n\n' +
                        '💡 **Quick Commands:**\n' +
                        '/bomb - Start bombing\n' +
                        '/credits - Check credits\n' +
                        '/daily - Spin daily wheel\n' +
                        '/referral - Get referral link\n' +
                        '/settings - Modify scanner/headers',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: mainKeyboard
                        }
                    );
                }
            }

        } catch (error) {
            logger.error('Message handler error:', error);
            try {
                await bot.sendMessage(
                    userId,
                    '❌ An error occurred. Please try again or use /start.',
                    { parse_mode: 'Markdown' }
                );
            } catch (e) {
                // Ignore
            }
        }
    });

    // Handle photo messages for payment
    bot.on('photo', async (msg) => {
        // Already handled in the main message handler
    });

    // Handle video messages for broadcast
    bot.on('video', async (msg) => {
        // Already handled in the main message handler
    });
};

module.exports = { setupMessageHandlers };
