# Security policy

ProofLayer is a prototype. The public deployment is a read-only demonstration: it has no sign-in, accepts no state-changing requests, runs no code and holds no secrets. Live verification exists only in private installations.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository. Do not open a public issue. Include the URL or file, what you did, and what you observed.

Please do not test against anything other than the public read-only demo, and do not attempt denial of service.

## Scope

- In scope: the public demo deployment, and the code in this repository (app, worker, scripts).
- Out of scope: third-party services (Vercel, GitHub), and findings that require an already-authenticated operator on their own machine unless they cross a sandbox boundary.

The current threat model, findings and residual risks are in [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md).
