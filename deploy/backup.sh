#!/usr/bin/env bash
set -euo pipefail
umask 077
# mysql option file is root-readable, e.g. /etc/nuansua/backup.cnf.
: "${MYSQL_OPTION_FILE:?Set a private MySQL option file}"
: "${BACKUP_DIR:?Set the second-disk or mounted remote backup directory}"
UPLOAD_DIR="${UPLOAD_DIR:-/var/lib/nuansua/uploads}"
DATABASE_NAME="${DATABASE_NAME:-nuansua-api}"
[[ "$DATABASE_NAME" =~ ^[a-zA-Z0-9_-]+$ ]] || exit 2
mkdir -p -- "$BACKUP_DIR"
name="nuansua-$(date -u +%Y%m%dT%H%M%SZ)"
stage="$(mktemp -d "$BACKUP_DIR/.staging-XXXXXXXX")"
trap 'rm -rf -- "$stage"' EXIT
mysqldump --defaults-extra-file="$MYSQL_OPTION_FILE" --single-transaction --no-tablespaces --set-gtid-purged=OFF --hex-blob "$DATABASE_NAME" > "$stage/database.sql"
tar -C "$UPLOAD_DIR" -cf "$stage/uploads.tar" .
tar -C "$stage" -czf "$BACKUP_DIR/$name.tar.gz.tmp" database.sql uploads.tar
mv -- "$BACKUP_DIR/$name.tar.gz.tmp" "$BACKUP_DIR/$name.tar.gz"
sha256sum "$BACKUP_DIR/$name.tar.gz" > "$BACKUP_DIR/$name.tar.gz.sha256"
# Restrict retention to archives this script created, within the configured dir.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'nuansua-????????T??????Z.tar.gz*' -mtime +13 -delete
echo "Backup completed: $name"
