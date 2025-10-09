# VPN Firewall & Security Gateway

## Overview
This is a Node.js Express-based VPN firewall that acts as a protective gateway for web applications. It detects and blocks users accessing through VPNs, proxies, or hosting services, while forwarding legitimate traffic to the backend application. All blocked attempts are logged with detailed information for security monitoring.

## Current State
The firewall is fully configured and running:
- Server runs on port 5000 with host 0.0.0.0
- VPN/Proxy detection is active and blocking suspicious traffic
- Admin dashboard is accessible for monitoring
- Legitimate traffic forwarding is configured
- All dependencies are installed

## How It Works
1. **Traffic Inspection**: Every incoming request is checked for VPN/proxy indicators
2. **IP Analysis**: Uses ip-api.com to analyze IP addresses for VPN/proxy/hosting signatures
3. **Decision Making**:
   - **VPN Detected**: User sees blocked page, data is logged
   - **Legitimate User**: Traffic is proxied to the backend application
4. **Admin Monitoring**: Administrators can view all blocked attempts with full details

## Recent Changes (October 9, 2025)
- Restructured application to function as a VPN-blocking firewall
- Implemented proxy middleware for forwarding legitimate traffic
- Created admin authentication system with password protection
- Built admin dashboard to monitor blocked users (IPv4/IPv6)
- Added comprehensive logging system with JSON storage
- Designed professional blocked user page with IP information
- Removed old fingerprinting components (now handled server-side)

## Project Architecture

### Technology Stack
- **Runtime**: Node.js
- **Framework**: Express.js 5.1.0
- **Template Engine**: EJS 3.1.10
- **HTTP Client**: Axios 1.8.4
- **Proxy**: http-proxy-middleware 3.0.3

### Project Structure
```
/
├── index.js                # Main firewall server
├── package.json           # Dependencies
├── .gitignore            # Git ignore rules
├── views/
│   ├── blocked.ejs       # Blocked user page
│   ├── admin-login.ejs   # Admin login page
│   └── admin.ejs         # Admin dashboard
├── blocked-users.json    # Blocked user database (auto-generated)
└── vpn-log.txt          # VPN detection logs (auto-generated)
```

### Key Features
1. **VPN/Proxy Detection**: Automatically identifies and blocks VPN, proxy, and hosting service IPs
2. **Traffic Forwarding**: Legitimate users are seamlessly proxied to the backend application
3. **Admin Dashboard**: Secure admin panel to monitor all blocked attempts
4. **IP Tracking**: Captures both IPv4 and IPv6 addresses of blocked users
5. **Detailed Logging**: Stores timestamp, IP addresses, country, ISP, and fingerprint data
6. **Real-time Statistics**: Dashboard shows total blocked, 24-hour activity, and unique countries

### Configuration

#### Environment Variables
- `PORT` - Server port (default: 5000)
- `TARGET_APP` - Backend application URL to forward legitimate traffic (default: http://localhost:3000)
- `ADMIN_PASSWORD` - Admin dashboard password (default: admin123)

**Important**: Change the admin password before deployment!

```bash
export ADMIN_PASSWORD="your-secure-password"
export TARGET_APP="http://your-backend-app:3000"
```

### API Endpoints
- `GET /` - Main entry point (checks VPN, blocks or proxies)
- `GET /admin-login` - Admin login page
- `POST /admin-login` - Admin authentication
- `GET /admin?auth=<token>` - Admin dashboard (requires authentication)
- `/*` - All other routes are proxied to TARGET_APP (if not blocked)

### External Dependencies
- **ip-api.com** - Free IP geolocation and VPN detection API

## Usage

### For Administrators
1. Access admin panel: Navigate to `/admin-login`
2. Enter password (default: `admin123`)
3. View dashboard with:
   - Total blocked users
   - 24-hour activity statistics
   - Unique countries blocked
   - Full table of blocked attempts with IPv4/IPv6

### For Integration
This firewall sits in front of your application:

```
User → VPN Firewall (port 5000) → Your App (TARGET_APP)
```

Set `TARGET_APP` to your backend application URL, and all legitimate traffic will be forwarded seamlessly.

## Security Features
- **Cloudflare WARP Detection**: Blocks Cloudflare WARP and similar services
- **Hosting IP Blocking**: Prevents access from datacenter/hosting IPs
- **Proxy Detection**: Identifies and blocks proxy services
- **Comprehensive Logging**: Every blocked attempt is recorded with full details
- **Admin Authentication**: Password-protected admin access

## Development
- **Start server**: `node index.js`
- **Port**: 5000
- **Host**: 0.0.0.0 (required for Replit)
- **Admin access**: Default password is `admin123` (change in production!)

## Deployment
The application is configured for autoscale deployment on Replit, ideal for this stateless firewall service.

## Data Storage
- `blocked-users.json` - JSON database of all blocked users with full details
- `vpn-log.txt` - Plain text log of blocked attempts

## Use Cases
- Protect web applications from VPN-based attacks
- Prevent fraudulent access from proxy services
- Monitor and log suspicious access attempts
- Block datacenter/hosting IPs to prevent bot traffic
- Geographic access control and monitoring
