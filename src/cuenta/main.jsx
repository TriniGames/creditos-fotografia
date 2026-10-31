import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import Cuenta from './Cuenta.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Cuenta />
  </StrictMode>
);
