import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import Equipo from './Equipo.jsx';
import { SesionProvider, RequiereSesion } from '../shared/SesionContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SesionProvider><RequiereSesion rol="empleado"><Equipo /></RequiereSesion></SesionProvider>
  </StrictMode>
);
