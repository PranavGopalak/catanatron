import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

test("renders the complete match studio", () => {
  render(<App />);

  expect(
    screen.getByRole("heading", { name: "Build smarter. Play deeper." }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Set the table" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Choose a board" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Seat the players" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Points to win")).toHaveValue("10");
  expect(screen.getByLabelText("Card discard limit")).toHaveValue("7");
  expect(
    screen.getByRole("button", { name: "Start match" }),
  ).toBeEnabled();
});

test("presets update the complete configuration", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(
    screen.getByRole("button", {
      name: "Strategy lab Long game · friendly robber",
    }),
  );

  expect(screen.getByText("3 players · 15 points · friendly robber")).toBeVisible();
  expect(screen.getByRole("button", { name: "Tournament Competitive layout" }))
    .toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("Friendly robber")).toBeChecked();
});
