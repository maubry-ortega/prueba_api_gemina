import os
import re
import json
import httpx
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase URL o KEY no configuradas en .env")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent"

async def call_gemini(prompt: str):
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=30.0
        )
        data = resp.json()
        text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        return text.strip() if text else None

async def handle_chat(message: str):
    if not message:
        return {"reply": "Envía un mensaje."}

    # 1. Generar SQL
    sql_prompt = f"""
Convierte esta consulta en lenguaje natural en una consulta SQL válida para PostgreSQL.
Usa exclusivamente la tabla 'productos' con las columnas:
id, nombre, categoria, genero, talla, precio, stock_actual, fecha_actualizacion.
Responde SOLO con el SQL, sin explicaciones ni comentarios.
Debe comenzar con SELECT y no incluir punto y coma.
Usuario: "{message}"
"""
    sql_query = await call_gemini(sql_prompt)
    if not sql_query:
        return {"reply": "No pude generar la consulta SQL."}

    sql_query = re.sub(r"```sql|```", "", sql_query, flags=re.IGNORECASE)
    sql_query = re.sub(r"^[\s(]+|[\s)]+$", "", sql_query)
    sql_query = re.sub(r";+\s*$", "", sql_query)
    sql_query = re.sub(r"\s+", " ", sql_query).strip()

    if not sql_query.lower().startswith("select"):
        return {"reply": "Solo se permiten consultas SELECT en esta demo."}

    # Ejecutar SQL en Supabase
    try:
        result = supabase.rpc("exec_sql", {"sql": sql_query}).execute()
    except Exception as e:
        return {"reply": f"Error al ejecutar SQL: {str(e)}"}

    data = getattr(result, "data", None) or []

    # Verificación semántica si no hay resultados
    if not data:
        verify_prompt = f"""
Se ejecutó esta consulta SQL: "{sql_query}"
y no arrojó resultados, podrían existir variaciones semánticas o errores ortográficos.
Analiza la tabla 'productos' y genera una NUEVA consulta SQL corregida si es posible.
Responde SOLO con la nueva consulta SQL. Si no hay mejoras posibles, responde "NO CAMBIO".
"""
        new_sql = await call_gemini(verify_prompt)
        if new_sql and new_sql != "NO CAMBIO" and new_sql.lower().startswith("select"):
            new_sql = re.sub(r"```sql|```", "", new_sql, flags=re.IGNORECASE)
            new_sql = re.sub(r";+\s*$", "", new_sql).strip()
            try:
                retry = supabase.rpc("exec_sql", {"sql": new_sql}).execute()
                if getattr(retry, "data", None):
                    data = retry.data
                    sql_query = new_sql
                else:
                    return {"reply": "No se encontraron resultados."}
            except Exception:
                return {"reply": "No se encontraron resultados."}
        else:
            return {"reply": "No se encontraron resultados."}

    # Generar resumen natural
    summary_prompt = f"""
Genera una respuesta clara y concisa en lenguaje natural basándote en los siguientes datos:
Resultado SQL: {json.dumps(data)}
Consulta final usada: "{sql_query}"
Pregunta original del usuario: "{message}"
"""
    reply_text = await call_gemini(summary_prompt)
    reply_text = reply_text or "No pude generar un resumen."
    return {"reply": reply_text, "data": data}
