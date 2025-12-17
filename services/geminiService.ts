
import { GoogleGenAI } from "@google/genai";
import { ShapeData } from "../types.ts";

const getBalanceStatus = (tilt: number) => {
  if (Math.abs(tilt) < 0.5) return "Balanced";
  if (tilt > 0) return "Leaning Right";
  return "Leaning Left";
};

export const analyzeComposition = async (shapes: ShapeData[], tiltAngle: number, mode: string): Promise<string> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API Key not found");
    }

    const ai = new GoogleGenAI({ apiKey });

    // Prepare data for the model
    const totalShapes = shapes.length;
    const balanceStatus = getBalanceStatus(tiltAngle);
    
    const shapeDescription = shapes.map(s => {
      const position = s.x + s.width / 2 < 400 ? "Left" : "Right";
      return `- ${s.type} on the ${position} (Size: ${s.height}, Shade: ${s.shade}/5)`;
    }).join("\n");

    const prompt = `
      You are a friendly middle-school art teacher helping 11-year-olds learn about visual balance.
      
      The student is using an app where shapes have "weight" based on their size and how dark their color is.
      
      Current Work:
      - The scale is: ${balanceStatus}.
      - Working in: ${mode} mode.
      - Shapes used:
      ${shapeDescription}
      
      Instructions for your feedback:
      1. Start by telling them if their scale is balanced or which side feels "heavier" to the eye.
      2. Explain simply how a big shape or a dark color adds "visual weight."
      3. Give one easy suggestion to improve the balance (like moving a shape or changing its color).
      4. Vocabulary: Use simple words. No complex art jargon.
      5. Length: Keep it very short (3 to 5 sentences max).
      6. Tone: Be a helpful mentor. Not a cheerleader, but encouraging.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "I couldn't quite see your work. Try clicking Analyze again!";
  } catch (error) {
    console.error("Error calling Gemini:", error);
    return "Oops! I'm having a little trouble thinking right now. Try again in a second.";
  }
};
