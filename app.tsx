
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

  const startTranscription = async () => {
    if (audioFiles.length === 0) return;
    setStatus(AppStatus.PROCESSING);
    setProgress(15);
    try {
      // 模擬進度提升
      const timer = setInterval(() => setProgress(prev => prev < 90 ? prev + 5 : prev), 2000);
      const result = await transcribeAudio(audioFiles, referenceFiles, sessionTitle || "未命名講座", selectedCourse);
      clearInterval(timer);
      setProgress(100);
      
      setLibrary(prev => [result, ...prev]);
      setActiveResult(result);
      setViewMode('transcript');
      setStatus(AppStatus.COMPLETED);
      setAudioFiles([]);
      setReferenceFiles([]); // 完成後清除輔助文件
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
            className="bg-white border-2 border-[#e6d5b8] rounded-lg px-4 py-2 outline-none focus:border-[#7c2d12] shadow-sm"
          >
            {courses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </header>

      <main className="max-w-5xl mx-auto space-y-8">
        {/* 上傳與設定區域 */}
        <section className="bg-white rounded-2xl p-8 shadow-sm border border-[#e6d5b8]">
          <div className="grid md:grid-cols-2 gap-10">
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-[#7c2d12] mb-2 uppercase tracking-widest">課程主題</label>
                <input 
                  value={sessionTitle} 
                  onChange={e => setSessionTitle(e.target.value)} 
                  placeholder="輸入本次講座主題或章節..." 
                  className="w-full p-4 bg-[#fdfaf3] border border-[#e6d5b8] rounded-xl outline-none focus:ring-2 ring-[#7c2d12]/20" 
                />
              </div>

              {/* 錄音檔管理區 */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-[#7c2d12] uppercase tracking-widest flex justify-between">
                  <span>待轉錄音檔 ({audioFiles.length})</span>
                  <span className="text-[10px] text-[#9a3412]/50 italic">支援 mp3, wav, m4a...</span>
                </label>
                <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-[#fffcf5] border border-dashed border-[#e6d5b8] rounded-xl">
                  {audioFiles.map((f, i) => (
                    <div key={i} className="bg-[#7c2d12] text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 shadow-sm animate-fade-in">
                      <i className="fa-solid fa-microphone-lines text-[10px]"></i>
                      <span className="max-w-[120px] truncate">{f.name}</span>
                      <button onClick={() => setAudioFiles(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-red-300 transition-colors">
                        <i className="fa-solid fa-circle-xmark"></i>
                      </button>
                    </div>
                  ))}
                  <label className="cursor-pointer bg-[#7c2d12] text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-[#9a3412] transition-all flex items-center gap-2">
                    <input type="file" className="hidden" accept="audio/*" multiple onChange={e => e.target.files && processFiles(e.target.files, true)} />
                    <i className="fa-solid fa-plus"></i> 加入音檔
                  </label>
                </div>
              </div>

              {/* 參考文件管理區 (輔助辨識文件) */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-[#7c2d12] uppercase tracking-widest flex justify-between">
                  <span>輔助辨識文件 ({referenceFiles.length})</span>
                  <span className="text-[10px] text-[#9a3412]/50 italic">上傳術語表、講義 PDF 或筆記照片</span>
                </label>
                <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-[#fdfaf3] border border-dashed border-[#e6d5b8] rounded-xl">
                  {referenceFiles.map((f, i) => (
                    <div key={i} className="bg-[#e6d5b8] text-[#7c2d12] px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 border border-[#d4bd94] shadow-sm animate-fade-in">
                      <i className="fa-solid fa-file-contract text-[10px]"></i>
                      <span className="max-w-[120px] truncate">{f.name}</span>
                      <button onClick={() => setReferenceFiles(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-red-600 transition-colors">
                        <i className="fa-solid fa-circle-xmark"></i>
                      </button>
                    </div>
                  ))}
                  <label className="cursor-pointer bg-white text-[#7c2d12] border-2 border-[#e6d5b8] px-4 py-1.5 rounded-lg text-xs font-bold hover:border-[#7c2d12] transition-all flex items-center gap-2">
                    <input type="file" className="hidden" accept="image/*,.pdf,.txt,.docx" multiple onChange={e => e.target.files && processFiles(e.target.files, false)} />
                    <i className="fa-solid fa-paperclip"></i> 附上參考資料
                  </label>
                </div>
                <p className="text-[10px] text-stone-400 italic">※ AI 將讀取這些資料來修正轉錄中的專有名詞與人名</p>
              </div>
            </div>

            <div className="flex flex-col justify-center items-center gap-6 border-l border-[#e6d5b8] pl-10">
              <div className="w-full space-y-2">
                {status === AppStatus.PROCESSING && (
                  <>
                    <div className="flex justify-between text-xs font-bold text-[#7c2d12]">
                      <span>學術分析中...</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-[#e6d5b8] h-2 rounded-full overflow-hidden">
                      <div className="bg-[#7c2d12] h-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                    </div>
                  </>
                )}
              </div>
              <button 
                onClick={startTranscription} 
                disabled={audioFiles.length === 0 || status === AppStatus.PROCESSING} 
                className={`w-full py-5 rounded-2xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-3
                  ${audioFiles.length === 0 ? 'bg-stone-200 text-stone-400 cursor-not-allowed shadow-none' : 'bg-[#7c2d12] text-white hover:bg-[#9a3412] hover:-translate-y-1'}`}
              >
                {status === AppStatus.PROCESSING ? (
                  <i className="fa-solid fa-spinner fa-spin"></i>
                ) : (
                  <i className="fa-solid fa-scroll"></i>
                )}
                啟動學術轉錄
              </button>
            </div>
          </div>
        </section>

        {/* 歷史紀錄橫軸 */}
        {library.length > 0 && (
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
            {library.map(doc => (
              <div 
                key={doc.id} 
                onClick={() => { setActiveResult(doc); setViewMode('transcript'); }} 
                className={`min-w-[200px] p-4 rounded-xl border-2 cursor-pointer transition-all flex-shrink-0 relative overflow-hidden
                  ${activeResult?.id === doc.id ? 'border-[#7c2d12] bg-[#fffcf5] shadow-md' : 'border-[#e6d5b8] bg-white hover:border-[#7c2d12]'}`}
              >
                <div className="text-[9px] text-[#9a3412] font-bold mb-1 opacity-70 uppercase tracking-tighter">{doc.courseName}</div>
                <div className="font-bold text-sm line-clamp-1">{doc.title}</div>
                <div className="text-[10px] text-stone-400 mt-2">{new Date(doc.timestamp).toLocaleDateString()}</div>
                {activeResult?.id === doc.id && <div className="absolute top-0 right-0 bg-[#7c2d12] text-white p-1 rounded-bl-lg"><i className="fa-solid fa-check text-[8px]"></i></div>}
              </div>
            ))}
          </div>
        )}

        {/* 內容展示區域 */}
        {activeResult && (
          <div className="bg-white rounded-2xl shadow-2xl border border-[#e6d5b8] overflow-hidden animate-slide-up">
            <div className="bg-[#7c2d12] text-white p-6 flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <h2 className="font-bold text-xl">{activeResult.title}</h2>
                <span className="text-xs opacity-80 italic">{activeResult.courseName}</span>
              </div>
              <div className="flex gap-2 bg-[#9a3412]/30 p-1 rounded-xl">
                <button 
                  onClick={() => setViewMode('transcript')} 
                  className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'transcript' ? 'bg-white text-[#7c2d12] shadow-md' : 'text-white hover:bg-[#9a3412]'}`}
                >
                  <i className="fa-solid fa-align-left mr-2"></i>逐字稿
                </button>
                <button 
                  onClick={handleGenerateNotes} 
                  className={`px-5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2
                    ${viewMode === 'latest_notes' ? 'bg-white text-[#7c2d12] shadow-md' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {isGeneratingNotes ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-brain"></i>}
                  {activeResult.notesLatest ? `筆記 v${activeResult.latestVersion}` : '生成筆記'}
                </button>
                <button 
                  onClick={() => download('doc')} 
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-[#9a3412] text-white hover:bg-[#7c2d12] transition-colors"
                  title="匯入為 Word 檔"
                >
                  <i className="fa-solid fa-file-export"></i>
                </button>
              </div>
            </div>
            
            <div className="relative">
              <div className="p-10 h-[600px] overflow-y-auto whitespace-pre-wrap leading-relaxed text-lg font-serif bg-[#fdfaf3] selection:bg-[#7c2d12]/10">
                {viewMode === 'transcript' && (
                  <div className="prose prose-stone max-w-none">
                    {activeResult.content}
                  </div>
                )}
                {viewMode === 'latest_notes' && (
                  <div className="prose prose-stone max-w-none">
                    {activeResult.notesLatest || <div className="flex flex-col items-center justify-center h-full text-stone-400 italic"><i className="fa-solid fa-wand-sparkles text-4xl mb-4 animate-bounce"></i>正在為您梳理課程精華...</div>}
                  </div>
                )}
                {viewMode === 'previous_notes' && (
                  <div className="prose prose-stone max-w-none">
                    <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 text-sm italic text-yellow-800">您正在查看過往版本 (v{activeResult.previousVersion})</div>
                    {activeResult.notesPrevious}
                  </div>
                )}
              </div>
              
              {/* 浮動水印 */}
              <div className="absolute bottom-4 right-4 opacity-10 pointer-events-none select-none">
                <i className="fa-solid fa-dharmachakra text-8xl"></i>
              </div>
            </div>

            {activeResult.notesPrevious && viewMode !== 'previous_notes' && (
              <div className="p-4 bg-[#e6d5b8]/30 text-center border-t border-[#e6d5b8]">
                <button onClick={() => setViewMode('previous_notes')} className="text-xs text-[#7c2d12] font-bold underline hover:text-[#9a3412] flex items-center justify-center gap-2 mx-auto">
                  <i className="fa-solid fa-clock-rotate-left"></i> 回溯上一版筆記 (v{activeResult.previousVersion})
                </button>
              </div>
            )}
          </div>
        )}
      </main>
      
      <footer className="text-center mt-20 pb-10">
        <div className="text-[#9a3412]/30 text-sm italic">學術紀錄自動化系統 v2.3 (Academic Edition)</div>
        <div className="flex justify-center gap-6 mt-4 text-[#7c2d12]/20 text-xl">
          <i className="fa-solid fa-book-open"></i>
          <i className="fa-solid fa-om"></i>
          <i className="fa-solid fa-pen-nib"></i>
        </div>
      </footer>

      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
        .animate-slide-up { animation: slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-spin-slow { animation: spin 8s linear infinite; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default App;
