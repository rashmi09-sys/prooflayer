# Sandbox image for ProofLayer checks. Contains Node only; no shell tools,
# no package manager, no credentials. Runs as an unprivileged user.
FROM node:22-bookworm-slim
RUN useradd --uid 10001 --create-home --home-dir /work runner && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
USER 10001
WORKDIR /work
ENV NEXT_TELEMETRY_DISABLED=1 CI=1
