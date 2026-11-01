import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import Cuenta from './Cuenta.jsx';
import { SesionProvider, RequiereSesion } from '../shared/SesionContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SesionProvider><RequiereSesion rol="cliente"><Cuenta /></RequiereSesion></SesionProvider>
  </StrictMode>
);
