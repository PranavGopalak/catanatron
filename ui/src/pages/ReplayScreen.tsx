import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "../routing";
import {
  ArrowBackRounded,
  ArrowForwardRounded,
  InsightsRounded,
  LiveTvRounded,
} from "@mui/icons-material";
import { Button, CircularProgress, Divider } from "@mui/material";

import ZoomableBoard from "./ZoomableBoard";
import LeftDrawer from "../components/LeftDrawer";
import RightDrawer from "../components/RightDrawer";
import AnalysisBox from "../components/AnalysisBox";
import ReplayBox from "../components/ReplayBox";
import { store } from "../store";
import ACTIONS from "../actions";
import { getState } from "../utils/apiClient";
import "./ReplayScreen.scss";

export default function ReplayScreen() {
  const { gameId, stateIndex: routeStateIndex } = useParams();
  const { state, dispatch } = useContext(store);
  const [latestStateIndex, setLatestStateIndex] = useState(0);
  const [stateIndex, setStateIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  useEffect(() => {
    if (!gameId) {
      setError("This replay link is incomplete.");
      setLoading(false);
      return;
    }
    let active = true;
    dispatch({ type: ACTIONS.CLEAR_GAME_STATE });
    setLoading(true);
    setError("");
    void getState(gameId, "latest")
      .then(async (latestState) => {
        if (!active) return;
        setLatestStateIndex(latestState.state_index);
        const parsedRouteIndex = Number(routeStateIndex);
        const targetIndex =
          routeStateIndex !== undefined &&
          Number.isInteger(parsedRouteIndex) &&
          parsedRouteIndex >= 0 &&
          parsedRouteIndex <= latestState.state_index
            ? parsedRouteIndex
            : latestState.state_index;
        const targetState =
          targetIndex === latestState.state_index
            ? latestState
            : await getState(gameId, targetIndex);
        if (!active) return;
        setStateIndex(targetIndex);
        dispatch({ type: ACTIONS.SET_GAME_STATE, data: targetState });
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("This replay could not be loaded.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dispatch, gameId, routeStateIndex]);

  const seek = useCallback(
    async (nextIndex: number) => {
      if (!gameId || nextIndex < 0 || nextIndex > latestStateIndex) return;
      const sequence = ++requestSequence.current;
      setStateIndex(nextIndex);
      setLoading(true);
      setError("");
      try {
        const gameState = await getState(gameId, nextIndex);
        if (sequence !== requestSequence.current) return;
        dispatch({ type: ACTIONS.SET_GAME_STATE, data: gameState });
      } catch {
        if (sequence !== requestSequence.current) return;
        setError(`Move ${nextIndex} could not be loaded.`);
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [dispatch, gameId, latestStateIndex],
  );

  const openInsights = () =>
    dispatch({ type: ACTIONS.SET_RIGHT_DRAWER_OPENED, data: true });

  if (!state.gameState || stateIndex === null) {
    return (
      <main className="game-loading">
        <Link className="game-back-link" to={gameId ? `/games/${gameId}` : "/"}>
          <ArrowBackRounded />
          Back to match
        </Link>
        <section className="game-load-card" role={error ? "alert" : "status"}>
          {error ? (
            <span className="load-card-glyph">!</span>
          ) : (
            <CircularProgress size={34} />
          )}
          <h1>{error ? "Replay unavailable" : "Rebuilding the timeline…"}</h1>
          <p>{error || "Loading every saved state from this match."}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="game-shell replay-shell">
      <header className="game-topbar">
        <Link className="game-wordmark" to="/" aria-label="Start a new match">
          <span>C</span>
          <strong>CATANATRON</strong>
        </Link>
        <div className="turn-status" role="status">
          <span
            className={`turn-color ${state.gameState.current_color.toLowerCase()}`}
          />
          <div>
            <small>Replay timeline</small>
            <strong>
              Move {stateIndex} of {latestStateIndex}
            </strong>
          </div>
          {loading && <span className="thinking-indicator">Loading</span>}
        </div>
        <nav className="game-top-actions" aria-label="Replay navigation">
          <span className="match-id" title={gameId}>
            Match {gameId?.slice(0, 8)}
          </span>
          <Link className="replay-link" to={`/games/${gameId}`}>
            <LiveTvRounded />
            Live board
          </Link>
          <Link className="new-match-link" to="/">
            New match
          </Link>
        </nav>
      </header>

      {error && (
        <div className="game-inline-error" role="alert">
          {error}
        </div>
      )}

      <div className="game-layout">
        <LeftDrawer />
        <section className="game-center" aria-label="Replay workspace">
          <div className="board-frame">
            <div className="board-caption">
              <span>Recorded board · move {stateIndex}</span>
              <small>Drag to pan · Scroll or pinch to zoom</small>
            </div>
            <ZoomableBoard replayMode />
          </div>
          <div className="replay-control-strip">
            <Button
              aria-label="Previous replay move"
              disabled={stateIndex === 0 || loading}
              onClick={() => void seek(stateIndex - 1)}
            >
              <ArrowBackRounded />
              Previous
            </Button>
            <strong>
              {stateIndex} <span>/ {latestStateIndex}</span>
            </strong>
            <Button
              aria-label="Next replay move"
              disabled={stateIndex === latestStateIndex || loading}
              onClick={() => void seek(stateIndex + 1)}
            >
              Next
              <ArrowForwardRounded />
            </Button>
            <Button
              aria-controls="insights-panel"
              className="open-replay-insights"
              onClick={openInsights}
            >
              <InsightsRounded />
              Explore
            </Button>
          </div>
        </section>
        <RightDrawer>
          <ReplayBox
            latestStateIndex={latestStateIndex}
            onNextMove={() => void seek(Math.min(stateIndex + 1, latestStateIndex))}
            onPrevMove={() => void seek(Math.max(stateIndex - 1, 0))}
            onSeekMove={(index) => void seek(index)}
            stateIndex={stateIndex}
          />
          <Divider />
          <AnalysisBox stateIndex={stateIndex} />
        </RightDrawer>
      </div>
    </main>
  );
}
