export interface TranscriptSegment {
  startTime?: string;
  text: string;
}

export interface TranscriptionResult {
  id: string;
  title: string;
  content: string;
  timestamp: number;
  courseName: string;
  notesLatest?: string;   
  notesPrevious?: string; 
  latestVersion: number; 
  previousVersion: number; 
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}
