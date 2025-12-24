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
  "知識圖譜導論",
  "印度佛教史",
  "佛教數位典藏與佛學研究",
  "教育實踐與生命反應",
  "禪修專題",
  "程式語言入門",
  "初期大乘佛教的起源與開展"
];

const App: React.FC = () => {
  const [courses, setCourses] = useState<string[]>(() => {
    const saved = localStorage.getItem('user_courses');
    return saved ? JSON.parse(saved) : DEFAULT_COURSES;
  });
  const [selectedCourse, setSelectedCourse] = useState(courses[1] || courses[0]); 
  const [isAddingCourse, setIsAddingCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");

  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [library, setLibrary] = useState<TranscriptionResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const [activeResult, setActiveResult] = useState<TranscriptionResult | null>(null);
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [viewMode, setViewMode] = useState<'transcript' | 'latest_notes' | 'previous_notes'>('transcript');
  
  const [error, setError] = useState<string | null>(null);
  const [audioFiles, setAudioFiles] = useState<FileData[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<FileData[]>([]);
  const [sessionTitle, setSessionTitle] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  
  const progressTimerRef = useRef<number | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  const getTodayDateString = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (audioFiles.length === 0) {
      setSessionTitle(`${getTodayDateString()} ${selectedCourse}`);
    }
  }, [selectedCourse, audioFiles.length]);

  useEffect(() => {
    localStorage.setItem('user_courses', JSON.stringify(courses));
  }, [courses]);

  useEffect(() => {
    if (status === AppStatus.PROCESSING) {
      setProgress(0);
      progressTimerRef.current = window.setInterval(() => {
        setProgress(prev => {
          if (prev >= 99) return prev;
          let increment = prev < 30 ? 0.6 : prev < 70 ? 0.3 : 0.05;
          return Math.min(prev + increment, 99);
        });
      }, 150);
    } else {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    }
    return () => { if (progressTimerRef.current) clearInterval(progressTimerRef.current); };
  }, [status]);

  const addCourse = () => {
    if (newCourseName.trim() && !courses.includes(newCourseName.trim())) {
      setCourses(prev => [...prev, newCourseName.trim()]);
      setSelectedCourse(newCourseName.trim());
      setNewCourseName("");
      setIsAddingCourse(false);
    }
  };

  const readFileAsBase64 = (file: File): Promise<FileData> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = (reader.result as string).split(',')[1];
        resolve({
          name: file.name,
          data: base64Data,
          mimeType: file.type,
          preview: (file.type.startsWith('image/') || file.type === 'application/pdf') ? (reader.result as string) : undefined
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async (files: FileList | File[]) => {
    const filesArray = Array.from(files);
    const audioFilesToRead = filesArray.filter(f => f.type.startsWith('audio/'));
    const refFilesToRead = filesArray.filter(f => 
      f.type.startsWith('image/') || 
      f.type === 'application/pdf' ||
      f.name.endsWith('.doc') || f.name.endsWith('.docx')
    );

    if (audioFilesToRead.length > 0) {
      const remainingSlots = 3 - audioFiles.length;
      const validAudio = audioFilesToRead.slice(0, Math.max(0, remainingSlots));
      const newAudios = await Promise.all(validAudio.map(readFileAsBase64));
      if (audioFiles.length === 0 && newAudios.length > 0) {
        const firstFileName = newAudios[0].name.replace(/\.[^/.]+$/, "");
        setSessionTitle(firstFileName);
      }
      setAudioFiles(prev => [...prev, ...newAudios]);
    }

    if (refFilesToRead.length > 0) {
      const newRefs = await Promise.all(refFilesToRead.map(readFileAsBase64));
      setReferenceFiles(prev => [...prev, ...newRefs]);
    }
  };

  const startTranscription = async () => {
    if (audioFiles.length === 0) return;
    setStatus(AppStatus.PROCESSING);
    setError(null);
    try {
      const finalTitle = sessionTitle.trim() || `${getTodayDateString()} ${selectedCourse}`;
      const data = await transcribeAudio(
        audioFiles.map(a => ({ data: a.data, mimeType: a.mimeType })),
        referenceFiles.map(ref => ({ data: ref.data, mimeType: ref.mimeType })),
        finalTitle,
        selectedCourse
      );
      setLibrary(prev => [data, ...prev]);
      setActiveResult(data);
      setViewMode('transcript');
      setStatus(AppStatus.COMPLETED);
      setAudioFiles([]);
      setTimeout(() => viewerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 500);
    } catch (err: any) {
      setError(err.message || '發生未知錯誤');
      setStatus(AppStatus.ERROR);
    }
  };

  const createStudyNotes = async () => {
    if (!activeResult) return;
    setIsGeneratingNotes(true);
    setError(null);
    
    const currentLatest = activeResult.notesLatest;
    const currentLatestVersion = activeResult.latestVersion || 0;
    
    try {
      const notes = await generateStudyNotes(activeResult.content, activeResult.title, activeResult.courseName || selectedCourse);
      
      const updatedResult: TranscriptionResult = {
        ...activeResult,
        notesLatest: notes,
        latestVersion: currentLatestVersion + 1,
        notesPrevious: currentLatest || activeResult.notesPrevious,
        previousVersion: currentLatest ? currentLatestVersion : activeResult.previousVersion
      };
      
      setActiveResult(updatedResult);
      setLibrary(prev => prev.map(item => item.id === updatedResult.id ? updatedResult : item));
      setViewMode('latest_notes');
    } catch (err: any) {
      setError('筆記整理失敗');
    } finally {
      setIsGeneratingNotes(false);
    }
  };

  const downloadDocument = (format: 'txt' | 'doc' | 'pdf') => {
    if (!activeResult) return;
    setIsExportMenuOpen(false); 

    let content = activeResult.content;
    let vText = "";
    if (viewMode === 'latest_notes' && activeResult.notesLatest) {
        content = `【第 ${activeResult.latestVersion} 版學術整理筆記】\n\n${activeResult.notesLatest}`;
        vText = ` (第 ${activeResult.latestVersion} 版)`;
    } else if (viewMode === 'previous_notes' && activeResult.notesPrevious) {
        content = `【第 ${activeResult.previousVersion} 版學術整理筆記】\n\n${activeResult.notesPrevious}`;
        vText = ` (第 ${activeResult.previousVersion} 版)`;
    }

    const title = activeResult.title + vText;

    if (format === 'pdf') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const html = `
          <html>
            <head>
              <meta charset="utf-8"><title>${title}</title>
              <style>
                body { font-family: 'PingFang TC', sans-serif; padding: 40px; line-height: 1.8; color: #333; }
                h1 { color: #7c2d12; border-bottom: 2px solid #7c2d12; padding-bottom: 10px; }
                .content { white-space: pre-wrap; font-size: 16px; }
              </style>
            </head>
            <body>
              <h1>${title}</h1>
              <div class="content">${content}</div>
            </body>
          </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.print();
      }
    } else if (format === 'doc') {
      const paragraphs = content.split('\n').map(line => `<p>${line.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')}</p>`).join('');
      const docHtml = `<html><body><h1>${title}</h1>${paragraphs}</body></html>`;
      const blob = new Blob([docHtml], { type: 'application/msword;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${title}.doc`;
      a.click();
    } else {
      const blob = new Blob(['\ufeff' + content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${title}.txt`;
      a.click();
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`確定要刪除這 ${selectedIds.length} 份文件嗎？`)) {
      setLibrary(prev => prev.filter(item => !selectedIds.includes(item.id)));
      if (activeResult && selectedIds.includes(activeResult.id)) setActiveResult(null);
      setSelectedIds([]);
    }
  };

  const mergeSelected = () => {
    const orderedItems = selectedIds.map(id => library.find(item => item.id === id)).filter((item): item is TranscriptionResult => !!item);
    if (orderedItems.length < 2) return;
    const mergedContent = orderedItems.map(item => `【原文件：${item.title}】\n${item.content}`).join('\n\n' + '='.repeat(20) + '\n\n');
    const newResult: TranscriptionResult = { 
      id: `trans-${crypto.randomUUID()}`, 
      title: `合併主題 - ${new Date().toLocaleDateString()}`, 
      content: mergedContent, 
      timestamp: Date.now(), 
      courseName: orderedItems[0].courseName, 
      latestVersion: 0, 
      previousVersion: 0 
    };
    setLibrary(prev => [newResult, ...prev]);
    setActiveResult(newResult);
    setSelectedIds([]);
    setViewMode('transcript');
  };

  return (
    <div className="min-h-screen bg-orange-50 text-stone-800 font-sans p-4 md:p-8">
      <header className="max-w-5xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-center gap-4 no-print">
        <div onClick={() => window.location.reload()} className="cursor-pointer group">
          <h1 className="text-3xl font-bold text-orange-900 mb-1 group-hover:text-orange-700 transition flex items-center gap-3">
            <i className="fa-solid fa-dharmachakra text-orange-700"></i>
            印度佛教史音檔轉錄專家
          </h1>
          <p className="text-orange-700 font-medium">精準學術轉錄・術語修正對照・智慧整理精華</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-orange-100">
          <select className="bg-transparent border-none focus:ring-0 text-orange-900 font-medium cursor-pointer" value={selectedCourse} onChange={(e) => setSelectedCourse(e.target.value)}>
            {courses.map(course => <option key={course} value={course}>{course}</option>)}
          </select>
          <button onClick={() => setIsAddingCourse(true)} className="p-1 hover:bg-orange-50 rounded-full text-orange-600 transition"><i className="fa-solid fa-plus text-lg"></i></button>
        </div>
      </header>

      {isAddingCourse && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-sm shadow-2xl">
            <h3 className="text-xl font-bold text-orange-900 mb-4">新增課程領域</h3>
            <input className="w-full px-4 py-2 border border-orange-200 rounded-lg mb-4 outline-none focus:ring-2 focus:ring-orange-300 transition" placeholder="領域名稱..." value={newCourseName} onChange={(e) => setNewCourseName(e.target.value)} autoFocus />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setIsAddingCourse(false)} className="px-4 py-2 text-stone-500">取消</button>
              <button onClick={addCourse} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition">確定</button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto space-y-8">
        <section className={`bg-white rounded-3xl p-8 shadow-xl border-2 border-dashed transition-all no-print ${isDragging ? 'border-orange-500 bg-orange-50 scale-[1.01]' : 'border-orange-200'}`} onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) processFiles(e.dataTransfer.files); }}>
          <div className="grid md:grid-cols-2 gap-10">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-orange-900 mb-2">講座主題 (轉錄核心參考)</label>
                <input className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-400 transition" value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} placeholder="例：印度佛教史-2：有相唯識與無相唯識" />
              </div>
              <div className="bg-orange-50/50 p-4 rounded-2xl border border-orange-100">
                <label className="block text-sm font-semibold text-orange-900 mb-2">錄音片段 ({audioFiles.length}/3)</label>
                <div className="flex flex-wrap gap-2">
                  {audioFiles.map((file, i) => (
                    <div key={i} className="px-3 py-2 bg-white border border-orange-200 text-orange-800 rounded-lg flex items-center gap-2 text-sm shadow-sm">
                      <i className="fa-solid fa-microphone text-orange-500"></i><span className="truncate max-w-[120px]">{file.name}</span>
                      <button onClick={() => setAudioFiles(prev => prev.filter((_, idx) => idx !== i))} className="font-bold hover:text-red-500 transition">×</button>
                    </div>
                  ))}
                  {audioFiles.length < 3 && (
                    <label className="px-4 py-2 bg-orange-600 text-white rounded-xl cursor-pointer hover:bg-orange-700 transition shadow-md text-sm font-bold flex items-center gap-2">
                      <input type="file" className="hidden" accept="audio/*" multiple onChange={(e) => e.target.files && processFiles(e.target.files)} />
                      <i className="fa-solid fa-plus"></i> 加入錄音
                    </label>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-orange-900 mb-2">輔助校對文件 (PDF/Word/圖片)</label>
                <div className="flex flex-wrap gap-2">
                  {referenceFiles.map((file, i) => (
                    <div key={i} className="relative group p-2 bg-white border border-stone-200 rounded-lg flex items-center gap-2 max-w-[160px] shadow-sm">
                      {file.mimeType.includes('image') ? <div className="w-8 h-8 rounded bg-stone-100 overflow-hidden"><img src={file.preview} className="w-full h-full object-cover" /></div> : <i className={`fa-solid ${file.mimeType.includes('pdf') ? 'fa-file-pdf text-red-500' : 'fa-file-word text-blue-600'} text-xl`}></i>}
                      <span className="text-[10px] truncate flex-1 font-medium">{file.name}</span>
                      <button onClick={() => setReferenceFiles(prev => prev.filter((_, idx) => idx !== i))} className="bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px] hover:bg-red-600 shadow-sm">×</button>
                    </div>
                  ))}
                  <label className="w-12 h-12 flex items-center justify-center bg-stone-50 border border-dashed border-stone-300 rounded-lg cursor-pointer text-stone-400 hover:border-orange-400 hover:text-orange-500 transition shadow-inner">
                    <input type="file" className="hidden" accept="image/*,application/pdf,.doc,.docx" multiple onChange={(e) => e.target.files && processFiles(e.target.files)} />
                    <i className="fa-solid fa-paperclip text-lg"></i>
                  </label>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center items-center p-8 border-l border-stone-100 space-y-5">
              {status === AppStatus.PROCESSING ? (
                <div className="w-full text-center space-y-5">
                  <div className="relative w-24 h-24 mx-auto">
                    <div className="w-24 h-24 border-8 border-orange-100 border-t-orange-600 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center text-orange-900 font-bold text-sm">{Math.floor(progress)}%</div>
                  </div>
                  <h3 className="text-xl font-bold text-orange-900">學術校對與角色區分中</h3>
                </div>
              ) : (
                <>
                  <button disabled={audioFiles.length === 0} onClick={startTranscription} className="w-full py-5 bg-orange-700 text-white rounded-2xl font-bold text-xl shadow-xl hover:bg-orange-800 disabled:opacity-40 flex items-center justify-center gap-3 transition-all hover:translate-y-[-2px] active:translate-y-[1px]">
                    <i className="fa-solid fa-feather-pointed"></i> 啟動精準轉錄
                  </button>
                  <div className="flex items-center gap-2 text-orange-800/60 text-xs font-bold uppercase tracking-wider">
                    <i className="fa-solid fa-users-viewfinder"></i> 自動區分老師與不同學生
                  </div>
                </>
              )}
              {error && <div className="p-4 bg-red-50 text-red-700 rounded-xl text-xs font-bold border border-red-100 shadow-sm">{error}</div>}
            </div>
          </div>
        </section>

        {library.length > 0 && (
          <section className="bg-white rounded-3xl p-6 shadow-lg border border-orange-100 no-print animate-fade-in">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-orange-900 flex items-center gap-2"><i className="fa-solid fa-box-archive text-orange-600"></i> 學術文件庫</h2>
              <div className="flex gap-2">
                {selectedIds.length > 0 && <button onClick={(e) => { e.stopPropagation(); deleteSelected(); }} className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-red-100 transition shadow-sm"><i className="fa-solid fa-trash-can"></i> 刪除選取 ({selectedIds.length})</button>}
                {selectedIds.length >= 2 && <button onClick={mergeSelected} className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-md hover:bg-amber-700 transition"><i className="fa-solid fa-object-group"></i> 合併主題</button>}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              {library.map(doc => {
                const isSelected = selectedIds.includes(doc.id);
                return (
                  <div key={doc.id} onClick={() => { setActiveResult(doc); setViewMode('transcript'); }} className={`relative p-5 rounded-2xl border transition-all cursor-pointer hover:shadow-md ${activeResult?.id === doc.id ? 'bg-orange-50 border-orange-400 ring-2 ring-orange-100 shadow-md' : 'bg-stone-50 border-stone-200 hover:border-orange-200'}`}>
                    <div className="absolute top-3 right-3 z-10" onClick={(e) => { e.stopPropagation(); toggleSelection(doc.id); }}>
                      {isSelected ? <div className="bg-orange-700 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white shadow-lg transform hover:scale-110 transition">{selectedIds.indexOf(doc.id) + 1}</div> : <div className="w-7 h-7 bg-white/90 border border-stone-200 rounded-full flex items-center justify-center text-stone-300 hover:text-orange-600 hover:border-orange-500 transition shadow-sm"><i className="fa-solid fa-check text-[10px]"></i></div>}
                    </div>
                    <div className="text-[10px] text-orange-600 font-bold uppercase mb-2 tracking-tight">{doc.courseName}</div>
                    <h3 className="font-bold text-sm text-stone-800 line-clamp-2 h-10 leading-snug">{doc.title}</h3>
                    <div className="text-[9px] text-stone-400 mt-3 font-medium">{new Date(doc.timestamp).toLocaleString()}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {activeResult && (
          <div ref={viewerRef} className="bg-white rounded-3xl shadow-2xl border border-orange-100 overflow-hidden animate-fade-in">
            <div className="bg-orange-900 p-6 text-white flex flex-col md:flex-row justify-between items-center gap-4 no-print shadow-inner">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-orange-300 mb-1 font-bold uppercase tracking-widest">{activeResult.courseName}</div>
                <h2 className="text-2xl font-bold truncate leading-tight">{activeResult.title}</h2>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={() => setViewMode('transcript')} className={`px-4 py-2.5 rounded-xl font-bold text-sm transition shadow-lg active:scale-95 ${viewMode === 'transcript' ? 'bg-orange-100 text-orange-900 ring-2 ring-white' : 'bg-orange-800 text-white hover:bg-orange-700'}`}>A. 原文逐字稿</button>
                <button disabled={!activeResult.notesPrevious} onClick={() => setViewMode('previous_notes')} className={`px-4 py-2.5 rounded-xl font-bold text-sm transition shadow-lg active:scale-95 ${!activeResult.notesPrevious ? 'opacity-40 cursor-not-allowed bg-stone-700' : viewMode === 'previous_notes' ? 'bg-orange-100 text-orange-900 ring-2 ring-white' : 'bg-orange-800 text-white hover:bg-orange-700'}`}>
                  B. 原整理筆記 (第 {activeResult.previousVersion} 版)
                </button>
                <button onClick={() => { if (!activeResult.notesLatest) createStudyNotes(); else if (viewMode !== 'latest_notes') setViewMode('latest_notes'); else createStudyNotes(); }} className={`px-4 py-2.5 rounded-xl font-bold text-sm transition shadow-lg active:scale-95 flex items-center gap-2 ${isGeneratingNotes ? 'bg-orange-200 text-orange-900 animate-pulse' : viewMode === 'latest_notes' && activeResult.notesLatest ? 'bg-orange-100 text-orange-900 ring-2 ring-white' : 'bg-white text-orange-900 hover:bg-orange-50'}`}>
                  {isGeneratingNotes ? <><i className="fa-solid fa-spinner animate-spin"></i> 整理中</> : <>C. {activeResult.notesLatest ? `重新整理筆記 (第 ${activeResult.latestVersion + 1} 版)` : '整理學術精華 (第 1 版)'}</>}
                </button>
                <div className="relative ml-2">
                  <button onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} className="px-5 py-2.5 bg-orange-700 text-white rounded-xl font-bold text-sm hover:bg-orange-600 transition flex items-center gap-2 shadow-lg border border-orange-800/50"><i className="fa-solid fa-download"></i> 匯出成果</button>
                  {isExportMenuOpen && (
                    <div className="absolute right-0 top-full mt-3 w-52 bg-white rounded-2xl shadow-2xl border border-stone-200 py-2 z-30 overflow-hidden ring-1 ring-black/5">
                      <button onClick={() => downloadDocument('txt')} className="w-full px-5 py-3 text-left text-sm text-stone-700 hover:bg-orange-50 transition flex items-center gap-3"><i className="fa-solid fa-file-lines text-stone-400"></i> 純文字 TXT</button>
                      <button onClick={() => downloadDocument('doc')} className="w-full px-5 py-3 text-left text-sm text-stone-700 hover:bg-orange-50 transition flex items-center gap-3"><i className="fa-solid fa-file-word text-blue-600"></i> Word (第 {viewMode === 'transcript' ? '0' : (viewMode === 'latest_notes' ? activeResult.latestVersion : activeResult.previousVersion)} 版)</button>
                      <button onClick={() => downloadDocument('pdf')} className="w-full px-5 py-3 text-left text-sm text-stone-700 hover:bg-orange-50 transition flex items-center gap-3"><i className="fa-solid fa-file-pdf text-red-600"></i> PDF 列印檔</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="p-10 max-h-[70vh] overflow-y-auto bg-stone-50 font-serif leading-loose text-xl whitespace-pre-wrap text-stone-800 scroll-smooth selection:bg-orange-200">
              {viewMode === 'transcript' && activeResult.content}
              {viewMode === 'latest_notes' && (activeResult.notesLatest ? <><div className="text-orange-900/40 text-sm font-bold mb-4">【當前：第 {activeResult.latestVersion} 版學術整理筆記】</div>{activeResult.notesLatest}</> : (isGeneratingNotes ? "AI 正在分析轉錄內容並整理第 1 版學術精華..." : "尚未生成筆記"))}
              {viewMode === 'previous_notes' && (activeResult.notesPrevious ? <><div className="text-stone-400 text-sm font-bold mb-4">【歷史紀錄：第 {activeResult.previousVersion} 版學術整理筆記】</div>{activeResult.notesPrevious}</> : "無上一版紀錄")}
            </div>
            
            <div className="bg-orange-50 px-10 py-4 text-xs text-orange-800 font-bold border-t border-orange-100 flex justify-between items-center">
              <div className="flex items-center gap-2"><i className="fa-solid fa-circle-info"></i><span>當前檢視：{viewMode === 'transcript' ? '原始逐字稿 (含角色區分)' : viewMode === 'latest_notes' ? `最新整理精華 (第 ${activeResult.latestVersion || 0} 版)` : `上一版整理紀錄 (第 ${activeResult.previousVersion || 0} 版)`}</span></div>
              <div className="flex items-center gap-3"><span className="text-orange-900/40">學術版本管理系統 v2.3</span></div>
            </div>
          </div>
        )}
      </main>
      
      <footer className="max-w-5xl mx-auto mt-16 mb-10 text-center text-stone-400 text-sm">
        <p className="font-medium tracking-wide">© 2025 學術紀錄自動化實驗室 | 支援版本累進與歷史版本溯源</p>
      </footer>
      <style>{`@keyframes fade-in { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fade-in 0.3s cubic-bezier(0.4, 0, 0.2, 1); } ::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-track { background: #f5f5f4; } ::-webkit-scrollbar-thumb { background: #d6d3d1; border-radius: 10px; } ::-webkit-scrollbar-thumb:hover { background: #a8a29e; }`}</style>
    </div>
  );
};

export default App;