import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up JSON body parser with a large limit so we can receive base64 images
app.use(express.json({ limit: "15mb" }));

// Initialize GoogleGenAI client lazy-loaded
let ai: GoogleGenAI | null = null;
const getGeminiClient = () => {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is missing from environment.");
    }
    ai = new GoogleGenAI({
      apiKey: apiKey || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return ai;
};

// OCR scan API endpoint
app.post("/api/ocr/scan", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64 payload" });
    }

    // Strip out the data:image/...;base64, prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const client = getGeminiClient();
    
    const response = await client.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType || "image/jpeg",
          },
        },
        "Extract details from this expense receipt. Return JSON only conforming to the requested schema. If any field is unreadable, set it to null."
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            merchant: { type: Type.STRING, description: "Name of the merchant/vendor. Set to null if unreadable." },
            amount: { type: Type.NUMBER, description: "Total numeric amount on the receipt. Do not invent if unreadable." },
            date: { type: Type.STRING, description: "Receipt date in YYYY-MM-DD format only. Null if unreadable." },
            time: { type: Type.STRING, description: "Time of the transaction if readable." },
            currency: { type: Type.STRING, description: "Currency e.g. INR, USD, etc. if readable." },
            receiptNumber: { type: Type.STRING, description: "Receipt or invoice number if readable." },
            taxAmount: { type: Type.NUMBER, description: "GST/tax numeric amount if clearly readable. Null if unreadable." },
            category: { 
              type: Type.STRING, 
              description: "Must be one of the existing categories if identifiable: 'Travel', 'Meals & Food', 'Client Entertainment', 'Office Supplies', 'Fuel / Conveyance', 'Lodging', 'Miscellaneous'." 
            },
            isUsable: { 
              type: Type.BOOLEAN, 
              description: "Whether the receipt image is clear, legible and not too dark or blurry to read basic details." 
            },
            isUsableReason: {
              type: Type.STRING,
              description: "Brief reason if the image is difficult to read."
            }
          },
          required: ["isUsable"]
        }
      }
    });

    const resultText = response.text || "{}";
    const resultJson = JSON.parse(resultText);

    return res.json(resultJson);
  } catch (err: any) {
    console.error("OCR API error:", err);
    return res.status(500).json({ error: err.message || "Failed to scan receipt" });
  }
});

// Vite middleware for dev or serving static files for production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // For SPA Routing fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
