import cn from "classnames";
import type { Color, PlayerState } from "../utils/api.types";
import ResourceCards from "./ResourceCards";
import "./PlayerStateBox.scss";

export default function PlayerStateBox({
  playerState,
  playerKey,
  color,
  isCurrent,
  isBot,
}: {
  playerState: PlayerState;
  playerKey: string;
  color: Color;
  isCurrent: boolean;
  isBot: boolean;
}) {
  const value = (key: string): number =>
    Number(playerState[`${playerKey}_${key}`] ?? 0);
  const actualVps = value("ACTUAL_VICTORY_POINTS");

  return (
    <section
      aria-label={`${color} player${isCurrent ? ", current turn" : ""}`}
      className={cn("player-state-box", color.toLowerCase(), {
        current: isCurrent,
      })}
    >
      <header className="player-state-header">
        <span className="player-color-dot" aria-hidden="true" />
        <div>
          <strong>{color}</strong>
          <small>{isBot ? "Automated player" : "Human player"}</small>
        </div>
        {isCurrent && <span className="turn-badge">Current turn</span>}
      </header>

      <ResourceCards playerState={playerState} playerKey={playerKey} compact />

      <div className="player-score-grid">
        <span className={cn({ achieved: value("HAS_ARMY") })}>
          <strong>{value("PLAYED_KNIGHT")}</strong>
          <small>Knights</small>
        </span>
        <span className={cn({ achieved: value("HAS_ROAD") })}>
          <strong>{value("LONGEST_ROAD_LENGTH")}</strong>
          <small>Road</small>
        </span>
        <span className={cn({ achieved: actualVps >= 10 })}>
          <strong>{actualVps}</strong>
          <small>Points</small>
        </span>
      </div>
    </section>
  );
}
