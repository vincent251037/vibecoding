import React, { useState, useEffect, useRef } from 'react';
import { AppStatus, TranscriptionResult } from './types';
import { transcribeAudio, generateStudyNotes } from './services/geminiService';

interface FileData {
  name: string;
  data: string;
  mimeType: string;
  preview?: string;
}

const DEFAULT_COURSES = [
  "印度佛教史",
  "知識圖譜導論",
  "佛教數位典藏與佛學研究",
  "教育實踐與生命反應",
  "禪修專題",
  "初期大乘佛教的起源與開展"
];

const App: React.FC = () => {
  const [courses, setCourses] = useState<string[]>(() => {
    const saved = localStorage.getItem('user_courses');
    return saved ? JSON.parse(saved) : DEFAULT_COURSES;
  });
  const [selectedCourse, setSelectedCourse] = useState(courses[0]);
  const [isAddingCourse, setIsAddingCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");

  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [library, setLibrary] = useState<TranscriptionResult[]>([]);
  const [activeResult, setActiveResult] = useState<TranscriptionResult | null>(null);
  const [viewMode, setViewMode] = useState<'transcript' | 'latest_notes' | 'previous_notes'>('transcript');
  
  const [audioFiles, setAudioFiles] = useState<FileData[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<FileData[]>([]);
  const [sessionTitle, setSessionTitle] = useState("");
  const [progress, setProgress] = useState(0);
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  useEffect(() => {
    if (audioFiles.length === 0) setSessionTitle(`${new Date().toLocaleDateString()} ${selectedCourse}`);
  }, [selectedCourse, audioFiles.length]);

  const processFiles = async (files: FileList | File[]) => {
    const filesArray = Array.from(files);
    for (const file of filesArray) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        const fileData = { name: file.name, data: base64, mimeType: file.type, preview: (file.type.startsWith('image') || file.type.includes('pdf')) ? (reader.result as string) : undefined };
        if (file.type.startsWith('audio')) setAudioFiles(prev => [...prev.slice(-2), fileData]);
        else setReferenceFiles(prev => [...prev, fileData]);
      };
      reader.readAsDataURL(file);
    }
  };

  const startTranscription = async () => {
    if (audioFiles.length === 0) return;
    setStatus(AppStatus.PROCESSING);
    setProgress(10);
    try {
      const result = await transcribeAudio(audioFiles, referenceFiles, sessionTitle || "未命名講座", selectedCourse);
      setLibrary(prev => [result, ...prev]);
      setActiveResult(result);
      setViewMode('transcript');
      setStatus(AppStatus.COMPLETED);
      setAudioFiles([]);
    } catch (e) {
      setStatus(AppStatus.ERROR);
    }
  };

  const handleGenerateNotes = async () => {
    if (!activeResult) return;
    setIsGeneratingNotes(true);
    try {
      const notes = await generateStudyNotes(activeResult.content, activeResult.title, activeResult.courseName);
      const updated: TranscriptionResult = {
        ...activeResult,
        notesPrevious: activeResult.notesLatest,
        previousVersion: activeResult.latestVersion,
        notesLatest: notes,
        latestVersion: activeResult.latestVersion + 1
      };
      setActiveResult(updated);
      setLibrary(prev => prev.map(i => i.id === updated.id ? updated : i));
      setViewMode('latest_notes');
    } finally {
      setIsGeneratingNotes(false);
    }
  };

  const download = (format: 'txt' | 'doc') => {
    if (!activeResult) return;
    setIsExportMenuOpen(false);
    const content = viewMode === 'transcript' ? activeResult.content : (viewMode === 'latest_notes' ? activeResult.notesLatest : activeResult.notesPrevious);
    const blob = new Blob([content || ""], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeResult.title}_${viewMode}.${format}`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-[#fffcf5] text-[#2d2d2d] p-6 font-serif">
      <header className="max-w-5xl mx-auto flex justify-between items-center mb-10 border-b-2 border-[#e6d5b8] pb-4">
        <div>
          <h1 className="text-3xl font-bold text-[#7c2d12] flex items-center gap-3">
            <i className="fa-solid fa-dharmachakra"></i> 印度佛教史轉錄專家
          </h1>
          <p className="text-[#9a3412] mt-1 italic">學術校對與多版本筆記管理系統</p>
        </div>
        <select value={selectedCourse} onChange={(e) => setSelectedCourse(e.target.value)} className="bg-white border-2 border-[#e6d5b8] rounded-lg px-4 py-2 outline-none focus:border-[#7c2d12]">
          {courses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </header>

      <main className="max-w-5xl mx-auto space-y-8">
        <section className="bg-white rounded-2xl p-8 shadow-sm border border-[#e6d5b8]">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <input value={sessionTitle} onChange={e => setSessionTitle(e.target.value)} placeholder="講座主題..." className="w-full p-3 bg-[#fdfaf3] border border-[#e6d5b8] rounded-xl outline-none" />
              <div className="flex flex-wrap gap-2">
                {audioFiles.map((f, i) => <div key={i} className="bg-[#7c2d12] text-white px-3 py-1 rounded-full text-xs flex items-center gap-2">音檔: {f.name} <button onClick={() => setAudioFiles(prev => prev.filter((_, idx) => idx !== i))}>×</button></div>)}
                <label className="cursor-pointer bg-[#e6d5b8] text-[#7c2d12] px-4 py-1 rounded-full text-xs font-bold hover:bg-[#d4bd94]">
                  <input type="file" className="hidden" accept="audio/*" multiple onChange={e => e.target.files && processFiles(e.target.files)} />
                  + 加入音檔
                </label>
              </div>
            </div>
            <div className="flex flex-col justify-center">
              {status === AppStatus.PROCESSING ? (
                <div className="text-center font-bold text-[#7c2d12] animate-pulse">學術處理中... {progress}%</div>
              ) : (
                <button onClick={startTranscription} disabled={audioFiles.length === 0} className="bg-[#7c2d12] text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-[#9a3412] disabled:opacity-30 transition-all">啟動學術轉錄</button>
              )}
            </div>
          </div>
        </section>

        {library.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {library.map(doc => (
              <div key={doc.id} onClick={() => { setActiveResult(doc); setViewMode('transcript'); }} className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${activeResult?.id === doc.id ? 'border-[#7c2d12] bg-[#fffcf5]' : 'border-[#e6d5b8] bg-white hover:border-[#7c2d12]'}`}>
                <div className="text-[10px] text-[#9a3412] font-bold mb-1">{doc.courseName}</div>
                <div className="font-bold text-sm line-clamp-1">{doc.title}</div>
              </div>
            ))}
          </div>
        )}

        {activeResult && (
          <div className="bg-white rounded-2xl shadow-xl border border-[#e6d5b8] overflow-hidden">
            <div className="bg-[#7c2d12] text-white p-5 flex justify-between items-center">
              <h2 className="font-bold">{activeResult.title}</h2>
              <div className="flex gap-2">
                <button onClick={() => setViewMode('transcript')} className={`px-4 py-1 rounded-lg text-xs font-bold ${viewMode === 'transcript' ? 'bg-white text-[#7c2d12]' : 'bg-[#9a3412]'}`}>逐字稿</button>
                <button onClick={handleGenerateNotes} className={`px-4 py-1 rounded-lg text-xs font-bold bg-white text-[#7c2d12]`}>{isGeneratingNotes ? '整理中...' : activeResult.notesLatest ? `重新整理(v${activeResult.latestVersion+1})` : '整理筆記'}</button>
                <button onClick={() => download('doc')} className="px-4 py-1 rounded-lg text-xs font-bold bg-[#9a3412]"><i className="fa-solid fa-download"></i></button>
              </div>
            </div>
            <div className="p-8 h-[500px] overflow-y-auto whitespace-pre-wrap leading-relaxed text-lg font-serif bg-[#fdfaf3]">
              {viewMode === 'transcript' && activeResult.content}
              {viewMode === 'latest_notes' && (activeResult.notesLatest || "正在整理第 1 版筆記...")}
              {viewMode === 'previous_notes' && activeResult.notesPrevious}
            </div>
            {activeResult.notesPrevious && viewMode !== 'previous_notes' && (
              <div className="p-3 bg-[#e6d5b8]/30 text-center">
                <button onClick={() => setViewMode('previous_notes')} className="text-xs text-[#7c2d12] font-bold underline">查看上一版紀錄 (v{activeResult.previousVersion})</button>
              </div>
            )}
          </div>
        )}
      </main>
      <footer className="text-center mt-20 text-[#9a3412]/50 text-sm italic">學術紀錄自動化系統 v2.3</footer>
    </div>
  );
};

export default App;