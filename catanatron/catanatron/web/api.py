import json
import logging

from flask import Response, Blueprint, jsonify, abort, request
from werkzeug.exceptions import HTTPException

from catanatron.web.models import upsert_game_state, get_game_state
from catanatron.json import GameEncoder, action_from_json
from catanatron.models.player import Color, RandomPlayer
from catanatron.game import Game
from catanatron.models.map import build_map
from catanatron.players.value import ValueFunctionPlayer
from catanatron.players.minimax import AlphaBetaPlayer
from catanatron.players.weighted_random import WeightedRandomPlayer
from catanatron.web.mcts_analysis import GameAnalyzer

bp = Blueprint("api", __name__, url_prefix="/api")
VALID_MAP_TEMPLATES = {"BASE", "MINI", "TOURNAMENT"}


def player_factory(player_key, color):
    if player_key == "CATANATRON":
        return AlphaBetaPlayer(color, 2, True)
    elif player_key == "WEIGHTED_RANDOM":
        return WeightedRandomPlayer(color)
    elif player_key == "RANDOM":
        return RandomPlayer(color)
    elif player_key == "HUMAN":
        return ValueFunctionPlayer(color, is_bot=False)
    else:
        raise ValueError("Invalid player key")


@bp.route("/games", methods=("POST",))
def post_game_endpoint():
    if not request.is_json or request.json is None or "players" not in request.json:
        abort(400, description="Missing or invalid JSON body: 'players' key required")

    player_keys = request.json["players"]
    if not isinstance(player_keys, list) or not 2 <= len(player_keys) <= 4:
        abort(400, description="'players' must be a list with 2 to 4 entries")
    valid_player_keys = {"CATANATRON", "WEIGHTED_RANDOM", "RANDOM", "HUMAN"}
    if any(
        not isinstance(player_key, str) or player_key not in valid_player_keys
        for player_key in player_keys
    ):
        abort(
            400,
            description=(
                "Each player must be one of CATANATRON, WEIGHTED_RANDOM, "
                "RANDOM, or HUMAN"
            ),
        )
    if player_keys.count("HUMAN") > 1:
        abort(400, description="Only one HUMAN player is supported")

    map_template = request.json.get("map_template", "BASE")
    if map_template not in VALID_MAP_TEMPLATES:
        abort(
            400,
            description="'map_template' must be one of BASE, MINI, or TOURNAMENT",
        )

    discard_limit = request.json.get("discard_limit", 7)
    if (
        isinstance(discard_limit, bool)
        or not isinstance(discard_limit, int)
        or not 5 <= discard_limit <= 20
    ):
        abort(400, description="'discard_limit' must be an integer between 5 and 20")

    vps_to_win = request.json.get("vps_to_win", 10)
    if (
        isinstance(vps_to_win, bool)
        or not isinstance(vps_to_win, int)
        or not 3 <= vps_to_win <= 20
    ):
        abort(400, description="'vps_to_win' must be an integer between 3 and 20")

    friendly_robber = request.json.get("friendly_robber", False)
    if not isinstance(friendly_robber, bool):
        abort(400, description="'friendly_robber' must be a boolean")

    players = [
        player_factory(player_key, color)
        for player_key, color in zip(player_keys, Color)
    ]
    catan_map = build_map(map_template)

    game = Game(
        players=players,
        discard_limit=discard_limit,
        friendly_robber=friendly_robber,
        vps_to_win=vps_to_win,
        catan_map=catan_map,
    )
    upsert_game_state(game)
    return jsonify({"game_id": game.id})


@bp.route("/games/<string:game_id>/states/<string:state_index>", methods=("GET",))
def get_game_endpoint(game_id, state_index):
    parsed_state_index = _parse_state_index(state_index)
    game = get_game_state(game_id, parsed_state_index)
    if game is None:
        abort(404, description="Resource not found")

    payload = json.dumps(game, cls=GameEncoder)
    return Response(
        response=payload,
        status=200,
        mimetype="application/json",
    )


@bp.route("/games/<string:game_id>/actions", methods=["POST"])
def post_action_endpoint(game_id):
    game = get_game_state(game_id)
    if game is None:
        abort(404, description="Resource not found")

    if game.winning_color() is not None:
        return Response(
            response=json.dumps(game, cls=GameEncoder),
            status=200,
            mimetype="application/json",
        )

    payload = request.get_json(silent=True)
    body_is_empty = not request.data or payload is None or payload == {}
    if game.state.current_player().is_bot:
        if not body_is_empty:
            abort(409, description="Wait for the bot turn to finish")
        game.play_tick()
        upsert_game_state(game)
    else:
        if body_is_empty:
            abort(400, description="An action is required on a human turn")
        if not isinstance(payload, list) or len(payload) != 3:
            abort(400, description="Action must be a three-item JSON array")
        try:
            action = action_from_json(payload)
            game.execute(action)
        except (KeyError, TypeError, ValueError, IndexError) as error:
            abort(400, description=f"Invalid action: {error}")
        upsert_game_state(game)

    return Response(
        response=json.dumps(game, cls=GameEncoder),
        status=200,
        mimetype="application/json",
    )


@bp.route("/stress-test", methods=["GET"])
def stress_test_endpoint():
    players = [
        AlphaBetaPlayer(Color.RED, 2, True),
        AlphaBetaPlayer(Color.BLUE, 2, True),
        AlphaBetaPlayer(Color.ORANGE, 2, True),
        AlphaBetaPlayer(Color.WHITE, 2, True),
    ]
    game = Game(players=players)
    game.play_tick()
    return Response(
        response=json.dumps(game, cls=GameEncoder),
        status=200,
        mimetype="application/json",
    )


@bp.route(
    "/games/<string:game_id>/states/<string:state_index>/mcts-analysis", methods=["GET"]
)
def mcts_analysis_endpoint(game_id, state_index):
    """Get MCTS analysis for specific game state."""
    logging.info(f"MCTS analysis request for game {game_id} at state {state_index}")

    # Convert 'latest' to None for consistency with get_game_state
    parsed_state_index = _parse_state_index(state_index)
    try:
        game = get_game_state(game_id, parsed_state_index)
        if game is None:
            logging.error(
                f"Game/state not found: {game_id}/{state_index}"
            )  # Use original state_index for logging
            abort(404, description="Game state not found")

        analyzer = GameAnalyzer(num_simulations=100)
        probabilities = analyzer.analyze_win_probabilities(game)

        logging.info(f"Analysis successful. Probabilities: {probabilities}")
        return Response(
            response=json.dumps(
                {
                    "success": True,
                    "probabilities": probabilities,
                    "state_index": (
                        parsed_state_index
                        if parsed_state_index is not None
                        else len(game.state.action_records)
                    ),
                }
            ),
            status=200,
            mimetype="application/json",
        )

    except HTTPException:
        raise
    except Exception:
        logging.exception("Error in MCTS analysis endpoint")
        return Response(
            response=json.dumps({"success": False, "error": "Analysis failed"}),
            status=500,
            mimetype="application/json",
        )


def _parse_state_index(state_index_str: str):
    """Helper function to parse and validate state_index."""
    if state_index_str == "latest":
        return None
    try:
        state_index = int(state_index_str)
    except ValueError:
        abort(
            400,
            description="Invalid state_index format. state_index must be an integer or 'latest'.",
        )
    if state_index < 0:
        abort(400, description="state_index must be zero or greater")
    return state_index


# ===== Debugging Routes
# @app.route(
#     "/games/<string:game_id>/players/<int:player_index>/features", methods=["GET"]
# )
# def get_game_feature_vector(game_id, player_index):
#     game = get_game_state(game_id)
#     if game is None:
#         abort(404, description="Resource not found")

#     return create_sample(game, game.state.colors[player_index])


# @app.route("/games/<string:game_id>/value-function", methods=["GET"])
# def get_game_value_function(game_id):
#     game = get_game_state(game_id)
#     if game is None:
#         abort(404, description="Resource not found")

#     # model = tf.keras.models.load_model("data/models/mcts-rep-a")
#     model2 = tf.keras.models.load_model("data/models/mcts-rep-b")
#     feature_ordering = get_feature_ordering()
#     indices = [feature_ordering.index(f) for f in NUMERIC_FEATURES]
#     data = {}
#     for color in game.state.colors:
#         sample = create_sample_vector(game, color)
#         # scores = model.call(tf.convert_to_tensor([sample]))

#         inputs1 = [create_board_tensor(game, color)]
#         inputs2 = [[float(sample[i]) for i in indices]]
#         scores2 = model2.call(
#             [tf.convert_to_tensor(inputs1), tf.convert_to_tensor(inputs2)]
#         )
#         data[color.value] = float(scores2.numpy()[0][0])

#     return data
