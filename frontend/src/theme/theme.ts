import { createTheme, alpha } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Palette {
    statusOpen: Palette['primary'];
    statusInProgress: Palette['primary'];
    statusOnHold: Palette['primary'];
    statusLongTerm: Palette['primary'];
    statusClosed: Palette['primary'];
    priorityLow: Palette['primary'];
    priorityMedium: Palette['primary'];
    priorityHigh: Palette['primary'];
    priorityUrgent: Palette['primary'];
  }
  interface PaletteOptions {
    statusOpen?: PaletteOptions['primary'];
    statusInProgress?: PaletteOptions['primary'];
    statusOnHold?: PaletteOptions['primary'];
    statusLongTerm?: PaletteOptions['primary'];
    statusClosed?: PaletteOptions['primary'];
    priorityLow?: PaletteOptions['primary'];
    priorityMedium?: PaletteOptions['primary'];
    priorityHigh?: PaletteOptions['primary'];
    priorityUrgent?: PaletteOptions['primary'];
  }
}

declare module '@mui/material/Chip' {
  interface ChipPropsColorOverrides {
    statusOpen: true;
    statusInProgress: true;
    statusOnHold: true;
    statusLongTerm: true;
    statusClosed: true;
    priorityLow: true;
    priorityMedium: true;
    priorityHigh: true;
    priorityUrgent: true;
  }
}

// Shared dropdown surface: rounded to match --radius-md, hairline border and a
// soft shadow in place of MUI's heavy elevation.
const dropdownPaper = (theme: { palette: { divider: string } }) => ({
  borderRadius: 12,
  border: `1px solid ${theme.palette.divider}`,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
  backgroundImage: 'none',
});

// Checkmark on the selected row — masked inline SVG on currentColor so it
// recolors with the text (including dark mode).
const selectedCheckmark = {
  paddingRight: 36,
  '&::after': {
    content: '""',
    position: 'absolute',
    right: 12,
    top: '50%',
    width: 16,
    height: 16,
    transform: 'translateY(-50%)',
    backgroundColor: 'currentColor',
    maskImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z'/></svg>\")",
    maskRepeat: 'no-repeat',
    maskSize: 'contain',
    WebkitMaskImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z'/></svg>\")",
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
  },
} as const;

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
        statusOpen: { main: '#2563eb', contrastText: '#ffffff' },
        statusInProgress: { main: '#7c3aed', contrastText: '#ffffff' },
        statusOnHold: { main: '#475569', contrastText: '#ffffff' },
        statusLongTerm: { main: '#0d9488', contrastText: '#ffffff' },
        statusClosed: { main: '#334155', contrastText: '#ffffff' },
        priorityLow: { main: '#15803d', contrastText: '#ffffff' },
        priorityMedium: { main: '#a16207', contrastText: '#ffffff' },
        priorityHigh: { main: '#c2410c', contrastText: '#ffffff' },
        priorityUrgent: { main: '#dc2626', contrastText: '#ffffff' },
      },
    },
    dark: {
      palette: {
        primary: {
          main: '#60a5fa',
          dark: '#3b82f6',
        },
        statusOpen: { main: '#60a5fa', contrastText: 'rgba(0, 0, 0, 0.87)' },
        statusInProgress: { main: '#a78bfa', contrastText: 'rgba(0, 0, 0, 0.87)' },
        statusOnHold: { main: '#94a3b8', contrastText: 'rgba(0, 0, 0, 0.87)' },
        statusLongTerm: { main: '#5eead4', contrastText: 'rgba(0, 0, 0, 0.87)' },
        statusClosed: { main: '#cbd5e1', contrastText: 'rgba(0, 0, 0, 0.87)' },
        priorityLow: { main: '#4ade80', contrastText: 'rgba(0, 0, 0, 0.87)' },
        priorityMedium: { main: '#fbbf24', contrastText: 'rgba(0, 0, 0, 0.87)' },
        priorityHigh: { main: '#fb923c', contrastText: 'rgba(0, 0, 0, 0.87)' },
        priorityUrgent: { main: '#f87171', contrastText: 'rgba(0, 0, 0, 0.87)' },
      },
    },
  },
  components: {
    // Dark mode gives elevated Paper surfaces (Menus, Popovers, Dialogs, Cards) a
    // light overlay wash on top of background.paper. Sticky ListSubheader rows
    // paint their own flat background.paper instead, so grouped Select menus
    // (e.g. the Purchase Order location picker) show a visible seam between
    // header and item rows. Flattening the overlay keeps every elevated surface
    // a consistent, flat background.paper.
    MuiPaper: {
      styleOverrides: {
        root: ({ theme }) => [
          theme.applyStyles('dark', { backgroundImage: 'none' }),
        ],
      },
    },
    // Outlined buttons default to a border at ~50% opacity of their color.
    // Over this theme's dark navy surfaces, a light color like dark mode's
    // primary blue (#60a5fa) at that opacity desaturates enough to read as
    // near-black instead of blue. Full-opacity border in dark mode only —
    // respects whatever `color` prop is set (primary, error, etc.), it's
    // just no longer diluted.
    // Scoped under Button's own stable `.MuiButton-outlined` class (not just
    // `theme.applyStyles`'s bare selector) so this rule has one extra class
    // of specificity over Button's built-in outlined-variant rule — that
    // built-in rule sets the same `borderColor` property at equal
    // specificity (applyStyles's dark-mode selector is wrapped in `:where()`
    // and contributes none), so without the extra class this override was
    // silently losing the tie.
    MuiMenu: {
      styleOverrides: {
        paper: ({ theme }) => dropdownPaper(theme),
        list: { padding: 6 },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: ({ theme }) => ({
          position: 'relative',
          borderRadius: 8,
          margin: '2px 0',
          '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.06) },
          '&.Mui-focusVisible': { backgroundColor: alpha(theme.palette.primary.main, 0.06) },
          '&.Mui-selected': {
            backgroundColor: alpha(theme.palette.primary.main, 0.12),
            color: theme.palette.primary.dark,
            fontWeight: 700,
            ...selectedCheckmark,
            '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.16) },
            '&.Mui-focusVisible': { backgroundColor: alpha(theme.palette.primary.main, 0.16) },
          },
        }),
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: ({ theme }) => dropdownPaper(theme),
        listbox: { padding: 6 },
        option: ({ theme }) => ({
          position: 'relative',
          borderRadius: 8,
          margin: '2px 0',
          '&.Mui-focused': { backgroundColor: alpha(theme.palette.primary.main, 0.06) },
          '&[aria-selected="true"]': {
            backgroundColor: alpha(theme.palette.primary.main, 0.12),
            color: theme.palette.primary.dark,
            fontWeight: 700,
            ...selectedCheckmark,
            '&.Mui-focused': { backgroundColor: alpha(theme.palette.primary.main, 0.16) },
          },
        }),
      },
    },
    MuiButton: {
      styleOverrides: {
        outlined: ({ theme }) => [
          theme.applyStyles('dark', { '&.MuiButton-outlined': { borderColor: 'currentColor' } }),
        ],
      },
    },
  },
});
