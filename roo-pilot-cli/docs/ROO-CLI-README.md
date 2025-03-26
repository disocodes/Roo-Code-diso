# Roo CLI

A command-line interface version of Roo Code that works in Windows terminals without requiring VSCode.

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

## Usage

### Starting the CLI

#### If installed globally:

On all platforms:
```
roo-cli
```

#### Running directly:

On Linux/macOS:
```bash
./roo-cli.sh
```

On Windows:
```cmd
roo-cli.bat
```

#### Running from npm:
```bash
npm start
```

### Commands

Once in the interactive chat session, you can use the following commands:

- `/help` - Display help information
- `/exit` or `/quit` - Exit the chat session
- `/clear` - Clear the chat history
- `/config` - Show current configuration
- `/config key=value` - Update a configuration value
- `/read path/to/file` - Read a file and add to context
- `/ls [path]` - List files in a directory

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