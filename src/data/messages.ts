export type OutgoingMessage =
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'image';
      height: number;
      uri: string;
      width: number;
    };

export type ChatMessage = OutgoingMessage & {
  id: string;
  sentAt: number;
};
