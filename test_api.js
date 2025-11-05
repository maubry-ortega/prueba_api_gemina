import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

async function probar() {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: "Hola Gemini, cuéntame un dato curioso sobre el universo 🌌" }] }]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  const respuesta = data.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log("🤖 Respuesta de Gemini:\n", respuesta || JSON.stringify(data, null, 2));
}

probar();
