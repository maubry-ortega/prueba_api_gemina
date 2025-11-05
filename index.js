import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Servir HTML estático
app.use(express.static(path.join(__dirname, "public")));

// Conexión a Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Ruta principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Endpoint principal del chat en lenguaje natural
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ reply: "Envía un mensaje." });

    // 1. Generar SQL desde lenguaje natural con Gemini
    const sqlPrompt = `
Convierte esta consulta en lenguaje natural en una consulta SQL válida para PostgreSQL.
Usa exclusivamente la tabla 'productos' con las columnas:
id, nombre, categoria, genero (valores posibles: 'Hombre', 'Mujer', 'Niño', 'Niña'), talla, precio, stock_actual, fecha_actualizacion.
Responde SOLO con el SQL, sin explicaciones ni comentarios.
Debe comenzar con SELECT y no incluir punto y coma.
Usuario: "${message}"
    `;

    const sqlResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: sqlPrompt }] }],
        }),
      }
    );

    const sqlData = await sqlResponse.json();
    let sqlQuery = sqlData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!sqlQuery) {
      console.error("No se pudo generar SQL:", sqlData);
      return res.json({ reply: "No pude generar la consulta SQL." });
    }

    // Limpiar SQL
    sqlQuery = sqlQuery
      .replace(/```sql|```/gi, "")
      .replace(/^[\s(]+|[\s)]+$/g, "")
      .replace(/;+\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    console.log("SQL generado:", sqlQuery);

    if (!/^select/i.test(sqlQuery)) {
      return res.json({
        reply: "Solo se permiten consultas SELECT en esta demo.",
      });
    }

    // 2. Ejecutar SQL en Supabase
    let { data, error } = await supabase.rpc("exec_sql", { sql: sqlQuery });

    if (error) {
      console.error("Error SQL:", error);
      return res.json({ reply: "Error al ejecutar SQL: " + error.message });
    }

    console.log("Resultado SQL:", data);

    // 3.Verificación semántica si no hay resultados
    if (!data || data.length === 0) {
      console.log("Sin resultados, verificando posibles variaciones...");

      const verifyPrompt = `
Se ejecutó esta consulta SQL: "${sqlQuery}"
y no arrojó resultados, pero podrían existir variaciones semánticas o errores ortográficos (por ejemplo: "niño" vs "niños", "mujer" vs "mujeres").

Analiza la tabla 'productos' con las columnas:
id, nombre, categoria, genero, talla, precio, stock_actual, fecha_actualizacion.

Si detectas una posible variación o pluralización que podría corregir el problema, genera una NUEVA consulta SQL corregida.
Responde SOLO con la nueva consulta SQL. Si crees que no hay mejoras posibles, responde exactamente con: "NO CAMBIO".
      `;

      const verifyResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: verifyPrompt }] }],
          }),
        }
      );

      const verifyData = await verifyResponse.json();
      let newSql = verifyData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (newSql && newSql !== "NO CAMBIO" && /^select/i.test(newSql)) {
        newSql = newSql
          .replace(/```sql|```/gi, "")
          .replace(/;+\s*$/g, "")
          .trim();

        console.log("SQL corregido por IA:", newSql);

        const retry = await supabase.rpc("exec_sql", { sql: newSql });
        if (!retry.error && retry.data?.length) {
          data = retry.data;
          sqlQuery = newSql;
        } else {
          console.log("Sin resultados tras corrección:", retry.error || retry.data);
          return res.json({ reply: "No se encontraron resultados." });
        }
      } else {
        console.log("La IA no propuso cambios significativos.");
        return res.json({ reply: "No se encontraron resultados." });
      }
    }

    // Generar resumen natural
    const summaryPrompt = `
Genera una respuesta clara y concisa en lenguaje natural basándote en los siguientes datos:
Resultado SQL: ${JSON.stringify(data)}
Consulta final usada: "${sqlQuery}"
Pregunta original del usuario: "${message}"
    `;

    const summaryResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: summaryPrompt }] }],
        }),
      }
    );

    const summaryData = await summaryResponse.json();
    const reply =
      summaryData.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No pude generar un resumen.";

    res.json({ reply });
  } catch (err) {
    console.error("Error general:", err);
    res.status(500).json({ reply: "Error interno del servidor." });
  }
});


// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Servidor escuchando en http://localhost:${PORT}`)
);
