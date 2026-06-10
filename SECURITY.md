# Security Policy for Snowball

The Snowball team takes the security of our application and our users' data seriously. As an offline-first habit tracker built with Tauri and React, our primary security philosophy revolves around local data ownership and minimizing external attack vectors.

## Supported Versions

We actively maintain and provide security updates for the following versions of Snowball:

| Version | Supported          |
| ------- | ------------------ |
| > 7.0.x | :white_check_mark: |
| < 7.0.0 | :x:                |

*Note: Since Snowball heavily relies on the system's native WebView (via Tauri) and the Rust toolchain, we strongly recommend users keep their host operating systems updated to receive the latest WebView security patches.*

## Security Architecture

Snowball leverages the **Tauri framework**, which provides several out-of-the-box security guarantees compared to traditional desktop wrappers:
* **No Bundled Server:** We do not bundle a Node.js runtime. 
* **Strict IPC (Inter-Process Communication):** All communication between the React frontend and the Rust backend is strictly typed and routed through explicitly allowed Tauri commands.
* **Capability Restrictions:** File system access, shell execution, and network requests are strictly scoped in our `tauri.conf.json`. The app only has access to the specific local directories required to store your habit data.
* **Offline-First:** Your data is yours. Snowball does not send telemetry, user habits, or analytics to external servers.

## Reporting a Vulnerability

If you discover a security vulnerability within Snowball, please **do not open a public GitHub issue**. We ask that you practice responsible disclosure.

Please report the vulnerability by reaching out via email:
**JustHorrid12@gmail.com**

### What to include in your report:
To help us triage and resolve the issue quickly, please include:
* **Type of issue:** (e.g., IPC bypass, arbitrary file write, XSS).
* **Location:** The specific file, component, or Rust command where the vulnerability exists.
* **Reproduction Steps:** Step-by-step instructions on how to reproduce the exploit.
* **Impact:** What an attacker could achieve by exploiting this.
* **Proof of Concept (PoC):** Any code or screenshots demonstrating the exploit.

### Response Timeline
1. We will acknowledge receipt of your vulnerability report within **48 hours**.
2. We will triage the report and verify the vulnerability within **1 week**.
3. Once verified, we will work on patching the issue and releasing a hotfix. 

## Coordinated Disclosure

We believe in the open-source community. Once a vulnerability is reported and patched, we will publish a security advisory on GitHub, explicitly crediting you (if you choose to be credited) for the discovery. 

Please refrain from publicly discussing the vulnerability or sharing the exploit code until the patch has been released and users have been given a reasonable amount of time to update their software.

---
*Thank you for helping keep Snowball secure!*
