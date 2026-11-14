#!/usr/bin/env bash
# Run on Dell. Includes NEW DSH runtime and secrets; keep archive private.
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run as root on the deployment host'; exit 1; }
audit_backup_dir=/opt/dsh-v2/backups
install -d -m 700 "$audit_backup_dir"
audit_archive="$audit_backup_dir/openaudit-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
audit_was_active=false
if systemctl is-active --quiet openaudit; then audit_was_active=true; systemctl stop openaudit; fi
trap 'if $audit_was_active; then systemctl start openaudit; fi' EXIT
umask 077
tar -czf "$audit_archive" -C /opt/dsh-v2 home secrets openaudit-data openaudit/deploy
sha256sum "$audit_archive" > "$audit_archive.sha256"
echo "Private backup created: $audit_archive"
