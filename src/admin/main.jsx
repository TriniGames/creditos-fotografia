import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import Admin from './Admin.jsx';
import { SesionProvider, RequiereSesion } from '../shared/SesionContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SesionProvider><RequiereSesion rol="admin"><Admin /></RequiereSesion></SesionProvider>
  </StrictMode>
);
