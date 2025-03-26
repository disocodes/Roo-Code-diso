#!/usr/bin/env node

/**
 * Starter script for Roo Pilot CLI
 * This script allows users to choose between the terminal CLI and the Streamlit web UI
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const os = require('os');

// ANSI color codes for formatting
const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

/**
 * Clear the terminal screen
 */
function clearScreen() {
  process.stdout.write('\x1bc');
}

/**
 * Print a styled header
 */
function printHeader() {
  console.log(`${colors.cyan}╔════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║${colors.bold}            Roo Pilot CLI v1.0.0            ${colors.reset}${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  console.log(`${colors.yellow}Choose an interface to launch:${colors.reset}`);
  console.log('');
}

/**
 * Get the script directory
 */
function getScriptDirectory() {
  return path.dirname(fs.realpathSync(process.argv[1]));
}

/**
 * Launch the terminal CLI interface
 */
function launchTerminalCLI() {
  const scriptDir = getScriptDirectory();
  let cliScript;
  
  // Choose the appropriate script based on the OS
  if (os.platform() === 'win32') {
    cliScript = path.join(scriptDir, 'roo-cli.bat');
    spawn('cmd.exe', ['/c', cliScript], { stdio: 'inherit' });
  } else {
    cliScript = path.join(scriptDir, 'roo-cli.sh');
    spawn('bash', [cliScript], { stdio: 'inherit' });
  }
}

/**
 * Launch the Streamlit web interface
 */
function launchStreamlitUI() {
  const scriptDir = getScriptDirectory();
  const streamlitDir = path.join(scriptDir, 'streamlit');
  let streamlitScript;
  
  // Choose the appropriate script based on the OS
  if (os.platform() === 'win32') {
    streamlitScript = path.join(streamlitDir, 'run-streamlit.bat');
    spawn('cmd.exe', ['/c', streamlitScript], { stdio: 'inherit' });
  } else {
    streamlitScript = path.join(streamlitDir, 'run-streamlit.sh');
    spawn('bash', [streamlitScript], { stdio: 'inherit' });
  }
}

/**
 * Check if Python and required packages are installed
 */
function checkPythonDependencies() {
  return new Promise((resolve) => {
    // Try to execute python with -V flag to get version
    const pythonProcess = spawn('python3', ['-V']);
    
    pythonProcess.on('error', () => {
      // Error means Python is not installed or not in PATH
      resolve(false);
    });
    
    pythonProcess.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

/**
 * Main function to show menu and handle choice
 */
async function main() {
  clearScreen();
  printHeader();
  
  // Check if Python is available for Streamlit
  const pythonAvailable = await checkPythonDependencies();
  
  console.log(`${colors.green}1. Terminal Interface${colors.reset} - Command-line interface`);
  
  if (pythonAvailable) {
    console.log(`${colors.green}2. Web Interface${colors.reset} - Streamlit UI in browser`);
  } else {
    console.log(`${colors.yellow}2. Web Interface${colors.reset} - Not available (Python required)`);
  }
  
  console.log(`${colors.green}q. Quit${colors.reset}`);
  console.log('');
  
  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // Prompt for choice
  rl.question(`${colors.yellow}Enter your choice:${colors.reset} `, (choice) => {
    rl.close();
    
    switch (choice.trim().toLowerCase()) {
      case '1':
        launchTerminalCLI();
        break;
      case '2':
        if (pythonAvailable) {
          launchStreamlitUI();
        } else {
          console.log(`${colors.red}Web Interface requires Python. Please install Python and try again.${colors.reset}`);
          process.exit(1);
        }
        break;
      case 'q':
        console.log(`${colors.cyan}Goodbye!${colors.reset}`);
        process.exit(0);
        break;
      default:
        console.log(`${colors.red}Invalid choice. Please try again.${colors.reset}`);
        process.exit(1);
    }
  });
}

// Run the main function
main();