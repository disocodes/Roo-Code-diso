#!/bin/bash

# Simple test script for Roo Pilot CLI

# Test environment setup
echo "Testing Roo Pilot CLI environment..."

# Check Node.js version
echo -n "Node.js version: "
node --version

# Check for required dependencies
echo "Checking dependencies..."
MISSING_DEPS=0

command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed."; MISSING_DEPS=1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required but not installed."; MISSING_DEPS=1; }

if [ $MISSING_DEPS -eq 1 ]; then
  echo "Please install the missing dependencies and try again."
  exit 1
fi

# Create a simple test directory structure
TEST_DIR="./test-playground"
mkdir -p "$TEST_DIR"
touch "$TEST_DIR/test1.txt"
echo "console.log('Hello from test script!');" > "$TEST_DIR/test-script.js"
mkdir -p "$TEST_DIR/nested"
echo "This is a nested test file" > "$TEST_DIR/nested/test2.txt"

# Run simple non-API tests
echo "Running non-API tests..."

echo -n "Testing script execution: "
RESULT=$(node "$TEST_DIR/test-script.js")
if [ "$RESULT" == "Hello from test script!" ]; then
  echo "PASS"
else
  echo "FAIL"
  exit 1
fi

echo -n "Testing file system operations: "
if [ -f "$TEST_DIR/test1.txt" ] && [ -f "$TEST_DIR/nested/test2.txt" ]; then
  echo "PASS"
else
  echo "FAIL"
  exit 1
fi

# Test the CLI build process
echo "Building Roo Pilot CLI..."
npm run build

if [ ! -d "./dist" ]; then
  echo "Build failed: dist directory not created."
  exit 1
fi

if [ ! -f "./dist/roo-cli.js" ]; then
  echo "Build failed: roo-cli.js not found."
  exit 1
fi

echo "Build successful!"

# Clean up test files
rm -rf "$TEST_DIR"

echo "All tests passed!"