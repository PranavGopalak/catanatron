import { useCallback, useContext, type PropsWithChildren } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import { IconButton } from "@mui/material";
import cn from "classnames";

import { store } from "../store";
import ACTIONS from "../actions";
import "./RightDrawer.scss";

export default function RightDrawer({ children }: PropsWithChildren) {
  const { state, dispatch } = useContext(store);
  const close = useCallback(
    () => dispatch({ type: ACTIONS.SET_RIGHT_DRAWER_OPENED, data: false }),
    [dispatch],
  );

  return (
    <>
      {state.isRightDrawerOpen && (
        <button
          aria-label="Close insights panel"
          className="drawer-backdrop insights-backdrop"
          onClick={close}
          type="button"
        />
      )}
      <aside
        aria-label="Match insights"
        className={cn("game-panel insights-panel", {
          "mobile-open": state.isRightDrawerOpen,
        })}
        id="insights-panel"
      >
        <header className="panel-heading">
          <div>
            <InsightsRoundedIcon />
            <span>
              <strong>Insights</strong>
              <small>Analysis and replay tools</small>
            </span>
          </div>
          <IconButton
            aria-label="Close insights panel"
            className="panel-close"
            onClick={close}
            size="small"
          >
            <CloseRoundedIcon />
          </IconButton>
        </header>
        <div className="drawer-content">{children}</div>
      </aside>
    </>
  );
}
