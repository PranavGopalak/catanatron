import pytest
import json
from unittest.mock import patch
from catanatron.web import create_app
from catanatron.web.models import db, GameState, get_game_state


@pytest.fixture
def app():
    """Create and configure a new app instance for each test."""
    # Setup an in-memory SQLite database for testing
    app = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "SECRET_KEY": "test",
        }
    )

    with app.app_context():
        db.create_all()

    yield app

    # Teardown: drop all tables after each test (optional, if tests are isolated)
    # with app.app_context():
    #     db.drop_all()


@pytest.fixture
def client(app):
    """A test client for the app."""
    return app.test_client()


def create_game_on_human_turn(client):
    response = client.post("/api/games", json={"players": ["HUMAN", "RANDOM"]})
    game_id = response.json["game_id"]
    for _ in range(4):
        state = client.get(f"/api/games/{game_id}/states/latest").json
        if state["current_color"] not in state["bot_colors"]:
            return game_id
        tick = client.post(f"/api/games/{game_id}/actions", json={})
        assert tick.status_code == 200
    raise AssertionError("Game did not reach the human turn")


def test_post_game_endpoint(client):
    """Test creating a new game."""
    response = client.post("/api/games", json={"players": ["RANDOM", "RANDOM"]})
    assert response.status_code == 200
    data = json.loads(response.data)
    assert "game_id" in data
    # Further check: Ensure the game was actually created in the db
    with client.application.app_context():
        assert (
            db.session.query(GameState).filter_by(uuid=data["game_id"]).first()
            is not None
        )


def test_post_game_endpoint_accepts_custom_config(client):
    response = client.post(
        "/api/games",
        json={
            "players": ["WEIGHTED_RANDOM", "CATANATRON"],
            "map_template": "MINI",
            "vps_to_win": 15,
            "discard_limit": 12,
            "friendly_robber": True,
        },
    )
    assert response.status_code == 200
    data = json.loads(response.data)

    with client.application.app_context():
        game = get_game_state(data["game_id"])
        assert game.friendly_robber is True

    state_response = client.get(f"/api/games/{data['game_id']}/states/latest")
    assert state_response.status_code == 200
    state_data = json.loads(state_response.data)
    land_tiles = [
        tile for tile in state_data["tiles"] if tile["tile"]["type"] != "WATER"
    ]
    assert len(land_tiles) == 7


def test_post_game_endpoint_rejects_invalid_config(client):
    response = client.post(
        "/api/games",
        json={
            "players": ["RANDOM"],
            "map_template": "INVALID",
            "vps_to_win": 25,
            "discard_limit": 2,
        },
    )
    assert response.status_code == 400


@pytest.mark.parametrize(
    "players",
    [
        "RANDOM",
        ["RANDOM"],
        ["RANDOM"] * 5,
        ["RANDOM", ""],
        ["RANDOM", None],
        ["RANDOM", "NOT_A_PLAYER"],
        ["HUMAN", "HUMAN"],
    ],
)
def test_post_game_endpoint_rejects_invalid_players(client, players):
    response = client.post("/api/games", json={"players": players})
    assert response.status_code == 400
    assert response.is_json
    assert response.json["status"] == 400


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("discard_limit", True),
        ("discard_limit", 4),
        ("discard_limit", 21),
        ("vps_to_win", False),
        ("vps_to_win", 2),
        ("vps_to_win", 21),
        ("friendly_robber", 1),
        ("map_template", "base"),
    ],
)
def test_post_game_endpoint_rejects_invalid_option_types(client, field, value):
    response = client.post(
        "/api/games",
        json={"players": ["RANDOM", "RANDOM"], field: value},
    )
    assert response.status_code == 400


def test_get_game_endpoint(client):
    """Test retrieving a specific game state."""
    # First, create a game to retrieve
    post_response = client.post("/api/games", json={"players": ["RANDOM", "RANDOM"]})
    game_id = json.loads(post_response.data)["game_id"]

    # Retrieve the initial state (state_index 0)
    response = client.get(f"/api/games/{game_id}/states/0")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert "nodes" in data
    assert "edges" in data
    assert data["is_initial_build_phase"] is True
    assert data["winning_color"] is None


def test_get_latest_game_endpoint(client):
    """Test retrieving the latest game state."""
    post_response = client.post("/api/games", json={"players": ["RANDOM", "RANDOM"]})
    game_id = json.loads(post_response.data)["game_id"]

    response = client.get(f"/api/games/{game_id}/states/latest")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert "nodes" in data
    assert "edges" in data
    assert data["is_initial_build_phase"] is True
    assert data["winning_color"] is None


def test_get_game_not_found(client):
    """Test retrieving a non-existent game."""
    response = client.get("/api/games/nonexistentgameid/states/0")
    assert response.status_code == 404


@pytest.mark.parametrize("state_index", ["-1", "1.5", "not-a-state"])
def test_get_game_rejects_invalid_state_index(client, state_index):
    response = client.get(f"/api/games/anything/states/{state_index}")
    assert response.status_code == 400


def test_post_action_bot_turn(client):
    """Test posting an action when it's a bot's turn."""
    # Create a game with at least one bot (RANDOM is a bot)
    post_response = client.post("/api/games", json={"players": ["RANDOM", "RANDOM"]})
    assert post_response.status_code == 200
    game_id = json.loads(post_response.data)["game_id"]

    data_before_res = client.get(f"/api/games/{game_id}/states/latest")
    data_before = json.loads(data_before_res.data)

    after_action_res = client.post(f"/api/games/{game_id}/actions", json={})
    assert after_action_res.status_code == 200
    data_after = json.loads(after_action_res.data)

    # Check if game state progressed, e.g., turn changed or actions list grew
    assert len(data_after["action_records"]) > len(data_before["action_records"])


def test_repeated_bot_actions_advance_latest_state(client):
    """Latest state should keep advancing across persisted bot turns."""
    post_response = client.post("/api/games", json={"players": ["RANDOM", "RANDOM"]})
    assert post_response.status_code == 200
    game_id = json.loads(post_response.data)["game_id"]

    latest_before = json.loads(client.get(f"/api/games/{game_id}/states/latest").data)
    first_tick = json.loads(client.post(f"/api/games/{game_id}/actions", json={}).data)
    second_tick = json.loads(client.post(f"/api/games/{game_id}/actions", json={}).data)
    latest_after = json.loads(client.get(f"/api/games/{game_id}/states/latest").data)

    assert first_tick["state_index"] == latest_before["state_index"] + 1
    assert second_tick["state_index"] == first_tick["state_index"] + 1
    assert len(second_tick["action_records"]) == len(first_tick["action_records"]) + 1
    assert latest_after["state_index"] == second_tick["state_index"]
    assert latest_after["action_records"] == second_tick["action_records"]


def test_human_turn_requires_an_explicit_action(client):
    game_id = create_game_on_human_turn(client)

    response = client.post(f"/api/games/{game_id}/actions", json={})

    assert response.status_code == 400
    assert response.json["message"] == "An action is required on a human turn"


def test_bot_turn_rejects_a_stale_human_action(client):
    post_response = client.post("/api/games", json={"players": ["RANDOM", "RANDOM"]})
    game_id = post_response.json["game_id"]

    response = client.post(
        f"/api/games/{game_id}/actions",
        json=["RED", "ROLL", None],
    )

    assert response.status_code == 409


def test_human_turn_rejects_malformed_action(client):
    game_id = create_game_on_human_turn(client)

    response = client.post(f"/api/games/{game_id}/actions", json={"bad": "shape"})

    assert response.status_code == 400
    assert "three-item JSON array" in response.json["message"]


def test_mcts_analysis_endpoint(client):
    """Test the MCTS analysis endpoint."""
    post_response = client.post("/api/games", json={"players": ["RANDOM", "RANDOM"]})
    game_id = json.loads(post_response.data)["game_id"]

    # Request MCTS analysis for the latest state
    response = client.get(f"/api/games/{game_id}/states/latest/mcts-analysis")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["success"] is True
    assert "probabilities" in data
    # Further checks on probabilities structure if known
    assert len(data["probabilities"]) == 2  # For two players


def test_mcts_analysis_game_not_found(client):
    """Test MCTS analysis for a non-existent game."""
    response = client.get("/api/games/nonexistent/states/nonexistent/mcts-analysis")
    assert response.status_code == 400


def test_mcts_analysis_returns_safe_error_message(client):
    post_response = client.post("/api/games", json={"players": ["RANDOM", "RANDOM"]})
    game_id = post_response.json["game_id"]
    with patch(
        "catanatron.web.api.GameAnalyzer.analyze_win_probabilities",
        side_effect=RuntimeError("sensitive internal details"),
    ):
        response = client.get(f"/api/games/{game_id}/states/latest/mcts-analysis")

    assert response.status_code == 500
    assert response.json == {"success": False, "error": "Analysis failed"}
    assert b"sensitive internal details" not in response.data


# Stress test endpoint is simple, just check if it runs
def test_stress_test_endpoint(client):
    response = client.get("/api/stress-test")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["winning_color"] is None
