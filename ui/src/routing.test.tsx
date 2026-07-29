import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  AppRouter,
  Link,
  matchRoute,
  useParams,
  useRouteMatch,
} from "./routing";

test("matches every supported route and falls back home", () => {
  expect(matchRoute("/")).toEqual({ name: "home", params: {} });
  expect(matchRoute("/games/match-1")).toEqual({
    name: "game",
    params: { gameId: "match-1" },
  });
  expect(matchRoute("/replays/match%202")).toEqual({
    name: "replay",
    params: { gameId: "match 2" },
  });
  expect(matchRoute("/games/match-3/states/42")).toEqual({
    name: "replay",
    params: { gameId: "match-3", stateIndex: "42" },
  });
  expect(matchRoute("/unknown/path")).toEqual({ name: "home", params: {} });
});

test("internal links navigate without a page reload", async () => {
  const user = userEvent.setup();

  function Probe() {
    const route = useRouteMatch();
    const params = useParams();
    return route.name === "home" ? (
      <Link to="/games/demo">Open match</Link>
    ) : (
      <p>Loaded {params.gameId}</p>
    );
  }

  render(
    <AppRouter initialPath="/">
      <Probe />
    </AppRouter>,
  );
  await user.click(screen.getByRole("link", { name: "Open match" }));

  expect(screen.getByText("Loaded demo")).toBeVisible();
  expect(window.location.pathname).toBe("/games/demo");
});

test("malformed encoded identifiers do not escape the router", () => {
  expect(matchRoute("/games/%E0%A4%A")).toEqual({
    name: "game",
    params: { gameId: undefined },
  });
});
