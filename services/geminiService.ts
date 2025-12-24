
import { GoogleGenAI, Type } from "@google/genai";
import { TranscriptionResult } from "../types";

// Explicitly declare process for browser environment safety
declare var process: {
  env: {
    API_KEY: string;
  };
};

const ERROR_CORRECTION_TABLE = `
【學術術語修正對照表】
- 上升緊繃 -> 上身緊繃 | 水路法會 -> 水陸法會
- 海英三昧 -> 海印三昧 | 產眾 -> 禪眾
- 阿賴還是 -> 阿賴耶識 | 氣理 -> 契理
- 法稱提出形象視為有垢論 -> 法稱出形象虛偽有垢論
- 骯髒氣承認形象是為有垢論 -> 寶藏寂承認形象虛偽有垢論
- 中部著重在「中觀瑜伽」中和學派 -> 寂護著重在「中觀瑜伽」綜合學派
- 無形象知識論 -> 無形相知識論 | 新意識 -> 心意識
- 末那是思量名 -> 末那是思量義
- 釋迦摩尼 -> 釋迦牟尼 | 維摩詰 -> 維摩詰
`;

const getSystemInstruction = (courseName: string, sessionTitle: string) => `
你是一位具備深厚學術功底的「${courseName}」領域紀錄專家。

核心任務：
1. **精準轉錄**：將音檔轉化為文字，嚴禁濃縮。
2. **術語校對**：結合上傳的參考文件，修正專有名詞（如梵文譯名、佛教術語）。
3. **角色識別**：必須區分「老師：」與「學生 1：」、「學生 2：」等發言者。
4. **格式**：重要術語或結論以 **粗體** 標示。

請輸出 JSON 格式：
{
  "title": "正式標題",
  "content": "逐字稿全文"
}
`;

function cleanJsonString(jsonStr: string | undefined): string {
  if (!jsonStr) return '{}';
  return jsonStr.replace(/```json\n?/, '').replace(/```\n?$/, '').trim();
}

export async function transcribeAudio(
  audioParts: { data: string; mimeType: string }[], 
  referenceFiles: { data: string; mimeType: string }[],
  sessionTitle: string,
  courseName: string
): Promise<TranscriptionResult> {
  // Always initialize right before use to capture latest process.env.API_KEY
  const apiKey = (process as any).env?.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please authorize your key in the header.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const parts: any[] = [];
  for (const a of audioParts) {
    parts.push({ inlineData: { data: a.data, mimeType: a.mimeType } });
  }
  for (const f of referenceFiles) {
    parts.push({ inlineData: { data: f.data, mimeType: f.mimeType } });
  }
  
  parts.push({
    text: `講座主題：${sessionTitle}。請參考專業對照表進行校正：${ERROR_CORRECTION_TABLE}`
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
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

  const result = JSON.parse(cleanJsonString(response.text));
  
  return { 
    ...result, 
    id: `trans-${Date.now()}`, 
    timestamp: Date.now(), 
    courseName,
    latestVersion: 1,
    previousVersion: 0
  };
}

export async function generateStudyNotes(content: string, title: string, courseName: string): Promise<string> {
  const apiKey = (process as any).env?.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `主題：${title}\n\n內容：\n${content}`,
    config: {
      systemInstruction: `請為「${courseName}」課程內容生成精煉且具深度的學術筆記，使用 Markdown 格式，包含重點摘要、邏輯分析與專有名詞解釋。`,
      thinkingConfig: { thinkingBudget: 16384 },
    }
  });
  return response.text || "";
}
