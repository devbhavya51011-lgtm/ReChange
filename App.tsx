import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, ImagePlus, X, Loader2, 
  Menu, Grid, MessageSquare, Plus, Trash2,
  ExternalLink, History, Shirt, ChevronRight
} from 'lucide-react';
import { generateEditedImage, fileToBase64, extractBase64FromDataUrl } from './services/geminiService';
import { Message, ImageFile, GalleryItem, ChatSession } from './types';
import { ChatMessage } from './components/ChatMessage';

const App: React.FC = () => {
  // --- State ---
  const [currentView, setCurrentView] = useState<'chat' | 'gallery'>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Sessions & History
  const [sessions, setSessions] = useState<ChatSession[]>([
    {
      id: 'default',
      title: 'New Project',
      messages: [{
        id: 'welcome',
        role: 'model',
        text: "Welcome to ReChange by Bhavya Tamboli. I'm powered by the advanced Nano Banana model. Upload an image to start transforming your fashion or photos instantly.",
        timestamp: Date.now()
      }],
      updatedAt: Date.now()
    }
  ]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('default');
  const [gallery, setGallery] = useState<GalleryItem[]>([]);

  // Active Chat State
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<ImageFile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Derived State
  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];
  const messages = currentSession.messages;

  // --- Effects ---

  // Auto-scroll
  useEffect(() => {
    if (currentView === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, currentView, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = 'auto';
      textAreaRef.current.style.height = `${Math.min(textAreaRef.current.scrollHeight, 100)}px`;
    }
  }, [inputText]);

  // Responsive Sidebar: Auto-close on mobile init
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Init
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Handlers ---

  const createNewSession = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'Untitled Project',
      messages: [],
      updatedAt: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setCurrentView('chat');
    setSelectedImage(null); // Fresh start
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  const switchSession = (id: string) => {
    setCurrentSessionId(id);
    setCurrentView('chat');
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    if (currentSessionId === id && newSessions.length > 0) {
      setCurrentSessionId(newSessions[0].id);
    } else if (newSessions.length === 0) {
      // Create a default session if all are deleted
      const defaultId = Date.now().toString();
      setSessions([{
        id: defaultId,
        title: 'New Project',
        messages: [{
          id: 'welcome',
          role: 'model',
          text: "Welcome to ReChange by Bhavya Tamboli. Start creating by uploading an image.",
          timestamp: Date.now()
        }],
        updatedAt: Date.now()
      }]);
      setCurrentSessionId(defaultId);
    }
  };

  // Delete from Gallery and sync with Chat
  const deleteFromGallery = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    e.preventDefault();

    const itemToDelete = gallery.find(g => g.id === itemId);
    
    // 1. Remove from Gallery
    setGallery(prev => prev.filter(g => g.id !== itemId));

    // 2. Sync: Remove image from the linked chat message
    if (itemToDelete && itemToDelete.sessionId && itemToDelete.messageId) {
        setSessions(prevSessions => prevSessions.map(session => {
            if (session.id === itemToDelete.sessionId) {
                return {
                    ...session,
                    messages: session.messages.map(msg => {
                        if (msg.id === itemToDelete.messageId) {
                            // Keep the message text but remove the image URL
                            return { ...msg, imageUrl: undefined };
                        }
                        return msg;
                    })
                };
            }
            return session;
        }));
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please upload a valid image file');
        return;
      }
      try {
        const base64 = await fileToBase64(file);
        const previewUrl = URL.createObjectURL(file);
        setSelectedImage({ file, previewUrl, base64, mimeType: file.type });
      } catch (error) {
        console.error("Error processing file", error);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = () => {
    if (selectedImage?.previewUrl && selectedImage.file) {
      URL.revokeObjectURL(selectedImage.previewUrl);
    }
    setSelectedImage(null);
  };

  const updateSession = (sessionId: string, updates: Partial<ChatSession>) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ...updates, updatedAt: Date.now() } : s));
  };

  const handleSend = async () => {
    // 1. Determine Input Image (New Upload OR Last Session Image)
    let imageToUse = selectedImage;
    
    // If no new image selected, check context memory
    if (!imageToUse && currentSession.lastImage) {
      imageToUse = currentSession.lastImage;
    }

    if (!inputText.trim() && !imageToUse) return;

    if (!imageToUse) {
        // User text only, no history
        const tempId = Date.now().toString();
        const userMsg: Message = { id: tempId, role: 'user', text: inputText, timestamp: Date.now() };
        updateSession(currentSessionId, { messages: [...currentSession.messages, userMsg] });
        setInputText('');
        
        setTimeout(() => {
           const botMsg: Message = { 
               id: (Date.now() + 1).toString(), 
               role: 'model', 
               text: "I need an image to start working. Please upload one first.", 
               timestamp: Date.now() 
           };
           updateSession(currentSessionId, { messages: [...currentSession.messages, userMsg, botMsg] });
        }, 600);
        return;
    }

    // 2. Prepare UI
    const prompt = inputText;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: prompt,
      originalImageUrl: selectedImage ? selectedImage.previewUrl : undefined, // Only show preview if NEW upload
      timestamp: Date.now()
    };

    // Update session with user message
    const updatedMessages = [...currentSession.messages, userMsg];
    
    // Update title if it's the first real message
    let newTitle = currentSession.title;
    if (currentSession.messages.length <= 1) {
        newTitle = prompt.slice(0, 25) || "Image Edit";
    }

    updateSession(currentSessionId, { messages: updatedMessages, title: newTitle });
    
    setInputText('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      // 3. Call AI
      const { text, imageUrl } = await generateEditedImage(
        prompt || "Enhance this image",
        imageToUse.base64,
        imageToUse.mimeType
      );

      // 4. Handle Response
      const responseMsgId = (Date.now() + 1).toString(); // Generate ID here to link to gallery
      const modelMsg: Message = {
        id: responseMsgId,
        role: 'model',
        text: text || "Here is your result.",
        imageUrl: imageUrl || undefined,
        timestamp: Date.now()
      };

      // 5. Update Session Context (Memory)
      let nextImageContext: ImageFile | undefined = currentSession.lastImage;
      
      if (imageUrl) {
          // If we got a new image, that becomes the new context
          const rawBase64 = extractBase64FromDataUrl(imageUrl);
          nextImageContext = {
              base64: rawBase64,
              mimeType: 'image/png', // Gemini returns PNG usually
              previewUrl: imageUrl
          };

          // Add to Gallery with Links
          setGallery(prev => [{
              id: Date.now().toString(),
              imageUrl: imageUrl!,
              prompt: prompt,
              timestamp: Date.now(),
              messageId: responseMsgId,      // Link back to message
              sessionId: currentSessionId    // Link back to session
          }, ...prev]);
      } else if (selectedImage) {
          // If we just analyzed an image but didn't generate a new one, context is the uploaded one
          nextImageContext = selectedImage;
      }

      updateSession(currentSessionId, { 
          messages: [...updatedMessages, modelMsg], 
          lastImage: nextImageContext 
      });

    } catch (error) {
      console.error(error);
      updateSession(currentSessionId, { 
          messages: [...updatedMessages, {
            id: (Date.now() + 1).toString(),
            role: 'model',
            text: "Something went wrong. Please try again.",
            timestamp: Date.now()
          }] 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // --- Render ---

  return (
    <div className="flex h-full w-full bg-slate-950 text-slate-100 font-sans overflow-hidden selection:bg-indigo-500/30">
      
      {/* Sidebar Overlay (Mobile) */}
      {sidebarOpen && (
        <div 
            className="fixed inset-0 bg-black/80 z-20 lg:hidden backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed lg:relative inset-y-0 left-0 z-30 w-[280px] bg-slate-950 border-r border-slate-800 transition-transform duration-300 ease-in-out flex flex-col ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:border-none'
        } lg:!translate-x-0 lg:!static lg:!block ${!sidebarOpen && 'lg:hidden'}`}
      >
        <div className="p-5 flex items-center justify-between border-b border-slate-800/50">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                    <Shirt size={18} fill="currentColor" className="text-white" />
                </div>
                <div>
                    <h2 className="font-bold text-lg tracking-tight text-white leading-tight">ReChange</h2>
                    <p className="text-[10px] text-slate-400 font-medium tracking-wide">BY BHAVYA TAMBOLI</p>
                </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-500 hover:text-white transition-colors">
                <X size={20} />
            </button>
        </div>

        <div className="p-4">
            <button 
                onClick={createNewSession}
                className="w-full bg-white text-slate-950 hover:bg-slate-200 rounded-lg p-3 flex items-center justify-center gap-2 transition-all font-semibold text-sm shadow-sm"
            >
                <Plus size={16} /> New Project
            </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 custom-scrollbar">
            <div className="text-[10px] font-bold text-slate-500 px-2 py-2 uppercase tracking-widest">Your Projects</div>
            {sessions.map(session => (
                <div 
                    key={session.id}
                    onClick={() => switchSession(session.id)}
                    className={`group flex items-center justify-between p-2.5 rounded-lg text-sm cursor-pointer transition-all border border-transparent ${
                        currentSessionId === session.id 
                        ? 'bg-slate-900 text-white border-slate-800' 
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                    }`}
                >
                    <div className="flex items-center gap-3 overflow-hidden">
                        <MessageSquare size={14} className={currentSessionId === session.id ? 'text-indigo-400' : 'text-slate-600'} />
                        <span className="truncate">{session.title}</span>
                    </div>
                    {/* Always visible on mobile, visible on hover on desktop */}
                    <button 
                        onClick={(e) => deleteSession(e, session.id)}
                        className="text-slate-600 hover:text-red-400 p-1.5 rounded-md hover:bg-slate-800 transition-all opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                        title="Delete Chat"
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            ))}
        </div>

        <div className="p-4 border-t border-slate-800/50 bg-slate-950 space-y-2">
             <button 
                onClick={() => { setCurrentView('gallery'); if(window.innerWidth < 1024) setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-sm transition-all ${
                    currentView === 'gallery' ? 'bg-slate-900 text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
                }`}
             >
                 <Grid size={16} /> Gallery
             </button>
        </div>
        
        <div className="p-4 pt-2 text-[10px] text-slate-600 flex justify-between items-center bg-slate-950">
             <span className="opacity-70">v2.5 Nano Build</span>
             <span className="text-slate-500">Free Tier</span>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative h-full w-full min-w-0 bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/10 via-slate-950 to-slate-950">
        
        {/* Header */}
        <header className="h-16 border-b border-slate-800/60 bg-slate-950/70 backdrop-blur-xl flex items-center justify-between px-4 lg:px-6 shrink-0 z-10 w-full">
            <div className="flex items-center gap-4">
                <button 
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-900 transition-colors"
                >
                    {sidebarOpen ? <ChevronRight size={20} className="rotate-180 lg:rotate-0" /> : <Menu size={20} />}
                </button>
                <div className="flex flex-col justify-center">
                    <h1 className="font-semibold text-sm text-slate-100 tracking-wide">
                        {currentView === 'gallery' ? 'Saved Gallery' : currentSession.title}
                    </h1>
                </div>
            </div>
            <div className="flex items-center gap-3">
                 <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Nano Banana Active</span>
                 </div>
                 <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg">
                     <ExternalLink size={18} />
                 </button>
            </div>
        </header>

        {/* View: Gallery */}
        {currentView === 'gallery' && (
            <div className="flex-1 overflow-y-auto p-4 md:p-8 w-full">
                <div className="max-w-7xl mx-auto">
                    <h2 className="text-2xl font-bold mb-8 text-white tracking-tight flex items-center gap-3">
                        <Grid size={24} className="text-indigo-500" /> Your Creations
                    </h2>
                    {gallery.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[50vh] text-slate-600 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
                            <p className="text-sm">No masterpieces yet.</p>
                            <button onClick={() => setCurrentView('chat')} className="text-indigo-400 mt-3 text-sm hover:underline font-medium">Start Creating</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {gallery.map(item => (
                                <div key={item.id} className="group relative aspect-square rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl transition-transform hover:-translate-y-1">
                                    <img src={item.imageUrl} alt={item.prompt} className="w-full h-full object-cover" />
                                    
                                    {/* Overlay Actions */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 p-4 flex flex-col justify-between">
                                        
                                        {/* Delete Button */}
                                        <div className="flex justify-end">
                                            <button 
                                                onClick={(e) => deleteFromGallery(e, item.id)}
                                                className="bg-black/40 hover:bg-red-500 text-white p-2 rounded-full backdrop-blur-md transition-colors"
                                                title="Delete from Gallery & Chat"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <p className="text-xs text-white line-clamp-2 font-medium mb-1 drop-shadow-md">{item.prompt}</p>
                                            <a 
                                                href={item.imageUrl} 
                                                download={`rechange-gallery-${item.id}.png`}
                                                className="w-full bg-white text-slate-950 py-2 rounded-lg text-xs font-bold text-center hover:bg-slate-200 transition-colors shadow-lg"
                                            >
                                                Download
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* View: Chat / Editor */}
        {currentView === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0 relative w-full">
                {/* Canvas Area (Chat Log) */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 scroll-smooth w-full">
                    <div className="max-w-3xl mx-auto flex flex-col min-h-full justify-end pb-4">
                        {messages.length === 0 && (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-6 mb-20 opacity-60">
                                <div className="w-24 h-24 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-2xl shadow-indigo-900/10">
                                    <ImagePlus size={40} strokeWidth={1.5} className="text-slate-500" />
                                </div>
                                <p className="text-sm font-medium">Upload. Prompt. ReChange.</p>
                            </div>
                        )}
                        
                        {messages.map(msg => (
                            <ChatMessage key={msg.id} message={msg} />
                        ))}

                        {isLoading && (
                            <div className="flex w-full justify-start mb-12 pl-2">
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin"></div>
                                    <div className="text-slate-500 text-xs font-medium tracking-widest uppercase">Processing...</div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Input Control Center */}
                <div className="p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md border-t border-slate-800/80 z-20 w-full">
                    <div className="max-w-3xl mx-auto w-full">
                        
                        {/* Status Bar */}
                        {!selectedImage && currentSession.lastImage && (
                             <div className="mb-3 flex items-center gap-2 text-[10px] font-medium text-indigo-300 bg-indigo-500/10 w-fit px-3 py-1.5 rounded-full border border-indigo-500/20 animate-in fade-in slide-in-from-bottom-2">
                                 <History size={10} />
                                 <span>EDITING PREVIOUS IMAGE</span>
                             </div>
                        )}

                        {/* Image Preview (New Upload) */}
                        {selectedImage && (
                            <div className="mb-4 relative inline-block animate-in zoom-in-95 duration-200">
                                <div className="relative rounded-xl overflow-hidden border border-slate-700 shadow-2xl w-24 h-24 group">
                                    <img 
                                        src={selectedImage.previewUrl} 
                                        alt="Preview" 
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                         <button 
                                            onClick={handleRemoveImage}
                                            className="text-white bg-black/50 p-1.5 rounded-full hover:bg-red-500/80 transition-colors"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Input Field */}
                        <div className="relative flex items-end gap-3 bg-slate-900/60 border border-slate-800 rounded-3xl p-2 pl-4 shadow-xl focus-within:bg-slate-900 focus-within:border-slate-700 transition-all w-full">
                            
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className={`mb-1.5 p-2 rounded-full transition-all duration-300 ${
                                    selectedImage 
                                    ? 'text-indigo-400 bg-indigo-500/10 rotate-0' 
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 hover:rotate-90'
                                }`}
                                title="Upload Image"
                                disabled={isLoading}
                            >
                                <Plus size={22} strokeWidth={2.5} />
                            </button>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*"
                                onChange={handleFileSelect}
                            />

                            <textarea
                                ref={textAreaRef}
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={
                                    selectedImage 
                                    ? "Describe your changes..." 
                                    : (currentSession.lastImage 
                                        ? "Refine the previous result..." 
                                        : "Upload an image to start...")
                                }
                                className="w-full bg-transparent border-none focus:ring-0 resize-none py-4 max-h-32 text-slate-100 placeholder-slate-500 text-base leading-relaxed"
                                rows={1}
                                disabled={isLoading}
                            />

                            <button
                                onClick={handleSend}
                                disabled={(!inputText.trim() && !selectedImage && !currentSession.lastImage) || isLoading}
                                className={`mb-1.5 p-3 rounded-full transition-all duration-300 flex items-center justify-center shrink-0 ${
                                    (!inputText.trim() && !selectedImage && !currentSession.lastImage) || isLoading
                                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed scale-90' 
                                    : 'bg-white text-slate-950 hover:bg-slate-200 shadow-lg shadow-white/10 hover:scale-105'
                                }`}
                            >
                                {isLoading ? (
                                    <Loader2 className="animate-spin" size={20} />
                                ) : (
                                    <Send size={20} fill={(!inputText.trim() && !selectedImage && !currentSession.lastImage) ? "none" : "currentColor"} />
                                )}
                            </button>
                        </div>
                        <div className="mt-3 flex justify-center w-full">
                            <p className="text-[10px] text-slate-600 font-medium">ReChange By Bhavya Tamboli</p>
                        </div>
                    </div>
                </div>
            </div>
        )}

      </main>
    </div>
  );
};

export default App;