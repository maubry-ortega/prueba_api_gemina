import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Ruta principal de prueba
app.get("/", (req, res) => {
  res.send("🚀 API de Gemini conectada correctamente (modelo gemini-2.5-flash)");
});

// Endpoint del chat
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Falta el campo 'message'" });
    }

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const body = {
      contents: [{ parts: [{ text: message }] }]
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

    res.json({ reply: reply || "No se recibió respuesta del modelo." });
  } catch (error) {
    console.error("❌ Error en el chat:", error);
    res.status(500).json({ error: "Error interno en el servidor" });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en http://localhost:${PORT}`);
});
