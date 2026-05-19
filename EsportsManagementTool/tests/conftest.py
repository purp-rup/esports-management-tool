import pytest
from EsportsManagementTool import app as application

@pytest.fixture()
def app():
    app = application
    app.config.update({
        "TESTING": True,
    })
    yield app

@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def runner(app):
    return app.test_cli_runner()
