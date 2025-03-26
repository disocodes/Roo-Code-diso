#!/usr/bin/env node

const readline = require('readline');
const { Anthropic } = require('@anthropic-ai/sdk');
const dotenv = require('dotenv');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Load environment variables
dotenv.config();

// Configuration 
const CONFIG_DIR = path.join(os.homedir(), '.roo-pilot');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Create directory if it doesn't exist
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Default configuration
const DEFAULT_CONFIG = {
  apiProvider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  model: 'claude-3-7-sonnet-20240229',
  temperature: 0.3,
  maxTokens: 4096,
  mode: 'assistant',
  workspacePath: process.cwd()
};

// Initialize configuration
function initConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
      return DEFAULT_CONFIG;
    }
    
    const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
    const config = JSON.parse(configData);
    
    // Prioritize environment variables
    if (process.env.ANTHROPIC_API_KEY && config.apiProvider === 'anthropic') {
      config.apiKey = process.env.ANTHROPIC_API_KEY;
    } else if (process.env.OPENAI_API_KEY && config.apiProvider === 'openai') {
      config.apiKey = process.env.OPENAI_API_KEY;
    }
    
    return { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    console.error('Error reading config:', error);
    return DEFAULT_CONFIG;
  }
}

// Save configuration
function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Start chat session
async function startChat() {
  const config = initConfig();
  let messages = [];
  
  // Header
  console.log(chalk.cyan('╔═════════════════════════════════════════╗'));
  console.log(chalk.cyan('║           Roo Pilot CLI v1.0.0          ║'));
  console.log(chalk.cyan('╚═════════════════════════════════════════╝'));
  console.log(chalk.cyan(`Using model: ${config.model}`));
  console.log(chalk.cyan(`Current workspace: ${config.workspacePath}`));
  console.log(chalk.yellow('Type "/help" to see available commands, "/exit" to quit'));
  
  if (!config.apiKey) {
    console.log(chalk.red('No API key found. Please set one with /config apiKey=your_key_here'));
    console.log(chalk.yellow('Or add it to your .env file as ANTHROPIC_API_KEY=your_key_here'));
  }
  
  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green('You > ')
  });
  
  // Display prompt
  rl.prompt();
  
  // Handle input
  rl.on('line', async (input) => {
    if (input.startsWith('/')) {
      const command = input.slice(1).trim();
      
      if (command === 'exit' || command === 'quit') {
        console.log(chalk.cyan('Goodbye!'));
        rl.close();
        return;
      }
      
      if (command === 'help') {
        displayHelp();
      }
      
      else if (command === 'clear') {
        console.clear();
        messages = [];
        console.log(chalk.yellow('Chat history cleared.'));
      }
      
      else if (command.startsWith('config')) {
        handleConfig(command.slice(6).trim(), config);
      }
      
      else if (command.startsWith('read')) {
        const filePath = command.slice(5).trim();
        if (!filePath) {
          console.log(chalk.red('Please specify a file path to read.'));
        } else {
          try {
            const fullPath = path.isAbsolute(filePath) 
              ? filePath 
              : path.join(config.workspacePath, filePath);
            
            const content = fs.readFileSync(fullPath, 'utf8');
            console.log(content);
            
            messages.push({
              role: 'user',
              content: `Here's the content of ${filePath}:\n\n${content}`
            });
          } catch (error) {
            console.log(chalk.red(`Error reading file: ${error.message}`));
          }
        }
      }
      
      else if (command.startsWith('ls')) {
        const dirPath = command.slice(3).trim() || '.';
        try {
          const fullPath = path.isAbsolute(dirPath) 
            ? dirPath 
            : path.join(config.workspacePath, dirPath);
          
          const files = fs.readdirSync(fullPath, { withFileTypes: true });
          const output = files.map(file => {
            const isDir = file.isDirectory();
            return `${isDir ? '[DIR]' : '[FILE]'} ${file.name}`;
          }).join('\\n');
          
          console.log(output);
          
          messages.push({
            role: 'user',
            content: `Directory listing of ${dirPath}:\n\n${output}`
          });
        } catch (error) {
          console.log(chalk.red(`Error listing directory: ${error.message}`));
        }
      }
      
      else {
        console.log(chalk.red(`Unknown command: ${command}`));
      }
      
      rl.prompt();
      return;
    }
    
    // Handle regular message
    if (!config.apiKey) {
      console.log(chalk.red('API key not set. Use /config apiKey=your_key_here to set it or add it to .env file.'));
      rl.prompt();
      return;
    }
    
    // Add user message to history
    messages.push({
      role: 'user',
      content: input
    });
    
    // Show user's message
    console.log(`You: ${input}`);
    
    try {
      console.log(chalk.yellow('Thinking...'));
      
      // Create client
      const client = new Anthropic({
        apiKey: config.apiKey
      });
      
      // System prompt
      const systemPrompt = "You are Roo Pilot, an AI assistant focused on helping with programming and software development tasks. Be concise, clear, and helpful.";
      
      // Send the request
      const response = await client.messages.create({
        model: config.model,
        system: systemPrompt,
        messages: messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens
      });
      
      // Get response
      const responseText = response.content[0].text;
      
      // Add to history
      messages.push({
        role: 'assistant',
        content: responseText
      });
      
      // Display response
      console.log(chalk.blue('Assistant:'));
      console.log(responseText);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
    
    rl.prompt();
  });
}

// Display help
function displayHelp() {
  console.log(chalk.yellow('\nRoo Pilot CLI Commands:'));
  console.log(chalk.cyan('/help') + ' - Display this help message');
  console.log(chalk.cyan('/exit') + ' - Exit the chat session');
  console.log(chalk.cyan('/clear') + ' - Clear the chat history');
  console.log(chalk.cyan('/config') + ' - Show current configuration');
  console.log(chalk.cyan('/config key=value') + ' - Update a configuration value');
  console.log(chalk.cyan('/read path/to/file') + ' - Read a file and add to context');
  console.log(chalk.cyan('/ls [path]') + ' - List files in a directory');
}

// Handle config commands
function handleConfig(subcommand, config) {
  if (!subcommand) {
    // Display current configuration
    console.log(chalk.yellow('\nCurrent Configuration:'));
    Object.entries(config).forEach(([key, value]) => {
      // Don't show API key
      if (key === 'apiKey') {
        value = value ? '****' : '(not set)';
      }
      console.log(`${chalk.cyan(key)} = ${value}`);
    });
    return;
  }
  
  // Update configuration
  const keyValueMatch = subcommand.match(/^(\w+)=(.+)$/);
  if (keyValueMatch) {
    const [_, key, value] = keyValueMatch;
    
    if (key in config) {
      // Type conversion for numeric values
      if (key === 'temperature' || key === 'maxTokens') {
        config[key] = Number(value);
      } else {
        config[key] = value;
      }
      
      saveConfig(config);
      console.log(chalk.green(`Configuration updated: ${key} = ${key === 'apiKey' ? '****' : value}`));
    } else {
      console.log(chalk.red(`Unknown configuration key: ${key}`));
      console.log(chalk.yellow(`Available keys: ${Object.keys(config).join(', ')}`));
    }
  } else {
    console.log(chalk.red('Invalid configuration format. Use /config key=value'));
  }
}

// Run the chat
startChat().catch(err => {
  console.error('Error starting chat:', err);
});