@echo off
setlocal

:: Set NODE_OPTIONS to increase memory limit if needed
set NODE_OPTIONS=--max-old-space-size=4096

:: Run the CLI with full implementation
node "%~dp0\run-full-cli.js" %*

endlocal