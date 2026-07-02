const User = require('../models/User');
const channelService = require('../services/channelService');
const referralService = require('../services/referralService');
const { mainKeyboard, adminKeyboard } = require('../keyboards/mainKeyboard');
const { ADMIN_IDS } = require('../config/constants');
const logger = require('../utils/logger');

const setupCallbackHandlers = (bot) => {
    
    // Handle all callback queries
    bot.on('callback_query', async (callbackQuery) => {
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;
        const messageId = callbackQuery.message.message_id;
        const chatId = callbackQuery.message.chat.id;

        try {
            // Answer callback to remove loading state
            await bot.answerCallbackQuery(callbackQuery.id);

            // === Channel Verification ===
            if (data.startsWith('verify_channels_')) {
                const referralCode = data.split('_')[2];
                
                // Check if user joined channels
                const channelCheck = await channelService.checkUserChannels(bot, userId);
                
                if (!channelCheck.joined) {
                    const inlineKeyboard = {
                        inline_keyboard: [
                            ...channelCheck.missingChannels.map(ch => ({
                                text: `🔵 Join ${ch.channelId}`,
                                url: `https://t.me/${ch.channelId.replace('@', '')}`
                            })),
                            [
                                {
                                    text: '🔄 Try Again',
                                    callback_data: `verify_channels_${referralCode}`
                                }
                            ]
                        ]
                    };

                    return bot.editMessageText(
                        `❌ **You haven't joined all channels!**\n\n` +
                        `Please join these channels first:\n` +
                        `${channelService.getChannelListMessage(channelCheck.missingChannels)}\n\n` +
                        `After joining, click "Try Again".`,
                        {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: 'Markdown',
                            reply_markup: inlineKeyboard
                        }
                    );
                }

                // Process referral
                const result = await referralService.processReferral(userId, referralCode);
                
                const message = result.success
                    ? `✅ ${result.message}`
                    : `❌ ${result.message}`;

                return bot.editMessageText(
                    message,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [] }
                    }
                );
            }

            // === Check channels for bomb ===
            if (data === 'check_channels_bomb') {
                const channelCheck = await channelService.checkUserChannels(bot, userId);
                
                if (!channelCheck.joined) {
                    const inlineKeyboard = {
                        inline_keyboard: [
                            ...channelCheck.missingChannels.map(ch => ({
                                text: `🔵 Join ${ch.channelId}`,
                                url: `https://t.me/${ch.channelId.replace('@', '')}`
                            })),
                            [
                                {
                                    text: '🔄 Try Again',
                                    callback_data: 'check_channels_bomb'
                                }
                            ]
                        ]
                    };

                    return bot.editMessageText(
                        `❌ **You haven't joined all channels!**\n\n` +
                        `Please join these channels first:\n` +
                        `${channelService.getChannelListMessage(channelCheck.missingChannels)}`,
                        {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: 'Markdown',
                            reply_markup: inlineKeyboard
                        }
                    );
                }

                await bot.editMessageText(
                    `✅ **All channels joined!**\n\n` +
                    `📱 Send the 10-digit phone number to bomb:`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );

                // Store state
                if (!global.userStates) global.userStates = new Map();
                global.userStates.set(userId, { step: 'bomb_phone' });
            }

            // === Check channels for referral ===
            if (data === 'check_channels_referral') {
                const channelCheck = await channelService.checkUserChannels(bot, userId);
                
                if (!channelCheck.joined) {
                    const inlineKeyboard = {
                        inline_keyboard: [
                            ...channelCheck.missingChannels.map(ch => ({
                                text: `🔵 Join ${ch.channelId}`,
                                url: `https://t.me/${ch.channelId.replace('@', '')}`
                            })),
                            [
                                {
                                    text: '🔄 Try Again',
                                    callback_data: 'check_channels_referral'
                                }
                            ]
                        ]
                    };

                    return bot.editMessageText(
                        `❌ **You haven't joined all channels!**\n\n` +
                        `Please join these channels first:\n` +
                        `${channelService.getChannelListMessage(channelCheck.missingChannels)}`,
                        {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: 'Markdown',
                            reply_markup: inlineKeyboard
                        }
                    );
                }

                // Open referral
                const user = await User.findOne({ userId });
                const stats = await referralService.getReferralStats(userId);
                const topReferrers = await referralService.getTopReferrers(5);
                const botUsername = (await bot.getMe()).username;

                let message = 
                    `🔗 **Your Referral Code:** \`${user.referralCode}\`\n\n` +
                    `📊 **You have referred:** ${stats ? stats.totalReferrals : 0} users\n` +
                    `💰 **Earned:** ${stats ? stats.totalBonus : 0} credits\n\n` +
                    `**How it works:**\n` +
                    `• Share your code with friends\n` +
                    `• Both get ${process.env.REFERRAL_BONUS || 5} credits!\n` +
                    `• **Cooldown:** ${process.env.REFERRAL_COOLDOWN || 60} seconds\n` +
                    `• **Link:** \`https://t.me/${botUsername}?start=${user.referralCode}\`\n\n`;

                if (topReferrers.length > 0) {
                    message += `🏆 **Top Referrers:**\n`;
                    topReferrers.forEach((ref, index) => {
                        message += `${index + 1}. ${ref.username} - ${ref.count} referrals\n`;
                    });
                } else {
                    message += `🏆 **Top Referrers:**\nNo referrals yet. Be the first!`;
                }

                await bot.editMessageText(
                    message,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [] }
                    }
                );
            }

            // === Settings callbacks ===
            if (data === 'settings_view') {
                const user = await User.findOne({ userId });
                let message =
                    `📋 **Your Settings**\n\n` +
                    `🔍 **Scanner Enabled:** ${user.scannerEnabled ? '✅' : '❌'}\n` +
                    `🛡️ **Custom Headers:** ${user.customHeaders ? Object.keys(user.customHeaders).length : 0} modified\n\n`;

                if (user.customHeaders && Object.keys(user.customHeaders).length > 0) {
                    message += `**Custom Headers:**\n`;
                    for (const [key, value] of Object.entries(user.customHeaders)) {
                        message += `\`${key}\`: \`${value}\`\n`;
                    }
                } else {
                    message += `No custom headers set.`;
                }

                await bot.editMessageText(
                    message,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
            }

            if (data === 'settings_scanner') {
                await bot.editMessageText(
                    `🔍 **Scanner/Bypass Setup**\n\n` +
                    `Please send a description or code for scanner bypass.\n` +
                    `(You can add custom scanner bypass logic here)`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
                // Store state for scanner input
                if (!global.userStates) global.userStates = new Map();
                global.userStates.set(userId, { step: 'scanner_input' });
            }

            if (data === 'settings_headers') {
                await bot.editMessageText(
                    `📝 **Modify Headers**\n\n` +
                    `Send header modifications in format:\n` +
                    `\`header_name: header_value\`\n\n` +
                    `Send /done when finished.`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
                // Store state for headers
                if (!global.userStates) global.userStates = new Map();
                global.userStates.set(userId, { step: 'headers_input', headers: {} });
            }

            if (data === 'settings_back') {
                await bot.editMessageText(
                    `⚙️ **Settings Panel**\n\n` +
                    `Manage your scanner bypass and custom headers.`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
            }

            // === Admin callbacks ===
            if (data === 'admin_back') {
                await bot.editMessageText(
                    `👑 **Admin Panel**`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: adminKeyboard
                    }
                );
            }

            // === Channel manager callbacks ===
            if (data === 'channel_add') {
                await bot.editMessageText(
                    `📺 **Add Channel**\n\n` +
                    `Send channel username to add (e.g., @channelname):`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
                if (!global.adminStates) global.adminStates = new Map();
                global.adminStates.set(userId, { step: 'channel_add' });
            }

            if (data === 'channel_remove') {
                const channels = await channelService.getChannels();
                if (channels.length === 0) {
                    return bot.editMessageText(
                        `📭 **No channels to remove.**`,
                        {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: 'Markdown'
                        }
                    );
                }

                let message = `📺 **Channels:**\n\n`;
                channels.forEach((ch, index) => {
                    message += `${index + 1}. ${ch.channelId}\n`;
                });
                message += `\nSend channel number to remove:`;

                await bot.editMessageText(
                    message,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
                if (!global.adminStates) global.adminStates = new Map();
                global.adminStates.set(userId, { step: 'channel_remove' });
            }

            if (data === 'channel_view') {
                const channels = await channelService.getChannels();
                const message = channels.length > 0
                    ? `📺 **Required Channels:**\n\n${channelService.getChannelListMessage(channels)}`
                    : `📭 **No channels configured.**`;

                await bot.editMessageText(
                    message,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
            }

            // === Broadcast callbacks ===
            if (data === 'broadcast_text') {
                await bot.editMessageText(
                    `📝 **Text Broadcast**\n\n` +
                    `Send the text message to broadcast:`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
                if (!global.adminStates) global.adminStates = new Map();
                global.adminStates.set(userId, { step: 'broadcast_text' });
            }

            if (data === 'broadcast_photo') {
                await bot.editMessageText(
                    `🖼️ **Photo Broadcast**\n\n` +
                    `Send the photo with caption (optional):`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
                if (!global.adminStates) global.adminStates = new Map();
                global.adminStates.set(userId, { step: 'broadcast_photo' });
            }

            if (data === 'broadcast_video') {
                await bot.editMessageText(
                    `🎥 **Video Broadcast**\n\n` +
                    `Send the video with caption (optional):`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
                if (!global.adminStates) global.adminStates = new Map();
                global.adminStates.set(userId, { step: 'broadcast_video' });
            }

            // === Scanner manager callbacks ===
            if (data === 'scanner_add') {
                await bot.editMessageText(
                    `🛡️ **Add Scanner**\n\n` +
                    `Send scanner bypass data (JSON format or description):`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
                if (!global.adminStates) global.adminStates = new Map();
                global.adminStates.set(userId, { step: 'scanner_add' });
            }

            if (data === 'scanner_remove') {
                await bot.editMessageText(
                    `🛡️ **Remove Scanner**\n\n` +
                    `Send scanner number to remove:`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
                if (!global.adminStates) global.adminStates = new Map();
                global.adminStates.set(userId, { step: 'scanner_remove' });
            }

            if (data === 'scanner_view') {
                // Load scanners from config (simplified)
                const scanners = global.scanners || [];
                const message = scanners.length > 0
                    ? `🛡️ **Scanners:**\n\n${scanners.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                    : `📭 **No scanners configured.**`;

                await bot.editMessageText(
                    message,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
            }

            if (data === 'scanner_headers') {
                await bot.editMessageText(
                    `🔄 **Global Headers**\n\n` +
                    `Send global headers in JSON format:\n` +
                    `\`{"header1": "value1", "header2": "value2"}\``,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
                if (!global.adminStates) global.adminStates = new Map();
                global.adminStates.set(userId, { step: 'scanner_headers' });
            }

            // === Payment callbacks ===
            if (data.startsWith('pay_accept_')) {
                const payUserId = parseInt(data.split('_')[2]);
                if (!ADMIN_IDS.includes(userId.toString())) {
                    return bot.answerCallbackQuery(callbackQuery.id, '❌ Admin only!');
                }

                await bot.answerCallbackQuery(callbackQuery.id, '✅ Accepted!');
                await bot.editMessageCaption(
                    `✅ **Payment Accepted**\n👤 User: ${payUserId}\n\n` +
                    `Send the amount of credits to give (e.g., 100):`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
                if (!global.adminStates) global.adminStates = new Map();
                global.adminStates.set(userId, { step: 'pay_coins', target: payUserId });
            }

            if (data.startsWith('pay_reject_')) {
                const payUserId = parseInt(data.split('_')[2]);
                if (!ADMIN_IDS.includes(userId.toString())) {
                    return bot.answerCallbackQuery(callbackQuery.id, '❌ Admin only!');
                }

                await bot.answerCallbackQuery(callbackQuery.id, '❌ Rejected!');
                await bot.editMessageCaption(
                    `❌ **Payment Rejected**\n👤 User: ${payUserId}`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
                try {
                    await bot.sendMessage(payUserId, '❌ Your payment was rejected. Please contact admin.');
                } catch (error) {
                    logger.warn('Could not notify user:', error);
                }
            }

            // === Bomb duration selection ===
            if (data.startsWith('bomb_duration_')) {
                const duration = parseInt(data.split('_')[2]);
                
                // Get stored phone
                const state = global.userStates?.get(userId);
                if (!state || !state.phone) {
                    return bot.editMessageText(
                        '❌ **Session expired. Please start again with /bomb**',
                        {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: 'Markdown'
                        }
                    );
                }

                const phone = state.phone;
                const user = await User.findOne({ userId });
                const cost = calculateCost(duration);
                const isUnlimited = hasUnlimitedPlan(user);

                const confirmKeyboard = {
                    inline_keyboard: [
                        [
                            {
                                text: '✅ Confirm',
                                callback_data: `bomb_confirm_${duration}_${phone}`
                            }
                        ],
                        [
                            {
                                text: '❌ Cancel',
                                callback_data: 'bomb_cancel'
                            }
                        ]
                    ]
                };

                const costText = isUnlimited ? '⭐ UNLIMITED - FREE' : `${cost} credits`;

                await bot.editMessageText(
                    `📱 **Target:** \`${phone}\`\n` +
                    `⏱️ **Duration:** ${getDurationMessage(duration)}\n` +
                    `💰 **Cost:** ${costText}\n\n` +
                    `⚠️ Confirm to start bombing.`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: confirmKeyboard
                    }
                );
            }

            if (data === 'bomb_cancel') {
                await bot.editMessageText(
                    '❌ **Bombing cancelled.**',
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );
                if (global.userStates) global.userStates.delete(userId);
            }

            if (data.startsWith('bomb_confirm_')) {
                const parts = data.split('_');
                const duration = parseInt(parts[2]);
                const phone = parts[3];

                if (global.userStates) global.userStates.delete(userId);

                // Start bombing
                await bot.editMessageText(
                    `✅ **Bombing started!**\n📱 Target: \`${phone}\`\n⏱️ Duration: ${getDurationMessage(duration)}\n\n` +
                    `🔄 Bombing in progress... Use /stop to halt.`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown'
                    }
                );

                // Start bombing service
                // This would call the bombing service
                // For now, just acknowledge
                await bot.sendMessage(userId, '🚀 Bombing service starting...');
            }

            // === All users pagination ===
            if (data.startsWith('allusers_')) {
                const page = parseInt(data.split('_')[1]);
                // Simplified: would need actual pagination
                const users = await User.find({}).skip(page * 15).limit(15);
                let message = '👥 **ALL USERS**\n\n';
                users.forEach((user, index) => {
                    const unlimited = hasUnlimitedPlan(user);
                    message += `${page * 15 + index + 1}. \`${user.userId}\` | ${user.username || 'No username'} | 💰 ${user.credits} ${unlimited ? '⭐' : ''}\n`;
                });

                const inlineKeyboard = {
                    inline_keyboard: []
                };
                if (page > 0) {
                    inlineKeyboard.inline_keyboard.push([
                        { text: '◀️ Prev', callback_data: `allusers_${page - 1}` }
                    ]);
                }
                // Check if more users exist
                const nextUsers = await User.find({}).skip((page + 1) * 15).limit(1);
                if (nextUsers.length > 0) {
                    inlineKeyboard.inline_keyboard.push([
                        { text: 'Next ▶️', callback_data: `allusers_${page + 1}` }
                    ]);
                }

                await bot.editMessageText(
                    message,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: inlineKeyboard
                    }
                );
            }

        } catch (error) {
            logger.error('Callback handler error:', error);
            try {
                await bot.answerCallbackQuery(callbackQuery.id, '❌ Error processing request.');
            } catch (e) {
                // Ignore
            }
        }
    });
};

module.exports = { setupCallbackHandlers };
