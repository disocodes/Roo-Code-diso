@echo off
setlocal enabledelayedexpansion

echo Installing Roo CLI...

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: Node.js is not installed.
    echo Please install Node.js from https://nodejs.org/
    exit /b 1
)

REM Rename cli-package.json to package.json for installation
if exist package.json (
    echo Backing up existing package.json...
    copy package.json package.json.backup >nul
)

copy cli-package.json package.json >nul

REM Rename cli-tsconfig.json to tsconfig.json for build
if exist tsconfig.json (
    echo Backing up existing tsconfig.json...
    copy tsconfig.json tsconfig.json.backup >nul
)

copy cli-tsconfig.json tsconfig.json >nul

REM Install dependencies
echo Installing dependencies...
call npm install

REM Build project
echo Building project...
call npm run build

REM Create symbolic link
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
echo Roo CLI has been installed successfully!
echo You can now run it by typing "roo-cli" in any terminal or by using "roo-cli.bat".
echo.

endlocal