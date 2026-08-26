#!/usr/bin/env bash
set -Eeuo pipefail

release_id="${1:-}"
release_root="/www/wwwroot/jobkoi-releases"
live_link="/www/wwwroot/jobkoi"
service_name="jobkoi-api"
environment_file="/etc/jobkoi-api.env"

if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]]; then
  echo "release id must be a 40-character lowercase Git commit SHA" >&2
  exit 2
fi

release_path="$release_root/$release_id"
resolved_release="$(realpath -e "$release_path")"
if [[ "$resolved_release" != "$release_path" || "$resolved_release" != "$release_root/"* ]]; then
  echo "release path is outside the managed release directory" >&2
  exit 2
fi
if [[ ! -L "$live_link" ]]; then
  echo "$live_link must be a symlink before automated activation" >&2
  exit 2
fi
if [[ ! -f "$release_path/package.json" || ! -f "$release_path/apps/api/package.json" ]]; then
  echo "release is missing API workspace files" >&2
  exit 2
fi
if [[ ! -f "$release_path/apps/web/dist/index.html" ]]; then
  echo "release is missing the validated Web build" >&2
  exit 2
fi
if [[ ! -f "$environment_file" ]]; then
  echo "production environment file is missing" >&2
  exit 2
fi

previous_release="$(readlink -f "$live_link")"
next_link="/www/wwwroot/.jobkoi-next-$release_id"
activated=0

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
  exit "$status"
}
trap rollback ERR INT TERM

set -a
# shellcheck disable=SC1090
source "$environment_file"
set +a
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for migrations" >&2
  exit 2
fi

runuser -u admin -- env HOME=/home/admin DATABASE_URL="$DATABASE_URL" \
  /usr/bin/pnpm --dir "$release_path" --filter @offerflow/api db:migrate

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

trap - ERR INT TERM
echo "activated $release_id (previous: $previous_release)"
