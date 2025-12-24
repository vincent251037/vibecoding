import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { TranscriptionResult } from "../types";

const ERROR_CORRECTION_TABLE = `
【學術術語修正對照表 - 優先參考】
- 上升緊繃 -> 上身緊繃
- 水路法會 -> 水陸法會
- 這個大象 -> 這個大項
- 大聊 -> 大寮
- 學期初的產物 -> 學期初的禪五
- 海英三昧 -> 海印三昧
- 產眾 -> 禪眾
- 穿堂 -> 川堂
- 戶外盡情 -> 戶外經行
- 有一展燈 -> 有一盞燈
- 阿賴也是 -> 阿賴耶識
- 助理獎學 -> 助理監香
- 路上的數字 -> 路上的樹枝
- 人生繪圖 -> 人間穢土
- 戶外止觀 -> 戶外直觀
- 氣理 -> 契理
- 由無著整理 -> 由無著成立
- 法稱提出形象視為有垢論 -> 法稱出形象虛偽有垢論
- 骯髒氣承認形象是為有垢論 -> 寶藏寂承認形象虛偽有垢論
- 中部著重在「中觀瑜伽」中和學派 -> 寂護著重在「中觀瑜伽」綜合學派
- 境不離識，即由心自體決定境義 -> 境不離心，即由心自體決定境義
- 無形象知識論 -> 無形相知識論
- 新意識 -> 心意識
- 末那是思量名 -> 末那是思量義
- 風火浪 -> 瘋狗浪
`;

const getSystemInstruction = (courseName: string, sessionTitle: string) => `
你是一位具備深厚學術功底的「${courseName}」領域紀錄專家。你目前正在處理一場主題為「${sessionTitle}」的極高專業度學術講座錄音。

你的核心任務是執行【精準學術轉錄】：

1. **依據主題優化術語識別**：
   - 本次講座的特定主題是：【${sessionTitle}】。
   - 請結合提供的輔助參考文件，將音檔中的專有名詞與參考文件中的文字進行比對與校對。

2. **強制術語修正**：
   - 以下是已知的 AI 易錯字詞修正表，轉錄時若聽到類似發音，請務必使用右側正確詞彙：
   ${ERROR_CORRECTION_TABLE}

3. **發言者識別與標記 (核心要求)**：
   - **必須區分老師與學生**。
   - 使用「老師：」標記主要講授者。
   - **區分不同學生**：若有多位學生參與討論或發問，請根據聲音特徵與對話邏輯區分為「學生 1：」、「學生 2：」、「學生 3：」等。

4. **語境敏感的文字還原**：
   - 將音檔轉化為文字，**嚴禁刪減、濃縮或摘要**。保持原始語氣但修正贅詞。
   - **過濾口頭禪**：自動移除「呃」、「然後」、「那個」等冗餘詞。

5. **格式規範**：
   - 保持原始段落感。重要學術術語或論點以 **粗體** 標示。
   - 遇到無法辨識的模糊片段，請標註 [??]。

輸出格式必須為嚴格的 JSON：
- title: 講座正式標題
- content: 完整的逐字稿（每行開頭必須包含發言者標籤，如「老師：...」或「學生 1：...」）
`;

const getNotesSystemInstruction = (courseName: string) => `
你是一位資深的學術研究員，擅長將繁瑣的「${courseName}」講座內容轉化為「研究生級別」的學習筆記。
請根據逐字稿，建構具備歷史背景、核心論點、術語對照、邏輯架構、文獻引用與學術反思的 Markdown 筆記。
風格要求：嚴謹、專業、排版美觀。
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
    const parts: any[] = [
      ...audioParts.map((audio) => ({
        inlineData: {
          data: audio.data,
          mimeType: audio.mimeType
        }
      })),
      ...referenceFiles.map(file => ({
        inlineData: {
          data: file.data,
          mimeType: file.mimeType
        }
      })),
      {
        text: `【當前主題】本次講座標題為「${sessionTitle}」，屬於「${courseName}」領域。
        【操作要求】請區分「老師」與「學生 1, 2...」。
        【參考文件說明】優先參考輔助文件與修正表進行學術校對：${ERROR_CORRECTION_TABLE}`
      }
    ];

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

    const cleanedText = cleanJsonString(response.text || '{}');
    const result = JSON.parse(cleanedText);
    return { ...result, id: '', timestamp: 0 }; 
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error("轉錄處理失敗。建議檢查音檔長度，或嘗試分段處理。");
  }
}

export async function generateStudyNotes(content: string, title: string, courseName: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `請針對「${courseName}」講座進行深度筆記整理：\n\n主題：${title}\n\n逐字稿內容：\n${content}`,
      config: {
        systemInstruction: getNotesSystemInstruction(courseName),
        thinkingConfig: { thinkingBudget: 16384 },
      }
    });

    return response.text || "無法產生筆記內容。";
  } catch (error) {
    console.error("Notes error:", error);
    throw new Error("筆記整理失敗。");
  }
}