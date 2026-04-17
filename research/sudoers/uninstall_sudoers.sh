#!/bin/bash
# Remove the axon-testing sudoers rule file installed by
# tools/install_sudoers.sh. Safe to re-run; no-op if the file is
# already gone.
#
# The axon CLI itself no longer needs sudo (it uses node-hid, which
# talks to macOS IOKit's HID manager directly — no elevated privileges).
# The only reason to keep the sudoers file is if you still want to
# run the legacy tools/axon_libusb_test*.py research scripts without
# typing your password each time. Once those are no longer useful,
# run this script to clean up.
#
# Run:  bash tools/uninstall_sudoers.sh
# Undo: bash tools/install_sudoers.sh

set -e

DEST="/etc/sudoers.d/axon-testing"

if [ ! -f "$DEST" ]; then
    echo "$DEST does not exist — nothing to uninstall."
    exit 0
fi

echo "Removing $DEST (requires sudo)..."
sudo rm "$DEST"
echo
echo "Removed. Verifying:"
if [ -f "$DEST" ]; then
    echo "  ERROR: $DEST still exists" >&2
    exit 1
fi
echo "  $DEST is gone."
echo
echo "Sanity check — the axon CLI should now work without sudo:"
echo "    cd apps/cli && bun run src/cli.ts status"
echo
echo "If that works, the libusb-era sudoers setup is fully gone."
