# VPN & Fingerprint Detection App

## Overview
This is a Node.js Express web application that detects VPN usage and collects browser fingerprints from visitors. When a user visits the site, it:
- Detects their IP address and geolocation
- Identifies if they're using a VPN or proxy service
- Collects browser fingerprinting data (WebRTC IPs, OS, browser, timezone, screen resolution, plugins)
- Logs all collected data to local text files

## Current State
The application is fully configured and running on the Replit environment:
- Server runs on port 5000 with host 0.0.0.0
- All dependencies are installed
- Workflow is configured and running
- Deployment is configured for autoscale

## Recent Changes (October 9, 2025)
- Updated server configuration to use port 5000 and host 0.0.0.0 for Replit compatibility
- Installed project dependencies (express, axios, ejs)
- Created .gitignore file for Node.js project
- Configured workflow to run the Express server
- Set up deployment configuration for autoscale deployment
- Application tested and verified working

## Project Architecture

### Technology Stack
- **Runtime**: Node.js
- **Framework**: Express.js 5.1.0
- **Template Engine**: EJS 3.1.10
- **HTTP Client**: Axios 1.8.4

### Project Structure
```
/
├── index.js              # Main Express server file
├── package.json          # Node.js dependencies and metadata
├── .gitignore           # Git ignore rules for Node.js
├── views/
│   └── landing.ejs      # Main landing page template
├── public/
│   ├── detect.js        # Browser detection script (unused)
│   └── fingerprint.js   # Active fingerprinting script
├── vpn-log.txt          # VPN detection logs (auto-generated)
└── fingerprint-log.txt  # Browser fingerprint logs (auto-generated)
```

### Key Features
1. **IP Detection**: Uses `x-forwarded-for` header to get visitor's real IP
2. **Geolocation**: Integrates with ip-api.com for IP geolocation lookup
3. **VPN Detection**: Checks if IP is from proxy or hosting service
4. **Browser Fingerprinting**: Collects WebRTC IPs, OS, browser, timezone, language, screen resolution, and installed plugins
5. **Logging**: All detections are logged to text files

### API Endpoints
- `GET /` - Main landing page, displays visitor's IP and country
- `POST /log-fingerprint` - Receives and logs browser fingerprint data

### External Dependencies
- **ip-api.com** - Free IP geolocation API (no authentication required)

## How It Works
1. User visits the site
2. Server detects IP from request headers
3. Server queries ip-api.com for geolocation and VPN detection
4. Page renders with basic IP/country info
5. Client-side JavaScript (`fingerprint.js`) collects browser data
6. Fingerprint data is sent back to `/log-fingerprint` endpoint
7. All data is logged to respective text files

## Development
- **Start server**: `node index.js`
- **Port**: 5000
- **Host**: 0.0.0.0 (required for Replit)

## Deployment
The application is configured for autoscale deployment on Replit, which is ideal for this stateless web application.
