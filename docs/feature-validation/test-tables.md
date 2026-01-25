# Tables Test

## Basic Table

| IP Address | Port | Service | Version |
|------------|------|---------|---------|
| 192.168.1.1 | 22 | SSH | OpenSSH 7.4 |
| 192.168.1.1 | 80 | HTTP | Apache 2.4.6 |
| 192.168.1.1 | 443 | HTTPS | Apache 2.4.6 |
| 192.168.1.1 | 3306 | MySQL | 5.7.31 |

## Vulnerability Report Table

| Severity | Title | CVE | CVSS | Status |
|----------|-------|-----|------|--------|
| 🔴 Critical | SQL Injection in login | CVE-2024-1234 | 9.8 | Open |
| 🟠 High | XSS in search | CVE-2024-5678 | 7.5 | Fixed |
| 🟡 Medium | CSRF in settings | - | 6.1 | Open |
| 🟢 Low | Information disclosure | - | 3.7 | Accepted |

## Subdomain Enumeration Results

| Subdomain | IP | Status | Technologies |
|-----------|----|----|--------------|
| www.example.com | 93.184.216.34 | ✅ Active | Nginx, PHP |
| api.example.com | 93.184.216.35 | ✅ Active | Node.js, Express |
| dev.example.com | 93.184.216.36 | ✅ Active | Apache, Django |
| admin.example.com | 93.184.216.37 | ❌ Protected | Unknown |

## Exploitation Timeline

| Time | Action | Result |
|------|--------|--------|
| 14:00 | Initial scan | 15 open ports discovered |
| 14:30 | Subdomain enum | 8 subdomains found |
| 15:00 | Directory brute force | /admin, /api/v1 discovered |
| 15:45 | SQL injection test | Vulnerable parameter found |
| 16:00 | Exploit developed | RCE achieved |
| 16:30 | Report submitted | Bug bounty awarded |

## Alignment Test

| Left Aligned | Center Aligned | Right Aligned |
|:-------------|:--------------:|--------------:|
| Target | 192.168.1.1 | $500 |
| Finding | SQL Injection | Critical |
| Bounty | Paid | $5,000 |
