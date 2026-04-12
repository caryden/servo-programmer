#!/usr/bin/env bash
set -euo pipefail

repo="${AXON_REPO:-caryden/servo-programmer}"
install_dir="${AXON_INSTALL_DIR:-/usr/local/bin}"
version="${AXON_VERSION:-latest}"
download_root="${AXON_DOWNLOAD_ROOT:-https://github.com/${repo}/releases}"

usage() {
  cat <<'EOF'
Install axon from GitHub Releases.

Environment overrides:
  AXON_INSTALL_DIR   Install directory (default: /usr/local/bin)
  AXON_VERSION       Release tag to install, for example v1.0.0 (default: latest)
  AXON_REPO          GitHub repo owner/name (default: caryden/servo-programmer)
  AXON_DOWNLOAD_ROOT Override the GitHub releases base URL for testing
EOF
}

case "${1:-}" in
  --help|-h)
    usage
    exit 0
    ;;
esac

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 1
  fi
}

need_cmd curl
need_cmd mktemp
need_cmd install

host_os="$(uname -s)"
host_arch="$(uname -m)"

asset=""
case "${host_os}:${host_arch}" in
  Darwin:arm64) asset="axon-darwin-arm64" ;;
  Darwin:x86_64) asset="axon-darwin-x64" ;;
  Linux:x86_64) asset="axon-linux-x64" ;;
  Linux:aarch64|Linux:arm64) asset="axon-linux-arm64" ;;
  *)
    echo "error: install.sh currently supports macOS and Linux only; detected ${host_os}/${host_arch}" >&2
    exit 1
    ;;
esac

if [[ "${version}" == "latest" ]]; then
  asset_url="${download_root}/latest/download/${asset}"
  checksum_url="${download_root}/latest/download/${asset}.sha256"
else
  asset_url="${download_root}/download/${version}/${asset}"
  checksum_url="${download_root}/download/${version}/${asset}.sha256"
fi

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

binary_path="${tmp_dir}/${asset}"
checksum_path="${tmp_dir}/${asset}.sha256"

echo "Downloading ${asset} from ${repo} (${version})"
curl -fsSL "${asset_url}" -o "${binary_path}"
curl -fsSL "${checksum_url}" -o "${checksum_path}"

expected_hash="$(awk '{print $1}' "${checksum_path}")"
if [[ -z "${expected_hash}" ]]; then
  echo "error: could not parse SHA256 from ${checksum_url}" >&2
  exit 1
fi

actual_hash=""
if command -v sha256sum >/dev/null 2>&1; then
  actual_hash="$(sha256sum "${binary_path}" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  actual_hash="$(shasum -a 256 "${binary_path}" | awk '{print $1}')"
else
  echo "error: need sha256sum or shasum to verify the download" >&2
  exit 1
fi

if [[ "${actual_hash}" != "${expected_hash}" ]]; then
  echo "error: checksum mismatch for ${asset}" >&2
  echo "expected: ${expected_hash}" >&2
  echo "actual:   ${actual_hash}" >&2
  exit 1
fi

chmod +x "${binary_path}"
reported_version="$("${binary_path}" --version 2>/dev/null || true)"
if [[ -z "${reported_version}" ]]; then
  reported_version="axon (version check unavailable)"
fi

target_path="${install_dir%/}/axon"
echo "About to install ${reported_version} to ${target_path}"

mkdir -p "${install_dir}"
if [[ ! -w "${install_dir}" ]]; then
  echo "error: cannot write to ${install_dir}" >&2
  echo "hint: rerun with AXON_INSTALL_DIR=\$HOME/.local/bin or choose a writable directory." >&2
  exit 1
fi

install -m 0755 "${binary_path}" "${target_path}"

echo "Installed ${reported_version} at ${target_path}"
echo "Run: ${target_path} doctor"
