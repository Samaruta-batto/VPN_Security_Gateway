const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { LRUCache } = require('lru-cache');

const app = express();
const port = process.env.PORT || 5000;
const host = '0.0.0.0';

const TARGET_APP = process.env.TARGET_APP || 'http://localhost:3000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const BLOCKED_USERS_FILE = path.join(__dirname, 'blocked-users.json');
const LOG_FILE = path.join(__dirname, 'vpn-log.txt');

// Trust proxy headers for accurate client IP resolution behind reverse proxies
app.set('trust proxy', true);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// LRU Cache for IP lookup results (6 hours TTL, max 10,000 entries)
const ipCache = new LRUCache({
    max: 10000,
    ttl: 1000 * 60 * 60 * 6,
    updateAgeOnGet: false
});

// Negative lookup cache for failed or rate-limited API calls (2 minutes TTL)
const failedLookupCache = new LRUCache({
    max: 1000,
    ttl: 1000 * 60 * 2
});

let cacheHits = 0;
let cacheMisses = 0;

// In-memory blocked users cache with asynchronous background persistence
let blockedUsersCache = [];
let writeQueue = Promise.resolve();

function initBlockedUsers() {
    try {
        if (fs.existsSync(BLOCKED_USERS_FILE)) {
            const data = fs.readFileSync(BLOCKED_USERS_FILE, 'utf8');
            blockedUsersCache = JSON.parse(data);
        }
    } catch (err) {
        console.error('Error loading blocked users:', err);
        blockedUsersCache = [];
    }
}
initBlockedUsers();

function persistBlockedUsersAsync() {
    writeQueue = writeQueue.then(async () => {
        try {
            await fs.promises.writeFile(
                BLOCKED_USERS_FILE,
                JSON.stringify(blockedUsersCache, null, 2),
                'utf8'
            );
        } catch (err) {
            console.error('Error persisting blocked users to file:', err.message);
        }
    });
}

function saveBlockedUser(data) {
    blockedUsersCache.push({
        timestamp: new Date().toISOString(),
        ipv4: data.ipv4,
        ipv6: data.ipv6 || 'N/A',
        country: data.country,
        city: data.city,
        isp: data.isp,
        org: data.org,
        fingerprint: data.fingerprint
    });
    persistBlockedUsersAsync();
}

// Helper: Extract clean client IP
function getClientIP(req) {
    let ip = '';
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        ip = forwarded.split(',')[0].trim();
    } else if (req.socket && req.socket.remoteAddress) {
        ip = req.socket.remoteAddress;
    }
    // Normalize IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
    if (ip && ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }
    return ip;
}

// Helper: Determine if IP is local / private / loopback
function isPrivateOrLocalIP(ip) {
    if (!ip) return true;
    const cleanIP = ip.startsWith('::ffff:') ? ip.substring(7) : ip;
    if (cleanIP === '127.0.0.1' || cleanIP === '::1' || cleanIP === 'localhost') return true;

    // IPv4 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16)
    const ipv4Match = cleanIP.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
        const o1 = parseInt(ipv4Match[1], 10);
        const o2 = parseInt(ipv4Match[2], 10);
        if (o1 === 10 || o1 === 127) return true;
        if (o1 === 192 && o2 === 168) return true;
        if (o1 === 172 && (o2 >= 16 && o2 <= 31)) return true;
        if (o1 === 169 && o2 === 254) return true;
        if (o1 === 100 && (o2 >= 64 && o2 <= 127)) return true;
        return false;
    }

    // IPv6 private / link-local / unique local (fc00::/7, fe80::/10)
    const lower = cleanIP.toLowerCase();
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
        return true;
    }

    return false;
}

// Session authentication helpers
function generateAdminToken() {
    return crypto.createHmac('sha256', SESSION_SECRET).update(ADMIN_PASSWORD).digest('hex');
}

function verifyAdminToken(token) {
    if (!token || typeof token !== 'string') return false;
    const expected = generateAdminToken();
    try {
        const tokenBuffer = Buffer.from(token);
        const expectedBuffer = Buffer.from(expected);
        if (tokenBuffer.length !== expectedBuffer.length) return false;
        return crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
    } catch {
        return false;
    }
}

function requireAdmin(req, res, next) {
    let isAuthed = verifyAdminToken(req.cookies?.admin_session);

    // Backward compatibility for ?auth= query string
    if (!isAuthed && req.query.auth) {
        try {
            if (Buffer.from(req.query.auth, 'base64').toString() === ADMIN_PASSWORD) {
                isAuthed = true;
                res.cookie('admin_session', generateAdminToken(), {
                    httpOnly: true,
                    sameSite: 'lax',
                    maxAge: 24 * 60 * 60 * 1000
                });
                return res.redirect(req.baseUrl + req.path);
            }
        } catch {
            // invalid base64
        }
    }

    if (!isAuthed) {
        return res.redirect('/admin-login');
    }
    next();
}

// VPN / Proxy inspection middleware
async function checkVPN(req, res, next) {
    // Exempt all administrative routes from VPN inspection
    if (req.path.startsWith('/admin')) {
        return next();
    }

    const userIP = getClientIP(req);

    // Skip inspection for local, private, or unspecified IPs
    if (!userIP || isPrivateOrLocalIP(userIP)) {
        return next();
    }

    // Check failedLookupCache to avoid hammering ip-api when down or rate-limited
    if (failedLookupCache.has(userIP)) {
        return next();
    }

    // 1. Check LRU Cache
    const cached = ipCache.get(userIP);
    if (cached) {
        cacheHits++;
        if (cached.isVPN) {
            return res.render('blocked', {
                ipv4: cached.data.ipv4,
                ipv6: cached.data.ipv6 || 'N/A',
                country: cached.data.country,
                isp: cached.data.isp
            });
        }
        return next();
    }

    cacheMisses++;

    // 2. Query external IP intelligence API
    try {
        const response = await axios.get(
            `http://ip-api.com/json/${encodeURIComponent(userIP)}?fields=status,message,country,regionName,city,isp,org,proxy,hosting,query`,
            { timeout: 4000 }
        );
        const locationData = response.data;

        if (locationData.status === 'fail') {
            failedLookupCache.set(userIP, true);
            return next();
        }

        const isVPN = Boolean(locationData.proxy || locationData.hosting);

        const ipv6 = req.headers['x-forwarded-for']?.includes(':') ?
            req.headers['x-forwarded-for'].split(',').find(ip => ip.includes(':'))?.trim() : 'N/A';

        const record = {
            ipv4: locationData.query || userIP,
            ipv6: ipv6 || 'N/A',
            country: locationData.country || 'Unknown',
            city: locationData.city || 'Unknown',
            isp: locationData.isp || 'Unknown',
            org: locationData.org || 'Unknown'
        };

        // Cache the lookup result in LRU Cache
        ipCache.set(userIP, {
            isVPN,
            data: record
        });

        if (isVPN) {
            saveBlockedUser({
                ...record,
                fingerprint: {
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    acceptLanguage: req.headers['accept-language'] || 'Unknown',
                    acceptEncoding: req.headers['accept-encoding'] || 'Unknown'
                }
            });

            const log = `[VPN BLOCKED] Time: ${new Date().toISOString()} | IPv4: ${record.ipv4} | IPv6: ${record.ipv6} | ISP: ${record.isp} | Country: ${record.country}\n`;
            console.log(log.trim());
            fs.appendFile(LOG_FILE, log, (err) => {
                if (err) console.error('Error writing to vpn-log.txt:', err.message);
            });

            return res.render('blocked', {
                ipv4: record.ipv4,
                ipv6: record.ipv6,
                country: record.country,
                isp: record.isp
            });
        }

        req.userIP = locationData.query || userIP;
        next();

    } catch (err) {
        console.error(`[VPN Check Warning] IP ${userIP}:`, err.message);
        failedLookupCache.set(userIP, true);
        next();
    }
}

app.use(checkVPN);

// Admin Routes
app.get('/admin-login', (req, res) => {
    if (verifyAdminToken(req.cookies?.admin_session)) {
        return res.redirect('/admin');
    }
    res.render('admin-login');
});

app.post('/admin-login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        const token = generateAdminToken();
        res.cookie('admin_session', token, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        res.redirect('/admin');
    } else {
        res.render('admin-login', { error: 'Invalid password' });
    }
});

app.get('/admin-logout', (req, res) => {
    res.clearCookie('admin_session');
    res.redirect('/admin-login');
});

app.get('/admin', requireAdmin, (req, res) => {
    const totalLookups = cacheHits + cacheMisses;
    const hitRate = totalLookups > 0 ? ((cacheHits / totalLookups) * 100).toFixed(1) + '%' : '0%';

    res.render('admin', {
        blockedUsers: blockedUsersCache,
        cacheStats: {
            size: ipCache.size,
            max: ipCache.max,
            hits: cacheHits,
            misses: cacheMisses,
            hitRate
        }
    });
});

app.post('/admin/clear-cache', requireAdmin, (req, res) => {
    ipCache.clear();
    failedLookupCache.clear();
    cacheHits = 0;
    cacheMisses = 0;
    res.redirect('/admin');
});

// Legitimate traffic proxy middleware
app.use('/', createProxyMiddleware({
    target: TARGET_APP,
    changeOrigin: true,
    onError: (err, req, res) => {
        console.error('Proxy Error:', err.message);
        res.status(503).send(`
            <h1>Service Unavailable</h1>
            <p>The backend application is not available.</p>
            <p>Configure TARGET_APP environment variable to point to your application.</p>
            <p>Current target: ${TARGET_APP}</p>
        `);
    }
}));

if (require.main === module) {
    app.listen(port, host, () => {
        console.log(`VPN Firewall running on http://${host}:${port}`);
        console.log(`Proxying legitimate traffic to: ${TARGET_APP}`);
        console.log(`Admin dashboard: http://${host}:${port}/admin-login`);
        if (ADMIN_PASSWORD === 'admin123') {
            console.warn(`[SECURITY NOTICE] Using default admin password. Set ADMIN_PASSWORD in environment for production.`);
        }
    });
}

module.exports = {
    app,
    ipCache,
    failedLookupCache,
    isPrivateOrLocalIP,
    getClientIP,
    generateAdminToken,
    verifyAdminToken
};


