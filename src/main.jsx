import React from 'react';
import { createRoot } from 'react-dom/client';
import './base.css';
import './animations.css';
import './responsive.css';
import ClayVariant from './variant-clay.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClayVariant />
  </React.StrictMode>
);
