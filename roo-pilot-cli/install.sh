#!/bin/bash

echo "Installing Roo CLI..."

# Detect OS
OS="unknown"
case "$(uname -s)" in
    Linux*)     OS="linux";;
    Darwin*)    OS="macos";;
    CYGWIN*)    OS="windows";;
    MINGW*)     OS="windows";;
    MSYS*)      OS="windows";;
    *)          OS="unknown";;
esac

echo "Detected OS: $OS"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Rename cli-package.json to package.json for installation
if [ -f package.json ]; then
    echo "Backing up existing package.json..."
    cp package.json package.json.backup
fi

cp cli-package.json package.json

# Rename cli-tsconfig.json to tsconfig.json for build
if [ -f tsconfig.json ]; then
    echo "Backing up existing tsconfig.json..."
    cp tsconfig.json tsconfig.json.backup
fi

cp cli-tsconfig.json tsconfig.json

# Install dependencies
echo "Installing dependencies..."
npm install

# Build project
echo "Building project..."
npm run build

# Create symbolic link
echo "Creating symbolic link..."
npm link

# Make the shell script executable
if [ "$OS" = "linux" ] || [ "$OS" = "macos" ]; then
    echo "Making shell script executable..."
    chmod +x ./roo-cli.sh
fi

# Restore original files if they were backed up
if [ -f package.json.backup ]; then
    echo "Restoring original package.json..."
    mv package.json.backup package.json
fi

if [ -f tsconfig.json.backup ]; then
    echo "Restoring original tsconfig.json..."
    mv tsconfig.json.backup tsconfig.json
fi

echo
echo "Roo CLI has been installed successfully!"
if [ "$OS" = "windows" ]; then
    echo "You can now run it by typing 'roo-cli' in any terminal."
elif [ "$OS" = "linux" ] || [ "$OS" = "macos" ]; then
    echo "You can now run it by typing 'roo-cli' or './roo-cli.sh' in any terminal."
else
    echo "You can now run it using the appropriate command for your system."
fi
echo