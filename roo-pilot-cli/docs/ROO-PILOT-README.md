# Roo Pilot

<p align="center">
  <img src="assets/icons/rocket.png" alt="Roo Pilot Logo" width="120"/>
</p>

<p align="center">
  <b>A standalone AI assistant for developers that works outside VSCode</b>
</p>

Roo Pilot is a developer-focused AI assistant that provides both CLI and GUI interfaces, offering the power of Roo Code without requiring VSCode. It supports multiple LLM providers and focuses on helping you with coding tasks, file management, and answering technical questions.

## Features

- **Dual Interface:** Choose between a Command Line Interface (CLI) or a Streamlit Web UI
- **Multi-Provider Support:** Works with Claude, GPT, Gemini, Mistral, and other LLMs
- **File Operations:** Read, write, and list files with context-awareness
- **Project Analysis:** Understand your codebase and help with coding tasks
- **Environment Variables:** Securely store API keys in a .env file
- **Cross-Platform:** Works on Windows, macOS, and Linux

## Installation

### Prerequisites

- **CLI Version:** Node.js 20.x or higher with npm
- **UI Version:** Python 3.8 or higher with pip
- API key for at least one supported LLM provider

### Automatic Installation

1. Clone this repository:
   ```
   git clone https://github.com/your-username/roo-pilot.git
   cd roo-pilot
   ```

2. Run the installation script:
   
   **Windows:**
   ```
   install-roo-pilot.bat
   ```
   
   **macOS/Linux:**
   ```
   chmod +x install-roo-pilot.sh
   ./install-roo-pilot.sh
   ```

3. Follow the prompts to install CLI, UI, or both versions.

### Manual Installation

#### CLI Version

1. Install Node.js dependencies:
   ```
   npm install
   ```

2. Build the CLI:
   ```
   npm run build
   ```

3. Install globally (optional):
   ```
   npm link
   ```

#### UI Version

1. Install Python dependencies:
   ```
   pip install -r requirements.txt
   ```

### API Key Setup

Create a `.env` file in the project root with your API keys:

```
# Anthropic (Claude)
ANTHROPIC_API_KEY=your_key_here

# OpenAI
# OPENAI_API_KEY=your_key_here

# Other providers...
```

You can run the following to create a template:
```
roo-pilot-cli env
```

## Usage

### Starting Roo Pilot

Use the launcher to choose your preferred interface:

**Windows:**
```
launch-roo-pilot.bat
```

**macOS/Linux:**
```
./launch-roo-pilot.sh
```

Alternatively, start either version directly:

**CLI Version:**
```
roo-pilot-cli
```

**UI Version:**
```
streamlit run streamlit_app.py
```

### CLI Commands

Once in the CLI, the following commands are available:

- `/help` - Display help information
- `/exit` or `/quit` - Exit the chat session
- `/clear` - Clear the chat history
- `/config` - Show current configuration
- `/config key=value` - Update a configuration value
- `/models` - Select a model from an interactive numbered list
- `/env` - Create .env.template file
- `/read path/to/file` - Read a file and add to context
- `/write path content` - Write content to a file
- `/ls [path]` - List files in a directory

Models in the CLI interface display with helpful icons:
- 👁️ - Models that support vision/image capabilities
- ⚡ - Indicators of relative speed (more = faster)
- 🧠 - Indicators of reasoning capability (more = better reasoning)

### Web UI

The Streamlit UI provides a more visual experience with:

- Chat interface with message history
- Enhanced model selection with indicators for capabilities:
  - Vision support (👁️)
  - Speed rating (⚡)
  - Reasoning capability (🧠)
  - Context window size
- Settings panel for comprehensive configuration
- File browser for navigating your project
- Documentation and help pages

## Configuration

Configuration is stored in `~/.roo-pilot/config.json` and can be modified through the interface or directly. Key settings include:

- `apiProvider` - Which LLM provider to use (anthropic, openai, openrouter, etc.)
- `model` - Specific model to use
- `temperature` - Temperature setting (0.0 to 1.0)
- `maxTokens` - Maximum token limit for responses
- `workspacePath` - Path to your current project

## Supported LLM Providers

- **Anthropic Claude**: Recommended for code understanding and generation, with vision capabilities
- **OpenAI GPT**: Powerful general knowledge and coding assistant, with vision capabilities
- **Groq**: Ultra-fast inference speeds for quick responses
- **Mistral AI**: Open alternative with strong reasoning capabilities
- **Google Gemini**: Strong multimodal capabilities with massive context windows
- **OpenRouter**: Proxy service for accessing multiple models through one API
- **AWS Bedrock**: Enterprise-grade models with security features

## Troubleshooting

### Common Issues

- **API Key Problems**: Ensure your key is correctly set in the .env file
- **Missing Dependencies**: Check that Node.js/Python and required packages are installed
- **Path Issues**: Use absolute paths or ensure relative paths are correct
- **Model Limitations**: Different models have different capabilities and token limits

### Getting Help

If you encounter issues:
1. Check the logs in the terminal output
2. Verify that your API keys are valid and have sufficient quota
3. Ensure you have the latest version installed

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

Roo Pilot is based on [Roo Code](https://github.com/RooVetGit/Roo-Code), an AI assistant for VS Code. This standalone version brings the same capabilities outside of the VS Code environment.