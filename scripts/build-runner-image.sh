#!/usr/bin/env bash
# Builds the sandbox image used for lint/typecheck/test/build.
# Prefers runner/Dockerfile. If the container registry is unreachable (as in
# some locked-down environments), falls back to assembling a minimal image
# from the host's own Node binary and its shared libraries.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${PROOFLAYER_RUNNER_IMAGE:-prooflayer-runner:node22}"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start the Docker daemon and re-run." >&2; exit 1
fi

if docker build -q -t "$IMAGE" "$ROOT/runner" >/dev/null 2>&1; then
  echo "Built $IMAGE from runner/Dockerfile"; exit 0
fi

echo "Registry unreachable; assembling $IMAGE from the host Node binary"
NODE="$(readlink -f "$(command -v node)")"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/usr/local/bin" "$TMP/tmp" "$TMP/work" "$TMP/etc"
cp "$NODE" "$TMP/usr/local/bin/node"
for lib in $(ldd "$NODE" | grep -oE '/[^ ]+\.so[^ ]*'); do
  mkdir -p "$TMP$(dirname "$lib")"; cp -L "$lib" "$TMP$lib"
done
echo 'runner:x:10001:10001::/work:/usr/sbin/nologin' > "$TMP/etc/passwd"
echo 'runner:x:10001:' > "$TMP/etc/group"
chmod 1777 "$TMP/tmp"
tar -C "$TMP" -c . | docker import -c 'USER 10001' -c 'WORKDIR /work' -c 'ENV PATH=/usr/local/bin' - "$IMAGE" >/dev/null
docker run --rm --network none "$IMAGE" node -e 'console.log("sandbox ready: node " + process.version)'
