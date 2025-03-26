@echo off
setlocal enabledelayedexpansion

cls
echo.
echo ╔═════════════════════════════════════════════╗
echo ║            Roo Pilot Launcher               ║
echo ╚═════════════════════════════════════════════╝
echo.

echo Choose how to start Roo Pilot:
echo.
echo 1. Command Line Interface (CLI)
echo 2. Streamlit Web Interface (UI)
echo 3. Exit
echo.

:CHOICE
set /p choice=Enter your choice (1-3): 

if "%choice%"=="1" goto START_CLI
if "%choice%"=="2" goto START_STREAMLIT
if "%choice%"=="3" goto END
echo Invalid choice. Please try again.
echo.
goto CHOICE

:START_CLI
cls
echo.
echo Starting Roo Pilot CLI...
echo.
call roo-pilot-cli
goto END

:START_STREAMLIT
cls
echo.
echo Starting Roo Pilot UI...
echo.
echo Access the UI at http://localhost:8501
echo Press Ctrl+C to exit
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python is not installed or not in the PATH.
    echo Please install Python from https://www.python.org/ (version 3.8 or higher required)
    echo.
    pause
    goto END
)

REM Check if streamlit is installed
python -c "import streamlit" >nul 2>&1
if %errorlevel% neq 0 (
    echo Streamlit is not installed. Attempting to install...
    pip install streamlit
    if %errorlevel% neq 0 (
        echo Failed to install Streamlit. Please install it manually with:
        echo pip install streamlit
        echo.
        pause
        goto END
    )
)

streamlit run streamlit_app.py

:END
endlocal
exit /b 0