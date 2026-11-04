"""Unit tests for the schema loader helpers (no MySQL or Docker needed)."""

import pytest

from db_schema import assert_safe_target, split_sql_statements


def test_splits_plain_statements_and_skips_comments():
    sql = "-- header\n\nCREATE TABLE a (id int);\n# note\nCREATE TABLE b (id int);\n"
    assert list(split_sql_statements(sql)) == ["CREATE TABLE a (id int)", "CREATE TABLE b (id int)"]


def test_multiline_statement_is_kept_whole():
    sql = "CREATE TABLE a (\n  id int,\n  PRIMARY KEY (id)\n) ENGINE=InnoDB;\n"
    assert len(list(split_sql_statements(sql))) == 1


def test_delimiter_blocks_keep_trigger_body_together():
    sql = (
        "DELIMITER ;;\n"
        "CREATE TRIGGER t BEFORE INSERT ON a FOR EACH ROW\n"
        "BEGIN\n  SET NEW.id = 1;\n  SET @y = 2;\nEND;;\n"
        "DELIMITER ;\n"
        "CREATE TABLE b (id int);\n"
    )
    statements = list(split_sql_statements(sql))
    assert len(statements) == 2
    assert "SET @y = 2;" in statements[0]
    assert statements[1] == "CREATE TABLE b (id int)"


def test_versioned_comment_statements_survive():
    assert list(split_sql_statements("/*!40101 SET @x=1 */;\n")) == ["/*!40101 SET @x=1 */"]


@pytest.mark.parametrize("host, name", [
    ("db.example.com", "esmt_test"),   # not local
    ("127.0.0.1", "esmt"),             # not a *_test name
    ("127.0.0.1", "bad;name_test"),    # unsafe identifier
])
def test_safety_guard_refuses_dangerous_targets(host, name):
    with pytest.raises(ValueError):
        assert_safe_target(host, name)


def test_safety_guard_allows_local_test_db():
    assert_safe_target("127.0.0.1", "esmt_test")