#!/usr/bin/env bash
set -euo pipefail
# Usage: scripts/stage-dell.sh user@ssh-host ssh-port
# Upload an acceptance build into the NEW DSH tree; no service restart or DNS change.
audit_target=${1:?Provide SSH target}; audit_port=${2:-22}
audit_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$audit_root"
test -f packages/client/dist/index.html
test -f packages/server/index.js
ssh -p "$audit_port" -o BatchMode=yes "$audit_target" 'test -x /usr/local/bin/dsh2 && mkdir -p /opt/dsh-v2/openaudit /opt/dsh-v2/openaudit-data'
tar --exclude='./.git' --exclude='./.orca' --exclude='node_modules' --exclude='./runtime' --exclude='./.openaudit-data' --exclude='.venv' --exclude='.test-runtime' --exclude='test-results' --exclude='playwright-report' -czf - . | ssh -p "$audit_port" -o BatchMode=yes "$audit_target" 'tar -xzf - -C /opt/dsh-v2/openaudit'
ssh -p "$audit_port" -o BatchMode=yes "$audit_target" 'export PATH=/opt/dsh-v2/node/bin:$PATH; cd /opt/dsh-v2/openaudit; npm ci --prefix packages/parsers --omit=dev --no-audit --no-fund; chmod 700 /opt/dsh-v2/openaudit-data'
