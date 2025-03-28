#!/usr/bin/env node

const readline = require('readline');
const chalk = require('chalk');
const { Anthropic } = require('@anthropic-ai/sdk');
const { OpenAI } = require('openai');
const dotenv = require('dotenv');
const ora = require('ora');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

// Load environment variables
dotenv.config();

// Configuration directory
const CONFIG_DIR = path.join(os.homedir(), '.roo-pilot');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Create config directory if it doesn't exist
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Default configuration
const DEFAULT_CONFIG = {
  apiProvider: 'groq',
  apiKey: process.env.GROQ_API_KEY || '',
  model: 'llama-3.3-70b-versatile',
  temperature: 0.3,
  maxTokens: 4096,
  workspacePath: process.cwd(),
  isVisionEnabled: false,
  mode: 'assistant',
  mcpServerAddress: 'http://localhost:3000',
  checkMcpOnStart: false
};

// Chat history
let chatHistory = [];

// Cached models
let cachedModels = {};

// Initialize config file if it doesn't exist
function initializeConfig() {
  // Function to detect which API keys are available
  function detectApiKeys() {
    const keys = {
      groq: process.env.GROQ_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      mistral: process.env.MISTRAL_API_KEY
    };
    
    // Count how many keys are available
    const availableKeys = Object.entries(keys).filter(([_, value]) => value && value.trim() !== '');
    
    return {
      keys,
      count: availableKeys.length,
      available: availableKeys.map(([key, _]) => key)
    };
  }
  
  if (!fs.existsSync(CONFIG_FILE)) {
    // Load API keys from environment variables
    const envConfig = { ...DEFAULT_CONFIG };
    const apiKeys = detectApiKeys();
    
    // If no keys are available, keep the default (groq)
    if (apiKeys.count === 0) {
      console.log(chalk.yellow('No API keys found in environment variables. Using default provider.'));
      console.log(chalk.yellow('Add your API key to the .env file or use /config apiKey=your_key'));
    }
    // If only one key is available, use that provider
    else if (apiKeys.count === 1) {
      const provider = apiKeys.available[0];
      envConfig.apiProvider = provider;
      envConfig.apiKey = apiKeys.keys[provider];
      
      // Set appropriate default model
      switch (provider) {
        case 'groq':
          envConfig.model = 'llama-3.3-70b-versatile';
          break;
        case 'anthropic':
          envConfig.model = 'claude-3-7-sonnet-20240229';
          break;
        case 'openai':
          envConfig.model = 'gpt-4o';
          break;
        case 'mistral':
          envConfig.model = 'mistral-large-latest';
          break;
      }
      
      console.log(chalk.green(`Found API key for ${provider}. Using it as default provider.`));
    }
    // If multiple keys are available, prioritize groq, then others
    else {
      if (apiKeys.keys.groq) {
        envConfig.apiProvider = 'groq';
        envConfig.apiKey = apiKeys.keys.groq;
        envConfig.model = 'llama-3.3-70b-versatile';
      } else if (apiKeys.keys.anthropic) {
        envConfig.apiProvider = 'anthropic';
        envConfig.apiKey = apiKeys.keys.anthropic;
        envConfig.model = 'claude-3-7-sonnet-20240229';
      } else if (apiKeys.keys.openai) {
        envConfig.apiProvider = 'openai';
        envConfig.apiKey = apiKeys.keys.openai;
        envConfig.model = 'gpt-4o';
      } else if (apiKeys.keys.mistral) {
        envConfig.apiProvider = 'mistral';
        envConfig.apiKey = apiKeys.keys.mistral;
        envConfig.model = 'mistral-large-latest';
      }
      
      console.log(chalk.green(`Multiple API keys found. Using ${envConfig.apiProvider} as default.`));
      console.log(chalk.yellow(`You can switch providers with /config apiProvider=provider_name`));
    }
    
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(envConfig, null, 2));
    return envConfig;
  } else {
    try {
      const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
      const config = { ...DEFAULT_CONFIG, ...JSON.parse(configData) };
      const apiKeys = detectApiKeys();
      
      // Fix legacy model names that may be in config
      if (config.apiProvider === 'groq') {
        if (config.model === 'llama-3-70b-8192') {
          config.model = 'llama3-70b-8192';
          saveConfig(config);
          console.log(chalk.yellow('Updated Groq model name format in config'));
        }
        
        // Upgrade to Llama 3.3 if using older Llama model
        if (config.model === 'llama3-70b-8192') {
          config.model = 'llama-3.3-70b-versatile';
          saveConfig(config);
          console.log(chalk.green('Upgraded to Llama 3.3 70B Versatile model with function calling'));
        }
      }
      
      // If the configured provider doesn't have an API key but others do, switch
      if (!apiKeys.keys[config.apiProvider] && apiKeys.count > 0) {
        console.log(chalk.yellow(`No API key found for ${config.apiProvider}, but keys found for other providers.`));
        
        // Use the first available provider
        const newProvider = apiKeys.available[0];
        config.apiProvider = newProvider;
        config.apiKey = apiKeys.keys[newProvider];
        
        // Update model if needed
        getAvailableModels(newProvider).then(models => {
          if (models.length > 0 && !models.includes(config.model)) {
            config.model = models[0];
          }
          
          console.log(chalk.green(`Switching to ${newProvider} with model ${config.model}`));
          
          // Save the updated config
          saveConfig(config);
        });
      } 
      // Otherwise, just use the environment variable for the current provider if available
      else if (apiKeys.keys[config.apiProvider]) {
        config.apiKey = apiKeys.keys[config.apiProvider];
      }
      
      return config;
    } catch (error) {
      console.error('Error reading config file:', error);
      console.log('Using default configuration');
      return DEFAULT_CONFIG;
    }
  }
}

// Save configuration
function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Model metadata with display names, vision capability, and context windows
class ModelMetadata {
  constructor(name, displayName, supportsVision = false, contextWindow = 4096, speed = 2, reasoning = 2) {
    this.name = name;
    this.displayName = displayName;
    this.supportsVision = supportsVision;
    this.contextWindow = contextWindow;
    this.speed = speed;      // 1-3 (1=slow, 3=fast)
    this.reasoning = reasoning; // 1-3 (1=basic, 3=advanced)
  }
  
  toString() {
    const visionIcon = this.supportsVision ? "👁️ " : "   ";
    const ctxSize = `${Math.round(this.contextWindow/1000)}K`;
    const speedIndicator = "⚡".repeat(this.speed);
    const reasoningIndicator = "🧠".repeat(this.reasoning);
    return `${visionIcon}${this.displayName} (${ctxSize} ctx) ${speedIndicator} ${reasoningIndicator}`;
  }
}

// Get available models for a provider
async function getAvailableModels(provider) {
  // Use cached models if available
  if (cachedModels[provider]) {
    return cachedModels[provider].map(model => model.name);
  }
  
  // Fetch models from provider API
  try {
    const models = await fetchModelsFromProvider(provider);
    if (models && models.length > 0) {
      cachedModels[provider] = models;
      return models.map(model => model.name);
    }
  } catch (error) {
    console.error(`Error fetching models from ${provider}:`, error);
  }
  
  // Fall back to hardcoded models if API fetch fails
  const fallbackModels = getFallbackModelsMetadata(provider);
  cachedModels[provider] = fallbackModels;
  return fallbackModels.map(model => model.name);
}

// Fetch models directly from provider API
async function fetchModelsFromProvider(provider) {
  if (provider === "openai") {
    try {
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      
      const response = await client.models.list();
      const chatModels = response.data.filter(model => 
        model.id.includes('gpt') && !model.id.includes('instruct')
      );
      
      return chatModels.map(model => {
        let contextWindow = 16385; // default
        let supportsVision = false;
        
        // Set known values for specific models
        if (model.id.includes('gpt-4') || model.id.includes('gpt-4o')) {
          contextWindow = 128000;
          supportsVision = true;
        } else if (model.id.includes('gpt-3.5-turbo')) {
          contextWindow = 16385;
          supportsVision = model.id.includes('vision');
        }
        
        return new ModelMetadata(
          model.id,
          model.id,
          supportsVision,
          contextWindow,
          model.id.includes('gpt-3.5') ? 3 : 2,
          model.id.includes('gpt-4') ? 3 : 2
        );
      });
    } catch (error) {
      console.error("Error fetching OpenAI models:", error);
      return null;
    }
  } 
  else if (provider === "groq") {
    try {
      // Groq uses OpenAI's API structure
      const client = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1"
      });
      
      const response = await client.models.list();
      
      return response.data.map(model => {
        let contextWindow = 8192; // default
        let supportsVision = false;
        
        // Set known values for specific models
        if (model.id.includes('llama3-70b')) {
          contextWindow = 8192;
        } else if (model.id.includes('mixtral')) {
          contextWindow = 32768;
        } else if (model.id.includes('claude')) {
          contextWindow = 200000;
          supportsVision = true;
        }
        
        return new ModelMetadata(
          model.id,
          model.id,
          supportsVision,
          contextWindow,
          3, // Groq is generally fast
          model.id.includes('70b') || model.id.includes('claude') ? 3 : 2
        );
      });
    } catch (error) {
      console.error("Error fetching Groq models:", error);
      return null;
    }
  }
  
  // For providers without a direct list API endpoint, use fallback
  return null;
}

// Get detailed fallback model metadata (when API fetch fails)
function getFallbackModelsMetadata(provider) {
  if (provider === "anthropic") {
    return [
      new ModelMetadata("claude-3-7-sonnet-20240229", "Claude 3.7 Sonnet", true, 200000, 2, 3),
      new ModelMetadata("claude-3-5-sonnet-20240620", "Claude 3.5 Sonnet", true, 200000, 2, 3),
      new ModelMetadata("claude-3-opus-20240229", "Claude 3 Opus", true, 200000, 1, 3),
      new ModelMetadata("claude-3-haiku-20240307", "Claude 3 Haiku", true, 200000, 3, 2)
    ];
  } else if (provider === "openai") {
    return [
      new ModelMetadata("gpt-4o", "GPT-4o", true, 128000, 2, 3),
      new ModelMetadata("gpt-4o-mini", "GPT-4o Mini", true, 128000, 3, 2),
      new ModelMetadata("gpt-4-turbo", "GPT-4 Turbo", true, 128000, 1, 3),
      new ModelMetadata("gpt-3.5-turbo", "GPT-3.5 Turbo", true, 16385, 3, 1)
    ];
  } else if (provider === "mistral") {
    return [
      new ModelMetadata("mistral-large-latest", "Mistral Large", false, 32000, 2, 2),
      new ModelMetadata("mistral-medium-latest", "Mistral Medium", false, 32000, 3, 2),
      new ModelMetadata("mistral-small-latest", "Mistral Small", false, 32000, 3, 1)
    ];
  } else if (provider === "groq") {
    return [
      new ModelMetadata("llama-3.3-70b-versatile", "Llama 3.3 70B Versatile", true, 8192, 3, 3),
      new ModelMetadata("llama3-70b-8192", "Llama 3 70B", false, 8192, 3, 2),
      new ModelMetadata("llama3-8b-8192", "Llama 3 8B", false, 8192, 3, 1),
      new ModelMetadata("mixtral-8x7b-32768", "Mixtral 8x7B", false, 32768, 3, 2),
      new ModelMetadata("gemma-7b-it", "Gemma 7B", false, 8192, 3, 1),
      new ModelMetadata("claude-3-5-sonnet-20240620", "Claude 3.5 Sonnet", true, 200000, 3, 3)
    ];
  } else {
    return [];
  }
}

// Get available models stored in cache or fetch fresh
async function getProviderModelsMetadata(provider) {
  if (cachedModels[provider]) {
    return cachedModels[provider];
  }
  
  const models = await fetchModelsFromProvider(provider);
  if (models && models.length > 0) {
    cachedModels[provider] = models;
    return models;
  }
  
  const fallbackModels = getFallbackModelsMetadata(provider);
  cachedModels[provider] = fallbackModels;
  return fallbackModels;
}

// File operations
async function readFile(filePath, config) {
  try {
    // Convert relative path to absolute
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(config.workspacePath, filePath);
    
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return `Error: File not found at ${fullPath}`;
    }
    
    // Read file content
    const content = fs.readFileSync(fullPath, 'utf8');
    return content;
  } catch (error) {
    return `Error reading file: ${error}`;
  }
}

async function writeFile(filePath, content, config) {
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

async function listFiles(dirPath, config) {
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

// MCP Server integration
const MCP_MODES = {
  assistant: "General purpose assistant mode",
  code: "Focused on coding tasks",
  sql: "Specialized for SQL queries and database work",
  data: "Data analysis and visualization helper",
  explain: "Code explanation and documentation specialist"
};

// Check MCP server status
async function checkMcpServerStatus(serverAddress) {
  try {
    const response = await fetch(`${serverAddress}/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const data = await response.json();
      return { status: 'connected', info: data };
    } else {
      return { status: 'error', message: `Server responded with status: ${response.status}` };
    }
  } catch (error) {
    return { status: 'disconnected', message: error.message };
  }
}

// List available MCP tools
async function listMcpTools(serverAddress) {
  try {
    const response = await fetch(`${serverAddress}/tools`, { 
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const data = await response.json();
      return { status: 'success', tools: data };
    } else {
      return { status: 'error', message: `Server responded with status: ${response.status}` };
    }
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

// Use MCP tool
async function useMcpTool(serverAddress, toolName, params) {
  try {
    const response = await fetch(`${serverAddress}/tools/${toolName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    
    if (response.ok) {
      const data = await response.json();
      return { status: 'success', result: data };
    } else {
      return { status: 'error', message: `Server responded with status: ${response.status}` };
    }
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

// Generate response with a language model
async function generateResponse(config, messages) {
  // Create a system prompt based on mode
  const systemPrompt = getSystemPromptForMode(config.mode);
  
  if (config.apiProvider === 'anthropic') {
    const client = new Anthropic({
      apiKey: config.apiKey
    });
    
    const response = await client.messages.create({
      model: config.model,
      system: systemPrompt,
      messages: messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens
    });
    
    return response.content[0].text;
  } 
  else if (config.apiProvider === 'openai') {
    const client = new OpenAI({
      apiKey: config.apiKey
    });
    
    // Format messages for OpenAI
    const formattedMessages = [];
    formattedMessages.push({ 
      role: "system", 
      content: systemPrompt
    });
    
    for (const msg of messages) {
      formattedMessages.push({
        role: msg.role,
        content: msg.content
      });
    }
    
    const response = await client.chat.completions.create({
      model: config.model,
      messages: formattedMessages,
      temperature: config.temperature,
      max_tokens: config.maxTokens
    });
    
    return response.choices[0].message.content;
  }
  else if (config.apiProvider === 'groq') {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: "https://api.groq.com/openai/v1"
    });
    
    // Format messages for Groq
    const formattedMessages = [];
    formattedMessages.push({ 
      role: "system", 
      content: systemPrompt
    });
    
    for (const msg of messages) {
      formattedMessages.push({
        role: msg.role,
        content: msg.content
      });
    }
    
    const response = await client.chat.completions.create({
      model: config.model,
      messages: formattedMessages,
      temperature: config.temperature,
      max_tokens: config.maxTokens
    });
    
    return response.choices[0].message.content;
  }
  else {
    return `Provider ${config.apiProvider} is not supported in this version. Please use /config apiProvider=anthropic, /config apiProvider=openai, or /config apiProvider=groq.`;
  }
}

// Get appropriate system prompt based on the current mode
function getSystemPromptForMode(mode) {
  const basePrompt = "You are Roo Pilot, an AI assistant that helps with a wide range of tasks. ";
  
  switch(mode) {
    case "code":
      return basePrompt + "You specialize in programming tasks, code generation, debugging, and software development. Provide high-quality, well-documented solutions tailored to the user's needs. When appropriate, provide shell commands to solve the user's problem.";
    
    case "sql":
      return basePrompt + "You specialize in database queries, SQL optimization, and data modeling. Show SQL queries when appropriate and explain your approach.";
    
    case "data":
      return basePrompt + "You specialize in data analysis, visualization, and interpretation. Suggest appropriate methods for analyzing and visualizing data, and provide sample code when helpful.";
    
    case "explain":
      return basePrompt + "You specialize in explaining complex concepts, code, and systems in clear, accessible language. Break down difficult topics into understandable parts.";
    
    case "assistant":
    default:
      return basePrompt + "You're helpful, informative, and capable of assisting with both technical and general tasks. You can suggest terminal commands, offer technical advice, and provide useful information on a wide range of topics. When the user asks a question that could be answered with a command, include the actual command they can run along with an explanation.";
  }
}

// Create .env template
function createEnvTemplate() {
  const template = `# Roo Pilot API Keys
# Uncomment and add your API keys below

# Groq
# GROQ_API_KEY=your_key_here

# Anthropic (Claude)
# ANTHROPIC_API_KEY=your_key_here

# OpenAI
# OPENAI_API_KEY=your_key_here

# Mistral
# MISTRAL_API_KEY=your_key_here

# MCP Server Configuration
# MCP_SERVER_ADDRESS=http://localhost:3000
# CHECK_MCP_ON_START=false
`;
  
  const filePath = path.join(process.cwd(), '.env.template');
  fs.writeFileSync(filePath, template);
  console.log(chalk.green(`Created .env.template file at ${filePath}`));
  console.log(chalk.yellow('Copy this file to .env and add your API keys.'));
  return template;
}

// Interactive chat session
async function startChatSession() {
  // Load configuration
  const config = initializeConfig();
  
  console.log(chalk.cyan('╔═════════════════════════════════════════╗'));
  console.log(chalk.cyan('║           Roo Pilot CLI v1.0.0          ║'));
  console.log(chalk.cyan('╚═════════════════════════════════════════╝'));
  console.log(chalk.cyan(`Using model: ${config.model}`));
  console.log(chalk.cyan(`Current workspace: ${config.workspacePath}`));
  console.log(chalk.cyan(`Mode: ${config.mode}`));
  console.log(chalk.yellow('Type "/help" to see available commands, "/exit" to quit'));
  
  // Only check MCP server if explicitly configured to do so
  if (process.env.CHECK_MCP_ON_START === 'true' || config.checkMcpOnStart) {
    if (process.env.MCP_SERVER_ADDRESS || config.mcpServerAddress) {
      const serverAddress = process.env.MCP_SERVER_ADDRESS || config.mcpServerAddress;
      console.log(chalk.yellow(`Checking MCP Server at ${serverAddress}...`));
      
      try {
        const status = await checkMcpServerStatus(serverAddress);
        if (status.status === 'connected') {
          console.log(chalk.green(`✓ Connected to MCP Server: ${status.info.name || serverAddress}`));
          console.log(chalk.yellow(`  Use /mcp to list available tools`));
        } else {
          console.log(chalk.red(`✗ MCP Server not available: ${status.message}`));
        }
      } catch (error) {
        console.log(chalk.red(`✗ Error connecting to MCP Server: ${error.message}`));
      }
    }
  } else {
    // Just print a hint about MCP being available
    console.log(chalk.yellow(`MCP server integration available. Use /mcp to access when needed.`));
  }
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green('You > ')
  });
  
  // Display prompt
  rl.prompt();
  
  // Handle user input
  // Flag to prevent prompt from disappearing on piped input
  let isInteractive = process.stdin.isTTY;
  
  // Handle process termination signals gracefully
  process.on('SIGINT', () => {
    console.log(chalk.cyan('\nGoodbye! Thanks for using Roo Pilot CLI.'));
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log(chalk.cyan('\nGoodbye! Thanks for using Roo Pilot CLI.'));
    process.exit(0);
  });
  
  rl.on('line', async (input) => {
    // Ensure the session doesn't exit on empty input
    if (!input.trim()) {
      rl.prompt();
      return;
    }
    
    // Handle special commands
    if (input.startsWith('/')) {
      const command = input.slice(1).trim();
      
      if (command === 'exit' || command === 'quit') {
        console.log(chalk.cyan('Goodbye! Thanks for using Roo Pilot CLI.'));
        rl.close();
        process.exit(0);
        return;
      }
      
      if (command === 'help') {
        displayHelp();
        rl.prompt();
        return;
      }
      
      if (command === 'clear') {
        console.clear();
        chatHistory = [];
        console.log(chalk.yellow('Chat history cleared.'));
        rl.prompt();
        return;
      }
      
      if (command.startsWith('config')) {
        await handleConfigCommand(command.slice(6).trim(), config);
        rl.prompt();
        return;
      }
      
      if (command === 'env') {
        createEnvTemplate();
        rl.prompt();
        return;
      }
      
      if (command.startsWith('read')) {
        const filePath = command.slice(4).trim();
        if (!filePath) {
          console.log(chalk.red('Please specify a file path to read.'));
          rl.prompt();
          return;
        }
        
        const content = await readFile(filePath, config);
        console.log(content);
        
        // Add file content to context
        chatHistory.push({
          role: 'user',
          content: `Here's the content of ${filePath}:\n\n${content}`
        });
        
        rl.prompt();
        return;
      }
      
      if (command.startsWith('write')) {
        try {
          // Format should be /write path content
          const filePath = command.slice(5).trim().split(' ')[0];
          const content = command.slice(5).trim().substring(filePath.length + 1);
          
          if (!filePath || !content) {
            console.log(chalk.red('Usage: /write path content'));
            rl.prompt();
            return;
          }
          
          const result = await writeFile(filePath, content, config);
          console.log(chalk.green(result));
          
          // Add file content to context
          chatHistory.push({
            role: 'user',
            content: `I've written the following content to ${filePath}:\n\n${content}`
          });
        } catch (error) {
          console.log(chalk.red(`Error: ${error}`));
        }
        
        rl.prompt();
        return;
      }
      
      if (command.startsWith('ls')) {
        const dirPath = command.slice(2).trim() || '.';
        const content = await listFiles(dirPath, config);
        console.log(content);
        
        // Add directory listing to context
        chatHistory.push({
          role: 'user',
          content: `Directory listing of ${dirPath}:\n\n${content}`
        });
        
        rl.prompt();
        return;
      }
      
      if (command === 'models') {
        showModelsMenu(config);
        rl.prompt();
        return;
      }
      
      if (command === 'modes') {
        showModesMenu(config);
        rl.prompt();
        return;
      }
      
      if (command.startsWith('mode ')) {
        const modeName = command.slice(5).trim().toLowerCase();
        if (MCP_MODES[modeName]) {
          config.mode = modeName;
          saveConfig(config);
          console.log(chalk.green(`Mode switched to: ${modeName} - ${MCP_MODES[modeName]}`));
        } else {
          console.log(chalk.red(`Unknown mode: ${modeName}`));
          console.log(chalk.yellow('Available modes:'));
          Object.entries(MCP_MODES).forEach(([mode, description]) => {
            console.log(`  ${chalk.cyan(mode)}: ${description}`);
          });
        }
        rl.prompt();
        return;
      }
      
      if (command === 'mcp') {
        await handleMcpCommand(null, config);
        rl.prompt();
        return;
      }
      
      if (command.startsWith('mcp ')) {
        const mcpSubCommand = command.slice(4).trim();
        await handleMcpCommand(mcpSubCommand, config);
        rl.prompt();
        return;
      }
      
      console.log(chalk.red(`Unknown command: ${command}`));
      rl.prompt();
      return;
    }
    
    // Process normal user input
    if (!config.apiKey) {
      console.log(chalk.red('API key not set. Use /config apiKey=your_key_here to set it or add it to .env file.'));
      console.log(chalk.yellow('Run /env to create a template .env file.'));
      rl.prompt();
      return;
    }
    
    // Add user message to chat history
    chatHistory.push({
      role: 'user',
      content: input
    });
    
    // Check if input looks like a shell command question
    const isCommandQuestion = isAskingForCommand(input.toLowerCase());
    
    // Generate response
    const spinner = ora('Thinking...').start();
    
    try {
      const response = await generateResponse(config, chatHistory);
      
      spinner.stop();
      
      // Add assistant message to history
      chatHistory.push({
        role: 'assistant',
        content: response
      });
      
      // Display formatted response
      console.log(chalk.blue('Assistant > '));
      console.log(response);
      
      // Try to extract and run command if appropriate
      if (isCommandQuestion) {
        await tryExtractAndRunCommand(response);
      }
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('Error processing request:'), error);
    }
    
    rl.prompt();
  });
  
  rl.on('close', () => {
    process.exit(0);
  });
}

// MCP Command handler
async function handleMcpCommand(subCommand, config) {
  const serverAddress = process.env.MCP_SERVER_ADDRESS || config.mcpServerAddress;
  
  if (!serverAddress) {
    console.log(chalk.red('MCP Server address not configured.'));
    console.log(chalk.yellow('Set it with: /config mcpServerAddress=http://localhost:3000'));
    console.log(chalk.yellow('Or add MCP_SERVER_ADDRESS to your .env file'));
    return;
  }
  
  // Check server status
  try {
    const status = await checkMcpServerStatus(serverAddress);
    
    if (status.status !== 'connected') {
      console.log(chalk.red(`Cannot connect to MCP Server at ${serverAddress}`));
      console.log(chalk.yellow(`Error: ${status.message}`));
      return;
    }
    
    console.log(chalk.green(`Connected to MCP Server: ${status.info.name || serverAddress}`));
    
    if (!subCommand) {
      // List available tools
      const toolsResult = await listMcpTools(serverAddress);
      
      if (toolsResult.status === 'success' && toolsResult.tools) {
        console.log(chalk.yellow('\nAvailable MCP Tools:'));
        toolsResult.tools.forEach(tool => {
          console.log(`${chalk.cyan(tool.name)}: ${tool.description}`);
        });
        
        console.log(chalk.yellow('\nTo use a tool:'));
        console.log(chalk.yellow('/mcp [tool_name] [parameters]'));
      } else {
        console.log(chalk.red(`Error listing MCP tools: ${toolsResult.message}`));
      }
    } else {
      // Parse the tool name and parameters
      const parts = subCommand.split(' ');
      const toolName = parts[0];
      
      // Try to parse parameters as JSON
      let params = {};
      if (parts.length > 1) {
        try {
          const paramsStr = parts.slice(1).join(' ');
          params = JSON.parse(paramsStr);
        } catch (error) {
          console.log(chalk.red(`Error parsing parameters: ${error.message}`));
          console.log(chalk.yellow('Parameters must be valid JSON'));
          return;
        }
      }
      
      // Execute the tool
      console.log(chalk.yellow(`Executing MCP tool: ${toolName}`));
      const spinner = ora('Processing...').start();
      
      try {
        const result = await useMcpTool(serverAddress, toolName, params);
        spinner.stop();
        
        if (result.status === 'success') {
          console.log(chalk.green('Tool execution successful:'));
          console.log(JSON.stringify(result.result, null, 2));
          
          // Add to chat history
          chatHistory.push({
            role: 'user',
            content: `I executed MCP tool ${toolName} with parameters: ${JSON.stringify(params)}.\nResult: ${JSON.stringify(result.result)}`
          });
        } else {
          console.log(chalk.red(`Tool execution failed: ${result.message}`));
        }
      } catch (error) {
        spinner.stop();
        console.log(chalk.red(`Error executing tool: ${error.message}`));
      }
    }
  } catch (error) {
    console.log(chalk.red(`Error communicating with MCP Server: ${error.message}`));
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
  console.log(chalk.cyan('/modes') + ' - Show available modes');
  console.log(chalk.cyan('/mode [name]') + ' - Switch to a different mode');
  console.log(chalk.cyan('/env') + ' - Create .env.template file');
  console.log(chalk.cyan('/read path/to/file') + ' - Read a file and add to context');
  console.log(chalk.cyan('/write path content') + ' - Write content to a file');
  console.log(chalk.cyan('/ls [path]') + ' - List files in a directory');
  console.log(chalk.cyan('/mcp') + ' - List available MCP tools');
  console.log(chalk.cyan('/mcp [tool] [params]') + ' - Execute an MCP tool');
  
  console.log(chalk.yellow('\nLLM Providers:'));
  console.log(' - ' + chalk.cyan('Groq') + ' - Extra fast inference speeds');
  console.log(' - ' + chalk.cyan('Anthropic Claude') + ' - Vision-capable, large context window');
  console.log(' - ' + chalk.cyan('OpenAI GPT') + ' - Vision-capable, good at coding tasks');
  console.log(' - ' + chalk.cyan('Mistral AI') + ' - Open models with good performance');

  console.log(chalk.yellow('\nQuick Tips:'));
  console.log(' - Use ' + chalk.cyan('/models') + ' to interactively select models');
  console.log(' - Set up your API keys in .env file for easy provider switching');
  console.log(' - 👁️ icon indicates models with vision/image capabilities');
  console.log(' - Switch between different ' + chalk.cyan('modes') + ' for specialized functionality');
  console.log(' - Connect to MCP servers for extended capabilities');
  console.log('\n');
}

// Show modes menu 
function showModesMenu(config) {
  console.log(chalk.yellow('\nAvailable Modes:'));
  
  Object.entries(MCP_MODES).forEach(([mode, description]) => {
    const isCurrent = mode === config.mode;
    console.log(`${isCurrent ? chalk.green('➤ ') : '  '}${chalk.cyan(mode)}: ${description}`);
  });
  
  console.log('');
  console.log(chalk.yellow(`To switch modes: /mode [name]`));
  console.log('');
}

// Show models menu with numbers
async function showModelsMenu(config) {
  console.log(chalk.yellow('\nFetching available models for current provider...'));
  
  const spinner = ora('Loading models...').start();
  
  try {
    // Get models for the current provider
    const modelsMetadata = await getProviderModelsMetadata(config.apiProvider);
    
    spinner.stop();
    
    console.log(chalk.cyan(`\nProvider: ${config.apiProvider}`));
    console.log(chalk.cyan(`Select a model by entering the number:`));
    console.log('');
    
    modelsMetadata.forEach((model, index) => {
      const isCurrent = model.name === config.model;
      const displayNum = (index + 1).toString().padStart(2, ' ');
      
      console.log(`${isCurrent ? chalk.green('➤') : ' '} ${chalk.yellow(displayNum)}. ${model.toString()}`);
    });
    
    console.log('');
    console.log(chalk.cyan(`Enter model number to select, or press Enter to cancel:`));
    
    // Create readline interface for model selection
    const rlTemp = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rlTemp.question('', answer => {
      rlTemp.close();
      
      // Process the model selection
      const modelNum = parseInt(answer.trim());
      if (!isNaN(modelNum) && modelNum > 0 && modelNum <= modelsMetadata.length) {
        const selectedModel = modelsMetadata[modelNum - 1];
        
        // Update config with the new model
        config.model = selectedModel.name;
        
        // Update vision capability based on model support
        config.isVisionEnabled = selectedModel.supportsVision;
        
        saveConfig(config);
        console.log(chalk.green(`\nModel changed to: ${selectedModel.displayName || selectedModel.name}`));
        
        if (selectedModel.supportsVision) {
          console.log(chalk.yellow(`This model supports vision/images.`));
        }
      } else if (answer.trim() !== '') {
        console.log(chalk.red(`\nInvalid selection: ${answer}`));
      }
    });
  } catch (error) {
    spinner.stop();
    console.error(chalk.red(`Error loading models: ${error.message}`));
    
    // Fall back to hardcoded models
    const fallbackModels = getFallbackModelsMetadata(config.apiProvider);
    console.log(chalk.yellow('Using fallback model list:'));
    
    fallbackModels.forEach((model, index) => {
      const isCurrent = model.name === config.model;
      const displayNum = (index + 1).toString().padStart(2, ' ');
      
      console.log(`${isCurrent ? chalk.green('➤') : ' '} ${chalk.yellow(displayNum)}. ${model.toString()}`);
    });
  }
}

// Handle configuration commands
async function handleConfigCommand(subcommand, config) {
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
      'groq': 'Groq (Fast inference)',
      'anthropic': 'Anthropic (Claude)',
      'openai': 'OpenAI (GPT)',
      'mistral': 'Mistral AI'
    };
    
    Object.entries(providers).forEach(([key, name]) => {
      const isCurrent = key === config.apiProvider;
      console.log(`${isCurrent ? chalk.green('➤ ') : '  '}${key}: ${name}`);
    });
    
    console.log(chalk.yellow('\nAvailable modes:'));
    Object.entries(MCP_MODES).forEach(([mode, description]) => {
      const isCurrent = mode === config.mode;
      console.log(`${isCurrent ? chalk.green('➤ ') : '  '}${mode}: ${description}`);
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
        const providers = ['groq', 'anthropic', 'openai', 'mistral'];
        if (!providers.includes(value)) {
          console.log(chalk.red(`Invalid provider: ${value}`));
          console.log(chalk.yellow(`Available providers: ${providers.join(', ')}`));
          return;
        }
        
        // Update provider and suggest a model
        config[key] = value;
        
        // Suggest a default model (use async function for model fetching)
        console.log(chalk.yellow(`Fetching available models for ${value}...`));
        const spinner = ora('Loading models...').start();
        
        try {
          const models = await getAvailableModels(value);
          spinner.stop();
          
          if (models.length > 0 && !models.includes(config.model)) {
            config.model = models[0];
            console.log(chalk.yellow(`Changed model to ${config.model}`));
          }
        } catch (error) {
          spinner.stop();
          console.error(chalk.red(`Error fetching models: ${error.message}`));
          
          // Fall back to default model selection
          const fallbackModels = getFallbackModelsMetadata(value);
          if (fallbackModels.length > 0) {
            config.model = fallbackModels[0].name;
            console.log(chalk.yellow(`Using fallback model: ${config.model}`));
          }
        }
      } else if (key === 'model') {
        // Validate model for current provider (use async function)
        try {
          const models = await getAvailableModels(config.apiProvider);
          
          if (!models.includes(value)) {
            console.log(chalk.red(`Warning: ${value} is not in the list of known models for ${config.apiProvider}`));
            console.log(chalk.yellow(`Available models: ${models.join(', ')}`));
            
            // Create a yes/no readline prompt
            const rlTemp = readline.createInterface({
              input: process.stdin,
              output: process.stdout
            });
            
            const proceed = await new Promise(resolve => {
              rlTemp.question('Continue anyway? (y/n) ', answer => {
                rlTemp.close();
                resolve(answer.toLowerCase() === 'y');
              });
            });
            
            if (!proceed) return;
          }
        } catch (error) {
          console.error(chalk.red(`Error validating model: ${error.message}`));
          console.log(chalk.yellow(`Proceeding without validation...`));
        }
        
        config[key] = value;
      } else if (key === 'mode') {
        // Validate mode
        if (!MCP_MODES[value]) {
          console.log(chalk.red(`Unknown mode: ${value}`));
          console.log(chalk.yellow('Available modes:'));
          Object.keys(MCP_MODES).forEach(mode => {
            console.log(`  ${chalk.cyan(mode)}`);
          });
          return;
        }
        config[key] = value;
      } else if (key === 'checkMcpOnStart') {
        // Boolean conversion
        config[key] = value.toLowerCase() === 'true';
      } else {
        // Type conversion for numeric values
        if (key === 'temperature' || key === 'maxTokens') {
          config[key] = Number(value);
        } else {
          config[key] = value;
        }
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

// Function to determine if the user is asking for a command
function isAskingForCommand(input) {
  const commandPatterns = [
    /how (?:do|can|to) I .* in (?:terminal|shell|bash|command line)/i,
    /how (?:do|can|to) I .* files/i,
    /how (?:do|can|to) I .* directory/i,
    /how (?:do|can|to) I .* folder/i,
    /how (?:do|can|to) I .* list/i,
    /how (?:do|can|to) I .* find/i,
    /how (?:do|can|to) I .* search/i,
    /how (?:do|can|to) I .* delete/i,
    /how (?:do|can|to) I .* create/i,
    /what command (?:should|can|do) I .*/i,
    /what's the command (?:for|to) .*/i,
    /what is the command (?:for|to) .*/i,
    /what are the commands .*/i,
    /which command (?:should|can|do) I .*/i,
    /command (?:for|to) .*/i,
    /how many files .*/i,
    /how many directories .*/i,
    /count (?:files|directories) .*/i,
    /show me (?:files|directories) .*/i,
    /list (?:files|directories) .*/i
  ];
  
  return commandPatterns.some(pattern => pattern.test(input));
}

// Extract and run commands from the AI response
async function tryExtractAndRunCommand(response) {
  // Extract commands from within markdown code blocks
  const codeBlockPattern = /```(?:bash|shell|sh|\n|\s)?\n?(.*?)```/gs;
  const inlineCodePattern = /`([^`]+)`/g;
  
  let commandsToRun = [];
  
  // First try to extract commands from code blocks
  let match;
  while ((match = codeBlockPattern.exec(response)) !== null) {
    // Get the content within the code block
    const potentialCommand = match[1].trim();
    if (potentialCommand && !potentialCommand.includes('\n')) {
      // Only add single-line commands to avoid running complex scripts
      commandsToRun.push(potentialCommand);
    } else if (potentialCommand && potentialCommand.includes('\n')) {
      // For multi-line code blocks, look for common shell commands
      const lines = potentialCommand.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#') && 
            (trimmedLine.startsWith('ls') || 
             trimmedLine.startsWith('find') || 
             trimmedLine.startsWith('grep') || 
             trimmedLine.startsWith('wc') ||
             trimmedLine.startsWith('cat') ||
             trimmedLine.startsWith('echo'))) {
          commandsToRun.push(trimmedLine);
        }
      }
    }
  }
  
  // If no commands in code blocks, look for inline code
  if (commandsToRun.length === 0) {
    while ((match = inlineCodePattern.exec(response)) !== null) {
      const potentialCommand = match[1].trim();
      if (potentialCommand && 
          (potentialCommand.startsWith('ls') || 
           potentialCommand.startsWith('find') || 
           potentialCommand.startsWith('grep') || 
           potentialCommand.startsWith('wc') ||
           potentialCommand.startsWith('cat') ||
           potentialCommand.startsWith('echo'))) {
        commandsToRun.push(potentialCommand);
      }
    }
  }
  
  // Run the first extracted command if any
  if (commandsToRun.length > 0) {
    const commandToRun = commandsToRun[0];
    console.log(chalk.yellow(`\nWould you like me to run this command for you? ${chalk.cyan(commandToRun)}`));
    console.log(chalk.yellow('Type y/yes to execute, or anything else to skip'));
    
    const rlTemp = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      rlTemp.question('> ', answer => {
        resolve(answer.toLowerCase());
        rlTemp.close();
      });
    });
    
    if (answer === 'y' || answer === 'yes') {
      console.log(chalk.green(`\nExecuting: ${commandToRun}`));
      
      try {
        // Execute the command
        const { execSync } = require('child_process');
        const output = execSync(commandToRun, { encoding: 'utf8' });
        
        // Display the output
        console.log(chalk.cyan('Output:'));
        console.log(output);
        
        // Add command execution to chat history
        chatHistory.push({
          role: 'user',
          content: `I ran the command: ${commandToRun}\n\nOutput:\n${output}`
        });
      } catch (error) {
        console.log(chalk.red(`Error executing command: ${error.message}`));
        
        // Add error to chat history
        chatHistory.push({
          role: 'user',
          content: `I tried to run the command: ${commandToRun}\n\nError:\n${error.message}`
        });
      }
    }
  }
}

// Start the application
startChatSession().catch(err => {
  console.error('Error:', err);
});