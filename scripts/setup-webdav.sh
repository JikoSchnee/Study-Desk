#!/usr/bin/env bash
set -euo pipefail

# One-command Study Desk WebDAV deployment. It creates a private Docker Compose
# stack with Caddy-managed TLS and prints the exact values for the desktop app.

if [[ "${EUID}" -ne 0 ]]; then
  echo "请使用 sudo 运行此脚本，例如：curl -fsSL <脚本地址> | sudo bash"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "需要先安装 Docker Engine 与 Docker Compose 插件，然后重新运行此脚本。"
  exit 1
fi

read -r -p "请输入已解析到此服务器的域名（例如 sync.example.com）: " DOMAIN
if [[ ! "${DOMAIN}" =~ ^[A-Za-z0-9.-]+$ || "${DOMAIN}" != *.* ]]; then
  echo "域名格式无效。请先将域名 A/AAAA 记录指向此服务器，再重新运行。"
  exit 1
fi

read -r -p "使用默认远端目录 study-desk？[Y/n] " DIRECTORY_ANSWER
DIRECTORY="study-desk"
if [[ "${DIRECTORY_ANSWER,,}" == "n" ]]; then
  read -r -p "远端目录名称: " DIRECTORY
  if [[ ! "${DIRECTORY}" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "目录只能包含字母、数字、点、下划线和连字符。"
    exit 1
  fi
fi

INSTALL_DIR="/opt/study-desk-webdav"
USERNAME="study-desk"
PASSWORD="$(openssl rand -hex 24)"
install -d -m 0700 "${INSTALL_DIR}/data"

cat > "${INSTALL_DIR}/.env" <<EOF
DOMAIN=${DOMAIN}
WEBDAV_USERNAME=${USERNAME}
WEBDAV_PASSWORD=${PASSWORD}
EOF
chmod 0600 "${INSTALL_DIR}/.env"

cat > "${INSTALL_DIR}/config.yml" <<'EOF'
address: 0.0.0.0
port: 6065
behindProxy: true
directory: /data
permissions: CRUD
users:
  - username: "{env}WEBDAV_USERNAME"
    password: "{env}WEBDAV_PASSWORD"
    permissions: CRUD
EOF

cat > "${INSTALL_DIR}/Caddyfile" <<'EOF'
{$DOMAIN} {
  reverse_proxy webdav:6065
}
EOF

cat > "${INSTALL_DIR}/compose.yml" <<'EOF'
services:
  webdav:
    image: ghcr.io/hacdias/webdav:latest
    restart: unless-stopped
    command: -c /config.yml
    env_file: .env
    volumes:
      - ./config.yml:/config.yml:ro
      - ./data:/data
  caddy:
    image: caddy:2
    restart: unless-stopped
    env_file: .env
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
volumes:
  caddy_data:
  caddy_config:
EOF

cd "${INSTALL_DIR}"
docker compose up -d

cat <<EOF

部署完成。请在 Study Desk 的“设置 → 服务器云同步”填写：

  WebDAV 地址: https://${DOMAIN}
  远端目录: ${DIRECTORY}
  用户名: ${USERNAME}
  WebDAV 密码: ${PASSWORD}

然后依次点击“保存同步器”、“测试连接”和“立即同步”。

请妥善保存上面的密码。它也保存在仅 root 可读的 ${INSTALL_DIR}/.env 中。
EOF
