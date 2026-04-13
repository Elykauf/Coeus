import json
from google import genai
from google.genai import types
from pathlib import Path
import PIL.Image as PILImage
import io as _io


def _get_api_key() -> str:
    """Load the Gemini API key from config.json, relative to this file's location."""
    config_path = Path(__file__).parent.parent / "config.json"
    if config_path.exists():
        with open(config_path, "r") as f:
            return json.load(f).get("gemini_api_key", "")
    return ""


def _resize_image(image_path: str, max_dim: int = 1500) -> bytes:
    """Resize image to max_dim on longest side and return JPEG bytes."""
    pil_img = PILImage.open(image_path).convert("RGB")
    w, h = pil_img.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        pil_img = pil_img.resize((int(w * scale), int(h * scale)), PILImage.LANCZOS)
    buf = _io.BytesIO()
    pil_img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def extract_pgn_from_image(image_path: str) -> str:
    api_key = _get_api_key()
    if not api_key:
        raise ValueError("Gemini API key is not configured. Set it in the Config page.")

    client = genai.Client(api_key=api_key)
    image_bytes = _resize_image(image_path)

    prompt = """You are a Chess Data Specialist. Your task is to extract chess moves and optional timestamps from handwritten scoresheets and convert them into a structured JSON format.

### Your Objectives:
1. **Standardize Notation:** Convert non-standard symbols into algebraic notation (e.g., "e-0" or "O-O" to "O-O", "K" to "N" for Knights if context implies it).
2. **Handle Typos:** If a move is clearly a coordinate typo, determine the most logical legal move.
3. **Timestamps:** If you see clocks or timestamps (e.g., "1:20", "0.45", "15:00") next to the moves, extract them.
4. **Structure:** Output the moves in an array of objects. Each object should contain:
   - "move_number": integer
   - "white_move": string (e.g., "e4")
   - "white_time": string (optional, e.g., "1:20")
   - "black_move": string (e.g., "c5")
   - "black_time": string (optional, e.g., "1:15")

### Constraints:
- Output ONLY a valid JSON object with a single key "moves" containing the array of move objects.
- Do not provide markdown formatting or conversational filler.
- If a move or time is missing, use an empty string.
- Piece letters must be capitalized (N, B, R, Q, K).
- Use "x" for captures."""

    response = client.models.generate_content(
        model="gemini-3.1-pro-preview",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
            prompt,
        ],
        config=types.GenerateContentConfig(
            temperature=0.2,
            response_mime_type="application/json",
        ),
    )

    return response.text.strip()


def extract_timestamps_from_image(image_path: str, pgn_context: str) -> str:
    """Extracts timestamps from a scoresheet, using the already extracted moves as context."""
    api_key = _get_api_key()
    if not api_key:
        raise ValueError("Gemini API key is not configured. Set it in the Config page.")

    client = genai.Client(api_key=api_key)
    image_bytes = _resize_image(image_path)

    prompt = f"""Given the image is a chess score sheet, find the timestamps of moves.
Timestamps are in the format HMM or H:MM where 200 would be 2 hours and 0 minutes.
Output as a structured JSON.

Context: These are the moves already identified:
{pgn_context}

Format:
{{
  "timestamps": [
    {{ "move_number": 1, "white_time": "2:00", "black_time": "1:58" }}
  ]
}}
"""

    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
            prompt,
        ],
        config=types.GenerateContentConfig(
            temperature=0.1,
            response_mime_type="application/json",
        ),
    )

    return response.text.strip()
