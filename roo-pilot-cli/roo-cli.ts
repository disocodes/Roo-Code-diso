#!/usr/bin/env node

import { Command } from 'commander';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import ora from 'ora';
import { Anthropic } from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { ApiConfiguration } from './src/shared/api';
import { buildApiHandler } from './src/api';
import { formatResponse } from './src/core/prompts/responses';
import { SYSTEM_PROMPT } from './src/core/prompts/system';
import { parseAssistantMessage } from './src/core/assistant-message';
import { fileExistsAtPath } from './src/utils/fs';
import { isToolAllowedForMode } from './src/core/mode-validator';
import { getModeBySlug, defaultModeSlug } from './src/shared/modes';
import { calculateApiCostAnthropic } from './src/utils/cost';

// Load environment variables
dotenv.config();

// Configuration directory - ensure cross-platform compatibility
const ROO_PILOT_CONFIG_DIR = path.join(os.homedir(), '.roo-pilot');
const CONFIG_FILE = path.join(ROO_PILOT_CONFIG_DIR, 'config.json');

// Create config directory if it doesn't exist
if (!fs.existsSync(ROO_PILOT_CONFIG_DIR)) {
  fs.mkdirSync(ROO_PILOT_CONFIG_DIR, { recursive: true });
}

// Default configuration
const DEFAULT_CONFIG: RooPilotConfig = {
  apiProvider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  model: 'claude-3-7-sonnet-20240229',
  temperature: 0.3,
  maxTokens: 4096,
  mode: 'assistant',
  workspacePath: process.cwd(),
  isVisionEnabled: false,
  checkMcpOnStart: false // Make MCP checking optional and off by default
};

// Type definitions
interface RooPilotConfig {
  apiProvider: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  mode: string;
  workspacePath: string;
  isVisionEnabled: boolean;
  checkMcpOnStart: boolean;
}

interface ChatHistory {
  messages: Anthropic.MessageParam[];
}

// CLI setup
const program = new Command();
let config: RooPilotConfig = DEFAULT_CONFIG;
let chatHistory: ChatHistory = { messages: [] };

// Initialize config file if it doesn't exist
function initializeConfig() {
  // Config directory is now created at startup
  
  if (!fs.existsSync(CONFIG_FILE)) {
    // Load API keys from environment variables if available
    const envConfig = { ...DEFAULT_CONFIG };
    
    if (process.env.ANTHROPIC_API_KEY) {
      envConfig.apiKey = process.env.ANTHROPIC_API_KEY;
      envConfig.apiProvider = 'anthropic';
    } else if (process.env.OPENAI_API_KEY) {
      envConfig.apiKey = process.env.OPENAI_API_KEY;
      envConfig.apiProvider = 'openai';
      envConfig.model = 'gpt-4o';
    } else if (process.env.OPENROUTER_API_KEY) {
      envConfig.apiKey = process.env.OPENROUTER_API_KEY;
      envConfig.apiProvider = 'openrouter';
      envConfig.model = 'anthropic/claude-3-7-sonnet';
    } else if (process.env.MISTRAL_API_KEY) {
      envConfig.apiKey = process.env.MISTRAL_API_KEY;
      envConfig.apiProvider = 'mistral';
      envConfig.model = 'mistral-large-latest';
    } else if (process.env.GROQ_API_KEY) {
      envConfig.apiKey = process.env.GROQ_API_KEY;
      envConfig.apiProvider = 'groq';
      envConfig.model = 'llama3-70b-8192';
    }
    
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(envConfig, null, 2));
    config = envConfig;
  } else {
    try {
      const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
      config = { ...DEFAULT_CONFIG, ...JSON.parse(configData) };
      
      // Migrate legacy model names to new format
      migrateModelNames();
      
      // Override with environment variables if set
      if (process.env.ANTHROPIC_API_KEY && config.apiProvider === 'anthropic') {
        config.apiKey = process.env.ANTHROPIC_API_KEY;
      } else if (process.env.OPENAI_API_KEY && config.apiProvider === 'openai') {
        config.apiKey = process.env.OPENAI_API_KEY;
      } else if (process.env.OPENROUTER_API_KEY && config.apiProvider === 'openrouter') {
        config.apiKey = process.env.OPENROUTER_API_KEY;
      } else if (process.env.MISTRAL_API_KEY && config.apiProvider === 'mistral') {
        config.apiKey = process.env.MISTRAL_API_KEY;
      } else if (process.env.GROQ_API_KEY && config.apiProvider === 'groq') {
        config.apiKey = process.env.GROQ_API_KEY;
      }
    } catch (error) {
      console.error('Error reading config file:', error);
      console.log('Using default configuration');
    }
  }
}

// Save configuration
function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Migrate legacy model names to new format
function migrateModelNames() {
  let configChanged = false;
  
  // Groq model name migration
  if (config.apiProvider === 'groq') {
    // Fix legacy Llama 3 model name format
    if (config.model === 'llama-3-70b-8192') {
      console.log(chalk.yellow('Migrating legacy model name to new format...'));
      config.model = 'llama3-70b-8192';
      configChanged = true;
    }
    
    // Upgrade to Llama 3.3 if requested
    if (config.model === 'llama-3-3-70b-versatile' || config.model === 'llama-3.3-70b-versatile') {
      console.log(chalk.yellow('Updating to proper Llama 3.3 model name format...'));
      config.model = 'llama3-3-70b-versatile';
      configChanged = true;
    }
    
    // Suggest upgrading to Llama 3.3 if using older Llama 3 model
    if (config.model === 'llama3-70b-8192' && !process.env.DISABLE_AUTO_UPGRADE) {
      console.log(chalk.yellow('Upgrading to Llama 3.3 70B Versatile for better capabilities...'));
      config.model = 'llama3-3-70b-versatile';
      configChanged = true;
    }
  }
  
  // Anthropic model name migration
  if (config.apiProvider === 'anthropic') {
    // Upgrade to Claude 3.7 Sonnet if using older Claude 3
    if (config.model === 'claude-3-sonnet-20240229' && !process.env.DISABLE_AUTO_UPGRADE) {
      console.log(chalk.yellow('Upgrading to Claude 3.7 Sonnet for better capabilities...'));
      config.model = 'claude-3-7-sonnet-20240229';
      configChanged = true;
    }
  }
  
  if (configChanged) {
    saveConfig();
    console.log(chalk.green(`Model upgraded to: ${config.model}`));
  }
}

// Handle API configuration
function getApiConfiguration(): ApiConfiguration {
  return {
    apiProvider: config.apiProvider,
    apiKey: config.apiKey,
    model: config.model,
    modelMaxTokens: config.maxTokens,
    modelTemperature: config.temperature,
  };
}

// Create .env template
function createEnvTemplate() {
  const template = `# Roo Pilot API Keys
# Uncomment and add your API keys below

# Anthropic (Claude)
# ANTHROPIC_API_KEY=your_key_here

# OpenAI
# OPENAI_API_KEY=your_key_here

# OpenRouter
# OPENROUTER_API_KEY=your_key_here

# AWS Bedrock
# AWS_ACCESS_KEY_ID=your_access_key
# AWS_SECRET_ACCESS_KEY=your_secret_key
# AWS_REGION=us-east-1

# Google Gemini
# GOOGLE_API_KEY=your_key_here

# Mistral
# MISTRAL_API_KEY=your_key_here

# Groq
# GROQ_API_KEY=your_key_here
`;

  const filePath = path.join(process.cwd(), '.env.template');
  fs.writeFileSync(filePath, template);
  console.log(chalk.green(`Created .env.template file at ${filePath}`));
  console.log(chalk.yellow('Copy this file to .env and add your API keys.'));
}

// Model metadata with display names, vision capability, and context windows
interface ModelMetadata {
  name: string;
  displayName: string;
  supportsVision: boolean;
  contextWindow: number;
}

// Get available models for a provider
function getAvailableModels(provider: string): string[] {
  return getProviderModelsMetadata(provider).map(model => model.name);
}

// Get detailed model metadata
function getProviderModelsMetadata(provider: string): ModelMetadata[] {
  if (provider === "anthropic") {
    return [
      { name: "claude-3-7-sonnet-20240229", displayName: "Claude 3.7 Sonnet", supportsVision: true, contextWindow: 200000 },
      { name: "claude-3-5-sonnet-20240620", displayName: "Claude 3.5 Sonnet", supportsVision: true, contextWindow: 200000 },
      { name: "claude-3-opus-20240229", displayName: "Claude 3 Opus", supportsVision: true, contextWindow: 200000 },
      { name: "claude-3-haiku-20240307", displayName: "Claude 3 Haiku", supportsVision: true, contextWindow: 200000 }
    ];
  } else if (provider === "openai") {
    return [
      { name: "gpt-4o", displayName: "GPT-4o", supportsVision: true, contextWindow: 128000 },
      { name: "gpt-4o-mini", displayName: "GPT-4o Mini", supportsVision: true, contextWindow: 128000 },
      { name: "gpt-4-turbo", displayName: "GPT-4 Turbo", supportsVision: true, contextWindow: 128000 },
      { name: "gpt-3.5-turbo", displayName: "GPT-3.5 Turbo", supportsVision: true, contextWindow: 16385 }
    ];
  } else if (provider === "openrouter") {
    return [
      { name: "anthropic/claude-3-7-sonnet", displayName: "Claude 3.7 Sonnet", supportsVision: true, contextWindow: 200000 },
      { name: "anthropic/claude-3-opus", displayName: "Claude 3 Opus", supportsVision: true, contextWindow: 200000 },
      { name: "openai/gpt-4o", displayName: "GPT-4o", supportsVision: true, contextWindow: 128000 },
      { name: "mistral/mistral-large", displayName: "Mistral Large", supportsVision: false, contextWindow: 32000 },
      { name: "meta-llama/llama-3-70b-instruct", displayName: "Llama 3 70B", supportsVision: false, contextWindow: 8000 }
    ];
  } else if (provider === "bedrock") {
    return [
      { name: "anthropic.claude-3-7-sonnet-20240229", displayName: "Claude 3.7 Sonnet", supportsVision: true, contextWindow: 200000 },
      { name: "anthropic.claude-3-opus-20240229", displayName: "Claude 3 Opus", supportsVision: true, contextWindow: 200000 },
      { name: "anthropic.claude-3-haiku-20240307", displayName: "Claude 3 Haiku", supportsVision: true, contextWindow: 200000 }
    ];
  } else if (provider === "gemini") {
    return [
      { name: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", supportsVision: true, contextWindow: 1000000 },
      { name: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash", supportsVision: true, contextWindow: 1000000 }
    ];
  } else if (provider === "mistral") {
    return [
      { name: "mistral-large-latest", displayName: "Mistral Large", supportsVision: false, contextWindow: 32000 },
      { name: "mistral-medium-latest", displayName: "Mistral Medium", supportsVision: false, contextWindow: 32000 },
      { name: "mistral-small-latest", displayName: "Mistral Small", supportsVision: false, contextWindow: 32000 }
    ];
  } else if (provider === "groq") {
    return [
      { name: "llama3-3-70b-versatile", displayName: "Llama 3.3 70B Versatile", supportsVision: false, contextWindow: 8192 },
      { name: "llama3-70b-8192", displayName: "Llama 3 70B", supportsVision: false, contextWindow: 8192 },
      { name: "llama3-8b-8192", displayName: "Llama 3 8B", supportsVision: false, contextWindow: 8192 },
      { name: "mixtral-8x7b-32768", displayName: "Mixtral 8x7B", supportsVision: false, contextWindow: 32768 },
      { name: "gemma-7b-it", displayName: "Gemma 7B", supportsVision: false, contextWindow: 8192 },
      { name: "claude-3-5-sonnet-20240620", displayName: "Claude 3.5 Sonnet", supportsVision: true, contextWindow: 200000 }
    ];
  } else {
    return [];
  }
}

// File operations
async function readFile(filePath: string): Promise<string> {
  try {
    // Convert relative path to absolute
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(config.workspacePath, filePath);
    
    // Check if file exists
    if (!await fileExistsAtPath(fullPath)) {
      return `Error: File not found at ${fullPath}`;
    }
    
    // Read file content
    const content = fs.readFileSync(fullPath, 'utf8');
    return content;
  } catch (error) {
    return `Error reading file: ${error}`;
  }
}

async function writeFile(filePath: string, content: string): Promise<string> {
  try {
    // Convert relative path to absolute
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(config.workspacePath, filePath);
    
    // Create directory if it doesn't exist
    const dirPath = path.dirname(fullPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Write file content
    fs.writeFileSync(fullPath, content);
    return `File written successfully to ${fullPath}`;
  } catch (error) {
    return `Error writing file: ${error}`;
  }
}

async function listFiles(dirPath: string): Promise<string> {
  try {
    // Convert relative path to absolute
    const fullPath = path.isAbsolute(dirPath) 
      ? dirPath 
      : path.join(config.workspacePath, dirPath);
    
    // Check if directory exists
    if (!fs.existsSync(fullPath)) {
      return `Error: Directory not found at ${fullPath}`;
    }
    
    // List files
    const items = fs.readdirSync(fullPath, { withFileTypes: true });
    const output = items.map(item => {
      const isDir = item.isDirectory();
      return `${isDir ? '[DIR]' : '[FILE]'} ${item.name}`;
    });
    
    return output.join('\n');
  } catch (error) {
    return `Error listing files: ${error}`;
  }
}

// Flag to indicate whether we're in an interactive session
let isInteractiveSession = false;

// IMPORTANT: Keep the CLI process running even when Ctrl+C is pressed
// Global SIGINT handler that prevents the process from exiting
process.on('SIGINT', () => {
  console.log(chalk.yellow('\nTo exit, type /exit or /quit'));
  // Don't exit
});

// Signal handling for graceful termination
function setupSignalHandlers(rl: readline.Interface) {
  // Handle SIGINT (Ctrl+C)
  rl.on('SIGINT', () => {
    console.log(chalk.yellow('\nTo exit, type /exit or /quit'));
    rl.prompt();
    // Don't exit
  });
  
  // Handle SIGTERM
  process.on('SIGTERM', () => {
    console.log(chalk.yellow('\nReceived termination signal.'));
    console.log(chalk.yellow('To exit, type /exit or /quit'));
    rl.prompt();
    // Don't exit
  });
}

// Interactive chat session
async function startChatSession() {
  isInteractiveSession = true;
  
  console.log(chalk.cyan('╔═════════════════════════════════════════╗'));
  console.log(chalk.cyan('║           Roo Pilot CLI v1.0.0          ║'));
  console.log(chalk.cyan('╚═════════════════════════════════════════╝'));
  console.log(chalk.cyan(`Using model: ${config.model}`));
  console.log(chalk.cyan(`Current workspace: ${config.workspacePath}`));
  console.log(chalk.yellow('Type "/help" to see available commands, "/exit" to quit'));
  
  // We'll use a function-based approach rather than event-based to ensure we don't exit unexpectedly
  await runChatLoop();
}

// Main chat loop
async function runChatLoop() {
  // Keep the session running until explicitly terminated
  let running = true;
  
  // Global readline interface
  const mainInput = process.stdin;
  const mainOutput = process.stdout;
  
  // Disable input echo mode to prevent issues
  if (mainInput.isTTY) {
    mainInput.setRawMode(false);
  }
  
  // Handle SIGINT (Ctrl+C) to prevent abrupt exit
  process.on('SIGINT', () => {
    mainOutput.write(chalk.yellow('\nUse /exit to quit the session.\n'));
    mainOutput.write(chalk.green('You > '));
  });
  
  // Handle SIGTERM for graceful shutdown
  process.on('SIGTERM', () => {
    console.log(chalk.yellow('\nReceived termination signal. Shutting down...'));
    running = false;
    process.exit(0);
  });
  
  while (running) {
    // Create a new readline interface for each input
    // This avoids issues with readline closing the process
    const rl = readline.createInterface({
      input: mainInput,
      output: mainOutput,
      prompt: chalk.green('You > ')
    });
    
    // Get user input
    const input = await new Promise<string>((resolve) => {
      rl.prompt();
      
      // Only set up a single listener that resolves the promise
      rl.once('line', (line) => {
        resolve(line);
        
        // Close without exiting
        rl.close();
      });
    });
    
    // Process commands
    if (input.startsWith('/')) {
      const command = input.slice(1).trim();
      
      if (command === 'exit' || command === 'quit') {
        console.log(chalk.cyan('Goodbye!'));
        running = false;
        process.exit(0);
        break;
      }
      
      if (command === 'help') {
        displayHelp();
        continue;
      }
      
      if (command === 'clear') {
        console.clear();
        chatHistory.messages = [];
        console.log(chalk.yellow('Chat history cleared.'));
        continue;
      }
      
      if (command.startsWith('config')) {
        await handleConfigCommand(command.slice(6).trim());
        continue;
      }
      
      if (command === 'env') {
        createEnvTemplate();
        continue;
      }
      
      if (command.startsWith('read')) {
        const filePath = command.slice(4).trim();
        if (!filePath) {
          console.log(chalk.red('Please specify a file path to read.'));
          continue;
        }
        
        const content = await readFile(filePath);
        console.log(content);
        
        // Add file content to context
        const userMessage: Anthropic.MessageParam = {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Here's the content of ${filePath}:\n\n${content}`
            }
          ]
        };
        
        chatHistory.messages.push(userMessage);
        continue;
      }
      
      if (command.startsWith('write')) {
        try {
          // Format should be /write path content
          const filePath = command.slice(5).trim().split(' ')[0];
          const content = command.slice(5).trim().substring(filePath.length + 1);
          
          if (!filePath || !content) {
            console.log(chalk.red('Usage: /write path content'));
            continue;
          }
          
          const result = await writeFile(filePath, content);
          console.log(chalk.green(result));
          
          // Add file content to context
          const userMessage: Anthropic.MessageParam = {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `I've written the following content to ${filePath}:\n\n${content}`
              }
            ]
          };
          
          chatHistory.messages.push(userMessage);
        } catch (error) {
          console.log(chalk.red(`Error: ${error}`));
        }
        
        continue;
      }
      
      if (command.startsWith('ls')) {
        const dirPath = command.slice(2).trim() || '.';
        const content = await listFiles(dirPath);
        console.log(content);
        
        // Add directory listing to context
        const userMessage: Anthropic.MessageParam = {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Directory listing of ${dirPath}:\n\n${content}`
            }
          ]
        };
        
        chatHistory.messages.push(userMessage);
        continue;
      }
      
      if (command === 'models') {
        console.log(chalk.yellow('\nAvailable models for current provider:'));
        
        const modelsMetadata = getProviderModelsMetadata(config.apiProvider);
        
        console.log(chalk.cyan(`\nProvider: ${config.apiProvider}`));
        console.log(chalk.cyan(`Select a model by entering the number:`));
        console.log('');
        
        modelsMetadata.forEach((model, index) => {
          const isCurrent = model.name === config.model;
          const visionIcon = model.supportsVision ? '👁️ ' : '   ';
          const displayNum = (index + 1).toString().padStart(2, ' ');
          const contextInfo = `(${Math.round(model.contextWindow/1000)}K ctx)`;
          
          console.log(`${isCurrent ? chalk.green('➤') : ' '} ${chalk.yellow(displayNum)}. ${visionIcon}${model.displayName} ${chalk.gray(contextInfo)}`);
        });
        
        console.log('');
        console.log(chalk.cyan(`Enter model number to select, or press Enter to cancel:`));
        
        // Get model selection
        const modelSelectRL = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const answer = await new Promise<string>((resolve) => {
          modelSelectRL.question('', (response) => {
            resolve(response);
            modelSelectRL.close();
          });
        });
        
        // Process the model selection
        const modelNum = parseInt(answer.trim());
        if (!isNaN(modelNum) && modelNum > 0 && modelNum <= modelsMetadata.length) {
          const selectedModel = modelsMetadata[modelNum - 1];
          
          // Update config with the new model
          config.model = selectedModel.name;
          
          // Update vision capability based on model support
          config.isVisionEnabled = selectedModel.supportsVision;
          
          saveConfig();
          console.log(chalk.green(`\nModel changed to: ${selectedModel.displayName}`));
          
          if (selectedModel.supportsVision) {
            console.log(chalk.yellow(`This model supports vision/images.`));
          }
        } else if (answer.trim() !== '') {
          console.log(chalk.red(`\nInvalid selection: ${answer}`));
        }
        
        continue;
      }
      
      console.log(chalk.red(`Unknown command: ${command}`));
      continue;
    }
    
    // Process normal user input and await the response
    await processUserInput(input);
    
    // Continue the loop - this is critical to maintaining the session
    continue;
  }
}

// Display help information
function displayHelp() {
  console.log(chalk.yellow('\nRoo Pilot CLI Commands:'));
  console.log(chalk.cyan('/help') + ' - Display this help message');
  console.log(chalk.cyan('/exit') + ' - Exit the chat session');
  console.log(chalk.cyan('/clear') + ' - Clear the chat history');
  console.log(chalk.cyan('/config') + ' - Show current configuration');
  console.log(chalk.cyan('/config key=value') + ' - Update a configuration value');
  console.log(chalk.cyan('/models') + ' - Select a model from numbered list');
  console.log(chalk.cyan('/env') + ' - Create .env.template file');
  console.log(chalk.cyan('/read path/to/file') + ' - Read a file and add to context');
  console.log(chalk.cyan('/write path content') + ' - Write content to a file');
  console.log(chalk.cyan('/ls [path]') + ' - List files in a directory');
  
  console.log(chalk.yellow('\nLLM Providers:'));
  console.log(' - ' + chalk.cyan('Anthropic Claude') + ' - Vision-capable, large context window');
  console.log(' - ' + chalk.cyan('OpenAI GPT') + ' - Vision-capable, good at coding tasks');
  console.log(' - ' + chalk.cyan('Groq') + ' - Fast inference with Llama 3.3 function calling');
  console.log(' - ' + chalk.cyan('Mistral AI') + ' - Open models with good performance');
  console.log(' - ' + chalk.cyan('OpenRouter') + ' - Access to many different models');

  console.log(chalk.yellow('\nQuick Tips:'));
  console.log(' - Use ' + chalk.cyan('/models') + ' to interactively select models with arrow keys');
  console.log(' - Set up your API keys in .env file for easy provider switching');
  console.log(' - The assistant can detect shell commands in responses and offer to run them');
  console.log(' - 👁️ icon indicates models with vision/image capabilities');
  console.log(' - Llama 3.3 models support function calling for better tool capabilities');
  console.log('\n');
}

// Handle configuration commands
async function handleConfigCommand(subcommand: string) {
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
    
    if (!config.apiKey) {
      console.log(chalk.red('\nWarning: API key is not set.'));
      console.log(chalk.yellow('You can:'));
      console.log(chalk.yellow('1. Use /config apiKey=your_key to set it directly'));
      console.log(chalk.yellow('2. Add it to .env file (recommended)'));
      console.log(chalk.yellow('3. Run /env to create a template .env file'));
    }
    
    console.log(chalk.yellow('\nAvailable providers:'));
    const providers = {
      'anthropic': 'Anthropic (Claude)',
      'openai': 'OpenAI (GPT)',
      'openrouter': 'OpenRouter',
      'bedrock': 'AWS Bedrock',
      'gemini': 'Google Gemini',
      'mistral': 'Mistral AI',
      'groq': 'Groq (Fast inference)'
    };
    
    Object.entries(providers).forEach(([key, name]) => {
      const isCurrent = key === config.apiProvider;
      console.log(`${isCurrent ? chalk.green('➤ ') : '  '}${key}: ${name}`);
    });
    
    return;
  }
  
  // Update configuration
  const keyValueMatch = subcommand.match(/^(\w+)=(.+)$/);
  if (keyValueMatch) {
    const [_, key, value] = keyValueMatch;
    
    if (key in config) {
      // Special handling for apiProvider
      if (key === 'apiProvider') {
        const providers = ['anthropic', 'openai', 'openrouter', 'bedrock', 'gemini', 'mistral', 'groq'];
        if (!providers.includes(value)) {
          console.log(chalk.red(`Invalid provider: ${value}`));
          console.log(chalk.yellow(`Available providers: ${providers.join(', ')}`));
          return;
        }
        
        // Update provider and suggest a model
        (config as any)[key] = value;
        
        // Suggest a default model
        const models = getAvailableModels(value);
        if (models.length > 0 && !models.includes(config.model)) {
          config.model = models[0];
          console.log(chalk.yellow(`Changed model to ${config.model}`));
        }
      } else if (key === 'model') {
        // Validate model for current provider
        const models = getAvailableModels(config.apiProvider);
        if (!models.includes(value)) {
          console.log(chalk.red(`Warning: ${value} is not in the list of known models for ${config.apiProvider}`));
          console.log(chalk.yellow(`Available models: ${models.join(', ')}`));
          const proceed = await askYesNo('Continue anyway?');
          if (!proceed) return;
        }
        (config as any)[key] = value;
      } else {
        // Type conversion for numeric values
        if (key === 'temperature' || key === 'maxTokens') {
          (config as any)[key] = Number(value);
        } else {
          (config as any)[key] = value;
        }
      }
      
      saveConfig();
      console.log(chalk.green(`Configuration updated: ${key} = ${key === 'apiKey' ? '****' : value}`));
    } else {
      console.log(chalk.red(`Unknown configuration key: ${key}`));
      console.log(chalk.yellow(`Available keys: ${Object.keys(config).join(', ')}`));
    }
  } else {
    console.log(chalk.red('Invalid configuration format. Use /config key=value'));
  }
}

// Helper function to ask yes/no questions
async function askYesNo(question: string): Promise<boolean> {
  // Create a temporary readline interface but don't let it exit the process
  const tempRL = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise<boolean>((resolve) => {
    tempRL.question(`${question} (y/n) `, (answer) => {
      // Make sure we don't propagate any close events
      try {
        tempRL.close();
      } catch (err) {
        // Ignore errors on close
      }
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// Detect and extract shell commands from text
function extractCommands(text: string): string[] {
  const commands: string[] = [];
  
  // Match code blocks with bash/shell or no language specified
  const codeBlockRegex = /```(?:bash|sh|shell|zsh|)?\n([\s\S]*?)\n```/g;
  let match;
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const code = match[1].trim();
    if (code && !code.includes("\n")) {
      // Single line commands only
      commands.push(code);
    }
  }
  
  // Match inline code that looks like commands
  const inlineCodeRegex = /`([^`]+)`/g;
  while ((match = inlineCodeRegex.exec(text)) !== null) {
    const code = match[1].trim();
    
    // Simple heuristic for common shell commands
    const commandPrefixes = ['cd ', 'ls', 'cat ', 'grep ', 'find ', 'mkdir ', 'rm ', 'cp ', 'mv ', 'git ', 'npm ', 'node ', 'python ', 'pip ', 'sudo ', 'apt ', 'brew ', 'touch ', 'echo ', 'curl ', 'wget '];
    const isCommand = commandPrefixes.some(prefix => code.startsWith(prefix));
    
    if (isCommand) {
      commands.push(code);
    }
  }
  
  return [...new Set(commands)]; // Remove duplicates
}

// Execute a shell command
async function executeCommand(command: string): Promise<string> {
  return new Promise((resolve) => {
    const { execSync } = require('child_process');
    
    try {
      const result = execSync(command, { 
        encoding: 'utf8',
        cwd: config.workspacePath 
      });
      resolve(result);
    } catch (error: any) {
      resolve(`Error: ${error.message}`);
    }
  });
}

// Check if the user question is about running a command
function isAskingAboutCommand(input: string): boolean {
  const commandPatterns = [
    /how (?:do|can) I run/i,
    /how (?:to|do I) (?:use|execute)/i,
    /what (?:is|are) the command/i,
    /what command (?:should|can) I (?:use|run)/i,
    /(?:show|tell) me the command/i,
    /how (?:to|do I) install/i,
    /(?:can|could) you (?:show|give) me the command/i
  ];
  
  return commandPatterns.some(pattern => pattern.test(input));
}

// Process user input
async function processUserInput(input: string) {
  // Flag to indicate we're processing a user message
  const processingUserInput = true;
  
  // Add user message to history
  const userMessage: Anthropic.MessageParam = {
    role: 'user',
    content: [
      {
        type: 'text',
        text: input
      }
    ]
  };
  
  chatHistory.messages.push(userMessage);
  
  // Get API handler
  const apiConfig = getApiConfiguration();
  if (!apiConfig.apiKey) {
    console.log(chalk.red('API key not set. Use /config apiKey=your_key to set it or add it to .env file.'));
    console.log(chalk.yellow('Run /env to create a template .env file.'));
    return;
  }
  
  const api = buildApiHandler(apiConfig);
  const spinner = ora('Thinking...').start();
  
  try {
    // Get system prompt
    const mode = getModeBySlug(config.mode) || getModeBySlug(defaultModeSlug);
    
    // Add more comprehensive system prompt for shell commands if needed
    let enhancedSystemPrompt = mode?.systemPrompt || '';
    
    if (isAskingAboutCommand(input)) {
      enhancedSystemPrompt += `\n\nWhen explaining shell commands, provide a clear explanation of what the command does and put the actual command in a code block using backticks. For example: \`command here\`. This makes it easier for the user to copy and run the command.`;
    }
    
    const systemPrompt = SYSTEM_PROMPT(enhancedSystemPrompt, {
      customInstructions: '',
      modeSlug: mode?.slug || defaultModeSlug,
      modeName: mode?.name || 'Assistant'
    });
    
    // Create message stream
    const messageStream = api.createMessage(systemPrompt, chatHistory.messages);
    
    let assistantResponse = '';
    let isDone = false;
    
    // Process stream
    for await (const chunk of messageStream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text') {
        assistantResponse += chunk.delta.text;
        
        // Update spinner text periodically to show progress
        if (assistantResponse.length % 50 === 0) {
          spinner.text = 'Thinking...';
        }
      } else if (chunk.type === 'message_stop') {
        isDone = true;
      }
    }
    
    spinner.stop();
    
    if (isDone) {
      // Parse assistant message to handle special formatting
      const parsedMessage = parseAssistantMessage(assistantResponse);
      
      // Add assistant message to history
      const assistantMessage: Anthropic.MessageParam = {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: assistantResponse
          }
        ]
      };
      
      chatHistory.messages.push(assistantMessage);
      
      // Display formatted response
      console.log(chalk.blue('Assistant > '));
      console.log(formatResponse(assistantResponse));
      
      // Handle tool use requests
      for (const content of parsedMessage) {
        if (content.type === 'tool_use') {
          await handleToolUse(content);
        }
      }
      
      // Detect and offer to run shell commands
      const commands = extractCommands(assistantResponse);
      if (commands.length > 0) {
        console.log('');
        console.log(chalk.yellow('I found some commands in the response. Would you like to run one?'));
        
        for (let i = 0; i < commands.length; i++) {
          console.log(chalk.cyan(`[${i + 1}]`) + ` ${commands[i]}`);
        }
        console.log(chalk.cyan('[0]') + ' Do not run any command');
        
        // Create a readline interface that doesn't affect the main process flow
        const commandSelectRL = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          terminal: false // Don't take over the terminal
        });
        
        // Get the command selection
        const answer = await new Promise<string>((resolve) => {
          commandSelectRL.question(chalk.green('Enter number: '), (response) => {
            resolve(response);
            // Close the interface but don't let it propagate exit events
            try {
              commandSelectRL.close();
            } catch (e) {
              // Ignore errors
            }
          });
        });
        
        const commandIndex = parseInt(answer.trim()) - 1;
        if (commandIndex >= 0 && commandIndex < commands.length) {
          const command = commands[commandIndex];
          console.log(chalk.yellow(`\nExecuting: ${command}`));
          
          const result = await executeCommand(command);
          console.log(result);
          
          // Add command execution to chat history
          const commandMessage: Anthropic.MessageParam = {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `I ran the command \`${command}\` and got this result:\n\n${result}`
              }
            ]
          };
          
          chatHistory.messages.push(commandMessage);
        }
      }
    }
  } catch (error) {
    spinner.stop();
    console.error(chalk.red('Error processing request:'), error);
  }
}

// Handle tool use requests from the assistant
async function handleToolUse(toolUse: any) {
  // Check if the tool is allowed
  const mode = getModeBySlug(config.mode) || getModeBySlug(defaultModeSlug);
  if (!mode || !isToolAllowedForMode(toolUse.name as any, mode.slug)) {
    console.log(chalk.red(`Tool ${toolUse.name} is not allowed in ${mode?.name || 'default'} mode.`));
    return;
  }
  
  console.log(chalk.yellow(`\nRequested to use tool: ${toolUse.name}`));
  
  // Process different tools
  if (toolUse.name === 'read_file') {
    const filePath = toolUse.parameters.file_path;
    console.log(chalk.cyan(`Reading file: ${filePath}`));
    
    const content = await readFile(filePath);
    
    // Add tool result to chat history
    const toolResultMessage: Anthropic.MessageParam = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Tool ${toolUse.name} result:\n${content}`
        }
      ]
    };
    
    chatHistory.messages.push(toolResultMessage);
    console.log(chalk.green('File content added to chat context.'));
  } else if (toolUse.name === 'write_to_file') {
    const { file_path, content } = toolUse.parameters;
    
    // Ask for confirmation before writing but ensure we don't exit the process
    let confirm = false;
    try {
      confirm = await askYesNo(chalk.yellow(`Allow writing to ${file_path}?`));
    } catch (err) {
      console.error('Error asking for confirmation:', err);
    }
    
    if (confirm) {
      console.log(chalk.cyan(`Writing to file: ${file_path}`));
      const result = await writeFile(file_path, content);
      
      // Add tool result to chat history
      const toolResultMessage: Anthropic.MessageParam = {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Tool ${toolUse.name} result:\n${result}`
          }
        ]
      };
      
      chatHistory.messages.push(toolResultMessage);
    } else {
      // Inform that the action was rejected
      const toolResultMessage: Anthropic.MessageParam = {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Tool ${toolUse.name} was rejected by the user.`
          }
        ]
      };
      
      chatHistory.messages.push(toolResultMessage);
    }
  } else if (toolUse.name === 'list_files') {
    const dirPath = toolUse.parameters.path || '.';
    console.log(chalk.cyan(`Listing files in: ${dirPath}`));
    
    const content = await listFiles(dirPath);
    
    // Add tool result to chat history
    const toolResultMessage: Anthropic.MessageParam = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Tool ${toolUse.name} result:\n${content}`
        }
      ]
    };
    
    chatHistory.messages.push(toolResultMessage);
  } else {
    console.log(chalk.red(`Unsupported tool: ${toolUse.name}`));
    
    // Inform the assistant that the tool is not supported
    const toolResultMessage: Anthropic.MessageParam = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Tool ${toolUse.name} is not supported in the CLI version.`
        }
      ]
    };
    
    chatHistory.messages.push(toolResultMessage);
  }
}

// Main program
program
  .name('roo-pilot-cli')
  .description('CLI version of Roo Pilot for Windows terminals')
  .version('1.0.0');

program
  .command('chat')
  .description('Start an interactive chat session')
  .action(() => {
    process.on('exit', (code) => {
      console.log(chalk.yellow(`\nRoo-Pilot CLI exited with code ${code}.`));
    });
    
    // Don't let process exit on errors
    process.on('uncaughtException', (err) => {
      console.error(chalk.red('Uncaught exception:'), err);
      // Don't exit
    });
    
    initializeConfig();
    startChatSession().catch(err => {
      console.error(chalk.red('Error in chat session:'), err);
      // Try to restart
      setTimeout(() => {
        startChatSession().catch(console.error);
      }, 1000);
    });
  });

program
  .command('config')
  .description('View or update configuration')
  .argument('[key=value]', 'Configuration key and value to set')
  .action((keyValue) => {
    initializeConfig();
    handleConfigCommand(keyValue || '');
  });

program
  .command('env')
  .description('Create a template .env file')
  .action(() => {
    createEnvTemplate();
  });

program.parse();

// Default to chat if no command is specified
if (!process.argv.slice(2).length) {
  initializeConfig();
  
  // Try to keep the CLI alive no matter what
  process.on('exit', (code) => {
    console.log(chalk.yellow(`\nRoo-Pilot CLI exited with code ${code}.`));
  });
  
  // Don't let process exit on errors
  process.on('uncaughtException', (err) => {
    console.error(chalk.red('Uncaught exception:'), err);
    // Don't exit
  });
  
  startChatSession().catch(err => {
    console.error(chalk.red('Error in chat session:'), err);
    // Try to restart
    setTimeout(() => {
      startChatSession().catch(console.error);
    }, 1000);
  });
}