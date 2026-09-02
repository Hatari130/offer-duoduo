#!/usr/bin/env bash
set -Eeuo pipefail

release_id="${1:-}"
release_root="/www/wwwroot/jobkoi-releases"
incoming_root="/www/wwwroot/jobkoi-incoming"
live_link="/www/wwwroot/jobkoi"
service_name="jobkoi-api"
environment_file="/etc/jobkoi-api.env"

if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]]; then
  echo "release id must be a 40-character lowercase Git commit SHA" >&2
  exit 2
fi

release_path="$release_root/$release_id"
staging_path="$release_root/.staging-$release_id"
archive_path="$incoming_root/$release_id.tar.gz"

if [[ "$(realpath -e "$release_root")" != "$release_root" ]]; then
  echo "release root is not the expected real directory" >&2
  exit 2
fi
if [[ ! -L "$live_link" ]]; then
  echo "$live_link must be a symlink before automated activation" >&2
  exit 2
fi
if [[ ! -f "$environment_file" ]]; then
  echo "production environment file is missing" >&2
  exit 2
fi

previous_release="$(readlink -f "$live_link")"
if [[ "$previous_release" == "$release_path" ]]; then
  if [[ "$(cat "$release_path/REVISION" 2>/dev/null)" != "$release_id" ]]; then
    echo "active release revision marker is invalid" >&2
    exit 2
  fi
  curl --fail --silent --show-error \
    -H "X-Forwarded-Proto: https" \
    http://127.0.0.1:8787/health >/dev/null
  rm -f "$archive_path"
  echo "$release_id is already active and healthy"
  exit 0
fi

resolved_archive="$(realpath -e "$archive_path")"
if [[ "$resolved_archive" != "$archive_path" || "$resolved_archive" != "$incoming_root/"* ]]; then
  echo "release archive is outside the managed incoming directory" >&2
  exit 2
fi
archive_manifest="$(tar -tzf "$archive_path")"
if grep -Eq '(^/|(^|/)\.\.(/|$))' <<<"$archive_manifest"; then
  echo "release archive contains an unsafe path" >&2
  exit 2
fi

next_link="/www/wwwroot/.jobkoi-next-$release_id"
activated=0

cleanup_staging() {
  if [[ -d "$staging_path" ]]; then
    find "$staging_path" -mindepth 1 -delete
    rmdir "$staging_path"
  fi
}

rollback() {
  status=$?
  if [[ "$activated" == "1" && -d "$previous_release" ]]; then
    rollback_link="/www/wwwroot/.jobkoi-rollback-$release_id"
    ln -s "$previous_release" "$rollback_link"
    mv -Tf "$rollback_link" "$live_link"
    systemctl restart "$service_name" || true
    echo "deployment failed; restored $previous_release" >&2
  fi
  rm -f "$next_link"
  cleanup_staging
  exit "$status"
}
trap rollback ERR INT TERM

if [[ -e "$release_path" ]]; then
  resolved_candidate="$(realpath -e "$release_path")"
  if [[ "$resolved_candidate" != "$release_path" || "$resolved_candidate" != "$release_root/"* ]]; then
    echo "existing release candidate is outside the managed release directory" >&2
    exit 2
  fi
  find "$release_path" -mindepth 1 -delete
  rmdir "$release_path"
fi
cleanup_staging
install -d -m 0755 -o admin -g admin "$staging_path"
tar --extract --gzip --file "$archive_path" --directory "$staging_path" --no-same-owner

if [[ "$(cat "$staging_path/REVISION" 2>/dev/null)" != "$release_id" ]]; then
  echo "release revision marker does not match the requested commit" >&2
  false
fi
if [[ ! -f "$staging_path/package.json" || ! -f "$staging_path/apps/api/package.json" ]]; then
  echo "release is missing API workspace files" >&2
  false
fi
if [[ ! -f "$staging_path/apps/web/dist/index.html" ]]; then
  echo "release is missing the validated Web build" >&2
  false
fi
if [[ ! -f "$staging_path/apps/web/dist/admin/index.html" ]]; then
  echo "release is missing the validated operations dashboard" >&2
  false
fi

chown -R admin:admin "$staging_path"
(
  cd "$staging_path"
  runuser -u admin -- env HOME=/home/admin CI=true \
    /usr/bin/pnpm install --frozen-lockfile
)

set -a
# shellcheck disable=SC1090
source "$environment_file"
set +a
migration_database_url="${MIGRATION_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$migration_database_url" ]]; then
  echo "MIGRATION_DATABASE_URL or DATABASE_URL is required for migrations" >&2
  false
fi
(
  cd "$staging_path"
  runuser -u admin -- env HOME=/home/admin DATABASE_URL="$migration_database_url" \
    /usr/bin/pnpm --filter @offerflow/api db:migrate
)

mv "$staging_path" "$release_path"
rm -f "$next_link"
ln -s "$release_path" "$next_link"
mv -Tf "$next_link" "$live_link"
activated=1
systemctl restart "$service_name"

healthy=0
for _ in {1..20}; do
  if curl --fail --silent --show-error \
    -H "X-Forwarded-Proto: https" \
    http://127.0.0.1:8787/health >/dev/null; then
    healthy=1
    break
  fi
  sleep 1
done
if [[ "$healthy" != "1" ]]; then
  echo "health check failed after activating $release_id" >&2
  false
fi

rm -f "$archive_path"
trap - ERR INT TERM
echo "activated $release_id (previous: $previous_release)"
