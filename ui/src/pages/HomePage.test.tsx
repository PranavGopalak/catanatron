import { beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HomePage from "./HomePage";
import { AppRouter, useRouteMatch } from "../routing";
import { createGame } from "../utils/apiClient";

vi.mock("../utils/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/apiClient")>();
  return { ...actual, createGame: vi.fn() };
});

function renderHomePage() {
  function TestRoute() {
    const route = useRouteMatch();
    return route.name === "game" ? <div>Loaded match</div> : <HomePage />;
  }
  return render(
    <AppRouter initialPath="/">
      <TestRoute />
    </AppRouter>,
  );
}

beforeEach(() => {
  vi.mocked(createGame).mockReset();
});

test("starts a match with the selected settings", async () => {
  const user = userEvent.setup();
  vi.mocked(createGame).mockResolvedValue("match-123");
  renderHomePage();

  await user.click(screen.getByRole("button", { name: "Start match" }));

  expect(createGame).toHaveBeenCalledWith({
    players: ["HUMAN", "CATANATRON", "WEIGHTED_RANDOM", "WEIGHTED_RANDOM"],
    mapTemplate: "BASE",
    vpsToWin: 10,
    discardLimit: 7,
    friendlyRobber: false,
  });
  expect(await screen.findByText("Loaded match")).toBeVisible();
});

test("shows a recoverable error when the engine is offline", async () => {
  const user = userEvent.setup();
  vi.mocked(createGame).mockRejectedValue(new Error("offline"));
  renderHomePage();

  await user.click(screen.getByRole("button", { name: "Start match" }));

  expect(
    await screen.findByText(/game engine could not start this match/i),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
});

test("enforces two to four seats", async () => {
  const user = userEvent.setup();
  renderHomePage();

  const removeSeatFour = screen.getByRole("button", { name: "Remove seat 4" });
  await user.click(removeSeatFour);
  await user.click(screen.getByRole("button", { name: "Remove seat 3" }));

  expect(screen.getByText("2/4")).toBeVisible();
  expect(screen.getAllByRole("button", { name: /Remove seat/ })).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Add a seat" })).toBeEnabled();
  expect(screen.getAllByRole("button", { name: /Remove seat/ })[0]).toBeDisabled();
});
