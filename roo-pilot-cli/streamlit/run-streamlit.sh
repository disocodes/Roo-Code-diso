#!/bin/bash

# Run the Streamlit app
echo "Starting Roo Pilot Streamlit UI..."

# Detect OS
OS="unknown"
case "$(uname -s)" in
    Linux*)     OS="linux";;
    Darwin*)    OS="macos";;
    *)          OS="unknown";;
esac

echo "Detected OS: $OS"

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed."
    echo "Please install Python 3 from https://www.python.org/"
    exit 1
fi

# Check if Streamlit is installed
if ! command -v streamlit &> /dev/null; then
    echo "Streamlit is not installed. Installing..."
    pip install -r requirements.txt
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run Streamlit app
cd "$SCRIPT_DIR"
streamlit run streamlit_app.py