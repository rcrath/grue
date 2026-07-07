#!/bin/sh
# Grue Linux uninstaller — removes what install.sh put in place.
# Use the same PREFIX you installed with:   sudo ./uninstall.sh
set -e

PREFIX="${PREFIX:-/usr/local}"

if [ ! -w "$PREFIX" ] && [ "$(id -u)" -ne 0 ]; then
    echo "Need root to remove files from $PREFIX — run:  sudo ./uninstall.sh"
    exit 1
fi

rm -f "$PREFIX/bin/grue"
rm -f "$PREFIX/share/applications/grue.desktop"
rm -f "$PREFIX/share/icons/hicolor/128x128/apps/grue.png"

update-desktop-database "$PREFIX/share/applications" 2>/dev/null || true
gtk-update-icon-cache -q "$PREFIX/share/icons/hicolor" 2>/dev/null || true

echo "Grue removed from $PREFIX"
