import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "../routing";
import { Button, CircularProgress, Divider } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";

import ZoomableBoard from "./ZoomableBoard";
import ActionsToolbar from "./ActionsToolbar";
import LeftDrawer from "../components/LeftDrawer";
import RightDrawer from "../components/RightDrawer";
import AnalysisBox from "../components/AnalysisBox";
import { store } from "../store";
import ACTIONS from "../actions";
import { type StateIndex, getState, postAction } from "../utils/apiClient";
import { dispatchSnackbar } from "../components/Snackbar";
import { getHumanColor } from "../utils/stateUtils";
import { useSnackbar } from "notistack";
import "./GameScreen.scss";

const ROBOT_THINKING_TIME = 350;

function readablePrompt(prompt: string) {
  const labels: Record<string, string> = {
    BUILD_INITIAL_SETTLEMENT: "Place your first settlement",
    BUILD_INITIAL_ROAD: "Connect your first road",
    DISCARD: "Choose cards to discard",
    MOVE_ROBBER: "Move the robber",
    PLAY_TURN: "Plan your turn",
    ROLL: "Roll the dice",
  };
  return labels[prompt] ?? prompt.toLowerCase().replaceAll("_", " ");
}

export default function GameScreen({ replayMode }: { replayMode: boolean }) {
  const { gameId, stateIndex } = useParams();
  const { state, dispatch } = useContext(store);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const botActionKey = useRef<string | null>(null);

  const loadGame = useCallback(async () => {
    if (!gameId) {
      setLoadError("This match link is incomplete.");
      return;
    }
    dispatch({ type: ACTIONS.CLEAR_GAME_STATE });
    setLoadError(null);
    try {
      const gameState = await getState(gameId, stateIndex as StateIndex);
      dispatch({ type: ACTIONS.SET_GAME_STATE, data: gameState });
    } catch {
      setLoadError(
        "This match could not be loaded. It may no longer exist, or the game engine may be offline.",
      );
    }
  }, [dispatch, gameId, stateIndex]);

  useEffect(() => {
    void loadGame();
  }, [loadGame, retryKey]);

  useEffect(() => {
    const gameState = state.gameState;
    if (!gameState || replayMode || !gameId || gameState.winning_color) return;
    if (!gameState.bot_colors.includes(gameState.current_color)) {
      botActionKey.current = null;
      return;
    }

    const actionKey = `${gameId}:${gameState.state_index}:${gameState.current_color}`;
    if (botActionKey.current === actionKey) return;
    botActionKey.current = actionKey;

    const playBotTurn = async () => {
      setIsBotThinking(true);
      const startedAt = Date.now();
      try {
        const nextGameState = await postAction(gameId);
        const remainingDelay = Math.max(
          0,
          ROBOT_THINKING_TIME - (Date.now() - startedAt),
        );
        window.setTimeout(() => {
          setIsBotThinking(false);
          dispatch({ type: ACTIONS.SET_GAME_STATE, data: nextGameState });
          if (getHumanColor(nextGameState)) {
            dispatchSnackbar(enqueueSnackbar, closeSnackbar, nextGameState);
          }
        }, remainingDelay);
      } catch {
        setIsBotThinking(false);
        setLoadError(
          "The automated player could not complete its turn. Retry to continue the match.",
        );
      }
    };

    void playBotTurn();
  }, [
    closeSnackbar,
    dispatch,
    enqueueSnackbar,
    gameId,
    replayMode,
    state.gameState,
  ]);

  const turnLabel = useMemo(() => {
    if (!state.gameState) return "";
    if (state.gameState.winning_color) {
      return `${state.gameState.winning_color} wins`;
    }
    return readablePrompt(state.gameState.current_prompt);
  }, [state.gameState]);

  if (!state.gameState) {
    return (
      <main className="game-loading">
        <Link className="game-back-link" to="/">
          <ArrowBackRoundedIcon />
          New match
        </Link>
        {loadError ? (
          <section className="game-load-card" role="alert">
            <span className="load-card-glyph">!</span>
            <h1>We lost the board.</h1>
            <p>{loadError}</p>
            <Button
              onClick={() => setRetryKey((value) => value + 1)}
              startIcon={<RefreshRoundedIcon />}
              variant="contained"
            >
              Try again
            </Button>
          </section>
        ) : (
          <section className="game-load-card" role="status">
            <CircularProgress size={34} />
            <h1>Setting the table…</h1>
            <p>Building the board and restoring the latest move.</p>
          </section>
        )}
      </main>
    );
  }

  const gameState = state.gameState;

  return (
    <main className="game-shell">
      <header className="game-topbar">
        <Link className="game-wordmark" to="/" aria-label="Start a new match">
          <span>C</span>
          <strong>CATANATRON</strong>
        </Link>
        <div className="turn-status" role="status">
          <span className={`turn-color ${gameState.current_color.toLowerCase()}`} />
          <div>
            <small>
              {replayMode ? `Move ${gameState.state_index}` : "Current phase"}
            </small>
            <strong>{replayMode ? "Replay review" : turnLabel}</strong>
          </div>
          {isBotThinking && <span className="thinking-indicator">Thinking</span>}
        </div>
        <nav className="game-top-actions" aria-label="Match navigation">
          <span className="match-id" title={gameId}>
            Match {gameId?.slice(0, 8)}
          </span>
          {!replayMode && (
            <Link className="replay-link" to={`/replays/${gameId}`}>
              <ReplayRoundedIcon />
              Replay
            </Link>
          )}
          <Link className="new-match-link" to="/">
            New match
          </Link>
        </nav>
      </header>

      {loadError && (
        <div className="game-inline-error" role="alert">
          <span>{loadError}</span>
          <Button
            color="inherit"
            onClick={() => setRetryKey((value) => value + 1)}
            size="small"
          >
            Retry
          </Button>
        </div>
      )}

      <div className="game-layout">
        <LeftDrawer />
        <section className="game-center" aria-label="Game workspace">
          <div className="board-frame">
            <div className="board-caption">
              <span>{replayMode ? "Replay board" : "Live board"}</span>
              <small>Drag to pan · Scroll or pinch to zoom</small>
            </div>
            <ZoomableBoard replayMode={replayMode} />
          </div>
          {!replayMode && (
            <ActionsToolbar
              isBotThinking={isBotThinking}
              replayMode={replayMode}
            />
          )}
        </section>
        <RightDrawer>
          <AnalysisBox stateIndex={replayMode ? gameState.state_index : "latest"} />
          <Divider />
        </RightDrawer>
      </div>
    </main>
  );
}
