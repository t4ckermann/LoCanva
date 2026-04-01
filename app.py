import os

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template

load_dotenv()

app = Flask(__name__)

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")


def ollama_url(path):
    return f"{OLLAMA_BASE_URL.rstrip('/')}{path}"


@app.route("/")
def index():
    return render_template("index.html")


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "1337"))
    app.run(host=host, port=port, debug=False)
