import { useCallback, useContext } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import PeopleAltRoundedIcon from "@mui/icons-material/PeopleAltRounded";
import { IconButton } from "@mui/material";
import cn from "classnames";

import PlayerStateBox from "./PlayerStateBox";
import { humanizeActionRecord } from "../utils/promptUtils";
import { store } from "../store";
import ACTIONS from "../actions";
import { playerKey } from "../utils/stateUtils";
import type { GameState } from "../utils/api.types";
import "./LeftDrawer.scss";

export default function LeftDrawer() {
  const { state, dispatch } = useContext(store);
  const gameState = state.gameState as GameState;
  const close = useCallback(
    () => dispatch({ type: ACTIONS.SET_LEFT_DRAWER_OPENED, data: false }),
    [dispatch],
  );

  return (
    <>
      {state.isLeftDrawerOpen && (
        <button
          aria-label="Close table panel"
          className="drawer-backdrop"
          onClick={close}
          type="button"
        />
      )}
      <aside
        aria-label="Players and game history"
        className={cn("game-panel table-panel", {
          "mobile-open": state.isLeftDrawerOpen,
        })}
        id="table-panel"
      >
        <header className="panel-heading">
          <div>
            <PeopleAltRoundedIcon />
            <span>
              <strong>Table</strong>
              <small>{gameState.colors.length} seated players</small>
            </span>
          </div>
          <IconButton
            aria-label="Close table panel"
            className="panel-close"
            onClick={close}
            size="small"
          >
            <CloseRoundedIcon />
          </IconButton>
        </header>

        <div className="player-stack">
          {gameState.colors.map((color) => (
            <PlayerStateBox
              color={color}
              isBot={gameState.bot_colors.includes(color)}
              isCurrent={gameState.current_color === color}
              key={color}
              playerKey={playerKey(gameState, color)}
              playerState={gameState.player_state}
            />
          ))}
        </div>

        <section className="history-section" aria-labelledby="history-title">
          <div className="history-heading">
            <HistoryRoundedIcon />
            <h2 id="history-title">Move history</h2>
            <span>{gameState.action_records.length}</span>
          </div>
          <div className="history-list" role="log" aria-live="polite">
            {gameState.action_records.length === 0 ? (
              <p className="history-empty">
                The opening move will appear here.
              </p>
            ) : (
              gameState.action_records
                .slice()
                .reverse()
                .map((actionRecord, index) => (
                  <div
                    className={cn(
                      "history-entry",
                      actionRecord[0][0].toLowerCase(),
                    )}
                    key={`${gameState.action_records.length - index}-${actionRecord[0][1]}`}
                  >
                    <span>{gameState.action_records.length - index}</span>
                    <p>{humanizeActionRecord(gameState, actionRecord)}</p>
                  </div>
                ))
            )}
          </div>
        </section>
      </aside>
    </>
  );
}
