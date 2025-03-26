@echo off
setlocal

echo Starting Roo Pilot Streamlit UI...

REM Check if Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Error: Python is not installed.
    echo Please install Python 3 from https://www.python.org/
    exit /b 1
)

REM Check if Streamlit is installed
streamlit --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Streamlit is not installed. Installing...
    pip install -r requirements.txt
)

REM Get script directory
set SCRIPT_DIR=%~dp0

REM Run Streamlit app
cd "%SCRIPT_DIR%"
streamlit run streamlit_app.py

endlocal