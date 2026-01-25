# Search Test Document

This file contains specific keywords and patterns to test the full-text search functionality.

## IP Addresses

Found the following IP addresses during reconnaissance:
- 192.168.1.1 (Gateway)
- 192.168.1.100 (Web Server)
- 10.0.0.5 (Database Server)
- 172.16.0.1 (Internal API)

## CVE References

- CVE-2024-1234 - SQL Injection in login form
- CVE-2023-5678 - Remote Code Execution in upload feature
- CVE-2024-9999 - Cross-Site Scripting in search
- CVE-2023-4444 - Authentication Bypass

## URLs and Endpoints

```
https://api.example.com/v1/users
https://dev.example.com/admin/dashboard
http://staging.example.com/api/auth/login
https://example.com/search?q=test&page=1
```

## Vulnerabilities

### SQL Injection
The username parameter accepts SQL injection payloads without proper sanitization.

### Cross-Site Scripting
XSS vulnerability found in the search functionality allowing arbitrary JavaScript execution.

### IDOR
Insecure Direct Object Reference in the /api/users/{id} endpoint.

### Authentication Bypass
Missing JWT validation allows unauthorized access to admin endpoints.

## Passwords and Credentials

**DO NOT store real credentials here - these are examples only**

Default credentials found:
- admin:admin
- root:toor
- administrator:password123

## Hash Values

MD5: 5f4dcc3b5aa765d61d8327deb882cf99
SHA1: 5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8
SHA256: 8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918

## File Paths

```
/var/www/html/index.php
/etc/passwd
/home/user/.ssh/id_rsa
C:\Windows\System32\config\SAM
```

## Keywords for Testing

bug bounty, penetration testing, vulnerability assessment, exploit development,
privilege escalation, lateral movement, persistence, reconnaissance, enumeration,
fuzzing, brute force, dictionary attack, session hijacking, man-in-the-middle
