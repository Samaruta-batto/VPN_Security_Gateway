const http = require('http');
const assert = require('assert');
const {
    app,
    ipCache,
    failedLookupCache,
    isPrivateOrLocalIP,
    getClientIP,
    generateAdminToken,
    verifyAdminToken
} = require('./index.js');

async function runTests() {
    console.log('--- Starting VPN Gateway & LRU Cache Tests ---');

    // 1. Test isPrivateOrLocalIP
    console.log('Testing isPrivateOrLocalIP...');
    assert.strictEqual(isPrivateOrLocalIP('127.0.0.1'), true, '127.0.0.1 should be private');
    assert.strictEqual(isPrivateOrLocalIP('::1'), true, '::1 should be private');
    assert.strictEqual(isPrivateOrLocalIP('::ffff:127.0.0.1'), true, '::ffff:127.0.0.1 should be private');
    assert.strictEqual(isPrivateOrLocalIP('10.0.0.15'), true, '10.0.0.15 should be private');
    assert.strictEqual(isPrivateOrLocalIP('192.168.1.100'), true, '192.168.1.100 should be private');
    assert.strictEqual(isPrivateOrLocalIP('172.16.5.1'), true, '172.16.5.1 should be private');
    assert.strictEqual(isPrivateOrLocalIP('172.31.255.255'), true, '172.31.255.255 should be private');
    assert.strictEqual(isPrivateOrLocalIP('1.1.1.1'), false, '1.1.1.1 should be public');
    assert.strictEqual(isPrivateOrLocalIP('104.28.212.15'), false, '104.28.212.15 should be public');
    console.log('✓ isPrivateOrLocalIP tests passed');

    // 2. Test LRU Cache
    console.log('Testing LRU Cache...');
    ipCache.clear();
    assert.strictEqual(ipCache.size, 0);
    ipCache.set('1.2.3.4', { isVPN: true, data: { country: 'Testland', isp: 'TestISP' } });
    assert.strictEqual(ipCache.size, 1);
    const cached = ipCache.get('1.2.3.4');
    assert.strictEqual(cached.isVPN, true);
    assert.strictEqual(cached.data.country, 'Testland');
    ipCache.clear();
    assert.strictEqual(ipCache.size, 0);
    console.log('✓ LRU Cache operations passed');

    // 3. Test Admin Authentication tokens
    console.log('Testing Auth Tokens...');
    const validToken = generateAdminToken();
    assert.strictEqual(verifyAdminToken(validToken), true, 'Valid token should verify');
    assert.strictEqual(verifyAdminToken('tampered-token'), false, 'Invalid token should fail');
    assert.strictEqual(verifyAdminToken(null), false, 'Null token should fail');
    console.log('✓ Auth Token tests passed');

    // 4. Test HTTP Server
    console.log('Testing HTTP Endpoints...');
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;

    function makeRequest(path, options = {}) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, baseUrl);
            const req = http.request(url, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
            });
            req.on('error', reject);
            if (options.body) {
                req.write(options.body);
            }
            req.end();
        });
    }

    try {
        // Test GET /admin-login
        const loginPageRes = await makeRequest('/admin-login');
        assert.strictEqual(loginPageRes.status, 200);
        assert(loginPageRes.body.includes('Admin Access'), 'Should show admin login page');

        // Test GET /admin unauthenticated -> redirects to /admin-login
        const adminUnauth = await makeRequest('/admin');
        assert.strictEqual(adminUnauth.status, 302);
        assert.strictEqual(adminUnauth.headers.location, '/admin-login');

        // Test POST /admin-login with invalid password
        const postBadLogin = await makeRequest('/admin-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'password=wrongpassword'
        });
        assert.strictEqual(postBadLogin.status, 200);
        assert(postBadLogin.body.includes('Invalid password'), 'Should display invalid password');

        // Test POST /admin-login with correct password ('admin123')
        const postGoodLogin = await makeRequest('/admin-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'password=admin123'
        });
        assert.strictEqual(postGoodLogin.status, 302);
        assert.strictEqual(postGoodLogin.headers.location, '/admin');
        const setCookie = postGoodLogin.headers['set-cookie'];
        assert(setCookie && setCookie.some(c => c.includes('admin_session=')), 'Should set admin_session cookie');

        const sessionCookie = setCookie.find(c => c.includes('admin_session=')).split(';')[0];

        // Test GET /admin with session cookie
        const adminAuthRes = await makeRequest('/admin', {
            headers: { 'Cookie': sessionCookie }
        });
        assert.strictEqual(adminAuthRes.status, 200);
        assert(adminAuthRes.body.includes('LRU Cache'), 'Admin page should show LRU Cache stat');
        assert(adminAuthRes.body.includes('Total Blocked'), 'Admin page should show Total Blocked');

        // Test cached VPN IP block response
        ipCache.set('198.51.100.99', {
            isVPN: true,
            data: {
                ipv4: '198.51.100.99',
                ipv6: 'N/A',
                country: 'VPNland',
                isp: 'ProxyHost'
            }
        });

        const blockedReq = await makeRequest('/', {
            headers: { 'x-forwarded-for': '198.51.100.99' }
        });
        assert.strictEqual(blockedReq.status, 200);
        assert(blockedReq.body.includes('Access Blocked'), 'Should show blocked page for cached VPN IP');
        assert(blockedReq.body.includes('VPNland'), 'Should show country from cached entry');

        // Check that hit count increased
        const adminAfterHit = await makeRequest('/admin', {
            headers: { 'Cookie': sessionCookie }
        });
        assert(adminAfterHit.body.includes('1 hits'), 'Admin stats should reflect 1 LRU cache hit');

        // Test POST /admin/clear-cache
        const clearCacheRes = await makeRequest('/admin/clear-cache', {
            method: 'POST',
            headers: { 'Cookie': sessionCookie }
        });
        assert.strictEqual(clearCacheRes.status, 302);
        assert.strictEqual(ipCache.size, 0, 'Cache should be empty after clear');

        // Test GET /admin-logout
        const logoutRes = await makeRequest('/admin-logout', {
            headers: { 'Cookie': sessionCookie }
        });
        assert.strictEqual(logoutRes.status, 302);
        assert.strictEqual(logoutRes.headers.location, '/admin-login');

        console.log('✓ All HTTP endpoint and LRU Cache integration tests passed!');
    } finally {
        await new Promise(resolve => server.close(resolve));
    }

    console.log('--- ALL TESTS PASSED SUCCESSFULLY ---');
}

runTests().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});
