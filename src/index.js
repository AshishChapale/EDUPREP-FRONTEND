import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ClerkProvider } from '@clerk/clerk-react';

// This pulls the key we just saved in your .env file!
const PUBLISHABLE_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key - Check your .env file")
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {/* Here is the security blanket wrapping your App! */}
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <App />
    </ClerkProvider>
  </React.StrictMode>
);