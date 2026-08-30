# Security Policy for Snowball

The Snowball team takes the security of our application, server infrastructure, and users' data seriously. As an offline-first productivity and habit-tracking application built across Web (PWA), Desktop (Tauri/Rust), Android (Capacitor), and Serverless Cloud (Express/Supabase), our security model prioritizes local data ownership, strict transport security, and defense-in-depth isolation.

## Supported Versions

We actively maintain and provide security updates for the following versions of Snowball:

| Version  | Supported | Status                                     |
| -------- | --------- | ------------------------------------------ |
| >= 7.0.x | ✅        | Actively supported with hotfixes & patches |
| < 7.0.0  | ❌        | End of Life                                |

*Note: Since Snowball relies on system native WebViews (via Tauri on desktop and Capacitor on Android), we strongly recommend users keep their host operating systems updated to receive the latest WebView and runtime security patches.*

## Security Architecture & Invariants

Snowball enforces strict security invariants across both frontend clients and backend APIs:

1. **Authentication & Token Isolation**:

   - Web sessions use `HttpOnly`, `SameSite=Lax/None`, `Secure` cookies.
   - Native desktop (Tauri) and mobile (Android) clients isolate Bearer tokens in IndexedDB and in-memory stores; no raw JWTs or user PII are stored in plain `localStorage`.
   - Token revocation is backed by a persistent token blacklist.
2. **Cross-Site Request Forgery (CSRF) Protection**:

   - All state-changing API endpoints (`POST`, `PUT`, `DELETE`, `PATCH`) require custom request validation (`X-Requested-With: XMLHttpRequest`).
3. **Database & Row-Level Security (RLS)**:

   - User-scoped queries utilize authenticated user tokens respecting Supabase Row Level Security (RLS) policies.
   - Administrative service-role privileges are restricted exclusively to server-side operations and never leaked to frontend clients.
4. **Cross-Site Scripting (XSS) & Code Execution Protections**:

   - Dynamic user content and rich-text note previews are sanitized using `DOMPurify` before DOM injection.
   - Expression evaluation (e.g. Calculator widgets) uses safe recursive-descent parsing without `eval()` or dynamic `Function()` constructors.
5. **Desktop & Mobile Sandbox Guarantees**:

   - Desktop builds (Tauri) restrict IPC commands and file capabilities to specific user directories with strict capability scoping in `tauri.conf.json`.

## Reporting a Vulnerability

If you discover a security vulnerability or potential exploit within Snowball, please **do not open a public GitHub issue**. We ask that you practice responsible, coordinated disclosure.

### Preferred Reporting Channels:

1. **GitHub Private Vulnerability Reporting (Recommended)**:

   - Navigate to the repository's **Security** tab -> **Advisories** -> **Report a vulnerability**.
2. **Security Contact Email**:

   - Email me directly at: **Swarg1408@gmail.com**
   - Please include `[SECURITY] Vulnerability Report` in the subject line.

### What to include in your report:

To help us triage and resolve the issue quickly, please include:

- **Type of issue:** (e.g., Auth bypass, RLS policy gap, XSS, CSRF, IPC escape, dependency advisory).
- **Affected Component:** Specific route, file, or platform (Web, Desktop, Android, Backend).
- **Reproduction Steps:** Step-by-step instructions or scripts to reproduce the behavior.
- **Impact Assessment:** Severity and what an attacker could achieve.
- **Proof of Concept (PoC):** Minimal reproduction payload or screenshots.

### Response Timeline

* **Acknowledgment:** We will acknowledge receipt of your report within **48 hours**.
* **Triage & Assessment:** We will verify and assess the vulnerability within **7 business days**.
* **Remediation & Patch:** We will prepare, test, and deploy a security hotfix in an expedited release cycle.

## Coordinated Disclosure

Once a vulnerability is validated and patched:

- We will release an updated version and publish a GitHub Security Advisory detailing the fix.
- We will gladly credit you for the responsible disclosure in our release notes and advisory (unless you prefer anonymity).

---

*Thank you for helping keep Snowball and its community safe!*
