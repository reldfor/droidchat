import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { chats as initialChats, type Chat } from '@/data/chats';
import type { Friend } from '@/data/friends';
import type { ChatMessage, OutgoingMessage } from '@/data/messages';

type ChatStore = {
  chats: Chat[];
  createGroupChat: (participants: Friend[]) => void;
  messagesByConversation: Record<string, ChatMessage[]>;
  sendMessage: (conversationId: string, message: OutgoingMessage, fallbackChat?: Chat) => void;
};

const ChatStoreContext = createContext<ChatStore | null>(null);

function messagePreview(message: OutgoingMessage) {
  return message.kind === 'text' ? `You: ${message.text}` : 'You sent an image';
}

export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [messagesByConversation, setMessagesByConversation] = useState<
    Record<string, ChatMessage[]>
  >({});

  const sendMessage = useCallback(
    (conversationId: string, message: OutgoingMessage, fallbackChat?: Chat) => {
      const fullMessage: ChatMessage = {
        ...message,
        id: `message-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sentAt: Date.now(),
      };

      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: [...(current[conversationId] ?? []), fullMessage],
      }));

      setChats((current) => {
        const existing = current.find((chat) => chat.id === conversationId);
        const updatedChat: Chat = {
          ...(existing ?? fallbackChat ?? {
            id: conversationId,
            name: 'Chat',
            kind: 'direct' as const,
            avatarBackground: undefined,
          }),
          preview: messagePreview(message),
          timestamp: 'Just now',
          unread: false,
        };

        return [updatedChat, ...current.filter((chat) => chat.id !== conversationId)];
      });
    },
    [],
  );

  const createGroupChat = useCallback((participants: Friend[]) => {
    if (participants.length === 0) {
      return;
    }

    const chat: Chat = {
      id: `group-chat-${Date.now()}`,
      name: participants.map((participant) => participant.name).join(', '),
      kind: 'group',
      preview: 'Group chat created',
      timestamp: 'Just now',
      participants,
    };

    setChats((current) => [chat, ...current]);
  }, []);

  const store = useMemo<ChatStore>(
    () => ({
      chats,
      createGroupChat,
      messagesByConversation,
      sendMessage,
    }),
    [chats, createGroupChat, messagesByConversation, sendMessage],
  );

  return <ChatStoreContext.Provider value={store}>{children}</ChatStoreContext.Provider>;
}

export function useChatStore() {
  const store = useContext(ChatStoreContext);

  if (!store) {
    throw new Error('useChatStore must be used inside ChatStoreProvider');
  }

  return store;
}
