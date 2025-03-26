import streamlit as st
import os
import json
import time
import subprocess
import requests
from typing import List, Dict, Any, Optional
import base64
from dotenv import load_dotenv
import anthropic
import openai
from pathlib import Path
import toml

# Load environment variables
load_dotenv()

# Set page config
st.set_page_config(
    page_title="Roo Pilot",
    page_icon="🚀",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Paths
CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".roo-pilot")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
os.makedirs(CONFIG_DIR, exist_ok=True)

# Default configuration
DEFAULT_CONFIG = {
    "api_provider": "anthropic",
    "model": "claude-3-7-sonnet-20240229",
    "temperature": 0.3,
    "max_tokens": 4096,
    "mode": "assistant",
    "workspace_path": os.getcwd()
}

# Load configuration
def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            st.error("Error loading configuration file. Using defaults.")
            return DEFAULT_CONFIG
    else:
        # Create default config if it doesn't exist
        with open(CONFIG_FILE, 'w') as f:
            json.dump(DEFAULT_CONFIG, f, indent=2)
        return DEFAULT_CONFIG

# Save configuration
def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

# Get API keys from environment
def get_api_keys():
    keys = {
        "anthropic": os.getenv("ANTHROPIC_API_KEY", ""),
        "openai": os.getenv("OPENAI_API_KEY", ""),
        "openrouter": os.getenv("OPENROUTER_API_KEY", ""),
        "bedrock": os.getenv("AWS_ACCESS_KEY_ID", "") and os.getenv("AWS_SECRET_ACCESS_KEY", ""),
        "gemini": os.getenv("GOOGLE_API_KEY", ""),
        "mistral": os.getenv("MISTRAL_API_KEY", ""),
        "groq": os.getenv("GROQ_API_KEY", "")
    }
    return keys

# Check if API key is available
def has_api_key(provider):
    keys = get_api_keys()
    return bool(keys.get(provider, ""))

# Create .env file template
def create_env_template(path=".env.template"):
    template = """# Roo Pilot API Keys
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
"""
    with open(path, 'w') as f:
        f.write(template)
    return template

# Model metadata class
class ModelInfo:
    def __init__(self, name, display_name, supports_vision=False, context_window=4096, speed=2, reasoning=2):
        self.name = name
        self.display_name = display_name
        self.supports_vision = supports_vision
        self.context_window = context_window
        self.speed = speed  # 1-3 (1=fast, 3=slow)
        self.reasoning = reasoning  # 1-3 (1=basic, 3=advanced)
    
    def __str__(self):
        vision_indicator = "👁️ " if self.supports_vision else ""
        ctx_size = f"{round(self.context_window/1000)}K"
        speed_indicator = "⚡" * self.speed
        reasoning_indicator = "🧠" * self.reasoning
        return f"{vision_indicator}{self.display_name} ({ctx_size} ctx) {speed_indicator} {reasoning_indicator}"

# Cached models dictionary to store API-fetched models
cached_models = {}

# Fetch models directly from provider API
async def fetch_models_from_provider(provider):
    try:
        if provider == "openai" and os.getenv("OPENAI_API_KEY"):
            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            response = client.models.list()
            
            # Filter for chat models
            chat_models = [model for model in response.data if "gpt" in model.id and not "instruct" in model.id]
            
            return [
                ModelInfo(
                    model.id, 
                    model.id,
                    supports_vision="vision" in model.id or "gpt-4" in model.id,
                    context_window=128000 if "gpt-4" in model.id else 16385,
                    speed=3 if "gpt-3.5" in model.id else 2,
                    reasoning=3 if "gpt-4" in model.id else 2
                )
                for model in chat_models
            ]
        
        elif provider == "groq" and os.getenv("GROQ_API_KEY"):
            # Groq uses OpenAI's API structure
            client = openai.OpenAI(
                api_key=os.getenv("GROQ_API_KEY"),
                base_url="https://api.groq.com/openai/v1"
            )
            
            response = client.models.list()
            
            return [
                ModelInfo(
                    model.id,
                    model.id,
                    supports_vision="claude" in model.id,
                    context_window=200000 if "claude" in model.id else 
                               32768 if "mixtral" in model.id else 8192,
                    speed=3,  # Groq is generally fast
                    reasoning=3 if "70b" in model.id or "claude" in model.id else 2
                )
                for model in response.data
            ]
        
        # Add support for more providers here
        
    except Exception as e:
        st.error(f"Error fetching models: {str(e)}")
        return None
    
    return None

# Get fallback model metadata when API fetch fails
def get_fallback_models_metadata(provider):
    if provider == "anthropic":
        return [
            ModelInfo("claude-3-7-sonnet-20240229", "Claude 3.7 Sonnet", True, 200000, 2, 3),
            ModelInfo("claude-3-5-sonnet-20240620", "Claude 3.5 Sonnet", True, 200000, 2, 3),
            ModelInfo("claude-3-opus-20240229", "Claude 3 Opus", True, 200000, 1, 3),
            ModelInfo("claude-3-haiku-20240307", "Claude 3 Haiku", True, 200000, 3, 2)
        ]
    elif provider == "openai":
        return [
            ModelInfo("gpt-4o", "GPT-4o", True, 128000, 2, 3),
            ModelInfo("gpt-4o-mini", "GPT-4o Mini", True, 128000, 3, 2),
            ModelInfo("gpt-4-turbo", "GPT-4 Turbo", True, 128000, 1, 3),
            ModelInfo("gpt-3.5-turbo", "GPT-3.5 Turbo", True, 16385, 3, 1)
        ]
    elif provider == "openrouter":
        return [
            ModelInfo("anthropic/claude-3-7-sonnet", "Claude 3.7 Sonnet", True, 200000, 2, 3),
            ModelInfo("anthropic/claude-3-opus", "Claude 3 Opus", True, 200000, 1, 3),
            ModelInfo("openai/gpt-4o", "GPT-4o", True, 128000, 2, 3),
            ModelInfo("mistral/mistral-large", "Mistral Large", False, 32000, 2, 2),
            ModelInfo("meta-llama/llama-3-70b-instruct", "Llama 3 70B", False, 8000, 2, 2)
        ]
    elif provider == "bedrock":
        return [
            ModelInfo("anthropic.claude-3-7-sonnet-20240229", "Claude 3.7 Sonnet", True, 200000, 2, 3),
            ModelInfo("anthropic.claude-3-opus-20240229", "Claude 3 Opus", True, 200000, 1, 3),
            ModelInfo("anthropic.claude-3-haiku-20240307", "Claude 3 Haiku", True, 200000, 3, 2)
        ]
    elif provider == "gemini":
        return [
            ModelInfo("gemini-1.5-pro", "Gemini 1.5 Pro", True, 1000000, 2, 3),
            ModelInfo("gemini-1.5-flash", "Gemini 1.5 Flash", True, 1000000, 3, 2)
        ]
    elif provider == "mistral":
        return [
            ModelInfo("mistral-large-latest", "Mistral Large", False, 32000, 2, 2),
            ModelInfo("mistral-medium-latest", "Mistral Medium", False, 32000, 3, 2),
            ModelInfo("mistral-small-latest", "Mistral Small", False, 32000, 3, 1)
        ]
    elif provider == "groq":
        return [
            ModelInfo("llama3-70b-8192", "Llama 3 70B", False, 8192, 3, 2),
            ModelInfo("llama3-8b-8192", "Llama 3 8B", False, 8192, 3, 1),
            ModelInfo("mixtral-8x7b-32768", "Mixtral 8x7B", False, 32768, 3, 2),
            ModelInfo("gemma-7b-it", "Gemma 7B", False, 8192, 3, 1),
            ModelInfo("claude-3-5-sonnet-20240620", "Claude 3.5 Sonnet", True, 200000, 3, 3)
        ]
    else:
        return []

# Get available models for a provider
def get_available_models(provider):
    # Use cached models if available  
    if provider in cached_models:
        return [model.name for model in cached_models[provider]]
    
    # Try to fetch models from provider API
    try:
        import asyncio
        models = asyncio.run(fetch_models_from_provider(provider))
        if models:
            cached_models[provider] = models
            return [model.name for model in models]
    except Exception as e:
        st.error(f"Error fetching models: {str(e)}")
    
    # Fall back to hardcoded models if API fetch fails
    fallback_models = get_fallback_models_metadata(provider)
    cached_models[provider] = fallback_models
    return [model.name for model in fallback_models]

# Get detailed model metadata
def get_provider_models_metadata(provider):
    # Use cached models if available
    if provider in cached_models:
        return cached_models[provider]
    
    # Try to fetch models from provider API
    try:
        import asyncio
        models = asyncio.run(fetch_models_from_provider(provider))
        if models:
            cached_models[provider] = models
            return models
    except Exception as e:
        st.error(f"Error fetching models: {str(e)}")
    
    # Fall back to hardcoded models if API fetch fails
    fallback_models = get_fallback_models_metadata(provider)
    cached_models[provider] = fallback_models
    return fallback_models

# Send message to LLM and get response
def generate_response(provider, model, messages, system_prompt="", temperature=0.3, max_tokens=4096):
    try:
        if provider == "anthropic":
            client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
            
            # Format messages for Anthropic
            formatted_messages = []
            for msg in messages:
                formatted_messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
            
            response = client.messages.create(
                model=model,
                system=system_prompt,
                messages=formatted_messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            return response.content[0].text
            
        elif provider == "openai":
            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            
            # Format messages for OpenAI
            formatted_messages = []
            if system_prompt:
                formatted_messages.append({"role": "system", "content": system_prompt})
            
            for msg in messages:
                formatted_messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
            
            response = client.chat.completions.create(
                model=model,
                messages=formatted_messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            return response.choices[0].message.content
            
        elif provider == "openrouter":
            # Using OpenRouter API
            url = "https://openrouter.ai/api/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {os.getenv('OPENROUTER_API_KEY')}",
                "Content-Type": "application/json"
            }
            
            # Format messages for OpenRouter
            formatted_messages = []
            if system_prompt:
                formatted_messages.append({"role": "system", "content": system_prompt})
            
            for msg in messages:
                formatted_messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
            
            payload = {
                "model": model,
                "messages": formatted_messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            
            response = requests.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]
            
        elif provider == "groq":
            # Using Groq API (compatible with OpenAI client)
            client = openai.OpenAI(
                api_key=os.getenv("GROQ_API_KEY"),
                base_url="https://api.groq.com/openai/v1"
            )
            
            # Format messages for Groq
            formatted_messages = []
            if system_prompt:
                formatted_messages.append({"role": "system", "content": system_prompt})
            
            for msg in messages:
                formatted_messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
            
            response = client.chat.completions.create(
                model=model,
                messages=formatted_messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            return response.choices[0].message.content
            
        elif provider == "mistral":
            import mistralai
            from mistralai.client import MistralClient
            from mistralai.models.chat_completion import ChatMessage
            
            client = MistralClient(api_key=os.getenv("MISTRAL_API_KEY"))
            
            # Format messages for Mistral
            formatted_messages = []
            if system_prompt:
                formatted_messages.append(ChatMessage(role="system", content=system_prompt))
            
            for msg in messages:
                formatted_messages.append(ChatMessage(
                    role=msg["role"],
                    content=msg["content"]
                ))
            
            response = client.chat(
                model=model,
                messages=formatted_messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            return response.choices[0].message.content
        
        else:
            return f"Provider {provider} is not fully implemented yet."
    
    except Exception as e:
        st.error(f"Error generating response: {str(e)}")
        return f"Error: {str(e)}"

# File operations
def read_file(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {str(e)}"

def write_file(path, content):
    try:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return f"File written successfully: {path}"
    except Exception as e:
        return f"Error writing file: {str(e)}"

def list_files(directory):
    try:
        items = os.listdir(directory)
        files = []
        dirs = []
        
        for item in items:
            full_path = os.path.join(directory, item)
            if os.path.isdir(full_path):
                dirs.append(f"📁 {item}")
            else:
                files.append(f"📄 {item}")
        
        return dirs + files
    except Exception as e:
        return [f"Error listing directory: {str(e)}"]

# Sidebar UI
def render_sidebar():
    st.sidebar.title("Roo Pilot 🚀")
    st.sidebar.markdown("---")
    
    # Navigation
    page = st.sidebar.radio("Navigation", ["Chat", "Settings", "File Browser", "Documentation"])
    
    # Load configuration
    config = load_config()
    
    # API provider selection and status
    st.sidebar.markdown("### LLM Provider")
    provider_options = {
        "anthropic": "Anthropic (Claude)",
        "openai": "OpenAI (GPT)",
        "openrouter": "OpenRouter",
        "bedrock": "AWS Bedrock",
        "gemini": "Google Gemini",
        "mistral": "Mistral AI",
        "groq": "Groq (Fast inference)"
    }
    
    selected_provider = st.sidebar.selectbox(
        "Select provider",
        list(provider_options.keys()),
        format_func=lambda x: f"{provider_options[x]} {'✅' if has_api_key(x) else '❌'}",
        index=list(provider_options.keys()).index(config['api_provider']) if config['api_provider'] in provider_options else 0
    )
    
    if selected_provider != config['api_provider']:
        config['api_provider'] = selected_provider
        save_config(config)
    
    if not has_api_key(selected_provider):
        st.sidebar.warning(f"No API key found for {provider_options[selected_provider]}. Add it to your .env file.")
        if st.sidebar.button("Create .env Template"):
            template = create_env_template()
            st.sidebar.code(template, language="bash")
            st.sidebar.download_button(
                label="Download .env Template",
                data=template,
                file_name=".env.template",
                mime="text/plain"
            )
    
    # Model selection with detailed info
    with st.sidebar.status("Fetching available models..."):
        model_metadata = get_provider_models_metadata(selected_provider)
    
    model_options = []
    model_dict = {}
    vision_enabled = False
    
    for model in model_metadata:
        model_display = str(model)
        model_options.append(model_display)
        model_dict[model_display] = model.name
        if model.name == config.get('model') and model.supports_vision:
            vision_enabled = True
    
    # Default index for model selection
    default_index = 0
    for i, model in enumerate(model_metadata):
        if model.name == config.get('model'):
            default_index = i
            break
    
    st.sidebar.markdown("### Model Selection")
    selected_model_display = st.sidebar.selectbox(
        "Model",
        model_options,
        index=default_index,
        help="👁️ = Vision support | ⚡ = Speed | 🧠 = Reasoning"
    )
    
    # Update configuration if model changed
    selected_model = model_dict[selected_model_display]
    if selected_model != config.get('model'):
        config['model'] = selected_model
        # Update vision capability based on selected model
        for model in model_metadata:
            if model.name == selected_model:
                config['vision_enabled'] = model.supports_vision
                break
        save_config(config)
    
    if selected_model != config['model']:
        config['model'] = selected_model
        save_config(config)
    
    # Temperature
    temperature = st.sidebar.slider(
        "Temperature",
        min_value=0.0,
        max_value=1.0,
        value=config['temperature'],
        step=0.1
    )
    
    if temperature != config['temperature']:
        config['temperature'] = temperature
        save_config(config)
    
    # Max tokens
    max_tokens = st.sidebar.slider(
        "Max Tokens",
        min_value=1000,
        max_value=32000,
        value=config['max_tokens'],
        step=1000
    )
    
    if max_tokens != config['max_tokens']:
        config['max_tokens'] = max_tokens
        save_config(config)
    
    # Workspace path
    workspace_path = st.sidebar.text_input(
        "Workspace Path",
        value=config['workspace_path']
    )
    
    if workspace_path != config['workspace_path']:
        if os.path.exists(workspace_path):
            config['workspace_path'] = workspace_path
            save_config(config)
        else:
            st.sidebar.error("Path does not exist")
    
    st.sidebar.markdown("---")
    st.sidebar.markdown("Roo Pilot v1.0.0")
    
    return page, config

# Chat UI
def render_chat_page(config):
    st.title("Roo Pilot Chat")
    
    # Initialize chat history
    if "messages" not in st.session_state:
        st.session_state.messages = []
    
    # Define system prompt
    mode = config.get('mode', 'assistant')
    
    if mode == "code":
        system_prompt = """You are Roo Pilot, a coding assistant. You help users with programming tasks, explain code, 
        debug issues, and suggest improvements. When asked to write code, provide well-documented, efficient solutions."""
    else:
        system_prompt = """You are Roo Pilot, an AI assistant. You are helpful, honest, harmless, and concise in your responses. 
        You can assist with a wide range of tasks while being mindful of limitations."""
    
    # Display chat messages
    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])
    
    # Input for new message
    if prompt := st.chat_input("Ask Roo Pilot..."):
        # Don't process if no API key
        if not has_api_key(config['api_provider']):
            st.error(f"No API key found for {config['api_provider']}. Please add it to your .env file.")
            return
        
        # Add user message to chat history
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)
        
        # Check for special commands
        if prompt.startswith("/"):
            parts = prompt[1:].split(" ", 1)
            command = parts[0].lower()
            args = parts[1] if len(parts) > 1 else ""
            
            # Handle commands
            if command == "read":
                if not args:
                    response = "Please specify a file path to read."
                else:
                    path = os.path.join(config['workspace_path'], args) if not os.path.isabs(args) else args
                    response = f"**File: {args}**\n```\n{read_file(path)}\n```"
            
            elif command == "write":
                try:
                    # Format should be /write path content
                    file_parts = args.split(" ", 1)
                    path = file_parts[0]
                    content = file_parts[1] if len(file_parts) > 1 else ""
                    
                    full_path = os.path.join(config['workspace_path'], path) if not os.path.isabs(path) else path
                    response = write_file(full_path, content)
                except Exception as e:
                    response = f"Error: {str(e)}\nUsage: /write path content"
            
            elif command == "ls":
                path = os.path.join(config['workspace_path'], args) if args else config['workspace_path']
                files = list_files(path)
                response = f"**Directory: {path}**\n" + "\n".join(files)
            
            elif command == "clear":
                st.session_state.messages = []
                response = "Chat history cleared."
            
            elif command == "help":
                response = """
                **Roo Pilot Commands:**
                
                `/read path` - Read file content
                `/write path content` - Write content to a file
                `/ls [path]` - List files in a directory
                `/clear` - Clear chat history
                `/help` - Show this help message
                """
            else:
                response = f"Unknown command: {command}"
            
            # Add response to chat history
            st.session_state.messages.append({"role": "assistant", "content": response})
            with st.chat_message("assistant"):
                st.markdown(response)
        
        else:
            # Generate regular response
            with st.chat_message("assistant"):
                message_placeholder = st.empty()
                message_placeholder.markdown("Thinking...")
                
                try:
                    response = generate_response(
                        provider=config['api_provider'],
                        model=config['model'],
                        messages=st.session_state.messages,
                        system_prompt=system_prompt,
                        temperature=config['temperature'],
                        max_tokens=config['max_tokens']
                    )
                    
                    message_placeholder.markdown(response)
                    st.session_state.messages.append({"role": "assistant", "content": response})
                except Exception as e:
                    message_placeholder.markdown(f"Error: {str(e)}")
                    st.session_state.messages.append({"role": "assistant", "content": f"Error: {str(e)}"})

# Settings UI
def render_settings_page(config):
    st.title("Settings")
    
    st.markdown("### Environment Setup")
    
    # Show current API key status
    api_keys = get_api_keys()
    st.markdown("#### API Keys Status")
    
    for provider, name in {
        "anthropic": "Anthropic (Claude)",
        "openai": "OpenAI (GPT)",
        "openrouter": "OpenRouter",
        "bedrock": "AWS Bedrock",
        "gemini": "Google Gemini",
        "mistral": "Mistral AI",
        "groq": "Groq"
    }.items():
        status = "✅ Configured" if api_keys.get(provider) else "❌ Not configured"
        st.markdown(f"- **{name}**: {status}")
    
    st.markdown("""
    To configure API keys, create a `.env` file in the application directory with your keys.
    """)
    
    if st.button("Create .env Template"):
        template = create_env_template()
        st.code(template, language="bash")
        st.download_button(
            label="Download .env Template",
            data=template,
            file_name=".env.template",
            mime="text/plain"
        )
    
    st.markdown("---")
    
    st.markdown("### Application Settings")
    
    # Mode selection
    mode = st.selectbox(
        "Mode",
        ["assistant", "code"],
        index=0 if config['mode'] == "assistant" else 1
    )
    
    if mode != config['mode']:
        config['mode'] = mode
        save_config(config)
    
    # Reset settings
    if st.button("Reset All Settings to Default"):
        for key, value in DEFAULT_CONFIG.items():
            config[key] = value
        save_config(config)
        st.success("Settings reset to default values.")

# File Browser UI
def render_file_browser(config):
    st.title("File Browser")
    
    current_path = st.text_input("Current Path", value=config['workspace_path'])
    
    if current_path != config['workspace_path']:
        if os.path.exists(current_path):
            config['workspace_path'] = current_path
            save_config(config)
        else:
            st.error("Path does not exist")
    
    try:
        items = list_files(current_path)
        
        col1, col2 = st.columns([3, 1])
        
        with col1:
            selected_item = st.selectbox("Select file or directory", items)
        
        with col2:
            st.markdown("<br>", unsafe_allow_html=True)
            open_button = st.button("Open")
            
            if open_button and selected_item:
                item_name = selected_item[2:]  # Remove the icon prefix
                item_path = os.path.join(current_path, item_name)
                
                if os.path.isdir(item_path):
                    config['workspace_path'] = item_path
                    save_config(config)
                    st.experimental_rerun()
                else:
                    file_content = read_file(item_path)
                    file_extension = os.path.splitext(item_name)[1].lower()
                    
                    if file_extension == ".py":
                        language = "python"
                    elif file_extension in [".js", ".ts"]:
                        language = "javascript"
                    elif file_extension in [".html", ".htm"]:
                        language = "html"
                    elif file_extension in [".css"]:
                        language = "css"
                    elif file_extension in [".json"]:
                        language = "json"
                    else:
                        language = None
                    
                    st.code(file_content, language=language)
        
        # Go up one directory
        if st.button("Go Up One Directory"):
            parent_dir = os.path.dirname(current_path)
            if os.path.exists(parent_dir):
                config['workspace_path'] = parent_dir
                save_config(config)
                st.experimental_rerun()
    
    except Exception as e:
        st.error(f"Error accessing directory: {str(e)}")

# Documentation UI
def render_documentation():
    st.title("Roo Pilot Documentation")
    
    st.markdown("""
    ## About Roo Pilot
    
    Roo Pilot is a standalone version of Roo Code that works outside of VS Code. It provides both command-line 
    and graphical interfaces to interact with AI models for code assistance, question answering, and more.
    
    ## Features
    
    - **Chat Interface**: Interact with AI models through a chat interface
    - **File Operations**: Read, write, and browse files
    - **Multiple LLM Support**: Works with Anthropic Claude, OpenAI GPT, and other providers
    - **Customizable**: Configure your preferred models, temperature, and other settings
    - **Dynamic Model Selection**: Fetches available models directly from providers when possible
    
    ## Installation
    
    ### Prerequisites
    
    - Python 3.8 or higher (for the Streamlit UI)
    - Node.js 20.x or higher (for the CLI version)
    - API keys for your preferred LLM providers
    
    ### Setup
    
    1. Clone the repository
    2. Create a `.env` file with your API keys
    3. Run the installation script for your platform
    
    ### Environment Variables
    
    Set these in your `.env` file:
    
    ```
    ANTHROPIC_API_KEY=your_key_here
    OPENAI_API_KEY=your_key_here
    OPENROUTER_API_KEY=your_key_here
    AWS_ACCESS_KEY_ID=your_access_key
    AWS_SECRET_ACCESS_KEY=your_secret_key
    AWS_REGION=us-east-1
    GOOGLE_API_KEY=your_key_here
    MISTRAL_API_KEY=your_key_here
    GROQ_API_KEY=your_key_here
    ```
    
    ## Usage
    
    ### Streamlit UI
    
    Run the Streamlit UI with:
    
    ```
    streamlit run streamlit_app.py
    ```
    
    ### CLI Mode
    
    Run the CLI with:
    
    ```
    roo-pilot-cli
    ```
    
    ### Commands
    
    Once in the chat interface, you can use these commands:
    
    - `/read path` - Read file content
    - `/write path content` - Write content to a file
    - `/ls [path]` - List files in a directory
    - `/clear` - Clear chat history
    - `/help` - Show help information
    
    ## Development
    
    Contributions are welcome! Please see the CONTRIBUTING.md file for guidelines.
    """)

# Main function
def main():
    page, config = render_sidebar()
    
    if page == "Chat":
        render_chat_page(config)
    elif page == "Settings":
        render_settings_page(config)
    elif page == "File Browser":
        render_file_browser(config)
    elif page == "Documentation":
        render_documentation()

if __name__ == "__main__":
    main()