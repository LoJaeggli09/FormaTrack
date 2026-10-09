import React, { useEffect } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import createAppTheme from '../theme';

const theme = createAppTheme();

// Preferenze salvate da versioni precedenti: il tema scuro non esiste più.
const LEGACY_KEYS = ['theme-mode', 'high-contrast', 'primary-color', 'secondary-color', 'background-color'];

export const ThemeProvider = ({ children }) => {
  useEffect(() => {
    LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
    document.body.classList.remove('dark-mode', 'high-contrast');
    document.documentElement.removeAttribute('data-theme');
  }, []);

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
};

export default ThemeProvider;
