#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage:
  ./scripts/install-remote.sh /path/to/qexow-cam_<version>_<arch>.deb [--preserve-state]

Behavior:
  - installs or upgrades the packaged Linux CAM runtime
  - does not require system Node
  - defaults to aggressive reinstall behavior
  - preserves prior CAM runtime state only when --preserve-state is passed
EOF
}

if [ "${1:-}" = "" ] || [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

PACKAGE_FILE="$1"
shift || true

if [ ! -f "$PACKAGE_FILE" ]; then
  echo "Package file not found: $PACKAGE_FILE" >&2
  exit 1
fi

PRESERVE_STATE=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --preserve-state) PRESERVE_STATE=1 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [ "$PRESERVE_STATE" = "1" ]; then
  sudo CAM_PRESERVE_STATE=1 dpkg -i "$PACKAGE_FILE"
else
  sudo dpkg -i "$PACKAGE_FILE"
fi
