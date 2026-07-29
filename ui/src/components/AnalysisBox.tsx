import { useContext, useEffect, useState } from "react";
import { Button, CircularProgress } from "@mui/material";
import AssessmentRoundedIcon from "@mui/icons-material/AssessmentRounded";
import AutoGraphRoundedIcon from "@mui/icons-material/AutoGraphRounded";
import { useParams } from "../routing";

import {
  type MCTSProbabilities,
  type StateIndex,
  getMctsAnalysis,
} from "../utils/apiClient";
import { store } from "../store";
import "./AnalysisBox.scss";

export default function AnalysisBox({ stateIndex }: { stateIndex: StateIndex }) {
  const { gameId } = useParams();
  const { state } = useContext(store);
  const [results, setResults] = useState<MCTSProbabilities>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setResults(undefined);
    setError("");
  }, [stateIndex, state.gameState?.state_index]);

  const analyze = async () => {
    if (!gameId || !state.gameState || state.gameState.winning_color) return;
    setLoading(true);
    setError("");
    try {
      const result = await getMctsAnalysis(gameId, stateIndex);
      if (!result.success) throw new Error("Analysis failed");
      setResults(result.probabilities);
    } catch {
      setError(
        "The strategy analysis could not finish. The position may be too expensive to evaluate right now.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="analysis-box" aria-labelledby="analysis-title">
      <div className="analysis-kicker">
        <AutoGraphRoundedIcon />
        Strategy lens
      </div>
      <h2 id="analysis-title">Win forecast</h2>
      <p>
        Run 100 Monte Carlo simulations from this exact board position.
      </p>
      <Button
        disabled={loading || !!state.gameState?.winning_color}
        fullWidth
        onClick={analyze}
        startIcon={
          loading ? (
            <CircularProgress color="inherit" size={18} />
          ) : (
            <AssessmentRoundedIcon />
          )
        }
        variant="contained"
      >
        {loading ? "Exploring futures…" : results ? "Run again" : "Analyze position"}
      </Button>

      {error && (
        <div className="analysis-error" role="alert">
          {error}
        </div>
      )}

      {results && !loading && !error && (
        <div className="probability-bars" aria-label="Win probabilities">
          {Object.entries(results).map(([color, probability]) => (
            <div
              className={`probability-row ${color.toLowerCase()}`}
              key={color}
            >
              <span className="probability-label">
                <i />
                {color}
              </span>
              <span
                aria-label={`${color}: ${probability}%`}
                className="probability-track"
                role="meter"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={probability}
              >
                <i style={{ width: `${Math.max(0, Math.min(100, probability))}%` }} />
              </span>
              <strong>{probability}%</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
