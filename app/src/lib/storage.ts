import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Connection, Message } from './types';

const CONNECTIONS_KEY = 'hm.connections.v1';
const tokenKey = (id: string) => `hm.token.${id}`;
const cacheKey = (id: string) => `hm.cache.v1.${id}`;
const CACHE_LIMIT = 300;

export async function loadConnections(): Promise<Connection[]> {
  try {
    const raw = await AsyncStorage.getItem(CONNECTIONS_KEY);
    return raw ? (JSON.parse(raw) as Connection[]) : [];
  } catch {
    return [];
  }
}

export async function saveConnections(list: Connection[]): Promise<void> {
  await AsyncStorage.setItem(CONNECTIONS_KEY, JSON.stringify(list));
}

// Tokens go to the Keychain / Android Keystore. The web build (dev preview only) has no secure store.
const secure = Platform.OS === 'web'
  ? { set: AsyncStorage.setItem, get: AsyncStorage.getItem, del: AsyncStorage.removeItem }
  : { set: SecureStore.setItemAsync, get: SecureStore.getItemAsync, del: SecureStore.deleteItemAsync };

export async function saveToken(id: string, token: string): Promise<void> {
  await secure.set(tokenKey(id), token);
}

export async function loadToken(id: string): Promise<string | null> {
  return secure.get(tokenKey(id));
}

export async function deleteConnectionData(id: string): Promise<void> {
  await Promise.all([secure.del(tokenKey(id)), AsyncStorage.removeItem(cacheKey(id))]);
}

export interface ChatCache {
  rev: number;
  messages: Message[];
  outbox: Message[];
}

export async function loadCache(id: string): Promise<ChatCache> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(id));
    if (raw) {
      const parsed = JSON.parse(raw) as ChatCache;
      return { rev: parsed.rev || 0, messages: parsed.messages || [], outbox: parsed.outbox || [] };
    }
  } catch {
    // corrupted cache: start fresh, the server resends everything
  }
  return { rev: 0, messages: [], outbox: [] };
}

export async function saveCache(id: string, cache: ChatCache): Promise<void> {
  const messages = cache.messages.slice(-CACHE_LIMIT);
  // If we dropped older messages the rev still covers them, which is fine: they are history.
  await AsyncStorage.setItem(cacheKey(id), JSON.stringify({ ...cache, messages }));
}
