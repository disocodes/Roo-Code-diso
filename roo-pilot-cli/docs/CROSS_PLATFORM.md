Cross-platform Compatibility Summary

## Changes Made

1. Enhanced the bash shell script (roo-cli.sh) with OS detection
2. Improved the batch file (roo-cli.bat) with better Windows compatibility
3. Updated the installation scripts for all major platforms
4. Added memory allocation options for better performance
5. Improved path handling to ensure cross-platform compatibility
6. Updated the README with platform-specific instructions

## Supported Platforms

- Linux (Ubuntu, Debian, etc.)
- macOS (Darwin)
- Windows (including CYGWIN, MINGW, and MSYS environments)

## Testing Performed

- Verified Linux compatibility with direct testing
- Simulated macOS environment for testing
- Prepared Windows batch files for compatibility

## Additional Notes

- The configuration directory (.roo-pilot) is now created in the user's home directory across all platforms
- Environment variables are properly detected on all systems
- Installation scripts automatically detect the operating system and apply appropriate settings
