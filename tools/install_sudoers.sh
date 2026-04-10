#!/bin/bash
# Install the axon-testing sudoers rule file with the correct permissions.
# Validates first (via `visudo -c`) so a syntax error cannot leave you
# locked out. Safe to re-run; it'll just overwrite the existing rule.
#
# Run:   bash tools/install_sudoers.sh
# Undo:  sudo rm /etc/sudoers.d/axon-testing

set -e

RULES="/Users/caryden/github/servo-programmer/tools/axon-sudoers-rules.txt"
DEST="/etc/sudoers.d/axon-testing"

if [ ! -f "$RULES" ]; then
    echo "error: $RULES not found" >&2
    exit 1
fi

echo "1. Validating sudoers syntax..."
sudo visudo -c -f "$RULES"

echo "2. Installing to $DEST..."
sudo install -m 0440 -o root -g wheel "$RULES" "$DEST"

echo
echo "OK — sudoers file installed at $DEST"
echo
echo "To verify scope, run:"
echo "    sudo -k"
echo "    sudo /Users/caryden/tools/axon-hw-venv/bin/python3 /Users/caryden/github/servo-programmer/tools/axon_libusb_test.py"
echo "    # ^ should NOT prompt for password"
echo
echo "    sudo echo 'hello'"
echo "    # ^ should STILL prompt for password"
echo
echo "To remove:"
echo "    sudo rm $DEST"
