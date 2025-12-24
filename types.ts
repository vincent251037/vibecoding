
export interface TranscriptSegment {
  startTime?: string;
  text: string;
}

export interface TranscriptionResult {
  id: string;
  title: string;
  content: string;
  timestamp: number;
  courseName?: string;
  notesLatest?: string;   // 最新版筆記
  notesPrevious?: string; // 上一版（舊版）筆記
  latestVersion?: number; // 最新版次
  previousVersion?: number; // 前一版次
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}
