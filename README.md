# VPN Firewall & Security Gateway

A Node.js-based VPN/Proxy firewall that protects your web applications by blocking suspicious traffic and forwarding legitimate users.

## 🛡️ Features

- **VPN/Proxy Detection**: Automatically blocks users connecting through VPNs, proxies, or hosting services
- **Traffic Forwarding**: Seamlessly proxies legitimate traffic to your backend application
- **Admin Dashboard**: Monitor all blocked attempts with IPv4/IPv6 addresses
- **Comprehensive Logging**: Tracks timestamps, IP addresses, location, ISP, and more
- **Real-time Statistics**: View blocked users, 24-hour activity, and country metrics

## 🚀 Quick Start

1. **Configure Environment Variables** (optional):
```bash
export ADMIN_PASSWORD="your-secure-password"  # Default: admin123
export TARGET_APP="http://your-backend:3000"   # Default: http://localhost:3000
```

2. **Start the Firewall**:
```bash
node index.js
```

3. **Access Admin Dashboard**:
- Go to `/admin-login`
- Enter password (default: `admin123`)
- View all blocked users and statistics

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Firewall server port | 5000 |
| `TARGET_APP` | Backend application URL | http://localhost:3000 |
| `ADMIN_PASSWORD` | Admin dashboard password | admin123 |

### How It Works

```
User Request → VPN Firewall (Port 5000) → Decision:
                                           ├─ VPN Detected → Block & Log
                                           └─ Legitimate → Forward to Backend
```

## 📊 Admin Dashboard

Access the admin panel at `/admin-login` to view:
- Total blocked users
- Last 24 hours activity
- Unique countries blocked
- Full details: IPv4, IPv6, ISP, location, timestamp

## 🔒 Security

- Detects VPN services (NordVPN, ExpressVPN, etc.)
- Blocks proxy services
- Identifies hosting/datacenter IPs
- Prevents Cloudflare WARP access
- Logs all suspicious attempts

## 📁 Data Storage

- `blocked-users.json` - JSON database of blocked users
- `vpn-log.txt` - Text log of blocked attempts

## ⚠️ Important

**Change the default admin password before deploying to production!**

```bash
export ADMIN_PASSWORD="your-very-secure-password"
```

## 🛠️ Use Cases

- Protect web apps from VPN-based attacks
- Prevent fraud from proxy services
- Monitor suspicious access patterns
- Block bot traffic from datacenters
- Geographic access control

## 📝 License

ISC
