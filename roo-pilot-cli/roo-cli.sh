#!/bin/bash

# Detect OS
OS="unknown"
case "$(uname -s)" in
    Linux*)     OS="linux";;
    Darwin*)    OS="macos";;
    *)          OS="unknown";;
esac

# Set NODE_OPTIONS to increase memory limit if needed
if [ "$OS" = "linux" ] || [ "$OS" = "macos" ]; then
    export NODE_OPTIONS="--max-old-space-size=4096"
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run the CLI with full implementation
node "$SCRIPT_DIR/run-full-cli.js" "$@"