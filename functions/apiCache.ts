// API Cache and Rate Limiting Utility
const cache = {};
const requestQueues = {};
let lastRequestTime = {};

/**
 * Get cached data or fetch fresh data with rate limiting
 */
export const getCachedData = async (cacheKey, fetchFn, cacheDuration = 5 * 60 * 1000, minDelay = 100) => {
    const now = Date.now();
    
    if (cache[cacheKey]) {
        const { data, timestamp } = cache[cacheKey];
        if (now - timestamp < cacheDuration) {
            return data;
        }
    }
    
    return new Promise((resolve, reject) => {
        if (!requestQueues[cacheKey]) {
            requestQueues[cacheKey] = [];
        }
        
        requestQueues[cacheKey].push(async () => {
            try {
                const timeSinceLastRequest = now - (lastRequestTime[cacheKey] || 0);
                if (timeSinceLastRequest < minDelay) {
                    await new Promise(r => setTimeout(r, minDelay - timeSinceLastRequest));
                }
                
                lastRequestTime[cacheKey] = Date.now();
                const data = await fetchFn();
                
                cache[cacheKey] = { data, timestamp: Date.now() };
                resolve(data);
            } catch (error) {
                reject(error);
            }
        });
        
        if (requestQueues[cacheKey].length === 1) {
            requestQueues[cacheKey][0]().then(() => {
                requestQueues[cacheKey].shift();
                if (requestQueues[cacheKey].length > 0) {
                    requestQueues[cacheKey][0]();
                }
            });
        }
    });
};

export const clearCache = (cacheKey) => {
    if (cacheKey) {
        delete cache[cacheKey];
    } else {
        Object.keys(cache).forEach(key => delete cache[key]);
    }
};

export const preloadCache = (cacheKey, data) => {
    cache[cacheKey] = { data, timestamp: Date.now() };
};