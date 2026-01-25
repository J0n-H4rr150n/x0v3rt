# All Features Test

This file tests multiple features in one document for comprehensive validation.

## Related Test Files

Use these wiki links to navigate to specific feature tests:

- [[test-code-blocks]] - Test syntax highlighting and copy buttons
- [[test-lists-formatting]] - Test various list types and nesting
- [[test-tables]] - Test table rendering and alignment
- [[test-typography]] - Test inline formatting and typography
- [[test-search-keywords]] - Test full-text search with Ctrl+P

**Navigation Tips:**
- Click on wiki links (if supported) or use **Ctrl+P** to search for file names
- Test the **Preview toggle** button to switch between raw markdown and rendered view

## 1. Headings and Typography

### Italic and Bold
This is *italic* and this is **bold** and this is ***both***.

### Strikethrough and Code
~~This is deprecated~~ but `this.is.code()` is current.

---

## 2. Lists

**Unordered:**
- Finding 1
  - Sub-finding A
  - Sub-finding B
- Finding 2

**Ordered:**
1. Step one
2. Step two
3. Step three

**Tasks:**
- [x] Completed task
- [ ] Pending task

---

## 3. Code Blocks

```python
# Python example
def find_sqli(url):
    payload = "' OR '1'='1"
    return test_injection(url, payload)
```

```json
{
  "status": "vulnerable",
  "severity": "critical"
}
```

---

## 4. Tables

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |
| Data 4   | Data 5   | Data 6   |

---

## 5. Blockquotes

> This is a quote about security
> > Nested quote for emphasis

---

## 6. Links and Images

[Link to OWASP](https://owasp.org)

Inline URL: https://example.com

---

## 7. Horizontal Rules

Three different styles:

***

---

___

## 8. Mixed Content

Here's a **critical** finding with `CVE-2024-1234`:

```bash
curl -X POST https://api.example.com/login \
  -d '{"user":"admin","pass":"' OR '1'='1"}'
```

**Impact**: SQL Injection allows:
- [ ] Database enumeration
- [x] Authentication bypass
- [ ] Remote code execution

**CVSS Score**: 9.8 (Critical)

| Metric | Value |
|--------|-------|
| Attack Vector | Network |
| Privileges Required | None |
| User Interaction | None |

---

## 9. Search Keywords

CVE-2024-1234, 192.168.1.1, SQL injection, XSS payload, admin panel
