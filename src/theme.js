import { createTheme } from '@mui/material/styles';
import { LIGHT as c, FONT_DISPLAY, FONT_TEXT } from './styles/tokens';

/**
 * Tema MUI di FormaTrack.
 *
 * Applica il linguaggio visivo dell'app ai componenti di libreria in un punto solo:
 * spigoli vivi (raggio 0), nessuna ombra, nessun gradiente, nessun movimento di entrata,
 * un solo colore guida (il blu) e colori accesi solo per lo stato.
 * I valori arrivano da styles/tokens.js, gli stessi delle variabili CSS di styles/tokens.css.
 */

const NO_SHADOWS = Array(25).fill('none');

// Unica transizione ammessa: colore / sfondo / bordo in 120 ms.
const COLOR_TRANSITION = 'color 120ms, background-color 120ms, border-color 120ms';

const createAppTheme = () => {
  const outline = `3px solid ${c.blue}`;

  const focusRing = { outline, outlineOffset: '2px' };

  return createTheme({
    palette: {
      mode: 'light',
      primary: { main: c.blue, dark: c['blue-d'], light: c['blue-l'], contrastText: c['on-blue'] },
      secondary: { main: c.ink, contrastText: c.bg },
      background: { default: c.bg, paper: c.bg },
      text: { primary: c.ink, secondary: c['ink-3'], disabled: c['ink-3'] },
      divider: c.line,
      success: { main: c.ev, contrastText: c.bg },
      warning: { main: c.act, contrastText: c.ink },
      error: { main: c.err, contrastText: c.bg },
      info: { main: c.blue, contrastText: c['on-blue'] },
      action: {
        hover: c['blue-t'],
        selected: c['blue-t'],
        disabled: c['ink-3'],
        disabledBackground: c.fill,
        focus: c['blue-t'],
      },
    },
    shape: { borderRadius: 0 },
    shadows: NO_SHADOWS,
    transitions: {
      duration: {
        shortest: 120,
        shorter: 120,
        short: 120,
        standard: 120,
        complex: 120,
        enteringScreen: 0,
        leavingScreen: 0,
      },
    },
    typography: {
      fontFamily: FONT_TEXT,
      h1: { fontFamily: FONT_DISPLAY, fontSize: '24px', fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em' },
      h2: { fontFamily: FONT_DISPLAY, fontSize: '18px', fontWeight: 800, lineHeight: 1.25, letterSpacing: '-0.02em' },
      h3: { fontFamily: FONT_DISPLAY, fontSize: '15px', fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.015em' },
      h4: { fontFamily: FONT_DISPLAY, fontSize: '14px', fontWeight: 700, lineHeight: 1.3 },
      h5: { fontFamily: FONT_DISPLAY, fontSize: '14px', fontWeight: 700, lineHeight: 1.3 },
      h6: { fontFamily: FONT_DISPLAY, fontSize: '14px', fontWeight: 700, lineHeight: 1.3 },
      subtitle1: { fontFamily: FONT_DISPLAY, fontSize: '14px', fontWeight: 700 },
      subtitle2: { fontFamily: FONT_DISPLAY, fontSize: '13px', fontWeight: 700 },
      body1: { fontSize: '14px', lineHeight: 1.5 },
      body2: { fontSize: '13px', lineHeight: 1.4 },
      caption: { fontSize: '12.5px', lineHeight: 1.4 },
      overline: {
        fontFamily: FONT_DISPLAY,
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.06em',
        lineHeight: 1.2,
      },
      button: {
        fontFamily: FONT_DISPLAY,
        fontSize: '14px',
        fontWeight: 700,
        letterSpacing: '-0.005em',
        textTransform: 'none',
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: c.bg,
            color: c['ink-2'],
            fontFamily: FONT_TEXT,
            fontSize: '14px',
            lineHeight: 1.5,
          },
        },
      },

      // Nessuna ombra, nessun velo di elevazione, nessun raggio
      MuiPaper: {
        defaultProps: { elevation: 0, square: true },
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
      MuiCard: { defaultProps: { elevation: 0, square: true } },
      MuiAppBar: { defaultProps: { elevation: 0, square: true } },
      MuiDrawer: { styleOverrides: { paper: { borderRadius: 0, boxShadow: 'none' } } },

      // Pulsanti
      MuiButtonBase: {
        defaultProps: { disableRipple: true, disableTouchRipple: true },
        styleOverrides: { root: { '&.Mui-focusVisible': focusRing, '&:focus': focusRing } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true, disableRipple: true },
        styleOverrides: {
          root: {
            borderRadius: 0,
            minHeight: 46,
            padding: '0 20px',
            boxShadow: 'none',
            transition: COLOR_TRANSITION,
            '&:hover': { boxShadow: 'none', transform: 'none' },
          },
          sizeSmall: { minHeight: 36, padding: '0 14px' },
          contained: {
            border: `1px solid ${c.blue}`,
            '&:hover': { backgroundColor: c['blue-d'], borderColor: c['blue-d'], boxShadow: 'none' },
          },
          outlined: {
            backgroundColor: c.bg,
            borderColor: c.ink,
            color: c.ink,
            '&:hover': { backgroundColor: c.bg, borderColor: c.blue, color: c.blue },
          },
          text: { color: c.ink, '&:hover': { backgroundColor: 'transparent', color: c.blue } },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 0,
            color: c.blue,
            transition: COLOR_TRANSITION,
            '&:hover': { backgroundColor: c['blue-t'] },
          },
        },
      },

      // Campi
      MuiTextField: { defaultProps: { variant: 'outlined' } },
      MuiInputBase: {
        styleOverrides: {
          root: { fontFamily: FONT_TEXT, fontSize: '14px', color: c.ink },
          input: { '&::placeholder': { color: c['ink-3'], opacity: 1 } },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 0,
            backgroundColor: c.bg,
            minHeight: 40,
            transition: COLOR_TRANSITION,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: c['line-2'], borderWidth: 1 },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: c.blue },
            '&.Mui-focused': focusRing,
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: c.blue, borderWidth: 1 },
            '&.Mui-disabled': { backgroundColor: c.fill },
            '&.Mui-disabled .MuiOutlinedInput-notchedOutline': { borderColor: c.line },
          },
          input: { padding: '8px 12px' },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            color: c['ink-3'],
            '&.Mui-focused': { color: c.blue },
          },
        },
      },
      MuiFormControlLabel: {
        styleOverrides: { label: { fontSize: '14px', color: c['ink-2'] } },
      },
      MuiSelect: {
        styleOverrides: { icon: { color: c['ink-3'] } },
      },

      // Menu a tendina: solo il bordo dà profondità
      MuiMenu: {
        defaultProps: { transitionDuration: 0 },
        styleOverrides: {
          paper: { border: `1px solid ${c['line-2']}`, borderRadius: 0, boxShadow: 'none', backgroundImage: 'none' },
        },
      },
      MuiPopover: {
        defaultProps: { transitionDuration: 0 },
        styleOverrides: { paper: { border: `1px solid ${c['line-2']}`, borderRadius: 0, boxShadow: 'none' } },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontSize: '14px',
            color: c['ink-2'],
            borderLeft: '3px solid transparent',
            transition: COLOR_TRANSITION,
            '&:hover': { backgroundColor: c['blue-t'], color: c.blue },
            '&:focus, &.Mui-focusVisible': { outline, outlineOffset: '-3px' },
            '&.Mui-selected': {
              backgroundColor: c['blue-t'],
              borderLeftColor: c.blue,
              color: c.blue,
              fontWeight: 700,
            },
            '&.Mui-selected:hover': { backgroundColor: c['blue-t'] },
          },
        },
      },

      // Finestre di dialogo e velo
      MuiDialog: {
        defaultProps: { transitionDuration: 0 },
        styleOverrides: { paper: { border: `1px solid ${c['line-2']}`, borderRadius: 0, boxShadow: 'none' } },
      },
      MuiBackdrop: {
        defaultProps: { transitionDuration: 0 },
        // Velo chiaro e piatto; i menu e le tendine usano un velo invisibile e restano trasparenti.
        styleOverrides: {
          root: ({ ownerState }) => (ownerState.invisible ? {} : { backgroundColor: c.scrim }),
        },
      },
      MuiModal: { defaultProps: { disableScrollLock: false } },
      MuiTooltip: {
        defaultProps: { transitionDuration: 0, arrow: false },
        styleOverrides: {
          tooltip: {
            backgroundColor: c.ink,
            color: c.bg,
            borderRadius: 0,
            fontSize: '12.5px',
            boxShadow: 'none',
          },
        },
      },
      MuiCollapse: { defaultProps: { timeout: 0 } },
      MuiFade: { defaultProps: { timeout: 0 } },
      MuiGrow: { defaultProps: { timeout: 0 } },
      MuiSlide: { defaultProps: { timeout: 0 } },
      MuiSnackbar: { defaultProps: { transitionDuration: 0 } },

      // Avvisi: bordo sottile e segnalino a sinistra del colore di stato
      MuiAlert: {
        defaultProps: { variant: 'standard' },
        styleOverrides: {
          root: {
            borderRadius: 0,
            boxShadow: 'none',
            border: `1px solid ${c['line-2']}`,
            borderLeftWidth: 3,
            backgroundColor: c.bg,
            color: c.ink,
            fontSize: '14px',
          },
          standardSuccess: { borderLeftColor: c.ev, '& .MuiAlert-icon': { color: c['st-ok'] } },
          standardError: { borderLeftColor: c.err, '& .MuiAlert-icon': { color: c.err } },
          standardWarning: { borderLeftColor: c.act, '& .MuiAlert-icon': { color: c['st-sent'] } },
          standardInfo: { borderLeftColor: c.blue, '& .MuiAlert-icon': { color: c.blue } },
        },
      },

      // Interruttore: tutto squadrato
      MuiSwitch: {
        styleOverrides: {
          root: { width: 46, height: 26, padding: 0, margin: 8 },
          switchBase: {
            padding: 3,
            borderRadius: 0,
            color: c.ink,
            '&.Mui-checked': { transform: 'translateX(20px)', color: c['on-blue'] },
            '&.Mui-checked + .MuiSwitch-track': { backgroundColor: c.blue, borderColor: c.blue, opacity: 1 },
            '&.Mui-disabled + .MuiSwitch-track': { opacity: 0.6 },
          },
          thumb: { width: 18, height: 18, borderRadius: 0, boxShadow: 'none' },
          track: {
            borderRadius: 0,
            backgroundColor: c.bg,
            border: `1px solid ${c['line-2']}`,
            opacity: 1,
            boxSizing: 'border-box',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 0,
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: '11px',
            height: 24,
            transition: COLOR_TRANSITION,
          },
        },
      },
      MuiListItem: { styleOverrides: { root: { borderRadius: 0 } } },
      MuiListItemButton: { styleOverrides: { root: { borderRadius: 0 } } },
    },
    breakpoints: { values: { xs: 0, sm: 600, md: 960, lg: 1280, xl: 1920 } },
  });
};

export default createAppTheme;
