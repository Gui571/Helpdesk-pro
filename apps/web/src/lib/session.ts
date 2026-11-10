'use client';

import { createContext, useContext } from 'react';
import type { User } from './api';

export const CurrentUser = createContext<User | null>(null);

export function useCurrentUser() {
  return useContext(CurrentUser)!;
}
