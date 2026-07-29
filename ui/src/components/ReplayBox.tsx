import { useEffect, useState } from "react";
import {
  ArrowBackIosRounded,
  ArrowForwardIosRounded,
  FirstPageRounded,
  LastPageRounded,
} from "@mui/icons-material";
import { Button, IconButton, Slider, Tooltip } from "@mui/material";

import NumericTextInput from "./NumericTextInput";
import "./ReplayBox.scss";

export default function ReplayBox({
  stateIndex,
  latestStateIndex,
  onPrevMove,
  onNextMove,
  onSeekMove,
}: {
  stateIndex: number;
  latestStateIndex: number;
  onPrevMove: () => void;
  onNextMove: () => void;
  onSeekMove: (value: number) => void;
}) {
  const [inputValue, setInputValue] = useState(String(stateIndex));

  useEffect(() => {
    setInputValue(String(stateIndex));
  }, [stateIndex]);

  const commitInput = () => {
    const parsed = Number(inputValue);
    if (inputValue.trim() === "" || !Number.isFinite(parsed)) {
      setInputValue(String(stateIndex));
      return;
    }
    const next = Math.max(0, Math.min(latestStateIndex, Math.trunc(parsed)));
    setInputValue(String(next));
    if (next !== stateIndex) onSeekMove(next);
  };

  return (
    <section className="replay-box" aria-labelledby="replay-title">
      <div className="replay-heading">
        <div>
          <span>Timeline</span>
          <h2 id="replay-title">Move explorer</h2>
        </div>
        <strong>
          {stateIndex} <span>/ {latestStateIndex}</span>
        </strong>
      </div>

      <Slider
        aria-label="Replay move"
        className="move-slider"
        disabled={latestStateIndex === 0}
        max={Math.max(1, latestStateIndex)}
        min={0}
        onChange={(_, value) => onSeekMove(value as number)}
        step={1}
        value={stateIndex}
      />

      <div className="replay-jump-row">
        <Tooltip title="First move">
          <span>
            <IconButton
              aria-label="Go to first move"
              disabled={stateIndex === 0}
              onClick={() => onSeekMove(0)}
            >
              <FirstPageRounded />
            </IconButton>
          </span>
        </Tooltip>
        <NumericTextInput
          label="Go to move"
          onChange={setInputValue}
          onCommit={commitInput}
          size="small"
          value={inputValue}
        />
        <Tooltip title="Latest move">
          <span>
            <IconButton
              aria-label="Go to latest move"
              disabled={stateIndex === latestStateIndex}
              onClick={() => onSeekMove(latestStateIndex)}
            >
              <LastPageRounded />
            </IconButton>
          </span>
        </Tooltip>
      </div>

      <div className="replay-buttons">
        <Button
          disabled={stateIndex === 0}
          onClick={onPrevMove}
          startIcon={<ArrowBackIosRounded />}
          variant="outlined"
        >
          Previous
        </Button>
        <Button
          disabled={stateIndex === latestStateIndex}
          endIcon={<ArrowForwardIosRounded />}
          onClick={onNextMove}
          variant="contained"
        >
          Next
        </Button>
      </div>
    </section>
  );
}
