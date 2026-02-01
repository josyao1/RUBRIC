"""
Quick test to verify your Gemini API key works.
"""

from google import genai

API_KEY = "AIzaSyC6aJSXvRQOI09v5Hv2WMAkiwgYG7rqcto"

client = genai.Client(api_key=API_KEY)

try:
    print("Testing gemini-2.5-flash-lite...")
    response = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents="Say 'API key works!' and nothing else."
    )
    print("SUCCESS:", response.text)
except Exception as e:
    print("ERROR:", e)
