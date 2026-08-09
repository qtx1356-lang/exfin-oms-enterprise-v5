import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRegistration } from '../../context/RegistrationContext';
import { db } from '../../services/firebase/config';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import {
  MessageSquare,
  Send,
  Search,
  ArrowLeft,
  Phone,
  Video,
  Users,
  User,
  Plus,
  Shield,
  Info,
  Clock,
  Check,
  CheckCheck,
  AlertCircle,
  WifiOff
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { ChatConversation, ChatMessage, ChatParticipant } from '../../types/chat';
import {
  createConversation,
  sendMessage,
  listenConversations,
  listenMessages,
  markAsRead
} from '../../services/chat/chatService';

export const ChatScreen: React.FC = () => {
  const { employeeData } = useRegistration();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Core State
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConv, setActiveConv] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // New Chat Dialog State
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [contacts, setContacts] = useState<ChatParticipant[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [chatType, setChatType] = useState<'DIRECT' | 'GROUP'>('DIRECT');

  // Call Feature Placeholders State
  const [callModal, setCallModal] = useState<{ isOpen: boolean; type: 'audio' | 'video' | null }>({
    isOpen: false,
    type: null,
  });

  const currentUserCode = employeeData?.employeeCode || '';
  const currentUserName = employeeData?.name || 'Employee';
  const currentUserRole = employeeData?.isTeamLeader ? 'TEAM_LEADER' : 'EMPLOYEE';

  // Listen to Online/Offline state
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listen to conversations
  useEffect(() => {
    if (!currentUserCode) return;
    const unsub = listenConversations(currentUserCode, (data) => {
      setConversations(data);
    });
    return () => unsub();
  }, [currentUserCode]);

  // Listen to active conversation messages
  useEffect(() => {
    if (!activeConv) {
      setMessages([]);
      return;
    }

    // Reset unread count immediately upon opening/receiving updates
    markAsRead(activeConv.id, currentUserCode).catch(console.error);

    const unsub = listenMessages(activeConv.id, (msgs) => {
      setMessages(msgs);
    });
    return () => unsub();
  }, [activeConv?.id, currentUserCode]);

  // Always scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch approved contacts for starting new chats
  useEffect(() => {
    if (!isNewChatOpen || !db) return;

    const fetchContacts = async () => {
      try {
        const list: ChatParticipant[] = [];

        // 1. Add Admin and HR as potential direct targets (System Accounts)
        list.push({ id: 'admin', name: 'Admin Department', role: 'ADMIN' });
        list.push({ id: 'hr_exec', name: 'HR Department', role: 'HR' });

        // 2. Fetch approved employees from registrations collection
        const q = query(collection(db, 'registrations'), where('status', '==', 'Approved'));
        const snap = await getDocs(q);
        
        snap.forEach(docSnap => {
          const data = docSnap.data();
          const empCode = data.employeeCode;
          // Filter out current user, empty codes, and any potential Super Admin references
          if (
            empCode &&
            empCode !== currentUserCode &&
            data.role !== 'SUPER_ADMIN' &&
            !data.name?.toLowerCase().includes('super')
          ) {
            list.push({
              id: empCode,
              name: data.name || empCode,
              role: data.isTeamLeader ? 'TEAM_LEADER' : 'EMPLOYEE'
            });
          }
        });

        setContacts(list);
      } catch (err) {
        console.error('Error fetching contacts for chat:', err);
      }
    };

    fetchContacts();
  }, [isNewChatOpen, currentUserCode]);

  // Send message handler
  const handleSend = async () => {
    if (!inputText.trim() || !activeConv) return;
    const textToSend = inputText.trim();
    setInputText('');

    // Optimistic Update (UI message state)
    const tempId = 'temp-' + Date.now();
    const optimisticMsg: ChatMessage = {
      id: tempId,
      senderId: currentUserCode,
      senderName: currentUserName,
      senderRole: currentUserRole,
      content: textToSend,
      timestamp: new Date().toISOString(),
      isPending: true,
    };

    setMessages(prev => [...prev, optimisticMsg]);

    try {
      await sendMessage(
        activeConv.id,
        currentUserCode,
        currentUserName,
        currentUserRole,
        textToSend
      );
    } catch (err) {
      console.error('Failed to send message:', err);
      // Mark as failed in local state
      setMessages(prev =>
        prev.map(m => m.id === tempId ? { ...m, isPending: false, isFailed: true } : m)
      );
    }
  };

  // Start chat handler (Direct or Group)
  const handleStartChat = async () => {
    if (chatType === 'DIRECT') {
      if (selectedContacts.length !== 1) return;
      const targetId = selectedContacts[0];
      const targetContact = contacts.find(c => c.id === targetId);
      if (!targetContact) return;

      const pIds = [currentUserCode, targetId].sort();
      const pNames = {
        [currentUserCode]: currentUserName,
        [targetId]: targetContact.name
      };

      try {
        const convId = await createConversation('DIRECT', pIds, pNames);
        setIsNewChatOpen(false);
        setSelectedContacts([]);
        
        // Find or build temporary Conversation object to select it
        const newConv: ChatConversation = {
          id: convId,
          type: 'DIRECT',
          participantIds: pIds,
          participantNames: pNames,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          unreadCounts: { [currentUserCode]: 0, [targetId]: 0 }
        };
        setActiveConv(newConv);
      } catch (err) {
        console.error('Failed to start direct chat:', err);
      }
    } else {
      // Group Chat
      if (selectedContacts.length < 1) return;
      const title = groupTitle.trim() || 'Project Group';
      const pIds = [currentUserCode, ...selectedContacts];
      const pNames: Record<string, string> = {
        [currentUserCode]: currentUserName
      };
      selectedContacts.forEach(id => {
        const contact = contacts.find(c => c.id === id);
        if (contact) {
          pNames[id] = contact.name;
        }
      });

      try {
        const convId = await createConversation('GROUP', pIds, pNames, title);
        setIsNewChatOpen(false);
        setSelectedContacts([]);
        setGroupTitle('');
        
        const newConv: ChatConversation = {
          id: convId,
          type: 'GROUP',
          title,
          participantIds: pIds,
          participantNames: pNames,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          unreadCounts: pIds.reduce((acc, curr) => ({ ...acc, [curr]: 0 }), {})
        };
        setActiveConv(newConv);
      } catch (err) {
        console.error('Failed to start group chat:', err);
      }
    }
  };

  const getRecipientName = (conv: ChatConversation) => {
    if (conv.type === 'ALL_EMPLOYEES') return conv.title || 'All Employees Channel';
    if (conv.type === 'GROUP') return conv.title || 'Group Chat';
    
    // Find the other participant's name
    const otherId = conv.participantIds.find(id => id !== currentUserCode);
    return otherId ? (conv.participantNames[otherId] || 'Conversation') : 'Conversation';
  };

  const toggleContactSelect = (id: string) => {
    if (chatType === 'DIRECT') {
      setSelectedContacts([id]);
    } else {
      setSelectedContacts(prev =>
        prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
      );
    }
  };

  // Filters based on search
  const filteredConversations = conversations.filter(conv =>
    getRecipientName(conv).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    contact.id.toLowerCase().includes(contactSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-[calc(100vh-110px)] text-white -mt-2">
      {/* Network Offline Alert */}
      {isOffline && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-200 text-xs px-4 py-2 flex items-center gap-2 justify-center font-bold">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>You are offline. Messages will sync automatically when online.</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT COLUMN: Conversation List (Hidden on mobile when chat is active) */}
        <div className={`w-full md:w-80 border-r border-purple-500/20 flex flex-col bg-[#1A0B36]/50 ${activeConv ? 'hidden md:flex' : 'flex'}`}>
          {/* Header */}
          <div className="p-4 border-b border-purple-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-400" /> Communications
              </h2>
              <button
                onClick={() => setIsNewChatOpen(true)}
                className="w-8 h-8 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center transition shadow-lg text-white"
                title="New Chat"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-purple-300/50" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#15092E] border border-purple-500/20 rounded-xl py-1.5 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-purple-500/55"
              />
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto divide-y divide-purple-500/10">
            {filteredConversations.length === 0 ? (
              <div className="text-center py-12 text-xs text-purple-300/40">
                No conversations found. Tap the '+' button above to start chatting!
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = activeConv?.id === conv.id;
                const unreadCount = conv.unreadCounts?.[currentUserCode] || 0;
                
                return (
                  <div
                    key={conv.id}
                    onClick={() => setActiveConv(conv)}
                    className={`p-3.5 flex items-center gap-3 cursor-pointer transition ${
                      isSelected ? 'bg-purple-600/20 border-l-4 border-purple-500' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-300 relative">
                      {conv.type === 'ALL_EMPLOYEES' ? (
                        <Users className="w-5 h-5" />
                      ) : conv.type === 'GROUP' ? (
                        <Users className="w-5 h-5" />
                      ) : (
                        <User className="w-5 h-5" />
                      )}
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black h-4 w-4 rounded-full flex items-center justify-center animate-pulse">
                          {unreadCount}
                        </span>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <h4 className="text-xs font-bold text-white truncate pr-1">
                          {getRecipientName(conv)}
                        </h4>
                        {conv.lastMessage && (
                          <span className="text-[9px] text-purple-300/40 font-mono">
                            {new Date(conv.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-purple-300/60 truncate">
                        {conv.lastMessage ? (
                          <>
                            <span className="font-semibold text-purple-300/80">{conv.lastMessage.senderName}: </span>
                            {conv.lastMessage.content}
                          </>
                        ) : (
                          <span className="italic">No messages yet</span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Chat Area */}
        <div className={`flex-1 flex flex-col bg-[#110526]/40 ${!activeConv ? 'hidden md:flex' : 'flex'}`}>
          {activeConv ? (
            <>
              {/* Active Conversation Header */}
              <div className="p-4 border-b border-purple-500/20 bg-[#1A0B36]/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveConv(null)}
                    className="md:hidden p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-300">
                    {activeConv.type === 'ALL_EMPLOYEES' ? (
                      <Users className="w-5 h-5" />
                    ) : activeConv.type === 'GROUP' ? (
                      <Users className="w-5 h-5" />
                    ) : (
                      <User className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white leading-tight">
                      {getRecipientName(activeConv)}
                    </h3>
                    <p className="text-[9px] text-purple-300/50 uppercase font-black tracking-wider mt-0.5">
                      {activeConv.type === 'ALL_EMPLOYEES' ? 'Broadcast Channel' : activeConv.type === 'GROUP' ? 'Group Space' : 'Direct Correspondence'}
                    </p>
                  </div>
                </div>

                {/* Video/Audio Call Placeholders */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCallModal({ isOpen: true, type: 'audio' })}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-purple-200 transition"
                    title="Audio Call"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCallModal({ isOpen: true, type: 'video' })}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-purple-200 transition"
                    title="Video Call"
                  >
                    <Video className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Message History list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-gradient-to-b from-transparent to-[#110526]/50">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-purple-300/40">
                    No messages in this chat. Start typing below!
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isOwn = msg.senderId === currentUserCode;
                    const isPending = msg.isPending;
                    const isFailed = msg.isFailed;

                    return (
                      <div
                        key={msg.id || index}
                        className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                      >
                        {/* Sender info */}
                        {!isOwn && (
                          <div className="flex items-center gap-1.5 mb-1 pl-1">
                            <span className="text-[10px] font-black text-purple-200">{msg.senderName}</span>
                            <span className={`text-[8px] font-black px-1.5 py-0.2 rounded uppercase ${
                              msg.senderRole === 'ADMIN' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                              msg.senderRole === 'HR' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                              msg.senderRole === 'TEAM_LEADER' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                              'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                            }`}>
                              {msg.senderRole}
                            </span>
                          </div>
                        )}

                        {/* Bubble */}
                        <div
                          className={`max-w-[80%] rounded-[20px] px-4 py-2.5 text-xs font-medium leading-relaxed shadow-lg border ${
                            isOwn
                              ? 'bg-purple-600 border-purple-500 text-white rounded-tr-none'
                              : 'bg-[#1C0D39]/90 border-purple-500/20 text-purple-100 rounded-tl-none'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          
                          {/* Footer details inside bubble */}
                          <div className="flex items-center justify-end gap-1 mt-1 text-[8px] text-white/40 font-mono">
                            <span>
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isOwn && (
                              <span>
                                {isFailed ? (
                                  <AlertCircle className="w-2.5 h-2.5 text-rose-400" />
                                ) : isPending ? (
                                  <Clock className="w-2.5 h-2.5 text-white/50" />
                                ) : (
                                  <CheckCheck className="w-2.5 h-2.5 text-emerald-400" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input controls */}
              <div className="p-4 border-t border-purple-500/20 bg-[#1A0B36]/30">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    placeholder={isOffline ? "Typing offline..." : "Write message..."}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="flex-1 bg-[#15092E] border border-purple-500/20 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-purple-300/40 focus:outline-none focus:border-purple-500/55"
                  />
                  <Button
                    type="submit"
                    disabled={!inputText.trim()}
                    className="bg-purple-600 hover:bg-purple-500 shrink-0 px-4 rounded-2xl h-auto"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-purple-300/40">
              <MessageSquare className="w-16 h-16 text-purple-500/20 mb-3" />
              <h3 className="text-base font-black text-white/60 mb-1">No Active Chat</h3>
              <p className="text-xs max-w-xs leading-relaxed">
                Select an existing thread from the left pane, or click the '+' button to discover contacts and start a conversation.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* NEW CHAT MODAL */}
      <Dialog
        isOpen={isNewChatOpen}
        onClose={() => {
          setIsNewChatOpen(false);
          setSelectedContacts([]);
          setGroupTitle('');
        }}
        title="Start Communication"
      >
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2 scrollbar-thin">
          {/* Chat Type Selection */}
          <div className="flex bg-[#15092E] p-1 rounded-xl border border-purple-500/20">
            <button
              onClick={() => {
                setChatType('DIRECT');
                setSelectedContacts([]);
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                chatType === 'DIRECT' ? 'bg-purple-600 text-white' : 'text-purple-300'
              }`}
            >
              Direct Chat
            </button>
            <button
              onClick={() => {
                setChatType('GROUP');
                setSelectedContacts([]);
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                chatType === 'GROUP' ? 'bg-purple-600 text-white' : 'text-purple-300'
              }`}
            >
              Group Space
            </button>
          </div>

          {/* Group Specific Fields */}
          {chatType === 'GROUP' && (
            <div className="space-y-1.5">
              <label className="text-[10px] text-purple-300/60 uppercase font-black tracking-wider">Group Name</label>
              <input
                type="text"
                placeholder="Enter group subject..."
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                className="w-full bg-[#15092E] border border-purple-500/20 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-purple-500/50"
              />
            </div>
          )}

          {/* Contact Search */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-purple-300/60 uppercase font-black tracking-wider">Search Contacts</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-purple-300/50" />
              <input
                type="text"
                placeholder="Search by name or code..."
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                className="w-full bg-[#15092E] border border-purple-500/20 rounded-xl py-2 pl-9 pr-3 text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Contacts List */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-purple-300/60 uppercase font-black tracking-wider">
              {chatType === 'DIRECT' ? 'Select Recipient' : 'Select Group Members'}
            </span>
            <div className="space-y-1 divide-y divide-purple-500/5 max-h-48 overflow-y-auto pr-1">
              {filteredContacts.length === 0 ? (
                <div className="text-center py-6 text-xs text-purple-300/40">No eligible contacts found</div>
              ) : (
                filteredContacts.map(c => {
                  const isSelected = selectedContacts.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => toggleContactSelect(c.id)}
                      className={`py-2 px-3 flex items-center justify-between rounded-lg cursor-pointer transition ${
                        isSelected ? 'bg-purple-600/10' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-300 text-xs font-bold">
                          {c.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white">{c.name}</p>
                          <p className="text-[9px] text-purple-300/50 font-mono">{c.id.toUpperCase()} • {c.role}</p>
                        </div>
                      </div>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-purple-600 border-purple-500' : 'border-purple-500/30'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <Button
              onClick={handleStartChat}
              disabled={selectedContacts.length < 1 || (chatType === 'GROUP' && !groupTitle.trim())}
              className="w-full bg-purple-600 hover:bg-purple-500 h-10 rounded-xl text-xs font-bold shadow-lg"
            >
              {chatType === 'DIRECT' ? 'Start Conversation' : 'Create Group Space'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* CALL FEATURE MODAL PLACEHOLDER */}
      <Dialog
        isOpen={callModal.isOpen}
        onClose={() => setCallModal({ isOpen: false, type: null })}
        title={callModal.type === 'video' ? 'Video Conference' : 'Voice Connection'}
      >
        <div className="space-y-4 text-center p-4">
          <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-300">
            {callModal.type === 'video' ? <Video className="w-8 h-8" /> : <Phone className="w-8 h-8" />}
          </div>
          <div className="space-y-2">
            <h4 className="text-base font-black text-white">Call Integration Sandbox</h4>
            <p className="text-xs text-purple-300/80 leading-relaxed max-w-sm mx-auto">
              Real-time video and audio calling requires integration with a WebRTC or communication provider (e.g., Twilio, Zoom, or Jitsi). This UI shell is ready for deployment once credentials are configured.
            </p>
          </div>
          <div className="pt-2">
            <Button
              onClick={() => setCallModal({ isOpen: false, type: null })}
              className="bg-purple-600 hover:bg-purple-500 w-full rounded-xl"
            >
              Close Call Sandbox
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
