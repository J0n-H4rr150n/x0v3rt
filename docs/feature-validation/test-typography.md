# Typography and Inline Elements Test

## Headings

# H1: Bug Bounty Report
## H2: Executive Summary
### H3: Vulnerability Details
#### H4: Technical Analysis
##### H5: Remediation Steps
###### H6: References

## Text Formatting

**Bold text** for important findings

*Italic text* for emphasis

***Bold and italic*** for critical alerts

~~Strikethrough~~ for deprecated methods

`Inline code` for commands and parameters

## Links and URLs

[OWASP Top 10](https://owasp.org/www-project-top-ten/)

[PortSwigger Web Security Academy](https://portswigger.net/web-security)

Bare URL: https://hackerone.com

Email: security@example.com

## Inline Code Elements

The parameter `username` is vulnerable to SQL injection.

Try the payload: `' OR '1'='1 --`

The cookie `session_id` lacks the `HttpOnly` flag.

Command to run: `sqlmap -u "http://target.com?id=1" --dbs`

## Emphasis Combinations

This is **very *important* information** about the vulnerability.

The ***critical*** finding requires immediate attention.

Use ~~don't use~~ the secure method instead.

## Special Characters

Escaping: \*Not italic\* \`Not code\`

Symbols: © ® ™ § ¶ † ‡

Math: x² + y² = z²

Arrows: → ← ↑ ↓ ⇒ ⇐

## Horizontal Rules

---

Above and below this line

___

Three ways to make horizontal rules

***

All work equally well

## Blockquotes

> This is a blockquote about security best practices.
>
> Always sanitize user input.
> Never trust client-side validation.

> **Note**: This is a nested quote
> > Important: Test all input fields
> > > Critical: Check for injection vulnerabilities

## Keyboard Shortcuts

Press <kbd>Ctrl</kbd> + <kbd>P</kbd> to search

Use <kbd>Ctrl</kbd> + <kbd>F</kbd> to find

<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>[</kbd> to fold code
