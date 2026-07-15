import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: 'class',
  },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: '#3b82f6',
          dark: '#2563eb',
        },
      },
    },
    dark: {
      palette: {
        primary: {
          main: '#60a5fa',
          dark: '#3b82f6',
        },
      },
    },
  },
});
