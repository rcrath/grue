#!/bin/sh
# Grue Linux installer — copies the program, menu entry, and icon into place.
# Run from the unpacked tarball directory:   sudo ./install.sh
# Install somewhere else with:               PREFIX=$HOME/.local ./install.sh
set -e

PREFIX="${PREFIX:-/usr/local}"
DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -w "$PREFIX" ] && [ "$(id -u)" -ne 0 ]; then
    echo "Need root to install into $PREFIX — run:  sudo ./install.sh"
    echo "(or install just for yourself:  PREFIX=\$HOME/.local ./install.sh)"
    exit 1
fi

install -Dm755 "$DIR/grue"         "$PREFIX/bin/grue"
install -Dm644 "$DIR/grue.desktop" "$PREFIX/share/applications/grue.desktop"
install -Dm644 "$DIR/grue.png"     "$PREFIX/share/icons/hicolor/128x128/apps/grue.png"

update-desktop-database "$PREFIX/share/applications" 2>/dev/null || true
gtk-update-icon-cache -q "$PREFIX/share/icons/hicolor" 2>/dev/null || true

echo "Installed grue to $PREFIX/bin/grue"

# Grue uses the system WebKitGTK 4.1 engine. Check it's present and, if not,
# print the one-line install command for this distro.
if ! ldconfig -p 2>/dev/null | grep -q libwebkit2gtk-4.1; then
    echo ""
    echo "ONE MORE STEP: Grue needs the WebKitGTK 4.1 engine, which is not"
    echo "installed on this system yet. Install it with:"
    if command -v pacman >/dev/null 2>&1; then
        echo "    sudo pacman -S webkit2gtk-4.1"
    elif command -v apt-get >/dev/null 2>&1; then
        echo "    sudo apt install libwebkit2gtk-4.1-0"
    elif command -v dnf >/dev/null 2>&1; then
        echo "    sudo dnf install webkit2gtk4.1"
    elif command -v zypper >/dev/null 2>&1; then
        echo "    sudo zypper install libwebkit2gtk-4_1-0"
    else
        echo "    (use your distro's package manager; the package is usually"
        echo "     called webkit2gtk-4.1 or libwebkit2gtk-4.1-0)"
    fi
    echo "then start Grue from the menu or by running: grue"
else
    echo "All set — start Grue from the applications menu or by running: grue"
fi
