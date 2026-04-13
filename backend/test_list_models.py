import google.generativeai as genai
import os
import json

# Load config to get the API key
config_path = "projects/chess-analyzer/backend/config.json"
if os.path.exists(config_path):
    with open(config_path, "r") as f:
        config = json.load(f)
        api_key = config.get("gemini_api_key")
        if api_key:
            genai.configure(api_key=api_key)
            for m in genai.list_models():
                if 'generateContent' in m.supported_generation_methods:
                    print(m.name)
        else:
            print("No API key found in config")
else:
    print("Config file not found")
