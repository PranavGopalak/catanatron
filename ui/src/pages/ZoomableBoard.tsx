import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import memoize from "fast-memoize";
import { useParams } from "../routing";

import "./Board.scss";
import { store, type CatanState } from "../store";
import { isPlayersTurn } from "../utils/stateUtils";
import { postAction } from "../utils/apiClient";
import ACTIONS from "../actions";
import Board from "./Board";
import type { GameAction, TileCoordinate } from "../utils/api.types";

function buildNodeActions(state: CatanState) {
  if (!state.gameState || !isPlayersTurn(state.gameState)) return {};

  const nodeActions: Record<number, GameAction> = {};
  if (state.gameState.is_initial_build_phase || state.isBuildingSettlement) {
    state.gameState.current_playable_actions
      .filter((action) => action[1] === "BUILD_SETTLEMENT")
      .forEach((action) => {
        nodeActions[action[2]] = action;
      });
  } else if (state.isBuildingCity) {
    state.gameState.current_playable_actions
      .filter((action) => action[1] === "BUILD_CITY")
      .forEach((action) => {
        nodeActions[action[2]] = action;
      });
  }
  return nodeActions;
}

function buildEdgeActions(state: CatanState) {
  if (!state.gameState || !isPlayersTurn(state.gameState)) return {};

  const edgeActions: Record<`${number},${number}`, GameAction> = {};
  if (
    state.gameState.is_initial_build_phase ||
    state.isBuildingRoad ||
    state.isRoadBuilding
  ) {
    state.gameState.current_playable_actions
      .filter((action) => action[1] === "BUILD_ROAD")
      .forEach((action) => {
        edgeActions[`${action[2][0]},${action[2][1]}`] = action;
      });
  }
  return edgeActions;
}

export default function ZoomableBoard({
  replayMode,
}: {
  replayMode: boolean;
}) {
  const { gameId } = useParams();
  const { state, dispatch } = useContext(store);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [show, setShow] = useState(false);
  const gameState = state.gameState!;
  const resolvedGameId = gameId!;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setSize({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setShow(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const buildOnNodeClick = useCallback(
    memoize((id: number, action?: GameAction) => async () => {
      if (!action) return;
      const nextGameState = await postAction(resolvedGameId, action);
      dispatch({ type: ACTIONS.SET_GAME_STATE, data: nextGameState });
    }),
    [dispatch, resolvedGameId],
  );
  const buildOnEdgeClick = useCallback(
    memoize((id: [number, number], action?: GameAction) => async () => {
      if (!action) return;
      const nextGameState = await postAction(resolvedGameId, action);
      dispatch({ type: ACTIONS.SET_GAME_STATE, data: nextGameState });
    }),
    [dispatch, resolvedGameId],
  );
  const handleTileClick = useCallback(
    async (coordinate: TileCoordinate) => {
      if (!state.isMovingRobber) return;
      const matchingAction = gameState.current_playable_actions.find(
        (action) =>
          action[1] === "MOVE_ROBBER" &&
          action[2][0].every(
            (value: number, index: number) => value === coordinate[index],
          ),
      );
      if (!matchingAction) return;
      const nextGameState = await postAction(resolvedGameId, matchingAction);
      dispatch({ type: ACTIONS.SET_GAME_STATE, data: nextGameState });
    },
    [
      dispatch,
      gameState.current_playable_actions,
      resolvedGameId,
      state.isMovingRobber,
    ],
  );

  const nodeActions = useMemo(
    () => (replayMode ? {} : buildNodeActions(state)),
    [replayMode, state],
  );
  const edgeActions = useMemo(
    () => (replayMode ? {} : buildEdgeActions(state)),
    [replayMode, state],
  );
  const robberCoordinates = useMemo(
    () =>
      new Set(
        state.isMovingRobber
          ? gameState.current_playable_actions
              .filter((action) => action[1] === "MOVE_ROBBER")
              .map((action) => `${action[2][0]}`)
          : [],
      ),
    [gameState.current_playable_actions, state.isMovingRobber],
  );

  return (
    <div
      aria-label="Catan game board. Drag to pan and use the mouse wheel or pinch gesture to zoom."
      className="board-container"
      ref={containerRef}
      role="application"
    >
      {size.width > 0 && size.height > 0 && (
        <TransformWrapper
          centerOnInit
          doubleClick={{ disabled: true }}
          initialScale={1}
          maxScale={2.4}
          minScale={0.7}
          wheel={{ step: 0.08 }}
        >
          <TransformComponent
            contentStyle={{ width: "100%", height: "100%" }}
            wrapperStyle={{ width: "100%", height: "100%" }}
          >
            <Board
              width={size.width}
              height={size.height}
              buildOnNodeClick={buildOnNodeClick}
              buildOnEdgeClick={buildOnEdgeClick}
              handleTileClick={handleTileClick}
              nodeActions={nodeActions}
              edgeActions={edgeActions}
              replayMode={replayMode}
              show={show}
              gameState={gameState}
              isMovingRobber={state.isMovingRobber}
              robberCoordinates={robberCoordinates}
            />
          </TransformComponent>
        </TransformWrapper>
      )}
    </div>
  );
}
