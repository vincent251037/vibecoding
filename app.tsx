
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
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [library, setLibrary] = useState<TranscriptionResult[]>([]);
  const [activeResult, setActiveResult] = useState<TranscriptionResult | null>(null);
  const [viewMode, setViewMode] = useState<'transcript' | 'latest_notes' | 'previous_notes'>('transcript');
  
  const [audioFiles, setAudioFiles] = useState<FileData[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<FileData[]>([]);
  const [sessionTitle, setSessionTitle] = useState("");
  const [progress, setProgress] = useState(0);
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);

  // 拖放狀態
  const [isDraggingAudio, setIsDraggingAudio] = useState(false);
  const [isDraggingRef, setIsDraggingRef] = useState(false);

  useEffect(() => {
    if (audioFiles.length === 0) {
      const date = new Date().toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
      setSessionTitle(`${date} ${selectedCourse} 課程紀錄`);
    }
  }, [selectedCourse, audioFiles.length]);

  const processFiles = async (files: FileList | File[], isAudio: boolean) => {
    const filesArray = Array.from(files);
    for (const file of filesArray) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        const fileData = { 
          name: file.name, 
          data: base64, 
          mimeType: file.type, 
          preview: (file.type.startsWith('image') || file.type.includes('pdf')) ? (reader.result as string) : undefined 
        };
        if (isAudio) {
          setAudioFiles(prev => [...prev, fileData]);
        } else {
          setReferenceFiles(prev => [...prev, fileData]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrag = (e: React.DragEvent, setDragging: (val: boolean) => void) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragging(true);
    } else if (e.type === "dragleave") {
      setDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent, isAudio: boolean, setDragging: (val: boolean) => void) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files, isAudio);
    }
  };

  const startTranscription = async () => {
    if (audioFiles.length === 0) return;
    setStatus(AppStatus.PROCESSING);
    setProgress(15);
    try {
      const timer = setInterval(() => setProgress(prev => prev < 90 ? prev + 5 : prev), 2000);
      const result = await transcribeAudio(audioFiles, referenceFiles, sessionTitle || "未命名講座", selectedCourse);
      clearInterval(timer);
      setProgress(100);
      
      setLibrary(prev => [result, ...prev]);
      setActiveResult(result);
      setViewMode('transcript');
      setStatus(AppStatus.COMPLETED);
      setAudioFiles([]);
      setReferenceFiles([]);
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
      <header className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center mb-10 border-b-2 border-[#e6d5b8] pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#7c2d12] flex items-center gap-3">
            <i className="fa-solid fa-dharmachakra animate-spin-slow"></i> 印度佛教史轉錄專家
          </h1>
          <p className="text-[#9a3412] mt-1 italic flex items-center gap-2">
            <i className="fa-solid fa-feather-pointed"></i> 學術校對與多版本筆記管理系統
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[#7c2d12]">目前課程：</span>
          <select 
            value={selectedCourse} 
            onChange={(e) => setSelectedCourse(e.target.value)} 
            className="bg-white border-2 border-[#e6d5b8] rounded-lg px-4 py-2 outline-none focus:border-[#7c2d12] shadow-sm transition-all"
          >
            {courses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </header>

      <main className="max-w-5xl mx-auto space-y-8">
        <section className="bg-white rounded-2xl p-8 shadow-sm border border-[#e6d5b8]">
          <div className="grid md:grid-cols-2 gap-10">
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-[#7c2d12] mb-2 uppercase tracking-widest">課程主題</label>
                <input 
                  value={sessionTitle} 
                  onChange={e => setSessionTitle(e.target.value)} 
                  placeholder="輸入本次講座主題或章節..." 
                  className="w-full p-4 bg-[#fdfaf3] border border-[#e6d5b8] rounded-xl outline-none focus:ring-2 ring-[#7c2d12]/20 transition-all" 
                />
              </div>

              {/* 錄音檔拖放區域 */}
              <div 
                className={`space-y-3 p-4 rounded-xl border-2 border-dashed transition-all duration-300 ${isDraggingAudio ? 'border-[#7c2d12] bg-[#7c2d12]/5' : 'border-[#e6d5b8] bg-[#fffcf5]'}`}
                onDragEnter={(e) => handleDrag(e, setIsDraggingAudio)}
                onDragOver={(e) => handleDrag(e, setIsDraggingAudio)}
                onDragLeave={(e) => handleDrag(e, setIsDraggingAudio)}
                onDrop={(e) => handleDrop(e, true, setIsDraggingAudio)}
              >
                <label className="block text-xs font-bold text-[#7c2d12] uppercase tracking-widest flex justify-between">
                  <span>待轉錄音檔 ({audioFiles.length})</span>
                  <span className="text-[10px] text-[#9a3412]/50 italic">支援拖放音檔至此</span>
                </label>
                <div className="flex flex-wrap gap-2 min-h-[40px]">
                  {audioFiles.map((f, i) => (
                    <div key={i} className="bg-[#7c2d12] text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 shadow-sm animate-fade-in group">
                      <i className="fa-solid fa-microphone-lines text-[10px]"></i>
                      <span className="max-w-[120px] truncate">{f.name}</span>
                      <button onClick={() => setAudioFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-white/50 group-hover:text-red-300 transition-colors">
                        <i className="fa-solid fa-circle-xmark"></i>
                      </button>
                    </div>
                  ))}
                  <label className="cursor-pointer bg-[#7c2d12] text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-[#9a3412] transition-all flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95">
                    <input type="file" className="hidden" accept="audio/*" multiple onChange={e => e.target.files && processFiles(e.target.files, true)} />
                    <i className="fa-solid fa-plus"></i> 選取檔案
                  </label>
                </div>
              </div>

              {/* 輔助辨識文件拖放區域 */}
              <div 
                className={`space-y-3 p-4 rounded-xl border-2 border-dashed transition-all duration-300 ${isDraggingRef ? 'border-[#9a3412] bg-[#9a3412]/5' : 'border-[#e6d5b8] bg-[#fdfaf3]'}`}
                onDragEnter={(e) => handleDrag(e, setIsDraggingRef)}
                onDragOver={(e) => handleDrag(e, setIsDraggingRef)}
                onDragLeave={(e) => handleDrag(e, setIsDraggingRef)}
                onDrop={(e) => handleDrop(e, false, setIsDraggingRef)}
              >
                <label className="block text-xs font-bold text-[#7c2d12] uppercase tracking-widest flex justify-between">
                  <span>輔助辨識文件 ({referenceFiles.length})</span>
                  <span className="text-[10px] text-[#9a3412]/50 italic">支援 PDF, Word, 圖片拖放</span>
                </label>
                <div className="flex flex-wrap gap-2 min-h-[40px]">
                  {referenceFiles.map((f, i) => (
                    <div key={i} className="bg-[#e6d5b8] text-[#7c2d12] px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 border border-[#d4bd94] shadow-sm animate-fade-in group">
                      <i className="fa-solid fa-file-contract text-[10px]"></i>
                      <span className="max-w-[120px] truncate">{f.name}</span>
                      <button onClick={() => setReferenceFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-[#7c2d12]/40 group-hover:text-red-600 transition-colors">
                        <i className="fa-solid fa-circle-xmark"></i>
                      </button>
                    </div>
                  ))}
                  <label className="cursor-pointer bg-white text-[#7c2d12] border border-[#e6d5b8] px-4 py-1.5 rounded-lg text-xs font-bold hover:border-[#7c2d12] transition-all flex items-center gap-2 shadow-sm active:scale-95">
                    <input type="file" className="hidden" accept="image/*,.pdf,.txt,.docx" multiple onChange={e => e.target.files && processFiles(e.target.files, false)} />
                    <i className="fa-solid fa-paperclip"></i> 附上資料
                  </label>
                </div>
                <p className="text-[10px] text-stone-400 italic">※ AI 將讀取資料修正專有名詞（如：部派名稱、梵文譯音）</p>
              </div>
            </div>

            <div className="flex flex-col justify-center items-center gap-6 border-l border-[#e6d5b8] pl-10">
              <div className="w-full space-y-2">
                {status === AppStatus.PROCESSING && (
                  <>
                    <div className="flex justify-between text-xs font-bold text-[#7c2d12]">
                      <span>深度學術語義分析中...</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-[#e6d5b8] h-2 rounded-full overflow-hidden">
                      <div className="bg-[#7c2d12] h-full transition-all duration-700 ease-in-out" style={{ width: `${progress}%` }}></div>
                    </div>
                  </>
                )}
              </div>
              <button 
                onClick={startTranscription} 
                disabled={audioFiles.length === 0 || status === AppStatus.PROCESSING} 
                className={`w-full py-6 rounded-2xl font-bold text-xl shadow-xl transition-all flex items-center justify-center gap-4 active:scale-[0.98]
                  ${audioFiles.length === 0 ? 'bg-stone-200 text-stone-400 cursor-not-allowed shadow-none' : 'bg-[#7c2d12] text-[#fffcf5] hover:bg-[#4a1c0b] hover:shadow-[#7c2d12]/20'}`}
              >
                {status === AppStatus.PROCESSING ? (
                  <i className="fa-solid fa-dharmachakra fa-spin text-2xl"></i>
                ) : (
                  <i className="fa-solid fa-scroll text-2xl"></i>
                )}
                {status === AppStatus.PROCESSING ? "分析進行中..." : "啟動學術轉錄"}
              </button>
            </div>
          </div>
        </section>

        {library.length > 0 && (
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
            {library.map(doc => (
              <div 
                key={doc.id} 
                onClick={() => { setActiveResult(doc); setViewMode('transcript'); }} 
                className={`min-w-[220px] p-5 rounded-xl border-2 cursor-pointer transition-all flex-shrink-0 relative overflow-hidden
                  ${activeResult?.id === doc.id ? 'border-[#7c2d12] bg-[#fffcf5] shadow-lg -translate-y-1' : 'border-[#e6d5b8] bg-white hover:border-[#7c2d12] hover:bg-stone-50'}`}
              >
                <div className="text-[10px] text-[#9a3412] font-black mb-1 opacity-70 uppercase tracking-widest">{doc.courseName}</div>
                <div className="font-bold text-base line-clamp-1 text-[#2d2d2d]">{doc.title}</div>
                <div className="text-[11px] text-stone-400 mt-3 flex items-center justify-between">
                  <span>{new Date(doc.timestamp).toLocaleDateString()}</span>
                  <i className="fa-solid fa-chevron-right text-[8px] opacity-30"></i>
                </div>
                {activeResult?.id === doc.id && (
                  <div className="absolute top-0 right-0 bg-[#7c2d12] text-white px-2 py-1 rounded-bl-lg shadow-sm animate-fade-in">
                    <i className="fa-solid fa-check text-[10px]"></i>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeResult && (
          <div className="bg-white rounded-2xl shadow-2xl border border-[#e6d5b8] overflow-hidden animate-slide-up">
            <div className="bg-[#7c2d12] text-white p-7 flex flex-col md:flex-row justify-between items-center gap-6 border-b-4 border-[#e6d5b8]/20">
              <div className="flex items-center gap-5">
                <div className="bg-white/20 p-3 rounded-xl">
                  <i className="fa-solid fa-book-quran text-3xl"></i>
                </div>
                <div>
                  <h2 className="font-bold text-2xl tracking-tight">{activeResult.title}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-bold px-2 py-0.5 bg-white/10 rounded uppercase tracking-widest">{activeResult.courseName}</span>
                    <span className="text-[10px] opacity-60">ID: {activeResult.id.slice(0, 8)}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 bg-[#4a1c0b]/50 p-1.5 rounded-2xl border border-white/10">
                <button 
                  onClick={() => setViewMode('transcript')} 
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${viewMode === 'transcript' ? 'bg-[#fffcf5] text-[#7c2d12] shadow-inner' : 'text-white/80 hover:text-white hover:bg-white/5'}`}
                >
                  <i className="fa-solid fa-align-left"></i>逐字稿
                </button>
                <button 
                  onClick={handleGenerateNotes} 
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2
                    ${viewMode === 'latest_notes' ? 'bg-[#fffcf5] text-[#7c2d12] shadow-inner' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {isGeneratingNotes ? <i className="fa-solid fa-dharmachakra fa-spin"></i> : <i className="fa-solid fa-wand-magic-sparkles"></i>}
                  {activeResult.notesLatest ? `筆記 v${activeResult.latestVersion}` : '生成學術筆記'}
                </button>
                <div className="w-[1px] bg-white/10 mx-1"></div>
                <button 
                  onClick={() => download('doc')} 
                  className="px-4 py-2.5 rounded-xl text-sm font-bold bg-[#9a3412] text-white hover:bg-red-900 transition-all shadow-md active:scale-95"
                  title="匯出為 Word"
                >
                  <i className="fa-solid fa-file-arrow-down"></i>
                </button>
              </div>
            </div>
            
            <div className="relative">
              <div className="p-12 h-[650px] overflow-y-auto whitespace-pre-wrap leading-relaxed text-xl font-serif bg-[#fdfaf3] text-[#333] selection:bg-[#7c2d12]/20 scroll-smooth">
                {viewMode === 'transcript' && (
                  <div className="prose prose-stone prose-lg max-w-none">
                    <div className="mb-8 p-4 bg-stone-100 rounded-lg border-l-4 border-stone-300 italic text-stone-500 text-sm">
                      本內容已透過輔助文件進行學術術語校對與發言者識別。
                    </div>
                    {activeResult.content}
                  </div>
                )}
                {viewMode === 'latest_notes' && (
                  <div className="prose prose-stone prose-lg max-w-none">
                    {activeResult.notesLatest || (
                      <div className="flex flex-col items-center justify-center h-full text-stone-400">
                        <i className="fa-solid fa-pen-nib text-5xl mb-6 animate-pulse opacity-30"></i>
                        <p className="italic text-lg">正在構建學術架構與反思...</p>
                      </div>
                    )}
                  </div>
                )}
                {viewMode === 'previous_notes' && (
                  <div className="prose prose-stone prose-lg max-w-none">
                    <div className="mb-6 p-4 bg-orange-50 border-l-4 border-orange-400 text-sm italic text-orange-800 flex items-center gap-3">
                      <i className="fa-solid fa-history"></i>
                      您正在查看過往版本 (v{activeResult.previousVersion})，建議以此作為內容對比參考。
                    </div>
                    {activeResult.notesPrevious}
                  </div>
                )}
              </div>
              
              <div className="absolute bottom-8 right-8 opacity-[0.03] pointer-events-none select-none">
                <i className="fa-solid fa-om text-[200px]"></i>
              </div>
            </div>

            {activeResult.notesPrevious && viewMode !== 'previous_notes' && (
              <div className="p-5 bg-stone-100/50 text-center border-t border-[#e6d5b8]">
                <button onClick={() => setViewMode('previous_notes')} className="text-xs text-[#7c2d12] font-bold underline hover:text-[#9a3412] transition-colors flex items-center justify-center gap-2 mx-auto uppercase tracking-widest">
                  <i className="fa-solid fa-clock-rotate-left"></i> 回溯上一版筆記 (v{activeResult.previousVersion})
                </button>
              </div>
            )}
          </div>
        )}
      </main>
      
      <footer className="text-center mt-24 pb-16">
        <div className="max-w-md mx-auto h-[1px] bg-gradient-to-r from-transparent via-[#e6d5b8] to-transparent mb-8"></div>
        <div className="text-[#9a3412]/40 text-sm font-bold tracking-[0.2em] uppercase">Academic Transcriber System</div>
        <div className="text-[#9a3412]/20 text-xs mt-2 italic">Designed for Buddhist History & Philosophy Studies v2.3.1</div>
        <div className="flex justify-center gap-10 mt-8 text-[#7c2d12]/10 text-2xl">
          <i className="fa-solid fa-book-open hover:text-[#7c2d12]/40 transition-colors"></i>
          <i className="fa-solid fa-dharmachakra hover:text-[#7c2d12]/40 transition-colors"></i>
          <i className="fa-solid fa-scroll hover:text-[#7c2d12]/40 transition-colors"></i>
        </div>
      </footer>

      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slide-up { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.4s cubic-bezier(0.23, 1, 0.32, 1) forwards; }
        .animate-slide-up { animation: slide-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-spin-slow { animation: spin 12s linear infinite; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        
        ::selection {
          background-color: rgba(124, 45, 18, 0.15);
          color: #7c2d12;
        }

        /* 提升按鈕在不同瀏覽器下的渲染效果 */
        button:focus {
          outline: none;
        }
      `}</style>
    </div>
  );
};

export default App;
