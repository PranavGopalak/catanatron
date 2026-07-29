import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Slider,
  Tooltip,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import PsychologyRoundedIcon from "@mui/icons-material/PsychologyRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";

import {
  createGame,
  type MapTemplate,
  type PlayerArchetype,
} from "../utils/apiClient";
import "./HomePage.scss";

type PlayerOption = {
  value: PlayerArchetype;
  label: string;
  description: string;
};

const PLAYER_ARCHETYPES: PlayerOption[] = [
  {
    value: "HUMAN",
    label: "Human",
    description: "You make every decision.",
  },
  {
    value: "CATANATRON",
    label: "Catanatron",
    description: "Search-driven tactical AI.",
  },
  {
    value: "WEIGHTED_RANDOM",
    label: "Weighted",
    description: "Fast, sensible baseline bot.",
  },
  {
    value: "RANDOM",
    label: "Random",
    description: "Unpredictable legal moves.",
  },
];

const MAPS: Array<{
  value: MapTemplate;
  label: string;
  detail: string;
  rings: number;
}> = [
  { value: "BASE", label: "Classic", detail: "19 land tiles", rings: 3 },
  { value: "MINI", label: "Mini", detail: "7 land tiles", rings: 2 },
  {
    value: "TOURNAMENT",
    label: "Tournament",
    detail: "Competitive layout",
    rings: 4,
  },
];

const PLAYER_COLORS = [
  { value: "RED", label: "Ember" },
  { value: "BLUE", label: "Tide" },
  { value: "ORANGE", label: "Saffron" },
  { value: "WHITE", label: "Ivory" },
] as const;

const PRESETS = [
  {
    label: "Quick duel",
    description: "Fast map · 10 points",
    players: ["HUMAN", "WEIGHTED_RANDOM"] as PlayerArchetype[],
    mapTemplate: "MINI" as MapTemplate,
    vpsToWin: 10,
    discardLimit: 7,
    friendlyRobber: false,
  },
  {
    label: "Classic table",
    description: "Four seats · official pace",
    players: [
      "HUMAN",
      "CATANATRON",
      "WEIGHTED_RANDOM",
      "WEIGHTED_RANDOM",
    ] as PlayerArchetype[],
    mapTemplate: "BASE" as MapTemplate,
    vpsToWin: 10,
    discardLimit: 7,
    friendlyRobber: false,
  },
  {
    label: "Strategy lab",
    description: "Long game · friendly robber",
    players: ["HUMAN", "CATANATRON", "CATANATRON"] as PlayerArchetype[],
    mapTemplate: "TOURNAMENT" as MapTemplate,
    vpsToWin: 15,
    discardLimit: 9,
    friendlyRobber: true,
  },
];

function HexPreview({ rings }: { rings: number }) {
  const cells = Array.from({ length: rings === 2 ? 7 : rings === 3 ? 19 : 25 });
  return (
    <div className={`map-hex-preview rings-${rings}`} aria-hidden="true">
      {cells.map((_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapTemplate, setMapTemplate] = useState<MapTemplate>("BASE");
  const [vpsToWin, setVpsToWin] = useState(10);
  const [discardLimit, setDiscardLimit] = useState(7);
  const [friendlyRobber, setFriendlyRobber] = useState(false);
  const [players, setPlayers] = useState<PlayerArchetype[]>([
    "HUMAN",
    "CATANATRON",
    "WEIGHTED_RANDOM",
    "WEIGHTED_RANDOM",
  ]);

  const humanCount = players.filter((player) => player === "HUMAN").length;
  const selectedMap = MAPS.find((map) => map.value === mapTemplate) ?? MAPS[0];
  const canStart = humanCount <= 1 && players.length >= 2 && !loading;
  const summary = useMemo(
    () => [
      `${players.length} players`,
      `${vpsToWin} points`,
      friendlyRobber ? "friendly robber" : "standard robber",
    ],
    [players.length, vpsToWin, friendlyRobber],
  );

  const setPlayer = (index: number, value: PlayerArchetype) => {
    if (
      value === "HUMAN" &&
      players[index] !== "HUMAN" &&
      humanCount >= 1
    ) {
      return;
    }
    setPlayers((current) =>
      current.map((player, playerIndex) =>
        playerIndex === index ? value : player,
      ),
    );
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setPlayers(preset.players);
    setMapTemplate(preset.mapTemplate);
    setVpsToWin(preset.vpsToWin);
    setDiscardLimit(preset.discardLimit);
    setFriendlyRobber(preset.friendlyRobber);
    setError(null);
  };

  const startGame = async () => {
    if (!canStart) return;
    setLoading(true);
    setError(null);
    try {
      const gameId = await createGame({
        players,
        mapTemplate,
        vpsToWin,
        discardLimit,
        friendlyRobber,
      });
      navigate(`/games/${gameId}`);
    } catch {
      setError(
        "The game engine could not start this match. Check that the local server is running, then try again.",
      );
      setLoading(false);
    }
  };

  return (
    <main className="home-page">
      <div className="home-orbit home-orbit-one" aria-hidden="true" />
      <div className="home-orbit home-orbit-two" aria-hidden="true" />

      <header className="home-nav">
        <a className="home-brand" href="/" aria-label="Catanatron home">
          <span className="brand-glyph" aria-hidden="true">
            C
          </span>
          <span>
            <strong>CATANATRON</strong>
            <small>Strategy engine</small>
          </span>
        </a>
        <div className="engine-status" role="status">
          <span className="status-dot" />
          Engine ready
        </div>
      </header>

      <div className="home-layout">
        <section className="home-intro" aria-labelledby="home-title">
          <div>
            <p className="eyebrow">
              <BoltRoundedIcon fontSize="small" />
              Open-source Catan laboratory
            </p>
            <h1 id="home-title">
              Build smarter.
              <br />
              <span>Play deeper.</span>
            </h1>
            <p className="intro-copy">
              Challenge a search-driven AI, inspect every move, and replay the
              decisions that shaped the board.
            </p>
          </div>

          <div className="intro-proof" aria-label="Product highlights">
            <div>
              <PsychologyRoundedIcon />
              <span>
                <strong>Purpose-built AI</strong>
                Search, evaluation, and playout agents
              </span>
            </div>
            <div>
              <RefreshRoundedIcon />
              <span>
                <strong>Move-by-move replay</strong>
                Study any state without losing context
              </span>
            </div>
            <div>
              <ShieldRoundedIcon />
              <span>
                <strong>Rules-accurate engine</strong>
                Deterministic seeds and legal-action checks
              </span>
            </div>
          </div>
        </section>

        <section className="match-studio" aria-labelledby="match-studio-title">
          <div className="studio-heading">
            <div>
              <p className="eyebrow">New match</p>
              <h2 id="match-studio-title">Set the table</h2>
            </div>
            <span className="match-summary">{summary.join(" · ")}</span>
          </div>

          <div className="preset-row" aria-label="Match presets">
            {PRESETS.map((preset) => (
              <button
                className="preset-button"
                key={preset.label}
                onClick={() => applyPreset(preset)}
                type="button"
              >
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
              </button>
            ))}
          </div>

          <div className="studio-section">
            <div className="section-heading">
              <span className="section-number">01</span>
              <div>
                <h3>Choose a board</h3>
                <p>Each layout changes the tempo and available space.</p>
              </div>
            </div>
            <div className="map-options">
              {MAPS.map((map) => (
                <button
                  aria-pressed={mapTemplate === map.value}
                  className={`map-option ${
                    mapTemplate === map.value ? "selected" : ""
                  }`}
                  key={map.value}
                  onClick={() => setMapTemplate(map.value)}
                  type="button"
                >
                  <HexPreview rings={map.rings} />
                  <span>
                    <strong>{map.label}</strong>
                    <small>{map.detail}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="studio-section">
            <div className="section-heading">
              <span className="section-number">02</span>
              <div>
                <h3>Seat the players</h3>
                <p>Two to four seats. One human player maximum.</p>
              </div>
              <span className="seat-count">{players.length}/4</span>
            </div>

            <div className="player-list">
              {players.map((player, index) => {
                const color = PLAYER_COLORS[index];
                const option =
                  PLAYER_ARCHETYPES.find((item) => item.value === player) ??
                  PLAYER_ARCHETYPES[0];
                return (
                  <div className="player-seat" key={`seat-${index}`}>
                    <span
                      className={`seat-color ${color.value.toLowerCase()}`}
                      aria-hidden="true"
                    />
                    <div className="seat-label">
                      <strong>Seat {index + 1}</strong>
                      <span>{color.label}</span>
                    </div>
                    <Select
                      aria-label={`Seat ${index + 1} player type`}
                      className="player-select"
                      onChange={(event) =>
                        setPlayer(index, event.target.value as PlayerArchetype)
                      }
                      size="small"
                      value={player}
                    >
                      {PLAYER_ARCHETYPES.map((item) => (
                        <MenuItem
                          disabled={
                            item.value === "HUMAN" &&
                            humanCount >= 1 &&
                            player !== "HUMAN"
                          }
                          key={item.value}
                          value={item.value}
                        >
                          {item.label}
                        </MenuItem>
                      ))}
                    </Select>
                    <span className="seat-description">
                      {option.description}
                    </span>
                    <Tooltip title="Remove seat">
                      <span>
                        <IconButton
                          aria-label={`Remove seat ${index + 1}`}
                          disabled={players.length <= 2}
                          onClick={() =>
                            setPlayers((current) =>
                              current.filter(
                                (_, playerIndex) => playerIndex !== index,
                              ),
                            )
                          }
                          size="small"
                        >
                          <CloseRoundedIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </div>
                );
              })}
            </div>

            <Button
              className="add-seat-button"
              disabled={players.length >= 4}
              onClick={() =>
                setPlayers((current) => [...current, "WEIGHTED_RANDOM"])
              }
              startIcon={<AddRoundedIcon />}
              variant="outlined"
            >
              Add a seat
            </Button>
          </div>

          <div className="studio-section rule-options">
            <div className="section-heading">
              <span className="section-number">03</span>
              <div>
                <h3>Tune the rules</h3>
                <p>Set the match length and robber pressure.</p>
              </div>
            </div>

            <div className="rule-grid">
              <label className="rule-control">
                <span>
                  <strong>Points to win</strong>
                  <output>{vpsToWin}</output>
                </span>
                <Slider
                  aria-label="Points to win"
                  marks={[
                    { value: 3, label: "3" },
                    { value: 10, label: "10" },
                    { value: 20, label: "20" },
                  ]}
                  max={20}
                  min={3}
                  onChange={(_, value) => setVpsToWin(value as number)}
                  value={vpsToWin}
                  valueLabelDisplay="auto"
                />
              </label>
              <label className="rule-control">
                <span>
                  <strong>Discard limit</strong>
                  <output>{discardLimit}</output>
                </span>
                <Slider
                  aria-label="Card discard limit"
                  marks={[
                    { value: 5, label: "5" },
                    { value: 7, label: "7" },
                    { value: 20, label: "20" },
                  ]}
                  max={20}
                  min={5}
                  onChange={(_, value) => setDiscardLimit(value as number)}
                  value={discardLimit}
                  valueLabelDisplay="auto"
                />
              </label>
              <div className="friendly-control">
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={friendlyRobber}
                      onChange={(event) =>
                        setFriendlyRobber(event.target.checked)
                      }
                    />
                  }
                  label="Friendly robber"
                />
                <Tooltip title="The robber cannot target opponents who have only two victory points.">
                  <IconButton aria-label="Friendly robber help" size="small">
                    <HelpOutlineRoundedIcon />
                  </IconButton>
                </Tooltip>
              </div>
            </div>
          </div>

          {humanCount > 1 && (
            <Alert severity="error">
              Only one Human player is allowed. Choose a bot for the other
              human seat.
            </Alert>
          )}
          {error && (
            <Alert
              action={
                <Button color="inherit" onClick={startGame} size="small">
                  Retry
                </Button>
              }
              severity="error"
            >
              {error}
            </Alert>
          )}

          <div className="studio-footer">
            <div>
              <strong>{selectedMap.label}</strong>
              <span>{selectedMap.detail}</span>
            </div>
            <Button
              className="launch-button"
              disabled={!canStart}
              endIcon={<ArrowForwardRoundedIcon />}
              onClick={startGame}
              variant="contained"
            >
              {loading ? "Preparing board…" : "Start match"}
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
