#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="${ROOT_DIR}/scripts/setup-webdav.sh"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "${TEST_DIR}"' EXIT

mkdir -p "${TEST_DIR}/bin"
cat > "${TEST_DIR}/bin/docker" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "${TEST_DIR}/bin/docker"
export PATH="${TEST_DIR}/bin:${PATH}"

run_account_tests() {
  local install_dir="${TEST_DIR}/accounts"
  STUDY_DESK_WEBDAV_INSTALL_DIR="$install_dir" STUDY_DESK_WEBDAV_LIBRARY=1 source "$SCRIPT"
  install -d -m 0700 "$INSTALL_DIR" "$DATA_DIR" "$ACCOUNTS_DIR" "${DATA_DIR}/empty"
  printf 'DOMAIN=sync.example.test\n' > "${INSTALL_DIR}/.env"

  valid_username alice
  ! valid_username 'alice/name'
  create_account alice 'A password with spaces & symbols!'
  create_account bob 'second-password'
  ! (create_account alice 'duplicate-password')
  reset_account_password bob 'reset password'
  load_account bob
  [[ "$ACCOUNT_PASSWORD" == 'reset password' ]]
  set_account_enabled alice false
  regenerate_config
  rg -F 'directory: "/data/users/bob"' "${INSTALL_DIR}/config.yml" >/dev/null
  ! rg -F 'username: "alice"' "${INSTALL_DIR}/config.yml" >/dev/null
  rg -F 'password: "reset password"' "${INSTALL_DIR}/config.yml" >/dev/null
  touch "$(account_data_dir alice)/snapshot.json"
  purge_account_data alice
  [[ ! -d "$(account_data_dir alice)" ]]
  set_account_enabled alice true
  [[ -d "$(account_data_dir alice)" ]]
  load_account alice
  [[ "$ACCOUNT_PASSWORD" == 'A password with spaces & symbols!' ]]
}

run_legacy_migration_test() {
  local install_dir="${TEST_DIR}/legacy"
  STUDY_DESK_WEBDAV_INSTALL_DIR="$install_dir" STUDY_DESK_WEBDAV_LIBRARY=1 source "$SCRIPT"
  install -d -m 0700 "${INSTALL_DIR}/data"
  cat > "${INSTALL_DIR}/.env" <<'EOF'
DOMAIN=sync.example.test
WEBDAV_USERNAME=legacy-user
WEBDAV_PASSWORD=legacy-password
EOF
  touch "${INSTALL_DIR}/data/study-desk-snapshot.json"
  migrate_legacy_installation
  [[ -f "${INSTALL_DIR}/data/users/legacy-user/study-desk-snapshot.json" ]]
  load_account legacy-user
  [[ "$ACCOUNT_PASSWORD" == 'legacy-password' ]]
  rg -F 'directory: "/data/users/legacy-user"' "${INSTALL_DIR}/config.yml" >/dev/null
}

bash -n "$SCRIPT"
run_account_tests
run_legacy_migration_test
printf 'setup-webdav tests passed\n'
