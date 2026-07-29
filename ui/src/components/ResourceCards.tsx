import type { Card, PlayerState, ResourceCard } from "../utils/api.types";
import "./PlayerStateBox.scss";

const RESOURCES: Array<{
  card: ResourceCard;
  label: string;
  short: string;
}> = [
  { card: "WOOD", label: "Wood", short: "Wd" },
  { card: "BRICK", label: "Brick", short: "Br" },
  { card: "SHEEP", label: "Sheep", short: "Sh" },
  { card: "WHEAT", label: "Wheat", short: "Wh" },
  { card: "ORE", label: "Ore", short: "Or" },
];

const DEVELOPMENT: Array<{ card: Card; label: string; short: string }> = [
  { card: "VICTORY_POINT", label: "Victory point", short: "VP" },
  { card: "KNIGHT", label: "Knight", short: "Kn" },
  { card: "MONOPOLY", label: "Monopoly", short: "Mo" },
  { card: "YEAR_OF_PLENTY", label: "Year of Plenty", short: "YP" },
  { card: "ROAD_BUILDING", label: "Road Building", short: "RB" },
];

export default function ResourceCards({
  playerState,
  playerKey,
  compact = false,
}: {
  playerState: PlayerState;
  playerKey: string;
  compact?: boolean;
}) {
  const amount = (card: Card): number =>
    Number(playerState[`${playerKey}_${card}_IN_HAND`] ?? 0);
  const developmentCards = DEVELOPMENT.filter(({ card }) => amount(card) > 0);

  return (
    <div
      aria-label="Resource cards"
      className={`resource-cards ${compact ? "compact" : ""}`}
    >
      {RESOURCES.map(({ card, label, short }) => (
        <div
          aria-label={`${label}: ${amount(card)}`}
          className={`resource-card ${card.toLowerCase()}`}
          key={card}
          title={`${label}: ${amount(card)}`}
        >
          <span>{short}</span>
          <strong>{amount(card)}</strong>
        </div>
      ))}
      {developmentCards.length > 0 && <span className="card-divider" />}
      {developmentCards.map(({ card, label, short }) => (
        <div
          aria-label={`${label}: ${amount(card)}`}
          className="resource-card development"
          key={card}
          title={`${label}: ${amount(card)}`}
        >
          <span>{short}</span>
          <strong>{amount(card)}</strong>
        </div>
      ))}
    </div>
  );
}
