#!/bin/bash

clear
echo
echo "╔═════════════════════════════════════════════╗"
echo "║            Roo Pilot Launcher               ║"
echo "╚═════════════════════════════════════════════╝"
echo

echo "Choose how to start Roo Pilot:"
echo
echo "1. Command Line Interface (CLI)"
echo "2. Streamlit Web Interface (UI)"
echo "3. Exit"
echo

while true; do
    read -p "Enter your choice (1-3): " choice
    
    case $choice in
        1)
            clear
            echo
            echo "Starting Roo Pilot CLI..."
            echo
            roo-pilot-cli
            break
            ;;
        2)
            clear
            echo
            echo "Starting Roo Pilot UI..."
            echo
            echo "Access the UI at http://localhost:8501"
            echo "Press Ctrl+C to exit"
            echo
            
            # Check if Python is installed
            if ! command -v python3 &> /dev/null; then
                echo "Error: Python 3 is not installed or not in the PATH."
                echo "Please install Python from https://www.python.org/ (version 3.8 or higher required)"
                echo
                read -p "Press Enter to exit..."
                exit 1
            fi
            
            # Check if streamlit is installed
            if ! python3 -c "import streamlit" &> /dev/null; then
                echo "Streamlit is not installed. Attempting to install..."
                pip3 install streamlit
                if [ $? -ne 0 ]; then
                    echo "Failed to install Streamlit. Please install it manually with:"
                    echo "pip3 install streamlit"
                    echo
                    read -p "Press Enter to exit..."
                    exit 1
                fi
            fi
            
            streamlit run streamlit_app.py
            break
            ;;
        3)
            echo "Exiting Roo Pilot Launcher."
            exit 0
            ;;
        *)
            echo "Invalid choice. Please try again."
            echo
            ;;
    esac
done

exit 0