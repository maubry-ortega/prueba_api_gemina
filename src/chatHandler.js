import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export async function handleChat(message) {
  if (!message) return { reply: "Envía un mensaje.", data: [] };

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
      body: JSON.stringify({ contents: [{ parts: [{ text: sqlPrompt }] }] }),
    }
  );

  const sqlData = await sqlResponse.json();
  let sqlQuery = sqlData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!sqlQuery) return { reply: "No pude generar la consulta SQL.", data: [] };

  // Limpiar SQL
  sqlQuery = sqlQuery
    .replace(/```sql|```/gi, "")
    .replace(/^[\s(]+|[\s)]+$/g, "")
    .replace(/;+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!/^select/i.test(sqlQuery))
    return { reply: "Solo se permiten consultas SELECT en esta demo.", data: [] };

  // 2. Ejecutar SQL en Supabase
  let { data, error } = await supabase.rpc("exec_sql", { sql: sqlQuery });
  if (error) return { reply: "Error al ejecutar SQL: " + error.message, data: [] };

  // 3. Verificación semántica si no hay resultados
  if (!data || data.length === 0) {
    const verifyPrompt = `
Se ejecutó esta consulta SQL: "${sqlQuery}"
y no arrojó resultados, pero podrían existir variaciones semánticas o errores ortográficos.

Analiza la tabla 'productos' y genera una NUEVA consulta SQL corregida si detectas variaciones.
Responde SOLO con la nueva consulta SQL o "NO CAMBIO".
    `;

    const verifyResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: verifyPrompt }] }] }),
      }
    );

    const verifyData = await verifyResponse.json();
    let newSql = verifyData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (newSql && newSql !== "NO CAMBIO" && /^select/i.test(newSql)) {
      newSql = newSql.replace(/```sql|```/gi, "").replace(/;+\s*$/g, "").trim();
      const retry = await supabase.rpc("exec_sql", { sql: newSql });
      if (!retry.error && retry.data?.length) {
        data = retry.data;
        sqlQuery = newSql;
      } else {
        return { reply: "No se encontraron resultados.", data: [] };
      }
    } else {
      return { reply: "No se encontraron resultados.", data: [] };
    }
  }

  // 4. Generar resumen natural
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
      body: JSON.stringify({ contents: [{ parts: [{ text: summaryPrompt }] }] }),
    }
  );

  const summaryData = await summaryResponse.json();
  const reply =
    summaryData.candidates?.[0]?.content?.parts?.[0]?.text || "No pude generar un resumen.";

  return { reply, data };
}
