# Security policy

ProofLayer is a prototype. The public deployment is a read-only demonstration:

- It has no sign-in and refuses state-changing requests.
- It has no operator credentials or API keys configured, and ignores them if they are set.
- It has no verification worker and does not execute the code of a checked repository. It serves recorded evidence, including static builds of the fictional demo app, which the visitor's browser loads in a sandboxed frame.

Live verification exists only in private installations.

## Reporting a vulnerability

Please do not put vulnerability details in a public issue.

- If this repository shows **Security → Report a vulnerability**, use it. That opens a private report.
- If that option is not shown, open an issue titled "Security contact request" with no technical details, and a private channel will be arranged.

Include the URL or file, what you did, and what you observed.

Please do not test against anything other than the public read-only demo, and do not attempt denial of service.

## Scope

- In scope: the public demo deployment, and the code in this repository (app, worker, scripts).
- Out of scope: third-party services (Vercel, GitHub), and findings that require an already-authenticated operator on their own machine unless they cross a sandbox boundary.

The threat model, findings and residual risks are in [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md). That audit was AI-assisted and internal; it is not an external penetration test or a certification.
