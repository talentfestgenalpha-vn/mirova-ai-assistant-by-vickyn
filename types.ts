export interface AudioStreamConfig {
  sampleRate: number;
}

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export interface VolumeLevel {
  input: number;
  output: number;
}

export interface Message {
  role: 'user' | 'bot';
  text: string;
  files?: { name: string; type: string }[];
  image?: string;
  audioBase64?: string;
  isGen?: boolean;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  lastUpdated: number;
}