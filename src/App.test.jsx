import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import App from './App';

vi.mock('./firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    chats: {
      create: vi.fn().mockReturnValue({
        sendMessage: vi.fn(),
      })
    }
  }))
}));

test('renders structural nodes successfully', () => {
  render(<App />);
  expect(screen.getByText(/Civic Hub/i)).toBeInTheDocument();
});
