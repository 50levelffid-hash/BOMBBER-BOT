// ============================================================
// bot.js – Main Telegram Bot with ALL Features + Load Balancer
// ============================================================

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const express = require('express');

// ============================================================
// ===== CONFIGURATION =====
// ============================================================

const BOT_TOKEN = "8212356485:AAGeN3peo9uHPG8eCLFRuWjs12hCVC-jNs4";
const ADMIN_IDS = [6346250222];

// ===== API URLS (YOUR 4 RENDER INSTANCES) =====
// In dono URLs ko apne actual Render URLs se replace karein
const API_URLS = {
    api1: 'https://api-server-padj.onrender.com',  // API Server 1
    api2: 'https://api-server-fy8w.onrender.com',  // API Server 2
    api3: 'https://api-server-mey8.onrender.com',  // API Server 3
    api4: 'https://api-server-0abv.onrender.com'   // API Server 4
};

const MONGODB_URL = "mongodb+srv://sahajada07:Sahajada123@cluster0.vynn0ht.mongodb.net/?appName=Cluster0";
const DB_NAME = "otp_bomber";

// ============================================================
// ===== MONGODB CONNECTION =====
// ============================================================

mongoose.connect(MONGODB_URL, {
    dbName: DB_NAME,
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// ============================================================
// ===== DATABASE SCHEMAS =====
// ============================================================

const userSchema = new mongoose.Schema({
    _id: { type: Number, required: true },
    username: { type: String, default: '' },
    first_name: { type: String, default: '' },
    credits: { type: Number, default: 10 },
    total_attacks: { type: Number, default: 0 },
    last_daily: { type: Number, default: 0 },
    daily_unlimited: { type: Number, default: 0 },
    bomb_sessions: { type: Array, default: [] },
    pending_ref_code: { type: String, default: null },
    referrer: { type: Number, default: null },
    referral_code: { type: String, default: null },
    referrals: { type: Array, default: [] },
    last_ref_used: { type: Number, default: 0 },
    scanner_enabled: { type: Boolean, default: false },
    custom_headers: { type: Object, default: {} },
    banned: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);

const protectedSchema = new mongoose.Schema({
    numbers: { type: Array, default: [] }
});
const Protected = mongoose.model('Protected', protectedSchema);

const redeemSchema = new mongoose.Schema({
    code: { type: String, unique: true },
    amount: { type: Number },
    used: { type: Boolean, default: false },
    used_by: { type: Number, default: null },
    created_at: { type: Date, default: Date.now }
});
const Redeem = mongoose.model('Redeem', redeemSchema);

const channelSchema = new mongoose.Schema({
    channels: { type: Array, default: [] }
});
const Channel = mongoose.model('Channel', channelSchema);

const scannerSchema = new mongoose.Schema({
    scanners: { type: Array, default: [] },
    global_headers: { type: Object, default: {} }
});
const ScannerConfig = mongoose.model('ScannerConfig', scannerSchema);

// ============================================================
// ===== DATABASE FUNCTIONS =====
// ============================================================

async function getUser(id) {
    let user = await User.findById(id);
    if (!user) {
        user = new User({ _id: id });
        await user.save();
    }
    return user;
}

async function updateCredits(id, amount) {
    const user = await getUser(id);
    user.credits = Math.max(0, user.credits + amount);
    await user.save();
    return user.credits;
}

async function banUser(id) {
    const user = await getUser(id);
    user.banned = true;
    await user.save();
}

async function unbanUser(id) {
    const user = await getUser(id);
    user.banned = false;
    await user.save();
}

async function isBanned(id) {
    const user = await getUser(id);
    return user.banned || false;
}

async function getProtected() {
    let doc = await Protected.findOne();
    if (!doc) {
        doc = new Protected({ numbers: [] });
        await doc.save();
    }
    return doc.numbers;
}

async function addProtected(number) {
    let doc = await Protected.findOne();
    if (!doc) {
        doc = new Protected({ numbers: [] });
    }
    if (!doc.numbers.includes(number)) {
        doc.numbers.push(number);
        await doc.save();
    }
}

async function removeProtected(number) {
    let doc = await Protected.findOne();
    if (doc) {
        doc.numbers = doc.numbers.filter(n => n !== number);
        await doc.save();
    }
}

async function createRedeemCode(code, amount) {
    const redeem = new Redeem({ code, amount });
    await redeem.save();
    return code;
}

async function getRedeemCode(code) {
    const doc = await Redeem.findOne({ code, used: false });
    if (doc) {
        doc.used = true;
        await doc.save();
        return doc.amount;
    }
    return null;
}

async function getChannels() {
    let doc = await Channel.findOne();
    if (!doc) {
        doc = new Channel({ channels: [] });
        await doc.save();
    }
    return doc.channels;
}

async function addChannel(channel) {
    let doc = await Channel.findOne();
    if (!doc) {
        doc = new Channel({ channels: [] });
    }
    if (!doc.channels.includes(channel)) {
        doc.channels.push(channel);
        await doc.save();
    }
}

async function removeChannel(channel) {
    let doc = await Channel.findOne();
    if (doc) {
        doc.channels = doc.channels.filter(c => c !== channel);
        await doc.save();
    }
}

async function getScannerConfig() {
    let doc = await ScannerConfig.findOne();
    if (!doc) {
        doc = new ScannerConfig({ scanners: [], global_headers: {} });
        await doc.save();
    }
    return doc;
}

async function addScanner(data) {
    const doc = await getScannerConfig();
    doc.scanners.push(data);
    await doc.save();
}

async function removeScanner(index) {
    const doc = await getScannerConfig();
    doc.scanners.splice(index, 1);
    await doc.save();
}

async function setGlobalHeaders(headers) {
    const doc = await getScannerConfig();
    doc.global_headers = headers;
    await doc.save();
}

async function generateReferralCode(userId) {
    const user = await getUser(userId);
    if (!user.referral_code) {
        user.referral_code = Math.random().toString(36).substring(2, 8).toUpperCase();
        await user.save();
    }
    return user.referral_code;
}

async function processReferral(userId, code) {
    const referrer = await User.findOne({ referral_code: code });
    if (!referrer) return { success: false, msg: 'Invalid referral code!' };
    if (referrer._id === userId) return { success: false, msg: 'You cannot refer yourself!' };
    
    const user = await getUser(userId);
    if (user.referrer) return { success: false, msg: 'You already used a referral code!' };
    
    const now = Date.now() / 1000;
    if (user.last_ref_used && user.last_ref_used > now - 60) {
        return { success: false, msg: 'Wait 1 minute before using referral!' };
    }
    
    user.referrer = referrer._id;
    user.last_ref_used = now;
    await user.save();
    
    await updateCredits(userId, 5);
    await updateCredits(referrer._id, 5);
    
    if (!referrer.referrals) referrer.referrals = [];
    referrer.referrals.push(userId);
    await referrer.save();
    
    return { success: true, msg: '✅ You got 5 credits! Your referrer also got 5 credits!' };
}

async function getReferralData(userId) {
    const user = await getUser(userId);
    return {
        code: user.referral_code || null,
        count: user.referrals ? user.referrals.length : 0
    };
}

async function isJoined(chatId, bot) {
    const channels = await getChannels();
    if (channels.length === 0) return true;
    
    for (const channel of channels) {
        try {
            const member = await bot.getChatMember(channel, chatId);
            if (member.status === 'left' || member.status === 'kicked') {
                return false;
            }
        } catch (e) {
            return false;
        }
    }
    return true;
}

// ============================================================
// ===== MEMORY MANAGEMENT =====
// ============================================================

const MEMORY_LIMIT = 400;
let lastGCTime = Date.now();

function checkMemory() {
    const now = Date.now();
    if (now - lastGCTime < 30000) return;
    lastGCTime = now;
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    if (used > MEMORY_LIMIT) {
        console.log(`⚠️ Memory high (${used.toFixed(1)}MB), running GC...`);
        if (global.gc) global.gc();
    }
}

// ===== ERROR HANDLING =====
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ============================================================
// ===== LOAD BALANCER =====
// ============================================================

let apiCycleCounter = 0;
const API_NAMES = ['api1', 'api2', 'api3', 'api4'];

function getApiForDuration(duration, cycleCount) {
    // 1 minute: ALL APIs simultaneously for max speed    if (duration <= 1) {
        return ['api1', 'api2', 'api3', 'api4'];
    }
    // 2-5 minutes: API 1
    if (duration <= 5) {
        return ['api1'];
    }
    // 5-10 minutes: API 2
    if (duration <= 10) {
        return ['api2'];
    }
    // 10-60 minutes: API 3
    if (duration <= 60) {
        return ['api3'];
    }
    // Fallback: Round-robin
    return [API_NAMES[cycleCount % 4]];
}

// ============================================================
// ===== STATUS MAPS =====
// ============================================================

const bombingStatus = new Map();
const userStates = new Map();
const pendingPayments = new Map();
const pendingScreenshots = new Map();
const adminBroadcastState = new Map();

// ===== QR CODE PATH =====
let qrCodePath = path.join(__dirname, 'qr_code.jpg');
let qrCodeSet = false;

// ============================================================
// ===== BOMBING ENGINE WITH LOAD BALANCER =====
// ============================================================

async function sendBombRequest(apiName, phone, duration) {
    const url = API_URLS[apiName];
    if (!url) return null;
    
    try {
        const response = await axios.post(`${url}/bomb`, {
            phone,
            duration,
            instance: apiName
        }, { timeout: 5000 });
        return response.data;
    } catch (error) {
        return null;
    }
}

async function runBomber(chatId, phone, durationMinutes) {
    const protectedList = await getProtected();
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

    const user = await getUser(chatId);
    const isUnlimited = user.daily_unlimited > Date.now() / 1000;

    if (!isUnlimited) {
        const cost = getBombCost(durationMinutes);
        if (!ADMIN_IDS.includes(Number(chatId)) && user.credits < cost) {
            bot.sendMessage(chatId, `❌ Insufficient credits! Need ${cost} credits for ${getDurationText(durationMinutes)}.`);
            bombingStatus.set(chatId, false);
            return;
        }
        await updateCredits(chatId, -cost);
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
        `⚔️ **BOMBING STARTED**\n📱 Target: \`${phone}\`\n⏱️ Duration: ${durationText}\n🔁 Using distributed API network...\n${isUnlimited ? '⭐ UNLIMITED PLAN ACTIVE' : `💳 Cost: ${getBombCost(durationMinutes)} credits`}`,
        { parse_mode: 'Markdown' }
    );

    let totalSent = 0;
    let smsCount = 0, callCount = 0, whatsappCount = 0;
    let lastUpdate = Date.now();
    const updateInterval = 1000;
    const startTime = Date.now() / 1000;
    const endTime = startTime + (durationMinutes === 1440 ? 86400 : durationMinutes * 60);
    let cycleCount = 0;

    while (bombingStatus.get(chatId)) {
        if (!isUnlimited && Date.now() / 1000 >= endTime) break;
        checkMemory();
        
        const apisToUse = getApiForDuration(durationMinutes, cycleCount);
        
        const promises = apisToUse.map(apiName => sendBombRequest(apiName, phone, durationMinutes));
        const results = await Promise.allSettled(promises);
        
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value && result.value.success) {
                const data = result.value;
                totalSent += data.totalSent || 0;
                smsCount += data.sms || 0;
                callCount += data.calls || 0;
                whatsappCount += data.whatsapp || 0;
            }
        }
        
        cycleCount++;
        apiCycleCounter++;

        const now = Date.now();
        if (now - lastUpdate >= updateInterval) {
            lastUpdate = now;
            const timeLeft = isUnlimited ? '∞' : Math.floor(endTime - now / 1000);
            const timeLeftText = typeof timeLeft === 'number' ? `${Math.floor(timeLeft/60)}m ${timeLeft%60}s` : '∞';
            try {
                await bot.editMessageText(
                    `⚔️ **BOMBING IN PROGRESS**\n📱 Target: \`${phone}\`\n⏱️ Time Left: ${timeLeftText}\n📨 SMS: ${smsCount}\n📞 Calls: ${callCount}\n📱 WA: ${whatsappCount}\n🔄 Cycles: ${cycleCount}\n🌐 API: ${apisToUse.join('+')}\n\n🔴 Use /stop to halt`,
                    { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' }
                );
            } catch (e) {}
        }

        await new Promise(r => setTimeout(r, 50));
    }

    bombingStatus.set(chatId, false);
    const finalStatus = bombingStatus.get(chatId) === false ? 'STOPPED' : 'COMPLETED';
    await bot.editMessageText(
        `✅ **BOMBING ${finalStatus}**\n📱 Target: \`${phone}\`\n📨 SMS: ${smsCount}\n📞 Calls: ${callCount}\n📱 WA: ${whatsappCount}\n🔄 Total Cycles: ${cycleCount}\n\n🟢 Use /bomb to start again`,
        { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' }
    );

    const updatedUser = await getUser(chatId);
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

function getBombCost(minutes) {
    if (minutes === 1440) return 100;
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

// ============================================================
// ===== KEYBOARDS =====
// ============================================================

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
                ['📸 SET QR CODE', '💳 PAYMENT APPROVAL'],
                ['🔙 BACK']
            ],
            resize_keyboard: true
        }
    };
}

// ============================================================
// ===== CHANNEL BUTTONS =====
// ============================================================

async function getChannelButtons() {
    const channels = await getChannels();
    const buttons = channels.map(ch => {
        return [{ text: `✅ ${ch}`, url: `https://t.me/${ch.replace('@', '')}` }];
    });
    buttons.push([{ text: '🟢 I have joined all channels', callback_data: 'verify_join' }]);
    return { inline_keyboard: buttons };
}

// ============================================================
// ===== PAYMENT SYSTEM =====
// ============================================================

const PAYMENT_PLANS = {
    '10': { credits: 10, price: 20, label: '10 Credits – ₹20' },
    '25': { credits: 25, price: 40, label: '25 Credits – ₹40' },
    '50': { credits: 50, price: 70, label: '50 Credits – ₹70' },
    '100': { credits: 100, price: 120, label: '100 Credits – ₹120' },
    'unlimited': { credits: 0, price: 150, label: '⭐ 1 Day Unlimited – ₹150' }
};

async function handleBuyCredits(chatId, planKey) {
    const plan = PAYMENT_PLANS[planKey];
    if (!plan) return bot.sendMessage(chatId, '❌ Invalid plan!');

    if (!qrCodeSet) {
        return bot.sendMessage(chatId, '❌ Payment QR code not configured yet. Please contact admin.');
    }

    const caption = `💳 **${plan.label}**\n\n` +
        `📌 **Instructions:**\n` +
        `1️⃣ Scan the QR code below\n` +
        `2️⃣ Pay ₹${plan.price} via UPI\n` +
        `3️⃣ Take a screenshot of payment\n` +
        `4️⃣ Send screenshot here\n\n` +
        `📸 **After payment, send screenshot!**`;

    try {
        await bot.sendPhoto(chatId, qrCodePath, { 
            caption: caption,
            parse_mode: 'Markdown'
        });

        const payId = Math.random().toString(36).substring(2, 10);
        pendingPayments.set(chatId, { ...plan, payId, status: 'pending', timestamp: Date.now() });
        userStates.set(chatId, { state: 'payment_screenshot', plan: planKey, payId });
        
    } catch (error) {
        bot.sendMessage(chatId, `❌ Failed to send QR code. Please try again.`);
    }
}

async function handlePaymentScreenshot(chatId, msg) {
    const state = userStates.get(chatId);
    if (!state || state.state !== 'payment_screenshot') return;

    if (!msg.photo) {
        return bot.sendMessage(chatId, '📸 Please send a **screenshot** of your payment.');
    }

    const planKey = state.plan;
    const plan = PAYMENT_PLANS[planKey];
    const payId = state.payId;

    const photo = msg.photo[msg.photo.length - 1];
    const file = await bot.getFile(photo.file_id);
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    pendingScreenshots.set(payId, {
        userId: chatId,
        username: msg.from.username || 'No username',
        first_name: msg.from.first_name || 'No name',
        plan: planKey,
        credits: plan.credits,
        price: plan.price,
        photoUrl: url,
        fileId: photo.file_id,
        timestamp: Date.now(),
        status: 'pending'
    });

    const adminMsg = `📸 **New Payment Screenshot!**\n\n` +
        `👤 User: ${msg.from.first_name} (@${msg.from.username || 'No username'})\n` +
        `🆔 User ID: \`${chatId}\`\n` +
        `💳 Plan: ${plan.label}\n` +
        `💰 Amount: ₹${plan.price}\n` +
        `🆔 Pay ID: \`${payId}\`\n\n` +
        `Approve or Reject:`;

    const approvalKeyboard = {
        inline_keyboard: [
            [
                { text: '✅ Approve', callback_data: `approve_pay_${payId}` },
                { text: '❌ Reject', callback_data: `reject_pay_${payId}` }
            ]
        ]
    };

    for (const adminId of ADMIN_IDS) {
        try {
            await bot.sendPhoto(adminId, photo.file_id, {
                caption: adminMsg,
                parse_mode: 'Markdown',
                reply_markup: approvalKeyboard
            });
        } catch (e) {
            console.error(`Failed to send to admin ${adminId}:`, e.message);
        }
    }

    await bot.sendMessage(chatId, 
        `✅ **Payment screenshot received!**\n\n` +
        `⏳ Waiting for admin approval...\n` +
        `📱 Plan: ${plan.label}\n` +
        `💳 Amount: ₹${plan.price}\n\n` +
        `You will receive credits once approved.`
    );

    userStates.delete(chatId);
}

// ============================================================
// ===== QR CODE SET HANDLER =====
// ============================================================

async function handleSetQRCode(chatId, msg) {
    if (!ADMIN_IDS.includes(Number(chatId))) {
        return bot.sendMessage(chatId, '❌ Admin only!');
    }

    if (!msg.photo) {
        return bot.sendMessage(chatId, '📸 **Please send a photo to set as QR code.**\n\nSend any image that will be shown to users when they buy credits.', { parse_mode: 'Markdown' });
    }

    try {
        const photo = msg.photo[msg.photo.length - 1];
        const file = await bot.getFile(photo.file_id);
        const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        
        const response = await axios({ url, responseType: 'stream' });
        const writer = fs.createWriteStream(qrCodePath);
        response.data.pipe(writer);
        
        writer.on('finish', () => {
            qrCodeSet = true;
            bot.sendMessage(chatId, '✅ **QR Code saved successfully!**\n\nUsers will now see this QR code when buying credits.', { parse_mode: 'Markdown' });
        });
        
        writer.on('error', (err) => {
            bot.sendMessage(chatId, `❌ Failed to save QR code: ${err.message}`);
        });
        
        userStates.delete(chatId);
        
    } catch (error) {
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
}

// ============================================================
// ===== BROADCAST SYSTEM =====
// ============================================================

async function handleBroadcast(chatId, msg) {
    try {
        const users = await User.find().select('_id');
        const totalUsers = users.length;
        
        if (totalUsers === 0) {
            return bot.sendMessage(chatId, '❌ No users found in database!');
        }
        
        const processingMsg = await bot.sendMessage(
            chatId,
            `📢 **Broadcasting to ${totalUsers} users...**\n\n⏳ Please wait...`,
            { parse_mode: 'Markdown' }
        );
        
        let messageType = 'text';
        let mediaId = null;
        let caption = msg.caption || '';
        let text = msg.text || '';
        
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
        } else if (msg.text) {
            messageType = 'text';
            text = msg.text;
        }
        
        let success = 0, fail = 0, blocked = 0, invalid = 0;
        const startTime = Date.now();
        const BATCH_SIZE_BROADCAST = 5;
        
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const targetId = user._id;
            
            try {
                switch (messageType) {
                    case 'text':
                        await bot.sendMessage(targetId, 
                            `📢 **BROADCAST**\n\n${text}`, 
                            { parse_mode: 'Markdown', disable_web_page_preview: true, timeout: 10000 }
                        );
                        break;
                    case 'photo':
                        await bot.sendPhoto(targetId, mediaId, { 
                            caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**',
                            parse_mode: 'Markdown', timeout: 10000
                        });
                        break;
                    case 'video':
                        await bot.sendVideo(targetId, mediaId, { 
                            caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**',
                            parse_mode: 'Markdown', timeout: 10000
                        });
                        break;
                    case 'document':
                        await bot.sendDocument(targetId, mediaId, { 
                            caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**',
                            parse_mode: 'Markdown', timeout: 10000
                        });
                        break;
                    case 'audio':
                        await bot.sendAudio(targetId, mediaId, { 
                            caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**',
                            parse_mode: 'Markdown', timeout: 10000
                        });
                        break;
                    case 'voice':
                        await bot.sendVoice(targetId, mediaId, { 
                            caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**',
                            parse_mode: 'Markdown', timeout: 10000
                        });
                        break;
                    case 'sticker':
                        await bot.sendSticker(targetId, mediaId, { timeout: 10000 });
                        break;
                    case 'animation':
                        await bot.sendAnimation(targetId, mediaId, { 
                            caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**',
                            parse_mode: 'Markdown', timeout: 10000
                        });
                        break;
                    default:
                        await bot.sendMessage(targetId, `📢 **BROADCAST**\n\nPlease check the channel for updates.`, { parse_mode: 'Markdown' });
                }
                success++;
            } catch (error) {
                const errorMsg = error.message || '';
                if (errorMsg.includes('bot was blocked') || errorMsg.includes('blocked')) {
                    blocked++;
                } else if (errorMsg.includes('chat not found') || errorMsg.includes('user not found')) {
                    invalid++;
                } else {
                    fail++;
                }
            }
            
            if ((i + 1) % BATCH_SIZE_BROADCAST === 0 || i === users.length - 1) {
                const processed = i + 1;
                const progress = Math.round((processed / totalUsers) * 100);
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                
                try {
                    await bot.editMessageText(
                        `📢 **BROADCASTING...**\n\n` +
                        `📊 Total Users: ${totalUsers}\n` +
                        `✅ Success: ${success}\n` +
                        `❌ Failed: ${fail}\n` +
                        `🚫 Blocked: ${blocked}\n` +
                        `❓ Invalid: ${invalid}\n` +
                        `⏳ Progress: ${progress}%\n` +
                        `⏱️ Elapsed: ${elapsed}s\n` +
                        `📎 Type: ${messageType.toUpperCase()}`,
                        { chat_id: chatId, message_id: processingMsg.message_id, parse_mode: 'Markdown' }
                    );
                } catch (e) {}
            }
            
            await new Promise(r => setTimeout(r, 50));
        }
        
        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        
        await bot.editMessageText(
            `✅ **BROADCAST COMPLETED!**\n\n` +
            `📊 Total Users: ${totalUsers}\n` +
            `✅ Success: ${success}\n` +
            `❌ Failed: ${fail}\n` +
            `🚫 Blocked: ${blocked}\n` +
            `❓ Invalid IDs: ${invalid}\n` +
            `⏱️ Time Taken: ${totalTime}s\n` +
            `📎 Message Type: ${messageType.toUpperCase()}`,
            { chat_id: chatId, message_id: processingMsg.message_id, parse_mode: 'Markdown' }
        );
        
    } catch (error) {
        console.error('Broadcast error:', error);
        bot.sendMessage(chatId, `❌ Broadcast failed: ${error.message}`);
    } finally {
        adminBroadcastState.delete(chatId);
    }
}

// ============================================================
// ===== COMMAND HANDLERS =====
// ============================================================

// /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const args = msg.text.split(' ');
    const refCode = args.length > 1 ? args[1] : null;

    if (await isBanned(chatId)) {
        bot.sendMessage(chatId, '🚫 You are banned!');
        return;
    }

    const user = await getUser(chatId);
    user.username = msg.from.username || '';
    user.first_name = msg.from.first_name || '';
    await user.save();

    if (refCode) {
        user.pending_ref_code = refCode;
        await user.save();
    }

    const joined = await isJoined(chatId, bot);
    if (!joined) {
        const channels = await getChannels();
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
    const user = await getUser(chatId);
    if (user.pending_ref_code) {
        const result = await processReferral(chatId, user.pending_ref_code);
        bot.sendMessage(chatId, result.success ? `🎉 ${result.msg}` : `❌ ${result.msg}`);
        user.pending_ref_code = null;
        await user.save();
    }
    const code = await generateReferralCode(chatId);
    const botInfo = await bot.getMe();
    const welcome = `👋 Welcome!\n\n🔗 Your Referral Code: \`${code}\`\n📤 Share: \`https://t.me/${botInfo.username}?start=${code}\`\n\nUse the buttons below!`;
    bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown', ...mainKeyboard() });
}

// ============================================================
// ===== MESSAGE HANDLER =====
// ============================================================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (await isBanned(chatId)) return bot.sendMessage(chatId, '🚫 You are banned!');

    const user = await getUser(chatId);

    // ===== SMART BROADCAST =====
    if (adminBroadcastState.has(chatId) && ADMIN_IDS.includes(Number(chatId))) {
        const state = adminBroadcastState.get(chatId);
        if (state && state.active) {
            if (text === '/cancel' || text === 'Cancel' || text === '❌ Cancel') {
                adminBroadcastState.delete(chatId);
                return bot.sendMessage(chatId, '❌ Broadcast cancelled.');
            }
            await handleBroadcast(chatId, msg);
            return;
        }
    }

    // ===== PAYMENT SCREENSHOT =====
    const state = userStates.get(chatId);
    if (state && state.state === 'payment_screenshot' && msg.photo) {
        await handlePaymentScreenshot(chatId, msg);
        return;
    }

    // ===== ADMIN: SET QR CODE =====
    if (text === '📸 SET QR CODE') {
        if (!ADMIN_IDS.includes(Number(chatId))) {
            return bot.sendMessage(chatId, '❌ Admin only!');
        }
        bot.sendMessage(chatId, '📸 **Send QR Code Photo**\n\nSend a photo to set as payment QR code.', { parse_mode: 'Markdown' });
        userStates.set(chatId, { state: 'set_qr' });
        return;
    }

    if (state && state.state === 'set_qr' && msg.photo) {
        await handleSetQRCode(chatId, msg);
        return;
    }

    // ===== ADMIN: PAYMENT APPROVAL =====
    if (text === '💳 PAYMENT APPROVAL') {
        if (!ADMIN_IDS.includes(Number(chatId))) {
            return bot.sendMessage(chatId, '❌ Admin only!');
        }

        const pending = Array.from(pendingScreenshots.values()).filter(p => p.status === 'pending');
        
        if (pending.length === 0) {
            return bot.sendMessage(chatId, '📭 No pending payments.');
        }

        let msgText = `💳 **Pending Payments** (${pending.length})\n\n`;
        for (const p of pending) {
            msgText += `👤 ${p.first_name} (@${p.username})\n`;
            msgText += `💳 ${p.plan} - ₹${p.price}\n`;
            msgText += `🆔 \`${p.payId}\`\n\n`;
        }
        bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
        return;
    }

    // ===== BUY CREDITS =====
    if (text === '💳 BUY CREDITS') {
        const keyboard = {
            inline_keyboard: [
                [{ text: '10 Credits – ₹20', callback_data: 'buy_10' }],
                [{ text: '25 Credits – ₹40', callback_data: 'buy_25' }],
                [{ text: '50 Credits – ₹70', callback_data: 'buy_50' }],
                [{ text: '100 Credits – ₹120', callback_data: 'buy_100' }],
                [{ text: '⭐ 1 Day Unlimited – ₹150', callback_data: 'buy_unlimited' }],
            ]
        };
        bot.sendMessage(chatId, '💳 **Choose a plan:**', { parse_mode: 'Markdown', reply_markup: keyboard });
        return;
    }

    // ===== MY CREDITS =====
    if (text === '💰 MY CREDITS') {
        const isUnlimited = user.daily_unlimited > Date.now() / 1000;
        const unlimitedText = isUnlimited ? '\n⭐ **Unlimited Plan Active!**' : '';
        bot.sendMessage(chatId, 
            `💰 **Your Credits:** \`${user.credits}\`${unlimitedText}\n⚔️ **Total Attacks:** ${user.total_attacks || 0}\n\n💡 Each minute costs 1 credit (max 10)\n⭐ 1 Day Unlimited: 100 coins`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ===== DAILY SPIN =====
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
        await updateCredits(chatId, reward);
        user.last_daily = now;
        await user.save();
        const newBalance = (await getUser(chatId)).credits;
        await bot.editMessageText(`🎉 **You won ${reward} credits!**\n💰 New balance: ${newBalance}`, 
            { chat_id: chatId, message_id: spinMsg.message_id, parse_mode: 'Markdown' });
        return;
    }

    // ===== REDEEM CODE =====
    if (text === '🎟️ REDEEM CODE') {
        userStates.set(chatId, { state: 'redeem_code' });
        bot.sendMessage(chatId, '🎟️ Send the redeem code:');
        return;
    }

    // ===== REFERRAL =====
    if (text === '🔗 REFERRAL') {
        if (!await isJoined(chatId, bot)) {
            const channels = await getChannels();
            return bot.sendMessage(chatId, `🚫 Join required channels first to use referral:\n${channels.join('\n')}`);
        }
        const code = await generateReferralCode(chatId);
        const botInfo = await bot.getMe();
        const refData = await getReferralData(chatId);
        const count = refData.count || 0;
        const msgText = `🔗 **Your Referral Code**\n\n🎯 \`${code}\`\n\n📊 You have referred: ${count} users\n💰 You earned: ${count * 5} credits\n\n**How it works:**\n• Share your code with friends\n• When they join, both get 5 credits!\n• **Note:** Only 1 referral per minute (anti-spam)\n• Invite link: \`https://t.me/${botInfo.username}?start=${code}\``;
        bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
        return;
    }

    // ===== MY STATS =====
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

    // ===== HELP =====
    if (text === '❓ HELP') {
        bot.sendMessage(chatId, 
            `🤖 **BOT COMMANDS & HELP**\n\n📱 **START BOMB** - Start bombing (choose duration)\n⏹️ **STOP BOMB** - Stop active bombing\n💰 **MY CREDITS** - Check your credits\n🎁 **DAILY SPIN** - Daily spin wheel\n🎟️ **REDEEM CODE** - Redeem code\n🔗 **REFERRAL** - Get referral link\n💳 **BUY CREDITS** - Buy credits\n⚙️ **SETTINGS** - Modify scanner/headers\n📊 **MY STATS** - View your stats\n\n💡 **Bombing Costs:**\n• 1-10 minutes: 1 credit per minute\n• 11-60 minutes: 10 credits\n• ⭐ 1 Day Unlimited: 100 coins\n\n💳 **Payment:**\n• Select plan > Scan QR > Pay > Send screenshot\n• Admin will approve\n\n⭐ **Referral Bonus:** 5 credits each!`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // ===== SETTINGS =====
    if (text === '⚙️ SETTINGS') {
        const keyboard = {
            inline_keyboard: [
                [{ text: '📋 View Settings', callback_data: 'settings_view' }],
                [{ text: '🔍 Add Scanner', callback_data: 'settings_add_scanner' }],
                [{ text: '📝 Modify Headers', callback_data: 'settings_modify_headers' }]
            ]
        };
        bot.sendMessage(chatId, '⚙️ **Settings Panel**', { parse_mode: 'Markdown', reply_markup: keyboard });
        return;
    }

    // ===== ADMIN PANEL =====
    if (text === '👑 ADMIN PANEL') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.sendMessage(chatId, '❌ You are not an admin.');
        bot.sendMessage(chatId, '🔐 Admin Panel', adminKeyboard());
        return;
    }

    if (text === '🔙 BACK') {
        bot.sendMessage(chatId, '🔙 Back to main menu', mainKeyboard());
        return;
    }

    // ===== ADMIN COMMANDS =====
    if (ADMIN_IDS.includes(Number(chatId))) {
        if (text === '📊 STATS') {
            const totalUsers = await User.countDocuments();
            const totalAttacks = (await User.aggregate([{ $group: { _id: null, total: { $sum: '$total_attacks' } } }]))[0]?.total || 0;
            const totalCredits = (await User.aggregate([{ $group: { _id: null, total: { $sum: '$credits' } } }]))[0]?.total || 0;
            const config = await getScannerConfig();
            const channels = await getChannels();
            const totalApis = 140;
            bot.sendMessage(chatId, 
                `📊 **BOT STATS**\n👥 Users: ${totalUsers}\n💰 Total credits: ${totalCredits}\n⚔️ Attacks: ${totalAttacks}\n📡 APIs loaded: ${totalApis}\n📺 Channels: ${channels.length}\n🛡️ Scanners: ${config.scanners.length}\n🌐 Load Balancer: ✅ Active\n🌐 API Instances: 4`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        if (text === '👥 USERS LIST') {
            const users = await User.find().select('_id username credits total_attacks').limit(20);
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
            const list = await getProtected();
            bot.sendMessage(chatId, `🛡️ **Protected Numbers**\n${list.length ? list.join('\n') : 'None'}`);
            return;
        }

        if (text === '📢 BROADCAST') {
            adminBroadcastState.set(chatId, { active: true });
            bot.sendMessage(chatId, 
                `📢 **Broadcast Mode Activated**\n\n` +
                `Send any message (text, photo, video, GIF, etc.) and I'll send it to ALL users!\n\n` +
                `Send /cancel to exit.`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        if (text === '📋 ALL USERS') {
            const users = await User.find().select('_id username credits');
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
            bot.sendMessage(chatId, '📺 **Channel Manager**', { reply_markup: keyboard });
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
            bot.sendMessage(chatId, '🛡️ **Scanner Manager**', { reply_markup: keyboard });
            return;
        }
    }

    // ===== START BOMB =====
    if (text && text.includes('START BOMB')) {
        if (bombingStatus.get(chatId)) {
            return bot.sendMessage(chatId, '❌ You already have an active bombing session. Use /stop first.');
        }
        if (!await isJoined(chatId, bot)) {
            const channels = await getChannels();
            return bot.sendMessage(chatId, `🚫 Join required channels first:\n${channels.join('\n')}`);
        }
        bot.sendMessage(chatId, '📱 Send the 10-digit phone number to bomb:');
        userStates.set(chatId, { state: 'enter_phone' });
        return;
    }

    // ===== STOP BOMB =====
    if (text === '🔴 STOP BOMB' || text === '/stop') {
        if (bombingStatus.get(chatId)) {
            bombingStatus.set(chatId, false);
            bot.sendMessage(chatId, '⏹️ Bombing stopped.');
        } else {
            bot.sendMessage(chatId, '❌ No active bombing.');
        }
        return;
    }

    // ===== STATE HANDLERS =====
    if (userStates.has(chatId)) {
        const state = userStates.get(chatId);
        const input = text.trim();

        if (state.state === 'redeem_code') {
            const amount = await getRedeemCode(input.toUpperCase());
            if (amount === null) {
                bot.sendMessage(chatId, '❌ Invalid code!');
            } else {
                await updateCredits(chatId, amount);
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
                    [{ text: '🟢 60 Min (10 coins)', callback_data: 'dur_60' }, { text: '⭐ 1 Day (100 coins)', callback_data: 'dur_1440' }]
                ]
            };
            bot.sendMessage(chatId, `📱 Target: \`${phone}\`\n⏱️ **Select Bombing Duration:**`, 
                { parse_mode: 'Markdown', reply_markup: keyboard });
            return;
        }

        if (state.state === 'gen_code') {
            const amount = parseInt(input);
            if (isNaN(amount) || amount <= 0 || amount > 1000) return bot.sendMessage(chatId, '❌ Invalid amount. Max 1000.');
            const code = 'RTF' + Math.random().toString(36).substring(2, 7).toUpperCase();
            await createRedeemCode(code, amount);
            bot.sendMessage(chatId, `✅ Code: \`${code}\`\nAmount: ${amount} credits`, { parse_mode: 'Markdown' });
            userStates.delete(chatId);
            return;
        }

        if (state.state === 'ban_user') {
            const id = parseInt(input);
            if (isNaN(id)) return bot.sendMessage(chatId, '❌ Invalid ID.');
            await banUser(id);
            bot.sendMessage(chatId, `✅ Banned ${id}`);
            userStates.delete(chatId);
            return;
        }

        if (state.state === 'unban_user') {
            const id = parseInt(input);
            if (isNaN(id)) return bot.sendMessage(chatId, '❌ Invalid ID.');
            await unbanUser(id);
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
            await updateCredits(state.uid, amount);
            bot.sendMessage(chatId, `✅ Added ${amount} credits to ${state.uid}`);
            userStates.delete(chatId);
            return;
        }

        if (state.state === 'add_protected') {
            if (!input.match(/^\d{10}$/)) return bot.sendMessage(chatId, '❌ Invalid number. Must be 10 digits.');
            await addProtected(input);
            bot.sendMessage(chatId, `✅ ${input} added to protected list.`);
            userStates.delete(chatId);
            return;
        }

        if (state.state === 'remove_protected') {
            if (!input.match(/^\d{10}$/)) return bot.sendMessage(chatId, '❌ Invalid number. Must be 10 digits.');
            await removeProtected(input);
            bot.sendMessage(chatId, `✅ ${input} removed from protected list.`);
            userStates.delete(chatId);
            return;
        }

        if (state.state === 'unlimited_plan') {
            const uid = parseInt(input);
            if (isNaN(uid)) return bot.sendMessage(chatId, '❌ Invalid ID.');
            const target = await getUser(uid);
            target.daily_unlimited = Date.now() / 1000 + 86400;
            await target.save();
            bot.sendMessage(chatId, `✅ Unlimited plan granted to user ${uid} for 24 hours!`);
            try {
                await bot.sendMessage(uid, '⭐ **You\'ve been granted a 1-Day Unlimited Bombing Plan!**\n\nYou can now bomb any number for free for the next 24 hours!\nUse START BOMB to start bombing.');
            } catch (e) {}
            userStates.delete(chatId);
            return;
        }
    }
});

// ============================================================
// ===== CALLBACK QUERY HANDLER =====
// ============================================================

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const msgId = callbackQuery.message.message_id;

    if (data === 'verify_join') {
        const joined = await isJoined(chatId, bot);
        if (joined) {
            bot.editMessageText('✅ You have joined all channels! Access granted.', { chat_id: chatId, message_id: msgId });
            await showMainMenu(chatId);
        } else {
            bot.answerCallbackQuery(callbackQuery.id, { text: '❌ You still haven\'t joined all channels.', show_alert: true });
        }
        return;
    }

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

    if (data.startsWith('buy_')) {
        const planKey = data.replace('buy_', '');
        await handleBuyCredits(chatId, planKey);
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ===== PAYMENT APPROVAL =====
    if (data.startsWith('approve_pay_')) {
        if (!ADMIN_IDS.includes(Number(chatId))) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only!', show_alert: true });
        }

        const payId = data.replace('approve_pay_', '');
        const payment = pendingScreenshots.get(payId);
        
        if (!payment) {
            return bot.editMessageText('❌ Payment not found or already processed.', { chat_id: chatId, message_id: msgId });
        }

        const userId = payment.userId;
        const credits = payment.credits;
        
        try {
            if (credits > 0) {
                await updateCredits(userId, credits);
            } else {
                const user = await getUser(userId);
                user.daily_unlimited = Date.now() / 1000 + 86400;
                await user.save();
            }

            payment.status = 'approved';
            pendingScreenshots.set(payId, payment);

            try {
                await bot.sendMessage(userId,
                    `🎉 **Payment Approved!**\n\n` +
                    `✅ Your payment of ₹${payment.price} has been approved.\n` +
                    `💰 ${credits > 0 ? `Added ${credits} credits!` : '⭐ Unlimited Plan Activated for 24 hours!'}\n\n` +
                    `Use START BOMB to start bombing!`
                );
            } catch (e) {}

            await bot.editMessageText(
                `✅ **Payment Approved!**\n\n` +
                `👤 User: ${payment.first_name}\n` +
                `💳 Plan: ${payment.plan}\n` +
                `💰 Amount: ₹${payment.price}\n` +
                `✅ Status: APPROVED`,
                { chat_id: chatId, message_id: msgId }
            );

            pendingScreenshots.delete(payId);

        } catch (error) {
            bot.editMessageText(`❌ Error: ${error.message}`, { chat_id: chatId, message_id: msgId });
        }

        bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Payment approved!' });
        return;
    }

    if (data.startsWith('reject_pay_')) {
        if (!ADMIN_IDS.includes(Number(chatId))) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only!', show_alert: true });
        }

        const payId = data.replace('reject_pay_', '');
        const payment = pendingScreenshots.get(payId);

        if (!payment) {
            return bot.editMessageText('❌ Payment not found.', { chat_id: chatId, message_id: msgId });
        }

        payment.status = 'rejected';
        pendingScreenshots.set(payId, payment);

        try {
            await bot.sendMessage(payment.userId,
                `❌ **Payment Rejected**\n\n` +
                `Your payment of ₹${payment.price} was rejected.\n\n` +
                `Please try again with a clear screenshot.`
            );
        } catch (e) {}

        await bot.editMessageText(
            `❌ **Payment Rejected**\n\n` +
            `👤 User: ${payment.first_name}\n` +
            `💳 Plan: ${payment.plan}\n` +
            `💰 Amount: ₹${payment.price}\n` +
            `❌ Status: REJECTED`,
            { chat_id: chatId, message_id: msgId }
        );

        pendingScreenshots.delete(payId);
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Payment rejected' });
        return;
    }

    // ===== SETTINGS =====
    if (data === 'settings_view') {
        const user = await getUser(chatId);
        const msgText = `📋 **Your Current Settings**\n\n🔍 Scanner: ${user.scanner_enabled ? '✅ Enabled' : '❌ Disabled'}\n🛡️ Custom Headers: ${Object.keys(user.custom_headers || {}).length} modified`;
        bot.editMessageText(msgText, { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' });
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

    // ===== CHANNEL MANAGER =====
    if (data === 'channel_add') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only' });
        userStates.set(chatId, { state: 'add_channel' });
        bot.editMessageText('📺 Send channel username to add (e.g., @channelname):', { chat_id: chatId, message_id: msgId });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    if (data === 'channel_remove') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only' });
        const channels = await getChannels();
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
        const channels = await getChannels();
        const msg = channels.length ? `📺 **Required Channels:**\n${channels.join('\n')}` : '📭 No channels configured.';
        bot.editMessageText(msg, { chat_id: chatId, message_id: msgId });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ===== SCANNER MANAGER =====
    if (data === 'scanner_add') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only' });
        userStates.set(chatId, { state: 'add_scanner' });
        bot.editMessageText('🛡️ Send scanner bypass data (JSON format or description):', { chat_id: chatId, message_id: msgId });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    if (data === 'scanner_remove') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only' });
        const config = await getScannerConfig();
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
        const config = await getScannerConfig();
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

    if (data === 'admin_back') {
        bot.editMessageText('🔐 Admin Panel', { chat_id: chatId, message_id: msgId });
        bot.sendMessage(chatId, '🔐 Admin Panel', adminKeyboard());
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

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

// ============================================================
// ===== HEALTH CHECK SERVER =====
// ============================================================

const app = express();

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
        qrCodeSet: qrCodeSet,
        pendingPayments: pendingScreenshots.size,
        loadBalancer: 'Active',
        apiInstances: Object.keys(API_URLS).length
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Health check server listening on port ${PORT}`);
});

console.log('🤖 Bot started successfully!');
console.log(`📡 Load Balancer: ACTIVE`);
console.log(`🌐 API Instances:`);
console.log(`   API 1: ${API_URLS.api1}`);
console.log(`   API 2: ${API_URLS.api2}`);
console.log(`   API 3: ${API_URLS.api3}`);
console.log(`   API 4: ${API_URLS.api4}`);
console.log(`📸 QR Code payment system: ${qrCodeSet ? '✅' : '❌'}`);
console.log(`💳 Screenshot approval system: ✅`);
console.log(`📢 Broadcast system: ✅`);
console.log(`🔗 Referral system: ✅`);
console.log(`🎁 Daily spin: ✅`);
console.log(`👑 Admin panel: ✅`);
console.log(`🛡️ Protected numbers: ✅`);
console.log(`📺 Channel verification: ✅`);
console.log(`⚙️ Settings: ✅`);
console.log(`📊 Stats: ✅`);
