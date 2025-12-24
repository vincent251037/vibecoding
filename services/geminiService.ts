import { GoogleGenAI, Type } from "@google/genai";
import { TranscriptionResult } from "../types";

const ERROR_CORRECTION_TABLE = `
【學術術語修正對照表】
- 上升緊繃 -> 上身緊繃 | 水路法會 -> 水陸法會
- 海英三昧 -> 海印三昧 | 產眾 -> 禪眾
- 阿賴也是 -> 阿賴耶識 | 氣理 -> 契理
- 法稱提出形象視為有垢論 -> 法稱出形象虛偽有垢論
- 骯髒氣承認形象是為有垢論 -> 寶藏寂承認形象虛偽有垢論
- 中部著重在「中觀瑜伽」中和學派 -> 寂護著重在「中觀瑜伽」綜合學派
- 無形象知識論 -> 無形相知識論 | 新意識 -> 心意識
- 末那是思量名 -> 末那是思量義
`;

const getSystemInstruction = (courseName: string, sessionTitle: string) => `
你是一位具備深厚學術功底的「${courseName}」領域紀錄專家。

核心任務：
1. **精準轉錄**：將音檔轉化為文字，嚴禁濃縮。
2. **術語校對**：結合上傳的參考文件，修正專有名詞。
3. **角色識別**：必須區分「老師：」與「學生 1：」、「學生 2：」等發言者。
4. **格式**：重要術語以 **粗體** 標示。

請輸出 JSON 格式：
{
  "title": "正式標題",
  "content": "逐字稿全文"
}
`;

const getNotesSystemInstruction = (courseName: string) => `
你是一位資深的學術研究員，請將「${courseName}」講座內容轉化為研究生級別的 Markdown 筆記。
要求：嚴謹、專業、排版美觀，包含邏輯架構與學術反思。
`;

function cleanJsonString(jsonStr: string): string {
  return jsonStr.replace(/```json\n?/, '').replace(/```\n?$/, '').trim();
}

export async function transcribeAudio(
  audioParts: { data: string; mimeType: string }[], 
  referenceFiles: { data: string; mimeType: string }[],
  sessionTitle: string,
  courseName: string
): Promise<TranscriptionResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          ...audioParts.map(a => ({ inlineData: { data: a.data, mimeType: a.mimeType } })),
          ...referenceFiles.map(f => ({ inlineData: { data: f.data, mimeType: f.mimeType } })),
          {
            text: `主題：${sessionTitle}。請區分老師與不同學生，並參考修正表：${ERROR_CORRECTION_TABLE}`
          }
        ]
      },
      config: {
        systemInstruction: getSystemInstruction(courseName, sessionTitle),
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 32768 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING }
          },
          required: ["title", "content"]
        }
      }
    });

    const text = response.text || '{}';
    const result = JSON.parse(cleanJsonString(text));
    
    return { 
      ...result, 
      id: `trans-${self.crypto.randomUUID()}`, 
      timestamp: Date.now(), 
      courseName,
      latestVersion: 0,
      previousVersion: 0
    };
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error("轉錄處理失敗。");
  }
}

export async function generateStudyNotes(content: string, title: string, courseName: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [{ text: `主題：${title}\n\n內容：\n${content}` }]
    },
    config: {
      systemInstruction: getNotesSystemInstruction(courseName),
      thinkingConfig: { thinkingBudget: 16384 },
    }
  });
  return response.text || "";
}