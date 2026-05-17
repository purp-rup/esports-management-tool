import pytest
from EsportsManagementTool import app

@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def runner(app):
    return app.test_cli_runner()


def test_request_example(client):
    response = client.get("/login")
    assert response.status_code == 200


def test_all_routes_accessible(client):
    for rule in app.url_map.iter_rules():
        response = client.get(rule.rule) # e.g. "/login"
        assert response.status_code == 200