#!/bin/bash

echo
echo "==================================="
echo "      Roo Pilot Installer"
echo "==================================="
echo

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "WARNING: This script is not running as root."
    echo "Some operations might fail. Consider running with sudo."
    echo
    sleep 3
fi

# Function to install CLI version
install_cli() {
    echo
    echo "=== Installing Roo Pilot CLI ==="
    echo

    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        echo "Error: Node.js is not installed."
        echo "Please install Node.js from https://nodejs.org/ (version 20.x or higher required)"
        echo
        return 1
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

    echo "Installing CLI dependencies..."
    npm install

    echo "Building CLI project..."
    npm run build

    echo "Creating symbolic link..."
    npm link

    # Restore original files if they were backed up
    if [ -f package.json.backup ]; then
        echo "Restoring original package.json..."
        mv package.json.backup package.json
    fi

    if [ -f tsconfig.json.backup ]; then
        echo "Restoring original tsconfig.json..."
        mv tsconfig.json.backup tsconfig.json
    fi

    # Create launcher script
    echo "#!/bin/bash" > roo-pilot-cli
    echo "node \"$(pwd)/dist/roo-cli.js\" \"\$@\"" >> roo-pilot-cli
    chmod +x roo-pilot-cli

    # Try to move to a directory in PATH
    if [ -d "/usr/local/bin" ] && [ -w "/usr/local/bin" ]; then
        cp roo-pilot-cli /usr/local/bin/
        echo "Installed launcher script to /usr/local/bin/roo-pilot-cli"
    else
        echo "Launcher script created: $(pwd)/roo-pilot-cli"
        echo "Consider moving it to a directory in your PATH"
    fi

    echo
    echo "Roo Pilot CLI installed successfully!"
    echo "You can run it by typing 'roo-pilot-cli' in your terminal."
    echo

    return 0
}

# Function to install Streamlit UI
install_streamlit() {
    echo
    echo "=== Installing Roo Pilot Streamlit UI ==="
    echo

    # Check if Python is installed
    if ! command -v python3 &> /dev/null; then
        echo "Error: Python 3 is not installed."
        echo "Please install Python from https://www.python.org/ (version 3.8 or higher required)"
        echo
        return 1
    fi

    # Check if pip is installed
    if ! command -v pip3 &> /dev/null; then
        echo "Error: pip3 is not installed."
        echo "Please install pip."
        echo
        return 1
    fi

    echo "Installing Streamlit UI dependencies..."
    pip3 install -r requirements.txt

    # Create .env.template file if it doesn't exist
    if [ ! -f .env.template ]; then
        echo "Creating .env.template file..."
        python3 -c "with open('streamlit_app.py', 'r') as f: exec(f.read()); create_env_template('.env.template')"
    fi

    # Create launcher script
    echo "#!/bin/bash" > run-roo-pilot-ui.sh
    echo "echo Starting Roo Pilot UI..." >> run-roo-pilot-ui.sh
    echo "echo" >> run-roo-pilot-ui.sh
    echo "echo Access the UI at http://localhost:8501" >> run-roo-pilot-ui.sh
    echo "echo Press Ctrl+C to exit" >> run-roo-pilot-ui.sh
    echo "echo" >> run-roo-pilot-ui.sh
    echo "streamlit run \"$(pwd)/streamlit_app.py\"" >> run-roo-pilot-ui.sh
    chmod +x run-roo-pilot-ui.sh

    # Try to move to a directory in PATH
    if [ -d "/usr/local/bin" ] && [ -w "/usr/local/bin" ]; then
        cp run-roo-pilot-ui.sh /usr/local/bin/roo-pilot-ui
        echo "Installed launcher script to /usr/local/bin/roo-pilot-ui"
    else
        echo "Launcher script created: $(pwd)/run-roo-pilot-ui.sh"
        echo "Consider moving it to a directory in your PATH"
    fi

    echo
    echo "Roo Pilot Streamlit UI installed successfully!"
    echo "You can start it by running 'run-roo-pilot-ui.sh' or 'roo-pilot-ui' if in PATH."
    echo

    return 0
}

# Main menu
while true; do
    clear
    echo "Choose installation option:"
    echo
    echo "1. Install CLI version only (Node.js required)"
    echo "2. Install Streamlit UI only (Python required)"
    echo "3. Install both versions"
    echo "4. Exit"
    echo
    read -p "Enter your choice (1-4): " choice
    
    case $choice in
        1)
            install_cli
            if [ $? -eq 0 ]; then
                break
            fi
            read -p "Press Enter to return to the menu..."
            ;;
        2)
            install_streamlit
            if [ $? -eq 0 ]; then
                break
            fi
            read -p "Press Enter to return to the menu..."
            ;;
        3)
            install_cli
            cli_result=$?
            install_streamlit
            streamlit_result=$?
            if [ $cli_result -eq 0 ] || [ $streamlit_result -eq 0 ]; then
                break
            fi
            read -p "Press Enter to return to the menu..."
            ;;
        4)
            echo "Exiting installer."
            exit 0
            ;;
        *)
            echo "Invalid choice. Please try again."
            sleep 2
            ;;
    esac
done

echo
echo "=== Installation Complete ==="
echo
echo "Remember to set up your API keys in the .env file before using Roo Pilot."
echo
echo "If you don't have a .env file yet, copy .env.template to .env and add your keys."
echo
read -p "Press Enter to exit..."
exit 0