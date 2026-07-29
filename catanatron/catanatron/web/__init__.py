import os
import secrets

from flask import Flask
from flask_cors import CORS
from werkzeug.exceptions import HTTPException


def create_app(test_config=None):
    """Create and configure an instance of the Flask application."""
    app = Flask(__name__)

    # ===== Load base configuration
    database_url = os.environ.get("DATABASE_URL", "sqlite:///:memory:")
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
    cors_origins = [
        origin.strip()
        for origin in os.environ.get(
            "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
        ).split(",")
        if origin.strip()
    ]
    app.config.from_mapping(
        SECRET_KEY=secret_key,
        SQLALCHEMY_DATABASE_URI=database_url,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    if test_config is not None:
        app.config.update(test_config)
    CORS(app, resources={r"/api/*": {"origins": cors_origins}})

    @app.errorhandler(HTTPException)
    def handle_http_error(error):
        return {
            "error": error.name,
            "message": error.description,
            "status": error.code,
        }, error.code

    # ===== Initialize Database
    from catanatron.web.models import db

    with app.app_context():
        db.init_app(app)
        db.create_all()

    # ===== Initialize Routes
    from . import api

    app.register_blueprint(api.bp)

    return app
