@echo off
setlocal enabledelayedexpansion

echo.
echo ===================================
echo      Roo Pilot Installer
echo ===================================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: This script is not running as administrator.
    echo Some operations might fail. Consider running as administrator.
    echo.
    timeout /t 3 >nul
)

:MENU
cls
echo Choose installation option:
echo.
echo 1. Install CLI version only (Node.js required)
echo 2. Install Streamlit UI only (Python required)
echo 3. Install both versions
echo 4. Exit
echo.
set /p choice=Enter your choice (1-4): 

if "%choice%"=="1" goto CLI_INSTALL
if "%choice%"=="2" goto STREAMLIT_INSTALL
if "%choice%"=="3" goto BOTH_INSTALL
if "%choice%"=="4" goto END
echo Invalid choice. Please try again.
timeout /t 2 >nul
goto MENU

:CLI_INSTALL
cls
echo.
echo === Installing Roo Pilot CLI ===
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed.
    echo Please install Node.js from https://nodejs.org/ (version 20.x or higher required)
    echo.
    echo Press any key to return to the menu...
    pause >nul
    goto MENU
)

REM Rename cli-package.json to package.json for installation
if exist package.json (
    echo Backing up existing package.json...
    copy package.json package.json.backup >nul
)

copy cli-package.json package.json >nul 2>&1

REM Rename cli-tsconfig.json to tsconfig.json for build
if exist tsconfig.json (
    echo Backing up existing tsconfig.json...
    copy tsconfig.json tsconfig.json.backup >nul
)

copy cli-tsconfig.json tsconfig.json >nul 2>&1

echo Installing CLI dependencies...
call npm install

echo Building CLI project...
call npm run build

echo Creating symbolic link...
call npm link

REM Restore original files if they were backed up
if exist package.json.backup (
    echo Restoring original package.json...
    move /y package.json.backup package.json >nul
)

if exist tsconfig.json.backup (
    echo Restoring original tsconfig.json...
    move /y tsconfig.json.backup tsconfig.json >nul
)

echo.
echo Roo Pilot CLI installed successfully!
echo You can run it by typing "roo-pilot-cli" in any terminal.
echo.

if "%choice%"=="1" goto END
goto STREAMLIT_INSTALL

:STREAMLIT_INSTALL
cls
echo.
echo === Installing Roo Pilot Streamlit UI ===
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python is not installed.
    echo Please install Python from https://www.python.org/ (version 3.8 or higher required)
    echo.
    echo Press any key to return to the menu...
    pause >nul
    goto MENU
)

REM Check if pip is installed
pip --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: pip is not installed.
    echo Please install pip.
    echo.
    echo Press any key to return to the menu...
    pause >nul
    goto MENU
)

echo Installing Streamlit UI dependencies...
pip install -r requirements.txt

REM Create .env.template file if it doesn't exist
if not exist .env.template (
    echo Creating .env.template file...
    python -c "with open('streamlit_app.py', 'r') as f: exec(f.read()); create_env_template('.env.template')"
)

REM Create shortcut to run Streamlit app
echo @echo off > run-roo-pilot-ui.bat
echo echo Starting Roo Pilot UI... >> run-roo-pilot-ui.bat
echo echo. >> run-roo-pilot-ui.bat
echo echo Access the UI at http://localhost:8501 >> run-roo-pilot-ui.bat
echo echo Press Ctrl+C to exit >> run-roo-pilot-ui.bat
echo echo. >> run-roo-pilot-ui.bat
echo streamlit run streamlit_app.py >> run-roo-pilot-ui.bat

echo.
echo Roo Pilot Streamlit UI installed successfully!
echo You can start it by running "run-roo-pilot-ui.bat"
echo.

if "%choice%"=="2" goto END
goto END

:BOTH_INSTALL
cls
goto CLI_INSTALL

:END
echo.
echo === Installation Complete ===
echo.
echo Remember to set up your API keys in the .env file before using Roo Pilot.
echo.
echo If you don't have a .env file yet, copy .env.template to .env and add your keys.
echo.
echo Press any key to exit...
pause >nul
endlocal
exit /b 0