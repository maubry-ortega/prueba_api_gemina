import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { handleChat } from "./chatHandler.js"

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Servir HTML estático
app.use(express.static(path.join(__dirname, "public")));

// Ruta principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Endpoint principal del chat en lenguaje natural
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const result = await handleChat(message); // llamamos al handler modular
    res.json(result); // devuelve { reply, data }
  } catch (err) {
    console.error("Error general:", err);
    res.status(500).json({ reply: "Error interno del servidor.", data: [] });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Servidor escuchando en http://localhost:${PORT}`)
);
