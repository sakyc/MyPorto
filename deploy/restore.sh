#!/usr/bin/env bash
set -euo pipefail
umask 077
# Restore into an EMPTY, explicitly named database and an EMPTY uploads directory.
# Stop the API first for a production restore. Test with a separate DB beforehand.
: "${MYSQL_OPTION_FILE:?Set a private MySQL option file}"
: "${RESTORE_DATABASE:?Set the empty destination database}"
: "${RESTORE_UPLOAD_DIR:?Set the empty uploads destination}"
archive="${1:?Pass an absolute backup archive path}"
[[ "$RESTORE_DATABASE" =~ ^[a-zA-Z0-9_-]+$ ]] || exit 2
[[ "$archive" = /* ]] || { echo 'Use an absolute archive path.' >&2; exit 2; }
sha256sum -c "$archive.sha256"
count="$(mysql --defaults-extra-file="$MYSQL_OPTION_FILE" --batch --skip-column-names -e "SELECT count(*) FROM information_schema.tables WHERE table_schema = '$RESTORE_DATABASE'")"
[[ "$count" = 0 ]] || { echo 'Destination database must be empty.' >&2; exit 2; }
mkdir -p -- "$RESTORE_UPLOAD_DIR"
[[ -z "$(find "$RESTORE_UPLOAD_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]] || { echo 'Uploads destination must be empty.' >&2; exit 2; }
stage="$(mktemp -d)"
trap 'rm -rf -- "$stage"' EXIT
tar -xzf "$archive" -C "$stage" database.sql uploads.tar
mysql --defaults-extra-file="$MYSQL_OPTION_FILE" "$RESTORE_DATABASE" < "$stage/database.sql"
tar --no-same-owner -xf "$stage/uploads.tar" -C "$RESTORE_UPLOAD_DIR"
echo 'Restore complete. Verify health, publication, login, and one image before starting traffic.'
