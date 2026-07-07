Grue for Linux — plain tarball
==============================

This package installs Grue using your system's own WebKitGTK web engine
instead of bundling one (which is what breaks the AppImage on some
distros, notably Arch/Manjaro).

Install:
    sudo ./install.sh

Or just for your own user (no root needed):
    PREFIX=$HOME/.local ./install.sh

The installer checks for the WebKitGTK 4.1 engine and prints the exact
install command for your distro if it's missing. Typical commands:

    Arch/Manjaro:   sudo pacman -S webkit2gtk-4.1
    Debian/Ubuntu:  sudo apt install libwebkit2gtk-4.1-0
    Fedora:         sudo dnf install webkit2gtk4.1
    openSUSE:       sudo zypper install libwebkit2gtk-4_1-0

Uninstall:
    sudo ./uninstall.sh
