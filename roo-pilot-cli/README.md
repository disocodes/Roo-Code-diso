# Roo Pilot CLI

A cross-platform command-line interface version of Roo Code that works on Linux, macOS, and Windows without requiring VSCode.

This package includes both a Terminal-based CLI and a Streamlit web interface.

## Prerequisites

- Node.js 20.x or higher
- npm 9.x or higher
- Python 3.8+ (only for the web interface)
- API key for one of the supported providers (Anthropic Claude, OpenAI, etc.)

## Features

- Interactive chat with Claude AI models
- File operations (read files, write files, list directories)
- Context-aware coding assistance
- Configurable API providers and models
- Simple command-based interface

## Installation

### Prerequisites

- Node.js 20.x or higher
- npm 9.x or higher
- An API key for Anthropic (Claude) or other supported providers

### Automatic Setup

#### For Linux and macOS:
```bash
# Clone the repository
git clone https://github.com/YourUsername/roo-cli.git
cd roo-cli

# Run the installation script
chmod +x install.sh
./install.sh
```

#### For Windows:
```cmd
:: Clone the repository
git clone https://github.com/YourUsername/roo-cli.git
cd roo-cli

:: Run the installation script
install-windows.bat
```

### Manual Setup

If you prefer to install manually:

1. Clone the repository:
   ```bash
   git clone https://github.com/YourUsername/roo-cli.git
   cd roo-cli
   ```

2. Copy configuration files:
   ```bash
   cp cli-package.json package.json
   cp cli-tsconfig.json tsconfig.json
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Build the project:
   ```bash
   npm run build
   ```

5. Install globally (optional):
   ```bash
   npm install -g .
   ```

6. Make scripts executable (Linux/macOS only):
   ```bash
   chmod +x roo-cli.sh
   ```

## Setup

1. Navigate to the project directory:
   ```bash
   cd /path/to/roo-pilot-cli
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Set up your API key(s) in one of two ways:
   
   **Option A**: Create a `.env` file in the project directory:
   ```
   ANTHROPIC_API_KEY=your_api_key_here
   # Or any other provider:
   # OPENAI_API_KEY=your_key_here
   # MISTRAL_API_KEY=your_key_here
   ```
   
   **Option B**: Export as environment variables:
   ```bash
   export ANTHROPIC_API_KEY=your_api_key_here
   ```

## Running the Application

### Quick Start (Simplified Version)

For a quick test, use the simplified CLI version which has fewer dependencies:

```bash
# On Linux/macOS
./simple-start.sh

# On Windows
simple-start.bat
```

### Full Version

#### Option 1: Use the interactive launcher

This will let you choose between terminal and web interfaces:

```bash
# On Linux/macOS
./start.sh

# On Windows
start.bat

# Using npm
npm start
```

#### Option 2: Run specific interfaces directly

##### For Terminal Interface (CLI):

```bash
# On Linux/macOS
./roo-cli.sh

# On Windows
roo-cli.bat

# Or using npm
npm run start:cli
```

#### For Web Interface (Streamlit):

```bash
# On Linux/macOS
cd streamlit
./run-streamlit.sh

# On Windows
cd streamlit
run-streamlit.bat
```

### Global Installation (Optional)

To install the CLI globally on your system:

```bash
npm install -g .
```

After global installation, you can run it from anywhere with:
```bash
roo-pilot
```

## Using the CLI

Once the terminal interface is running, you can:

1. Use the interactive chat to talk with the AI
2. Run commands like:
   - `/help` - Show available commands
   - `/exit` or `/quit` - Exit the chat session
   - `/clear` - Clear chat history
   - `/config` - View or change configuration
   - `/config key=value` - Update a configuration value
   - `/read path/to/file` - Read a file and add to context
   - `/write path content` - Write content to a file
   - `/ls [path]` - List directory contents
   - `/models` - Choose from available models
   - `/env` - Create a template .env file

## Using the Web Interface

The Streamlit web interface provides:
1. A chat window for interacting with the AI
2. Settings panel to configure your model and API
3. File browser to explore your workspace
4. Documentation section for help

## Troubleshooting

- If you see API key errors, make sure your key is correctly set in the `.env` file or as an environment variable
- For Streamlit errors, ensure Python and required packages are installed
- For permission errors on Linux/macOS, ensure script files are executable with `chmod +x *.sh`
- If you encounter Node.js memory issues, adjust the NODE_OPTIONS environment variable

### Configuration

Initial configuration is stored in `~/.roo-cli/config.json`. You can edit this file directly or use the `/config` command to update settings:

```
/config apiKey=your_anthropic_api_key
/config model=claude-3-7-sonnet-20240229
/config temperature=0.3
```

Available configuration options:

- `apiProvider` - API provider (anthropic, openai, openrouter, etc.)
- `apiKey` - Your API key
- `model` - Model to use
- `temperature` - Temperature setting (0.0 to 1.0)
- `maxTokens` - Maximum token limit for responses
- `mode` - Mode to use (assistant, code, etc.)
- `workspacePath` - Path to your project workspace

## Development

### Running in development mode

```
npm run dev
```

### Project Structure

- `roo-cli.ts` - Main CLI application
- `src/` - Source code from Roo Code extension
- `cli-package.json` - Package configuration for the CLI
- `cli-tsconfig.json` - TypeScript configuration

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

This CLI is based on the [Roo Code VSCode extension](https://github.com/RooVetGit/Roo-Code).