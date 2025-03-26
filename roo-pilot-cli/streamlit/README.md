# Roo Pilot Streamlit UI

A web-based interface for Roo Pilot, providing a graphical alternative to the command-line interface.

## Features

- Chat interface with multiple AI model support
- File browser for easy navigation
- Settings management
- Multi-provider support (Anthropic, OpenAI, OpenRouter, etc.)
- Cross-platform compatibility

## Prerequisites

- Python 3.8 or higher
- API keys for LLM providers

## Installation

1. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```

2. Create a `.env` file with your API keys (see template below)

3. Run the Streamlit app:
   ```bash
   streamlit run streamlit_app.py
   ```

## Environment Variables

Create a `.env` file in the same directory as the Streamlit app with your API keys:

```
# Anthropic (Claude)
ANTHROPIC_API_KEY=your_key_here

# OpenAI
OPENAI_API_KEY=your_key_here

# OpenRouter
OPENROUTER_API_KEY=your_key_here

# Mistral
MISTRAL_API_KEY=your_key_here

# Groq
GROQ_API_KEY=your_key_here
```

## Usage

The Streamlit interface provides four main sections:

1. **Chat**: Interact with AI models through a chat interface
2. **Settings**: Configure providers, models, and parameters
3. **File Browser**: Browse and view files in your workspace
4. **Documentation**: View help and documentation

## Commands

While in the chat interface, you can use the following commands:

- `/read path` - Read file content
- `/write path content` - Write content to a file
- `/ls [path]` - List files in a directory
- `/clear` - Clear chat history
- `/help` - Show help information