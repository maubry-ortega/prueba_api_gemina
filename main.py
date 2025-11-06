import os
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from chat_handler import handle_chat

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# Servir HTML
@app.get("/", response_class=HTMLResponse)
async def index():
    with open("public/index.html", "r", encoding="utf-8") as f:
        return f.read()

# Endpoint chat
@app.post("/api/chat")
async def chat_endpoint(req: Request):
    body = await req.json()
    message = body.get("message", "").strip()
    response = await handle_chat(message)
    return response
