import type { Color, GameState } from "./api.types";

/**
 * Check if it's a human player's turn
 * @param gameState
 * @returns True if a human player needs to play
 */
export function isPlayersTurn(gameState: GameState): boolean {
  return !gameState.bot_colors.includes(gameState.current_color);
}

export function playerKey(gameState: GameState, color: Color): string {
  const index = gameState.colors.indexOf(color);
  if (index === -1) {
    throw new Error(`Color ${color} is not seated in this game`);
  }
  return `P${index}`;
}

export function getHumanColor(gameState: GameState): Color | undefined {
  return gameState.colors.find(
    (color) => !gameState.bot_colors.includes(color)
  );
}
