from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import os
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential


class CompleteRequest(BaseModel):
    task: str
    input: Dict[str, Any]


class CompleteResponse(BaseModel):
    specs_filled: Optional[List[Dict[str, str]]] = None
    notes: Optional[str] = None


OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
MODEL = os.getenv("MODEL", "gpt-4o-mini")

app = FastAPI(title="Shop AI Backend")


def build_prompt(data: Dict[str, Any]) -> str:
    url = data.get("url", "")
    title = data.get("title", "")
    specs = data.get("specs", [])
    prompt = (
        "You are a product attribute completion agent for an e-commerce site.\n"
        "Given partially extracted product info, identify missing key specs and fill them with precise values.\n"
        "Prefer authoritative sources. If unsure, return null for the value.\n"
        f"URL: {url}\n"
        f"Title: {title}\n"
        f"Extracted specs: {specs}\n"
        "Return JSON array of {name, value} pairs under key specs_filled and an optional notes string."
    )
    return prompt


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
async def call_openai(prompt: str) -> Dict[str, Any]:
    if not OPENAI_API_KEY:
        return {"specs_filled": [], "notes": "OPENAI_API_KEY not set; returning empty completion."}
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "You output strict JSON only."},
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
    }
    async with httpx.AsyncClient(timeout=60, base_url=OPENAI_BASE_URL) as client:
        r = await client.post("/chat/completions", headers=headers, json=payload)
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"OpenAI error {r.status_code}: {r.text}")
        data = r.json()
        try:
            content = data["choices"][0]["message"]["content"]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Invalid OpenAI response: {e}")
        try:
            return httpx.Response(200, content=content).json()
        except Exception:
            return {"raw": content}


@app.post("/api/v1/ai", response_model=CompleteResponse)
async def complete(req: CompleteRequest):
    if req.task != "complete_product_specs":
        raise HTTPException(status_code=400, detail="Unsupported task")
    prompt = build_prompt(req.input)
    result = await call_openai(prompt)
    return CompleteResponse(**result)


@app.get("/healthz")
async def healthz():
    return {"ok": True}

