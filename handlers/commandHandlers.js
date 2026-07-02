const User = require('../models/User');
const ProtectedNumber = require('../models/ProtectedNumber');
const channelService = require('../services/channelService');
const referralService = require('../services/referralService');
const { mainKeyboard, adminKeyboard } = require('../keyboards/mainKeyboard');
const { ADMIN_IDS } = require('../config/constants');
const { hasUnlimitedPlan, formatDate } = require('../utils/helpers');
const logger = require('../utils/logger');

const setupCommandHandlers = (bot) => {
    
    // Start command
    bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
        const userId = msg.chat.id;
        const referralCode = match ? match[1] : null;

        try {
            // Check if user is banned
            const existingUser = await User.findOne({ userId });
            if (existingUser && existingUser.isBanned) {
                return bot.sendMessage(userId, '🚫 You are banned!');
            }

            // Create or update user
            let user = await User.findOne({ userId });
            if (!user) {
                user = new User({
                    userId,
                    username: msg.from.username || '',
                    firstName: msg.from.first_name || ''
                });
                await user.save();
                logger.info(`👤 New user: ${userId} (${user.firstName})`);
            } else {
                user.username = msg.from.username || user.username;
                user.firstName = msg.from.first_name || user.firstName;
                await user.save();
            }

            // Process referral if code provided
            let referralMessage = '';
            if (referralCode) {
                // Check if user joined channels
                const channelCheck = await channelService.checkUserChannels(bot, userId);
                if (!channelCheck.joined) {
                    const inlineKeyboard = {
                        inline_keyboard: [
                            ...channelCheck.missingChannels.map(ch => {
                                const button = {
                                    text: `📢 Join ${ch.channelId}`,
                                    url: `https://t.me/${ch.channelId.replace('@', '')}`
                                };
                                // Add color effect using emoji
                                return [{
                                    ...button,
                                    text: `🔵 ${button.text}`
                                }];
                            }),
                            [
                                {
                                    text: '✅ I Have Joined!',
                                    callback_data: `verify_channels_${referralCode}`
                                }
                            ]
                        ]
                    };

                    return bot.sendMessage(
                        userId,
                        `📢 **Please join our channels first to use referral!**\n\n` +
                        `After joining, click the verify button below.`,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: inlineKeyboard
                        }
                    );
                }

                // Process referral
                const result = await referralService.processReferral(userId, referralCode);
                if (result.success) {
                    referralMessage = `\n\n${result.message}`;
                } else {
                    referralMessage = `\n\n❌ ${result.message}`;
                }
            }

            // Generate referral link
            const botUsername = (await bot.getMe()).username;
            const userRefCode = user.referralCode;

            // Check channel status
            const channelCheck = await channelService.checkUserChannels(bot, userId);
            const channelStatus = channelCheck.joined ? '✅' : '❌';
            const channels = await channelService.getChannels();

            const welcomeMsg = 
                `👋 **Welcome ${user.firstName}!**\n\n` +
                `📺 **Channel Status:** ${channelStatus}\n` +
                `📋 **Required Channels:**\n${channelService.getChannelListMessage(channels)}\n\n` +
                `🔗 **Your Referral Code:** \`${userRefCode}\`\n` +
                `📤 **Share:** \`https://t.me/${botUsername}?start=${userRefCode}\`\n` +
                `💰 **Credits:** ${user.credits}\n` +
                `⭐ **Unlimited Plan:** ${hasUnlimitedPlan(user) ? 'Active ✅' : 'Inactive ❌'}\n\n` +
                `Use the buttons below to get started!${referralMessage}`;

            bot.sendMessage(userId, welcomeMsg, {
                parse_mode: 'Markdown',
                reply_markup: mainKeyboard
            });

        } catch (error) {
            logger.error('Start command error:', error);
            bot.sendMessage(userId, '❌ Error starting bot. Please try again.');
        }
    });

    // Bomb command
    bot.onText(/\/bomb/, async (msg) => {
        const userId = msg.chat.id;

        try {
            // Check channel join
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
                                text: '🔄 Check Again',
                                callback_data: 'check_channels_bomb'
                            }
                        ]
                    ]
                };

                return bot.sendMessage(
                    userId,
                    `📢 **Please join our channels first!**\n\n` +
                    `You need to join these channels to use the bot:\n` +
                    `${channelService.getChannelListMessage(channelCheck.missingChannels)}\n\n` +
                    `After joining, click "Check Again".`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: inlineKeyboard
                    }
                );
            }

            bot.sendMessage(userId, '📱 **Send the 10-digit phone number to bomb:**', {
                parse_mode: 'Markdown'
            });

            // Store state
            const state = { step: 'bomb_phone' };
            // Store in memory or use a more robust solution
            // For simplicity, we'll use a Map
            if (!global.userStates) global.userStates = new Map();
            global.userStates.set(userId, state);

        } catch (error) {
            logger.error('Bomb command error:', error);
            bot.sendMessage(userId, '❌ Error starting bombing. Please try again.');
        }
    });

    // Stop command
    bot.onText(/\/stop/, async (msg) => {
        const userId = msg.chat.id;
        
        try {
            // Stop bombing logic
            if (global.bombingSessions && global.bombingSessions[userId]) {
                global.bombingSessions[userId].stop = true;
                bot.sendMessage(userId, '⏹️ **Bombing stopped!**', { parse_mode: 'Markdown' });
            } else {
                bot.sendMessage(userId, '❌ No active bombing session.', { parse_mode: 'Markdown' });
            }
        } catch (error) {
            logger.error('Stop command error:', error);
            bot.sendMessage(userId, '❌ Error stopping bombing.');
        }
    });

    // Credits command
    bot.onText(/\/credits/, async (msg) => {
        const userId = msg.chat.id;

        try {
            const user = await User.findOne({ userId });
            if (!user) {
                return bot.sendMessage(userId, '❌ User not found. Use /start first.');
            }

            const unlimited = hasUnlimitedPlan(user);
            const message = 
                `💰 **Your Credits:** \`${user.credits}\`\n` +
                `${unlimited ? '⭐ **Unlimited Plan Active!**\n' : ''}` +
                `⚔️ **Total Attacks:** ${user.totalAttacks}\n\n` +
                `💡 **Bombing Costs:**\n` +
                `• 1-10 minutes: 1 credit per minute\n` +
                `• 11-60 minutes: 10 credits\n` +
                `• 1 Day Unlimited: 20 credits`;

            bot.sendMessage(userId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            logger.error('Credits command error:', error);
            bot.sendMessage(userId, '❌ Error checking credits.');
        }
    });

    // Daily command
    bot.onText(/\/daily/, async (msg) => {
        const userId = msg.chat.id;

        try {
            const user = await User.findOne({ userId });
            if (!user) {
                return bot.sendMessage(userId, '❌ User not found. Use /start first.');
            }

            const today = new Date();
            const lastDaily = user.lastDaily;

            if (lastDaily && lastDaily.toDateString() === today.toDateString()) {
                const nextDay = new Date(lastDaily);
                nextDay.setDate(nextDay.getDate() + 1);
                const timeLeft = nextDay - new Date();
                const hours = Math.floor(timeLeft / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                return bot.sendMessage(
                    userId,
                    `❌ You already claimed today's spin!\n` +
                    `Come back in ${hours}h ${minutes}m.`,
                    { parse_mode: 'Markdown' }
                );
            }

            // Spin wheel animation
            const spinMsg = await bot.sendMessage(
                userId,
                '🎡 **Spinning...**\n' +
                '⚙️ \u200b',
                { parse_mode: 'Markdown' }
            );

            // Simulate spin
            const spins = ['🎲 Rolling...', '⚙️ Spinning...', '🎡 Almost there...'];
            for (const spin of spins) {
                await new Promise(resolve => setTimeout(resolve, 300));
                await bot.editMessageText(
                    `🎡 **${spin}**\n` +
                    '⚙️ \u200b',
                    {
                        chat_id: userId,
                        message_id: spinMsg.message_id,
                        parse_mode: 'Markdown'
                    }
                );
            }

            // Generate random credits (1-10)
            const credits = Math.floor(Math.random() * 10) + 1;
            user.credits += credits;
            user.lastDaily = new Date();
            await user.save();

            await bot.editMessageText(
                `🎉 **You won ${credits} credits!**\n\n` +
                `💰 **New Balance:** ${user.credits}`,
                {
                    chat_id: userId,
                    message_id: spinMsg.message_id,
                    parse_mode: 'Markdown'
                }
            );

        } catch (error) {
            logger.error('Daily command error:', error);
            bot.sendMessage(userId, '❌ Error claiming daily reward.');
        }
    });

    // Referral command
    bot.onText(/\/referral/, async (msg) => {
        const userId = msg.chat.id;

        try {
            const user = await User.findOne({ userId });
            if (!user) {
                return bot.sendMessage(userId, '❌ User not found. Use /start first.');
            }

            // Check channel join
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
                                text: '🔄 Check Again',
                                callback_data: 'check_channels_referral'
                            }
                        ]
                    ]
                };

                return bot.sendMessage(
                    userId,
                    `📢 **Please join our channels first!**\n\n` +
                    `You need to join these channels to use referral:\n` +
                    `${channelService.getChannelListMessage(channelCheck.missingChannels)}`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: inlineKeyboard
                    }
                );
            }

            // Get referral stats
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
                `• **Cooldown:** ${process.env.REFERRAL_COOLDOWN || 60} seconds between referrals\n` +
                `• **Link:** \`https://t.me/${botUsername}?start=${user.referralCode}\`\n\n`;

            if (topReferrers.length > 0) {
                message += `🏆 **Top Referrers:**\n`;
                topReferrers.forEach((ref, index) => {
                    message += `${index + 1}. ${ref.username} - ${ref.count} referrals\n`;
                });
            } else {
                message += `🏆 **Top Referrers:**\nNo referrals yet. Be the first!`;
            }

            bot.sendMessage(userId, message, { parse_mode: 'Markdown' });

        } catch (error) {
            logger.error('Referral command error:', error);
            bot.sendMessage(userId, '❌ Error getting referral info.');
        }
    });

    // Settings command
    bot.onText(/\/settings/, async (msg) => {
        const userId = msg.chat.id;

        try {
            const user = await User.findOne({ userId });
            if (!user) {
                return bot.sendMessage(userId, '❌ User not found. Use /start first.');
            }

            const inlineKeyboard = {
                inline_keyboard: [
                    [
                        {
                            text: '📋 View Settings',
                            callback_data: 'settings_view'
                        }
                    ],
                    [
                        {
                            text: '🔍 Add Scanner',
                            callback_data: 'settings_scanner'
                        }
                    ],
                    [
                        {
                            text: '📝 Modify Headers',
                            callback_data: 'settings_headers'
                        }
                    ],
                    [
                        {
                            text: '🔙 Back',
                            callback_data: 'settings_back'
                        }
                    ]
                ]
            };

            bot.sendMessage(
                userId,
                '⚙️ **Settings Panel**\n\n' +
                'Manage your scanner bypass and custom headers.',
                {
                    parse_mode: 'Markdown',
                    reply_markup: inlineKeyboard
                }
            );

        } catch (error) {
            logger.error('Settings command error:', error);
            bot.sendMessage(userId, '❌ Error opening settings.');
        }
    });

    // Stats command (Admin only)
    bot.onText(/\/stats/, async (msg) => {
        const userId = msg.chat.id;

        if (!ADMIN_IDS.includes(userId.toString())) {
            return bot.sendMessage(userId, '❌ Admin only!');
        }

        try {
            const totalUsers = await User.countDocuments();
            const bannedUsers = await User.countDocuments({ isBanned: true });
            const totalCredits = await User.aggregate([
                { $group: { _id: null, total: { $sum: '$credits' } } }
            ]);
            const totalAttacks = await User.aggregate([
                { $group: { _id: null, total: { $sum: '$totalAttacks' } } }
            ]);
            const unlimitedUsers = await User.countDocuments({
                dailyUnlimited: { $gt: new Date() }
            });

            const channels = await channelService.getChannels();

            const message = 
                `📊 **BOT STATS**\n\n` +
                `👥 **Users:** ${totalUsers}\n` +
                `🚫 **Banned:** ${bannedUsers}\n` +
                `💰 **Total Credits:** ${totalCredits[0]?.total || 0}\n` +
                `⚔️ **Total Attacks:** ${totalAttacks[0]?.total || 0}\n` +
                `⭐ **Unlimited Users:** ${unlimitedUsers}\n` +
                `📺 **Channels:** ${channels.length}\n` +
                `📡 **APIs Loaded:** ${global.apisLoaded || 94}`;

            bot.sendMessage(userId, message, { parse_mode: 'Markdown' });

        } catch (error) {
            logger.error('Stats command error:', error);
            bot.sendMessage(userId, '❌ Error getting stats.');
        }
    });

    // Admin commands
    bot.onText(/\/admin/, async (msg) => {
        const userId = msg.chat.id;

        if (!ADMIN_IDS.includes(userId.toString())) {
            return bot.sendMessage(userId, '❌ Admin only!');
        }

        bot.sendMessage(userId, '👑 **Admin Panel**', {
            parse_mode: 'Markdown',
            reply_markup: adminKeyboard
        });
    });

    // Channel manager
    bot.onText(/\/channelmanager/, async (msg) => {
        const userId = msg.chat.id;

        if (!ADMIN_IDS.includes(userId.toString())) {
            return bot.sendMessage(userId, '❌ Admin only!');
        }

        const inlineKeyboard = {
            inline_keyboard: [
                [
                    {
                        text: '➕ Add Channel',
                        callback_data: 'channel_add'
                    }
                ],
                [
                    {
                        text: '➖ Remove Channel',
                        callback_data: 'channel_remove'
                    }
                ],
                [
                    {
                        text: '📋 View Channels',
                        callback_data: 'channel_view'
                    }
                ],
                [
                    {
                        text: '🔙 Back',
                        callback_data: 'admin_back'
                    }
                ]
            ]
        };

        bot.sendMessage(
            userId,
            '📺 **Channel Manager**\n\n' +
            'Manage required channels for referral/bot usage.',
            {
                parse_mode: 'Markdown',
                reply_markup: inlineKeyboard
            }
        );
    });

    // Scanner manager
    bot.onText(/\/scannermanager/, async (msg) => {
        const userId = msg.chat.id;

        if (!ADMIN_IDS.includes(userId.toString())) {
            return bot.sendMessage(userId, '❌ Admin only!');
        }

        const inlineKeyboard = {
            inline_keyboard: [
                [
                    {
                        text: '➕ Add Scanner',
                        callback_data: 'scanner_add'
                    }
                ],
                [
                    {
                        text: '➖ Remove Scanner',
                        callback_data: 'scanner_remove'
                    }
                ],
                [
                    {
                        text: '📋 View Scanners',
                        callback_data: 'scanner_view'
                    }
                ],
                [
                    {
                        text: '🔄 Global Headers',
                        callback_data: 'scanner_headers'
                    }
                ],
                [
                    {
                        text: '🔙 Back',
                        callback_data: 'admin_back'
                    }
                ]
            ]
        };

        bot.sendMessage(
            userId,
            '🛡️ **Scanner Manager**\n\n' +
            'Manage scanner bypass configurations.',
            {
                parse_mode: 'Markdown',
                reply_markup: inlineKeyboard
            }
        );
    });

    // Broadcast command
    bot.onText(/\/broadcast/, async (msg) => {
        const userId = msg.chat.id;

        if (!ADMIN_IDS.includes(userId.toString())) {
            return bot.sendMessage(userId, '❌ Admin only!');
        }

        const inlineKeyboard = {
            inline_keyboard: [
                [
                    {
                        text: '📝 Text',
                        callback_data: 'broadcast_text'
                    }
                ],
                [
                    {
                        text: '🖼️ Photo',
                        callback_data: 'broadcast_photo'
                    }
                ],
                [
                    {
                        text: '🎥 Video',
                        callback_data: 'broadcast_video'
                    }
                ],
                [
                    {
                        text: '🔙 Back',
                        callback_data: 'admin_back'
                    }
                ]
            ]
        };

        bot.sendMessage(
            userId,
            '📢 **Broadcast**\n\n' +
            'Send a message to all users.',
            {
                parse_mode: 'Markdown',
                reply_markup: inlineKeyboard
            }
        );
    });

    // Unlimited plan (Admin)
    bot.onText(/\/unlimited/, async (msg) => {
        const userId = msg.chat.id;

        if (!ADMIN_IDS.includes(userId.toString())) {
            return bot.sendMessage(userId, '❌ Admin only!');
        }

        bot.sendMessage(
            userId,
            '⭐ **Grant Unlimited Plan**\n\n' +
            'Send the user ID to grant 1-day unlimited bombing plan:\n' +
            `\`/grantunlimited 123456789\``,
            { parse_mode: 'Markdown' }
        );
    });

    bot.onText(/\/grantunlimited\s+(\d+)/, async (msg, match) => {
        const userId = msg.chat.id;

        if (!ADMIN_IDS.includes(userId.toString())) {
            return bot.sendMessage(userId, '❌ Admin only!');
        }

        const targetUserId = parseInt(match[1]);

        try {
            const user = await User.findOne({ userId: targetUserId });
            if (!user) {
                return bot.sendMessage(userId, '❌ User not found!');
            }

            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 1);
            user.dailyUnlimited = expiryDate;
            await user.save();

            bot.sendMessage(
                userId,
                `✅ Unlimited plan granted to user \`${targetUserId}\` for 24 hours!`,
                { parse_mode: 'Markdown' }
            );

            try {
                await bot.sendMessage(
                    targetUserId,
                    '⭐ **You\'ve been granted a 1-Day Unlimited Bombing Plan!**\n\n' +
                    'You can now bomb any number for FREE for the next 24 hours!\n' +
                    'Use /bomb to start bombing.',
                    { parse_mode: 'Markdown' }
                );
            } catch (error) {
                logger.warn(`Could not notify user ${targetUserId}:`, error);
            }

        } catch (error) {
            logger.error('Grant unlimited error:', error);
            bot.sendMessage(userId, '❌ Error granting unlimited plan.');
        }
    });

    // Buy command
    bot.onText(/\/buy/, async (msg) => {
        const userId = msg.chat.id;

        const message =
            `💸 **Buy 100 Credits**\n\n` +
            `💵 **Price:** ₹100\n` +
            `💳 **Credits:** 100\n\n` +
            `📱 **Scan QR Code & Pay:**\n` +
            `[QR Code Placeholder]\n\n` +
            `✅ After payment, send /paymentscreenshot`;

        bot.sendMessage(userId, message, { parse_mode: 'Markdown' });
    });

    // Payment screenshot
    bot.onText(/\/paymentscreenshot/, async (msg) => {
        const userId = msg.chat.id;

        bot.sendMessage(
            userId,
            '📸 **Please send your payment screenshot.**',
            { parse_mode: 'Markdown' }
        );
    });
};

module.exports = { setupCommandHandlers };
