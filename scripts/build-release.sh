#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/build-release.sh [--target <bun-target>] [--outfile <path>] [--outdir <dir>] [--skip-checks]

Build a standalone axon binary for the current runner and write a matching
SHA256 sidecar. This script is native-runner oriented: use the GitHub release
workflow matrix to build all platforms.

Examples:
  scripts/build-release.sh
  scripts/build-release.sh --target bun-darwin-arm64
  scripts/build-release.sh --target bun-linux-x64 --outfile apps/cli/dist/axon-linux-x64
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cli_dir="${repo_root}/apps/cli"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required to build release binaries" >&2
  exit 1
fi

skip_checks=0
target=""
outfile=""
outdir="${cli_dir}/dist"
allow_cross_target="${AXON_ALLOW_CROSS_TARGET:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      target="${2:-}"
      shift 2
      ;;
    --outfile)
      outfile="${2:-}"
      shift 2
      ;;
    --outdir)
      outdir="${2:-}"
      shift 2
      ;;
    --skip-checks)
      skip_checks=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

host_os="$(uname -s)"
host_arch="$(uname -m)"

default_target=""
default_artifact=""

case "${host_os}:${host_arch}" in
  Darwin:arm64)
    default_target="bun-darwin-arm64"
    default_artifact="axon-darwin-arm64"
    ;;
  Darwin:x86_64)
    default_target="bun-darwin-x64"
    default_artifact="axon-darwin-x64"
    ;;
  Linux:x86_64)
    default_target="bun-linux-x64"
    default_artifact="axon-linux-x64"
    ;;
  Linux:aarch64|Linux:arm64)
    default_target="bun-linux-arm64"
    default_artifact="axon-linux-arm64"
    ;;
  MINGW64_NT-*:x86_64|MSYS_NT-*:x86_64|CYGWIN_NT-*:x86_64)
    default_target="bun-windows-x64"
    default_artifact="axon-windows-x64.exe"
    ;;
  *)
    echo "error: unsupported host platform ${host_os}/${host_arch}" >&2
    exit 1
    ;;
esac

if [[ -z "${target}" ]]; then
  target="${default_target}"
fi

if [[ "${target}" != "${default_target}" && "${allow_cross_target}" != "1" ]]; then
  echo "error: refusing cross-target build from ${default_target} to ${target}" >&2
  echo "hint: use a matching native runner or set AXON_ALLOW_CROSS_TARGET=1 for an experiment." >&2
  exit 1
fi

artifact="${default_artifact}"
case "${target}" in
  bun-darwin-arm64) artifact="axon-darwin-arm64" ;;
  bun-darwin-x64) artifact="axon-darwin-x64" ;;
  bun-linux-x64) artifact="axon-linux-x64" ;;
  bun-linux-arm64) artifact="axon-linux-arm64" ;;
  bun-windows-x64) artifact="axon-windows-x64.exe" ;;
  *)
    echo "error: unsupported Bun target '${target}'" >&2
    exit 2
    ;;
esac

if [[ -z "${outfile}" ]]; then
  if [[ "${outdir}" != /* ]]; then
    outdir="${repo_root}/${outdir}"
  fi
  mkdir -p "${outdir}"
  outfile="${outdir%/}/${artifact}"
else
  if [[ "${outfile}" != /* ]]; then
    outfile="${repo_root}/${outfile}"
  fi
  mkdir -p "$(dirname "${outfile}")"
fi

(
  cd "${repo_root}"
  bun install --frozen-lockfile
)

if [[ "${skip_checks}" -eq 0 ]]; then
  (
    cd "${repo_root}"
    bun run ci
  )
fi

(
  cd "${cli_dir}"
  bun build \
    --compile \
    --target="${target}" \
    --outfile="${outfile}" \
    src/cli.ts
)

chmod +x "${outfile}" 2>/dev/null || true

if [[ "${host_os}" == "Darwin" && "${target}" == bun-darwin-* ]]; then
  if ! command -v codesign >/dev/null 2>&1; then
    echo "error: codesign is required to finalize macOS release binaries" >&2
    exit 1
  fi

  # Bun standalone builds may leave a signature blob that verifies on the
  # runner that produced it but fails verification after download on a
  # different machine. Strip any existing signature, then replace it with
  # a fresh ad-hoc signature and verify it before upload.
  codesign --remove-signature "${outfile}" 2>/dev/null || true
  codesign -s - -f "${outfile}"
  codesign --verify --verbose=4 "${outfile}"
fi

if [[ "${target}" == "${default_target}" ]]; then
  if [[ "${artifact}" == *.exe ]]; then
    "${outfile}" --version
    "${outfile}" --help >/dev/null
  else
    "${outfile}" --version
    "${outfile}" --help >/dev/null
  fi
else
  printf 'skipping smoke execution for cross-target build %s on host %s\n' \
    "${target}" "${default_target}"
fi

sha_file="${outfile}.sha256"
if command -v sha256sum >/dev/null 2>&1; then
  (
    cd "$(dirname "${outfile}")"
    sha256sum "$(basename "${outfile}")" > "$(basename "${sha_file}")"
  )
elif command -v shasum >/dev/null 2>&1; then
  (
    cd "$(dirname "${outfile}")"
    shasum -a 256 "$(basename "${outfile}")" > "$(basename "${sha_file}")"
  )
elif command -v powershell.exe >/dev/null 2>&1; then
  hash_value="$(
    powershell.exe -NoProfile -Command \
      "(Get-FileHash '${outfile}' -Algorithm SHA256).Hash.ToLower()" \
      | tr -d '\r'
  )"
  printf '%s  %s\n' "${hash_value}" "$(basename "${outfile}")" > "${sha_file}"
else
  echo "error: could not find a SHA256 tool on PATH" >&2
  exit 1
fi

printf 'built %s\n' "${outfile}"
printf 'sha256 %s\n' "${sha_file}"
