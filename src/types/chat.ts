export type ChatType = 'DIRECT' | 'GROUP' | 'ALL_EMPLOYEES';

export interface ChatParticipant {
  id: string; // employeeCode or admin loginId
  name: string;
  role: 'EMPLOYEE' | 'ADMIN' | 'HR' | 'TEAM_LEADER';
  isOnline?: boolean;
}

export interface ChatConversation {
  id: string;
  type: ChatType;
  title?: string; // For Group/All employee chats
  participantIds: string[]; // List of employeeCodes or admin loginIds
  participantNames: Record<string, string>; // Maps participantId to Name
  createdAt: string;
  updatedAt: string;
  lastMessage?: {
    content: string;
    senderId: string;
    senderName: string;
    timestamp: string;
  };
  unreadCounts: Record<string, number>; // Tracks unread count per participant
}

export interface ChatAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ChatMessage {
  id: string;
  senderId: string; // employeeCode or admin loginId
  senderName: string;
  senderRole: 'EMPLOYEE' | 'ADMIN' | 'HR' | 'TEAM_LEADER';
  content: string;
  timestamp: string;
  isPending?: boolean; // For offline support
  isFailed?: boolean;  // For offline support
  attachment?: ChatAttachment; // Optional attachment metadata
}
