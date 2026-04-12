#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

mkdir -p "${tmp_dir}/bin" "${tmp_dir}/releases/latest/download" "${tmp_dir}/install"

asset_name=""
case "$(uname -s):$(uname -m)" in
  Darwin:arm64) asset_name="axon-darwin-arm64" ;;
  Darwin:x86_64) asset_name="axon-darwin-x64" ;;
  Linux:x86_64) asset_name="axon-linux-x64" ;;
  Linux:aarch64|Linux:arm64) asset_name="axon-linux-arm64" ;;
  *)
    echo "skipping install test on unsupported host $(uname -s)/$(uname -m)"
    exit 0
    ;;
esac

cat > "${tmp_dir}/releases/latest/download/${asset_name}" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" ]]; then
  echo "axon 9.9.9-test"
else
  echo "fake axon"
fi
EOF
chmod +x "${tmp_dir}/releases/latest/download/${asset_name}"

if command -v sha256sum >/dev/null 2>&1; then
  (
    cd "${tmp_dir}/releases/latest/download"
    sha256sum "${asset_name}" > "${asset_name}.sha256"
  )
else
  (
    cd "${tmp_dir}/releases/latest/download"
    shasum -a 256 "${asset_name}" > "${asset_name}.sha256"
  )
fi

cat > "${tmp_dir}/bin/curl" <<EOF
#!/usr/bin/env bash
set -euo pipefail
out=""
url=""
while [[ \$# -gt 0 ]]; do
  case "\$1" in
    -o)
      out="\$2"
      shift 2
      ;;
    -*)
      shift
      ;;
    *)
      url="\$1"
      shift
      ;;
  esac
done
if [[ -z "\${url}" ]]; then
  exit 2
fi
path="\${url#https://example.invalid}"
src="${tmp_dir}\${path}"
if [[ -z "\${out}" ]]; then
  cat "\${src}"
else
  cp "\${src}" "\${out}"
fi
EOF
chmod +x "${tmp_dir}/bin/curl"

PATH="${tmp_dir}/bin:${PATH}" \
AXON_DOWNLOAD_ROOT="https://example.invalid/releases" \
AXON_INSTALL_DIR="${tmp_dir}/install" \
  "${repo_root}/scripts/install.sh"

"${tmp_dir}/install/axon" --version | grep -F "axon 9.9.9-test" >/dev/null
echo "install.sh test passed"
