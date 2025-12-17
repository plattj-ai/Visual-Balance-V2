
import { GoogleGenAI } from "@google/genai";
import { ShapeData } from "../types";

const getBalanceStatus = (tilt: number) => {
  if (Math.abs(tilt) < 0.5) return "Balanced";
  if (tilt > 0) return "Tipped Right";
  return "Tipped Left";
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
    
    // Categorize shapes for better description
    const leftShapes = shapes.filter(s => s.x + s.width / 2 < 400); // Assuming 800 width roughly
    const rightShapes = shapes.filter(s => s.x + s.width / 2 >= 400);
    
    const shapeDescription = shapes.map(s => {
      const position = s.x + s.width / 2 < 400 ? "Left side" : "Right side";
      return `- A ${s.type} on the ${position} (Size: ${s.height}x${s.width}, Shade Level: ${s.shade})`;
    }).join("\n");

    const prompt = `
      You are a helpful and objective art coach for 6th grade students.
      
      Analyze the following graphic design composition created by a student in the "Visual Balance Coach" app.
      
      Context:
      - The goal is to create a visually balanced composition using shapes.
      - The current mode is: ${mode}.
      - The mechanical balance beam status is: ${balanceStatus} (Tilt Angle: ${tiltAngle.toFixed(1)} degrees).
      - Total Shapes: ${totalShapes} (${leftShapes.length} on left, ${rightShapes.length} on right).
      
      Shape Details:
      ${shapeDescription}
      
      Instructions:
      1. Confirm if the composition is balanced mechanically.
      2. Discuss the visual weight distribution (size/color darkness).
      3. Comment on the use of symmetry vs asymmetry.
      4. Provide one clear strength and one specific, constructive tip for improvement.
      5. Tone: Friendly and professional, but not overly excited. Avoid excessive exclamation marks. Use a coaching voice, not a cheerleader voice.
      6. Keep it under 150 words.
    `;

    // Fixed: Always use recommended models for basic text tasks
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    // Fixed: Directly access .text property as it is a property, not a method.
    return response.text || "Could not generate analysis.";
  } catch (error) {
    console.error("Error calling Gemini:", error);
    return "Sorry, I couldn't analyze your artwork right now. Please try again later.";
  }
};
