// index.js
const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 5000;
const host = '0.0.0.0';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', async (req, res) => {
    const userIP = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    let locationData = null;

    try {
        const response = await axios.get(`http://ip-api.com/json/${userIP}?fields=status,message,country,regionName,city,isp,org,proxy,hosting,query`);
        locationData = response.data;

        if (locationData.status === "fail") throw new Error("IP lookup failed");

        const isVPN = locationData.proxy || locationData.hosting;
        if (isVPN) {
            const log = `[VPN DETECTED] IP: ${locationData.query} | ISP: ${locationData.isp} | Country: ${locationData.country} | Host: ${locationData.hosting}\n`;
            console.log(log);
            fs.appendFileSync('vpn-log.txt', log);
        }

    } catch (err) {
        console.error("Error fetching IP info:", err.message);
        locationData = { query: userIP, country: "Unknown" };
    }

    res.render('landing', {
        ip: locationData.query,
        country: locationData.country
    });
});

app.post('/log-fingerprint', (req, res) => {
    const data = req.body;
    const log = `[FINGERPRINT] IP: ${data.ip}\nWebRTC IPs: ${data.webrtc}\nOS: ${data.os}\nBrowser: ${data.browser}\nTimezone: ${data.timezone}\nLanguage: ${data.language}\nResolution: ${data.resolution}\nPlugins: ${data.plugins.join(', ')}\n------------------------\n`;
    console.log(log);
    fs.appendFileSync('fingerprint-log.txt', log);
    res.sendStatus(200);
});

app.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}`);
});
