#!/bin/sh
set -eu

# 此腳本只接受四個 immutable images，並在 Docker internal network 中執行真實跨服務 smoke。
require_image() {
  image_var="$1"
  image_value="$2"
  case "$image_value" in
    *@sha256:????????????????????????????????????????????????????????????????) ;;
    *) echo "P0.7_UNVERIFIED: $image_var 必須是 immutable digest reference" >&2; exit 1 ;;
  esac
}
require_image WEB_EDGE_IMAGE "${WEB_EDGE_IMAGE:-}"
require_image TUTOR_BACKEND_IMAGE "${TUTOR_BACKEND_IMAGE:-}"
require_image VOICE_BACKEND_IMAGE "${VOICE_BACKEND_IMAGE:-}"
require_image OPENCLAW_LEARNING_IMAGE "${OPENCLAW_LEARNING_IMAGE:-}"

node deployment/staging/validate-env.mjs

project_name="mentornest-p07-evidence"
compose_files="-f deployment/staging/compose.yaml -f deployment/staging/compose.runtime-evidence.yaml"

cleanup() {
  docker compose -p "$project_name" $compose_files down --volumes >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker compose -p "$project_name" $compose_files pull
docker compose -p "$project_name" $compose_files up --detach --no-build --wait

network_internal="$(docker network inspect "${project_name}_private" --format '{{.Internal}}')"
test "$network_internal" = "true" || {
  echo "P0.7_UNVERIFIED: runtime private network 並非 internal，no-cloud topology 未成立" >&2
  exit 1
}

for isolated_service in voice-backend openclaw-learning; do
  container_id="$(docker compose -p "$project_name" $compose_files ps --quiet "$isolated_service")"
  network_count="$(docker inspect "$container_id" --format '{{len .NetworkSettings.Networks}}')"
  test "$network_count" = "1" || {
    echo "P0.7_UNVERIFIED: $isolated_service 連接額外 network，no-cloud topology 未成立" >&2
    exit 1
  }
done

# Runner 只帶合成 subject 與短效測試 secret；不掛載或讀取任何 student data volume。
docker run --rm \
  --network "${project_name}_private" \
  --volume "$PWD/test/staging/runtime-evidence-smoke.mjs:/workspace/test/staging/runtime-evidence-smoke.mjs:ro" \
  --volume "$PWD/server/auth/session-auth.mjs:/workspace/server/auth/session-auth.mjs:ro" \
  --workdir /workspace \
  --env P07_WEB_EDGE_ORIGIN=http://web-edge \
  --env P07_TUTOR_INTERNAL_ORIGIN=http://tutor-backend:8787 \
  --env P07_TUTOR_INVALID_CREDENTIAL_ORIGIN=http://tutor-invalid-runtime-credential:8787 \
  --env P07_TUTOR_CONTRACT_MISMATCH_ORIGIN=http://tutor-contract-mismatch:8787 \
  --env P07_TUTOR_MISSING_CAPABILITY_ORIGIN=http://tutor-missing-capability:8787 \
  --env P011_TUTOR_PROVIDER_UNAVAILABLE_ORIGIN=http://tutor-provider-unavailable:8787 \
  --env P011_WEB_EDGE_VOICE_UNAVAILABLE_ORIGIN=http://web-edge-voice-unavailable \
  --env P07_VOICE_INTERNAL_ORIGIN=http://voice-backend:8502 \
  --env P011_OPENCLAW_INTERNAL_ORIGIN=http://openclaw-learning:18789 \
  --env P07_SESSION_SECRET="$MENTORNEST_GATEWAY_SESSION_SECRET" \
  --env P07_SERVICE_AUTH_KEY="$MENTORNEST_SERVICE_AUTH_KEY" \
  --env P011_OPENCLAW_SERVICE_AUTH_KEY="$OPENCLAW_SERVICE_AUTH_KEY" \
  --env P07_VOICE_IMAGE="$VOICE_BACKEND_IMAGE" \
  --env P07_OPENCLAW_IMAGE="$OPENCLAW_LEARNING_IMAGE" \
  --env P07_STAGING_DATA_NAMESPACE="$STAGING_DATA_NAMESPACE" \
  --env P07_SYNTHETIC_SUBJECT=student_test_p07_runtime \
  "$TUTOR_BACKEND_IMAGE" node test/staging/runtime-evidence-smoke.mjs

docker compose -p "$project_name" $compose_files images
echo "P0.7_RUNTIME_EVIDENCE_OK"
