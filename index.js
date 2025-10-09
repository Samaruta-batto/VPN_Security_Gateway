const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 5000;
const host = '0.0.0.0';

const TARGET_APP = process.env.TARGET_APP || 'http://localhost:3000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const BLOCKED_USERS_FILE = 'blocked-users.json';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function loadBlockedUsers() {
    try {
        if (fs.existsSync(BLOCKED_USERS_FILE)) {
            return JSON.parse(fs.readFileSync(BLOCKED_USERS_FILE, 'utf8'));
        }
    } catch (err) {
        console.error('Error loading blocked users:', err);
    }
    return [];
}

function saveBlockedUser(data) {
    const blockedUsers = loadBlockedUsers();
    blockedUsers.push({
        timestamp: new Date().toISOString(),
        ipv4: data.ipv4,
        ipv6: data.ipv6 || 'N/A',
        country: data.country,
        city: data.city,
        isp: data.isp,
        org: data.org,
        fingerprint: data.fingerprint
    });
    fs.writeFileSync(BLOCKED_USERS_FILE, JSON.stringify(blockedUsers, null, 2));
}

async function checkVPN(req, res, next) {
    const userIP = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    
    if (req.path === '/admin' || req.path === '/admin-login') {
        return next();
    }

    try {
        const response = await axios.get(`http://ip-api.com/json/${userIP}?fields=status,message,country,regionName,city,isp,org,proxy,hosting,query`);
        const locationData = response.data;

        if (locationData.status === "fail") throw new Error("IP lookup failed");

        const isVPN = locationData.proxy || locationData.hosting;
        
        if (isVPN) {
            const ipv6 = req.headers['x-forwarded-for']?.includes(':') ? 
                req.headers['x-forwarded-for'].split(',').find(ip => ip.includes(':')) : 'N/A';
            
            const blockedData = {
                ipv4: locationData.query,
                ipv6: ipv6,
                country: locationData.country,
                city: locationData.city,
                isp: locationData.isp,
                org: locationData.org,
                fingerprint: {
                    userAgent: req.headers['user-agent'],
                    acceptLanguage: req.headers['accept-language'],
                    acceptEncoding: req.headers['accept-encoding']
                }
            };

            saveBlockedUser(blockedData);

            const log = `[VPN BLOCKED] Time: ${new Date().toISOString()} | IPv4: ${locationData.query} | IPv6: ${ipv6} | ISP: ${locationData.isp} | Country: ${locationData.country}\n`;
            console.log(log);
            fs.appendFileSync('vpn-log.txt', log);

            return res.render('blocked', {
                ipv4: locationData.query,
                ipv6: ipv6,
                country: locationData.country,
                isp: locationData.isp
            });
        }

        req.userIP = locationData.query;
        next();

    } catch (err) {
        console.error("Error checking VPN:", err.message);
        next();
    }
}

app.use(checkVPN);

app.get('/admin-login', (req, res) => {
    res.render('admin-login');
});

app.post('/admin-login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.redirect('/admin?auth=' + Buffer.from(ADMIN_PASSWORD).toString('base64'));
    } else {
        res.render('admin-login', { error: 'Invalid password' });
    }
});

app.get('/admin', (req, res) => {
    const auth = req.query.auth;
    if (!auth || Buffer.from(auth, 'base64').toString() !== ADMIN_PASSWORD) {
        return res.redirect('/admin-login');
    }

    const blockedUsers = loadBlockedUsers();
    res.render('admin', { blockedUsers });
});

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

app.listen(port, host, () => {
    console.log(`VPN Firewall running on http://${host}:${port}`);
    console.log(`Proxying legitimate traffic to: ${TARGET_APP}`);
    console.log(`Admin password: ${ADMIN_PASSWORD}`);
});
