# Lists and Formatting Test

## Unordered Lists

- Reconnaissance
  - Subdomain enumeration
  - Port scanning
  - Technology detection
- Vulnerability Assessment
  - SQL Injection
  - XSS
  - CSRF
  - Authentication bypass
- Exploitation
  - Proof of concept development
  - Privilege escalation
  - Lateral movement

## Ordered Lists

1. Information Gathering
   1. Passive reconnaissance
   2. Active scanning
   3. Service enumeration
2. Vulnerability Discovery
   1. Manual testing
   2. Automated scanning
   3. Code review
3. Exploitation
   1. Develop exploit
   2. Test in safe environment
   3. Report findings

## Task Lists

- [x] Set up testing environment
- [x] Configure Burp Suite
- [ ] Run nuclei scan
- [ ] Test authentication endpoints
- [ ] Check for IDOR vulnerabilities
- [ ] Document findings
- [ ] Submit bug report

## Mixed Nested Lists

* **Web Application Testing**
  1. Login functionality
     - [ ] Test SQL injection
     - [x] Test XSS
     - [ ] Test authentication bypass
  2. API endpoints
     - [ ] Test authorization
     - [ ] Check rate limiting
     - [ ] Verify input validation
* **Network Security**
  1. Port scan results
  2. Service vulnerability assessment
  3. SSL/TLS configuration review

## Definition Lists (via HTML)

<dl>
<dt>CVE</dt>
<dd>Common Vulnerabilities and Exposures - A standardized identifier for vulnerabilities</dd>

<dt>CVSS</dt>
<dd>Common Vulnerability Scoring System - A framework for rating vulnerability severity</dd>

<dt>OWASP</dt>
<dd>Open Web Application Security Project - Community focused on web security</dd>
</dl>

## Deeply Nested Lists

- Target: example.com
  - Subdomains found:
    - api.example.com
      - Endpoints discovered:
        - /api/v1/users
          - Vulnerable to IDOR
          - Missing authentication
        - /api/v1/admin
          - Authentication bypass possible
    - dev.example.com
      - Contains debug information
      - Exposed .git directory
