
import React, { useState, useEffect } from 'react';
import { AppStatus, TranscriptionResult } from './types';
import { transcribeAudio, generateStudyNotes } from './services/geminiService';

// Declare process to satisfy TypeScript compiler for process.env.API_KEY
declare var process: {
  env: {
    API_KEY: string;
  };
};

interface FileData {
  name: string;
  data: string;
  mimeType: string;
}

const DEFAULT_COURSES = [
  "印度佛教史",
  "知識圖譜導論",
  "佛教數位典藏與佛學研究",
  "教育實踐與生命反思",
  "禪修專題",
  "初期大乘佛教的起源與開展"
];

// Use a more robust way to handle window.aistudio to avoid TS errors
const getAiStudio = () => (window as any).aistudio;

const App: React.FC = () => {
  const [courses, setCourses] = useState<string[]>(() => {
    const saved = localStorage.getItem('user_courses');
    return saved ? JSON.parse(saved) : DEFAULT_COURSES;
  });
  const [selectedCourse, setSelectedCourse] = useState(courses[0]);
  const [isManageOpen, setIsManageOpen] = useState(false);
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

  const [isDraggingAudio, setIsDraggingAudio] = useState(false);
  const [isDraggingRef, setIsDraggingRef] = useState(false);

  useEffect(() => {
    localStorage.setItem('user_courses', JSON.stringify(courses));
  }, [courses]);

  // Initial key check on mount
  useEffect(() => {
    const checkKey = async () => {
      const aistudio = getAiStudio();
      if (aistudio) {
        const hasKey = await aistudio.hasSelectedApiKey();
        if (!hasKey) {
          console.log("No API Key selected yet.");
        }
      }
    };
    checkKey();
  }, []);

  // 1. 隨課程切換動態更新網頁標題與預設主題
  useEffect(() => {
    document.title = `${selectedCourse} 轉錄專家`;
    
    // 如果沒有音檔時，主題隨課程連動
    if (audioFiles.length === 0) {
      const date = new Date().toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
      setSessionTitle(`${date} ${selectedCourse} 課程紀錄`);
    }
  }, [selectedCourse, audioFiles.length]);

  const addCourse = () => {
    if (newCourseName.trim() && !courses.includes(newCourseName.trim())) {
      setCourses(prev => [...prev, newCourseName.trim()]);
      setSelectedCourse(newCourseName.trim());
      setNewCourseName("");
    }
  };

  const removeCourse = (name: string) => {
    if (courses.length <= 1) return;
    const updated = courses.filter(c => c !== name);
    setCourses(updated);
    if (selectedCourse === name) setSelectedCourse(updated[0]);
  };

  const processFiles = async (files: FileList | File[], isAudio: boolean) => {
    const filesArray = Array.from(files);
    
    // 2. 當有錄音檔上傳時，自動將「課程主題」更新為第一個錄音檔的檔名
    if (isAudio && filesArray.length > 0) {
      const fileNameWithoutExt = filesArray[0].name.replace(/\.[^/.]+$/, "");
      setSessionTitle(fileNameWithoutExt);
    }

    for (const file of filesArray) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        const fileData = { 
          name: file.name, 
          data: base64, 
          mimeType: file.type 
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent, isAudio: boolean, setDragging: (v: boolean) => void) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files, isAudio);
    }
  };

  const handleSelectApiKey = async () => {
    const aistudio = getAiStudio();
    if (aistudio) {
      await aistudio.openSelectKey();
    }
  };

  const handleStartTranscription = async () => {
    if (audioFiles.length === 0) return;

    const aistudio = getAiStudio();
    if (!aistudio) {
      alert("此環境不支援 API 金鑰選擇。");
      return;
    }

    try {
      const hasKey = await aistudio.hasSelectedApiKey();
      const currentKey = (process as any).env?.API_KEY;
      
      if (!hasKey || !currentKey) {
        alert("系統偵測到金鑰尚未設定。正在開啟授權視窗，請選取一個 API 金鑰。授權完成後，請再次點擊「啟動學術轉錄」。");
        await aistudio.openSelectKey();
        return;
      }

      setStatus(AppStatus.PROCESSING);
      setProgress(5);
      
      const timer = setInterval(() => setProgress(prev => prev < 95 ? prev + 2 : prev), 1000);
      
      const result = await transcribeAudio(audioFiles, referenceFiles, sessionTitle || "未命名講座", selectedCourse);
      
      clearInterval(timer);
      setProgress(100);
      
      setLibrary(prev => [result, ...prev]);
      setActiveResult(result);
      setViewMode('transcript');
      setStatus(AppStatus.COMPLETED);
      setAudioFiles([]);
      setReferenceFiles([]);
    } catch (e: any) {
      console.error("Transcription Failed:", e);
      setStatus(AppStatus.ERROR);
      
      // 針對 SDK 拋出的金鑰錯誤進行引導
      if (e.message?.includes("API Key must be set") || 
          e.message?.includes("Requested entity was not found") || 
          e.message?.includes("API Key is missing")) {
        alert("金鑰無效或尚未成功注入。請點擊右上角「授權金鑰」並重新選取金鑰。");
        await aistudio.openSelectKey();
      } else {
        alert(`轉錄失敗: ${e.message || "未知錯誤"}`);
      }
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
    } catch (e: any) {
      console.error("Notes error:", e);
      if (e.message?.includes("API Key must be set") || e.message?.includes("Requested entity was not found")) {
        alert("金鑰授權驗證失敗，請點擊上方「授權金鑰」重新選擇。");
        const aistudio = getAiStudio();
        if (aistudio) await aistudio.openSelectKey();
      } else {
        alert(`生成筆記失敗: ${e.message}`);
      }
    } finally {
      setIsGeneratingNotes(false);
    }
  };

  const downloadDoc = () => {
    if (!activeResult) return;
    const content = viewMode === 'transcript' ? activeResult.content : (activeResult.notesLatest || "");
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeResult.title}.txt`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-[#fffcf5] text-[#2d2d2d] p-6 font-serif">
      <header className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center mb-10 border-b-2 border-[#e6d5b8] pb-6 gap-4">
        <div className="animate-fade-in">
          <h1 className="text-3xl font-bold text-[#7c2d12] flex items-center gap-3">
            <i className={`fa-solid ${selectedCourse.includes("佛") ? 'fa-dharmachakra' : 'fa-brain'} animate-spin-slow`}></i> {selectedCourse}轉錄專家
          </h1>
          <p className="text-[#9a3412] mt-1 italic flex items-center gap-2">
            <i className="fa-solid fa-feather-pointed"></i> 學術校對與多版本筆記管理系統 (Flash 版)
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSelectApiKey}
            className="flex items-center gap-2 bg-[#d4a017] hover:bg-[#b8860b] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition-all active:scale-95"
            title="選取 API 金鑰"
          >
            <i className="fa-solid fa-key"></i> 授權金鑰
          </button>
          
          <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-[#e6d5b8]">
            <select 
              value={selectedCourse} 
              onChange={(e) => setSelectedCourse(e.target.value)} 
              className="bg-transparent px-4 py-2 outline-none text-sm font-medium"
            >
              {courses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button 
              onClick={() => setIsManageOpen(true)}
              className="w-8 h-8 rounded-lg bg-[#7c2d12] text-white flex items-center justify-center hover:bg-[#9a3412] transition-all"
            >
              <i className="fa-solid fa-list-ul text-xs"></i>
            </button>
          </div>
        </div>
      </header>

      {isManageOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsManageOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-[#e6d5b8] animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-[#7c2d12] text-xl">課程清單管理</h3>
              <button onClick={() => setIsManageOpen(false)}><i className="fa-solid fa-xmark text-xl text-stone-400"></i></button>
            </div>
            <div className="flex gap-2 mb-6">
              <input 
                value={newCourseName} 
                onChange={e => setNewCourseName(e.target.value)}
                placeholder="輸入新課程名稱..." 
                className="flex-1 p-3 bg-[#fdfaf3] border border-[#e6d5b8] rounded-xl outline-none"
                onKeyDown={e => e.key === 'Enter' && addCourse()}
              />
              <button onClick={addCourse} className="bg-[#7c2d12] text-white px-4 rounded-xl font-bold hover:bg-[#9a3412] transition-colors">新增</button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {courses.map(c => (
                <div key={c} className="flex justify-between items-center p-3 bg-stone-50 rounded-xl border border-stone-100 hover:bg-stone-100 transition-colors">
                  <span className="font-medium">{c}</span>
                  <button onClick={() => removeCourse(c)} className="text-stone-300 hover:text-red-500 transition-colors px-2">
                    <i className="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto space-y-8">
        <section className="bg-white rounded-2xl p-8 shadow-sm border border-[#e6d5b8]">
          <div className="grid md:grid-cols-2 gap-10">
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-[#7c2d12] mb-2 uppercase tracking-widest">課程主題</label>
                <div className="relative">
                  <input 
                    value={sessionTitle} 
                    onChange={e => setSessionTitle(e.target.value)} 
                    placeholder="輸入課程紀錄標題..." 
                    className="w-full p-4 bg-[#fdfaf3] border border-[#e6d5b8] rounded-xl outline-none focus:ring-2 ring-[#7c2d12]/20 transition-all text-lg font-medium" 
                  />
                  {audioFiles.length > 0 && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] bg-[#7c2d12]/10 text-[#7c2d12] px-2 py-1 rounded font-bold animate-pulse">檔名連動中</span>
                  )}
                </div>
              </div>

              <div 
                className={`group space-y-3 p-6 rounded-xl border-2 border-dashed transition-all relative ${isDraggingAudio ? 'border-[#7c2d12] bg-[#7c2d12]/5 scale-[1.01]' : 'border-[#e6d5b8] bg-[#fffcf5]'}`}
                onDragOver={handleDragOver}
                onDragEnter={() => setIsDraggingAudio(true)}
                onDragLeave={() => setIsDraggingAudio(false)}
                onDrop={(e) => handleDrop(e, true, setIsDraggingAudio)}
              >
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-[#7c2d12] uppercase tracking-widest">待轉錄音檔 ({audioFiles.length})</label>
                  <span className="text-[10px] text-[#9a3412]/50 italic">支援拖放音檔至此</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {audioFiles.map((f, i) => (
                    <div key={i} className="bg-[#7c2d12] text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 animate-fade-in shadow-sm">
                      <i className="fa-solid fa-microphone-lines"></i>
                      <span className="max-w-[150px] truncate">{f.name}</span>
                      <button onClick={() => setAudioFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-white/50 hover:text-white transition-colors">
                        <i className="fa-solid fa-circle-xmark"></i>
                      </button>
                    </div>
                  ))}
                  <label className="cursor-pointer bg-[#7c2d12] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#9a3412] transition-all flex items-center gap-2 shadow-md active:scale-95">
                    <input type="file" className="hidden" accept="audio/*" multiple onChange={e => e.target.files && processFiles(e.target.files, true)} />
                    <i className="fa-solid fa-plus"></i> 選取檔案
                  </label>
                </div>
              </div>

              <div 
                className={`group space-y-3 p-6 rounded-xl border-2 border-dashed transition-all relative ${isDraggingRef ? 'border-[#9a3412] bg-[#9a3412]/5 scale-[1.01]' : 'border-[#e6d5b8] bg-[#fdfaf3]'}`}
                onDragOver={handleDragOver}
                onDragEnter={() => setIsDraggingRef(true)}
                onDragLeave={() => setIsDraggingRef(false)}
                onDrop={(e) => handleDrop(e, false, setIsDraggingRef)}
              >
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-[#7c2d12] uppercase tracking-widest">輔助資料 ({referenceFiles.length})</label>
                  <span className="text-[10px] text-[#9a3412]/50 italic">校對參考用文件</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {referenceFiles.map((f, i) => (
                    <div key={i} className="bg-[#e6d5b8] text-[#7c2d12] px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 border border-[#d4bd94] animate-fade-in">
                      <i className="fa-solid fa-file-contract"></i>
                      <span className="max-w-[150px] truncate">{f.name}</span>
                      <button onClick={() => setReferenceFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-[#7c2d12]/40 hover:text-red-600 transition-colors">
                        <i className="fa-solid fa-circle-xmark"></i>
                      </button>
                    </div>
                  ))}
                  <label className="cursor-pointer bg-white text-[#7c2d12] border border-[#e6d5b8] px-4 py-2 rounded-lg text-xs font-bold hover:border-[#7c2d12] transition-all flex items-center gap-2 shadow-sm active:scale-95">
                    <input type="file" className="hidden" accept="image/*,.pdf,.txt,.docx" multiple onChange={e => e.target.files && processFiles(e.target.files, false)} />
                    <i className="fa-solid fa-paperclip"></i> 上傳資料
                  </label>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-center items-center gap-6 border-l border-[#e6d5b8] pl-10">
              <div className="w-full space-y-2">
                {status === AppStatus.PROCESSING && (
                  <>
                    <div className="flex justify-between text-xs font-bold text-[#7c2d12]">
                      <span>深度語義轉錄進行中...</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-[#e6d5b8] h-2 rounded-full overflow-hidden shadow-inner">
                      <div className="bg-gradient-to-r from-[#7c2d12] to-[#9a3412] h-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
                    </div>
                  </>
                )}
              </div>
              
              <button 
                onClick={handleStartTranscription} 
                disabled={audioFiles.length === 0 || status === AppStatus.PROCESSING} 
                className={`w-full py-6 rounded-2xl font-bold text-xl shadow-xl transition-all flex items-center justify-center gap-4 active:scale-[0.98]
                  ${audioFiles.length === 0 ? 'bg-stone-200 text-stone-400 cursor-not-allowed shadow-none' : 'bg-[#7c2d12] text-[#fffcf5] hover:bg-[#5d1a04] hover:shadow-[#7c2d12]/30 cursor-pointer'}`}
              >
                {status === AppStatus.PROCESSING ? (
                  <i className="fa-solid fa-dharmachakra fa-spin text-2xl"></i>
                ) : (
                  <i className="fa-solid fa-scroll text-2xl"></i>
                )}
                {status === AppStatus.PROCESSING ? "學術轉錄中..." : "啟動學術轉錄"}
              </button>
              <p className="text-[10px] text-stone-400 text-center px-6 italic">已切換至 Gemini 3.0 Flash 模型，轉錄速度更快。若出現金鑰錯誤，請重新授權。</p>
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
                  ${activeResult?.id === doc.id ? 'border-[#7c2d12] bg-[#fffcf5] shadow-lg -translate-y-1' : 'border-[#e6d5b8] bg-white hover:border-[#7c2d12]'}`}
              >
                <div className="text-[10px] text-[#9a3412] font-black mb-1 opacity-70 uppercase tracking-widest">{doc.courseName}</div>
                <div className="font-bold text-base line-clamp-1 text-[#2d2d2d]">{doc.title}</div>
                <div className="text-[11px] text-stone-400 mt-3">{new Date(doc.timestamp).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        )}

        {activeResult && (
          <div className="bg-white rounded-2xl shadow-2xl border border-[#e6d5b8] overflow-hidden animate-slide-up">
            <div className="bg-[#7c2d12] text-white p-7 flex flex-col md:flex-row justify-between items-center gap-6 border-b-4 border-[#e6d5b8]/20">
              <div className="flex items-center gap-5">
                <div className="bg-white/20 p-3 rounded-xl"><i className="fa-solid fa-book-quran text-3xl"></i></div>
                <div>
                  <h2 className="font-bold text-2xl tracking-tight">{activeResult.title}</h2>
                  <div className="mt-1"><span className="text-xs font-bold px-2 py-0.5 bg-white/10 rounded uppercase tracking-widest">{activeResult.courseName}</span></div>
                </div>
              </div>
              <div className="flex gap-3 bg-[#4a1c0b]/50 p-1.5 rounded-2xl border border-white/10">
                <button 
                  onClick={() => setViewMode('transcript')} 
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${viewMode === 'transcript' ? 'bg-[#fffcf5] text-[#7c2d12] shadow-inner' : 'text-white/80 hover:text-white'}`}
                >
                  逐字稿
                </button>
                <button 
                  onClick={handleGenerateNotes} 
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2
                    ${viewMode === 'latest_notes' ? 'bg-[#fffcf5] text-[#7c2d12] shadow-inner' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {isGeneratingNotes ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-wand-magic-sparkles"></i>}
                  {activeResult.notesLatest ? `學術筆記 v${activeResult.latestVersion}` : '生成學術筆記'}
                </button>
                <button onClick={downloadDoc} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-[#9a3412] text-white hover:bg-red-900 transition-all shadow-md">
                  <i className="fa-solid fa-file-arrow-down"></i>
                </button>
              </div>
            </div>
            
            <div className="p-12 h-[650px] overflow-y-auto whitespace-pre-wrap leading-relaxed text-xl font-serif bg-[#fdfaf3] text-[#333] custom-scrollbar">
              {viewMode === 'transcript' && (
                <div className="prose prose-stone prose-lg max-w-none">
                  {activeResult.content}
                </div>
              )}
              {viewMode === 'latest_notes' && (
                <div className="prose prose-stone prose-lg max-w-none">
                  {activeResult.notesLatest || <p className="text-stone-400 italic">學術筆記生成中...</p>}
                </div>
              )}
              {viewMode === 'previous_notes' && (
                <div className="prose prose-stone prose-lg max-w-none">
                  {activeResult.notesPrevious}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      
      <footer className="text-center mt-24 pb-16">
        <div className="text-[#9a3412]/40 text-sm font-bold tracking-[0.2em] uppercase">Academic Transcriber System</div>
        <div className="text-[#9a3412]/20 text-xs mt-2 italic tracking-widest">Digital Academic Support for Philosophy & History Studies</div>
      </footer>

      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slide-up { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
        .animate-slide-up { animation: slide-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-spin-slow { animation: spin 12s linear infinite; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e6d5b8; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #7c2d12; }
      `}</style>
    </div>
  );
};

export default App;
