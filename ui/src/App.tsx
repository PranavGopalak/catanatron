import { lazy, Suspense } from "react";
import { SnackbarProvider } from "notistack";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Fade from "@mui/material/Fade";

import HomePage from "./pages/HomePage";
import { StateProvider } from "./store";
import { AppRouter, useRouteMatch } from "./routing";

import "./App.scss";
const GameScreen = lazy(() => import("./pages/GameScreen"));
const ReplayScreen = lazy(() => import("./pages/ReplayScreen"));

function CurrentRoute() {
  const route = useRouteMatch();
  if (route.name === "replay") return <ReplayScreen />;
  if (route.name === "game") return <GameScreen replayMode={false} />;
  return <HomePage />;
}

function RouteLoading() {
  return (
    <main className="route-loading" role="status">
      <span className="brand-glyph" aria-hidden="true">
        C
      </span>
      <strong>Loading the strategy lab…</strong>
    </main>
  );
}

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#f0b84b",
      contrastText: "#07110f",
    },
    secondary: {
      main: "#4ec7b1",
      contrastText: "#07110f",
    },
    background: {
      default: "#07110f",
      paper: "#192923",
    },
    text: {
      primary: "#f5ead6",
      secondary: "#9caaa4",
    },
    error: { main: "#f06558" },
  },
  typography: {
    fontFamily:
      '"DM Sans", Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
    button: {
      fontWeight: 700,
      letterSpacing: "0.04em",
    },
  },
  shape: {
    borderRadius: 14,
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: "none",
          minHeight: 44,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <StateProvider>
        <SnackbarProvider
          classes={{ containerRoot: "snackbar-container" }}
          maxSnack={1}
          autoHideDuration={1000}
          TransitionComponent={Fade}
          TransitionProps={{ timeout: 100 }}
          >
          <AppRouter>
            <Suspense fallback={<RouteLoading />}>
              <CurrentRoute />
            </Suspense>
          </AppRouter>
        </SnackbarProvider>
      </StateProvider>
    </ThemeProvider>
  );
}

export default App;
