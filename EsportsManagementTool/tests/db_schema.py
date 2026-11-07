"""
Helpers for building the test database from the checked-in schema file.

Deliberately has NO third-party imports so it can be unit-tested without MySQL.
`load_schema` accepts any DB-API connection (pymysql).
"""

import re
from pathlib import Path

_IDENT = re.compile(r"[A-Za-z0-9_]+")
_LOOPBACK = ("127.0.0.1", "localhost", "::1")
_DELIMITER = re.compile(r"^DELIMITER\s+(\S+)\s*$", re.IGNORECASE)


def assert_safe_target(host: str, db_name: str) -> None:
    """
    The session fixture runs DROP DATABASE with root credentials, so refuse
    anything that is not obviously a local, disposable test database.
    """
    if host not in _LOOPBACK:
        raise ValueError(f"Refusing to reset a database on non-local host {host!r}")
    if not db_name.endswith("_test"):
        raise ValueError(f"Refusing to reset {db_name!r}: name must end with '_test'")
    if not _IDENT.fullmatch(db_name):
        raise ValueError(f"Unsafe database identifier: {db_name!r}")


def split_sql_statements(sql: str):
    """
    Split a mysqldump-style script into individual statements.

    Needed because DB-API drivers run one statement per execute() and
    mysqldump emits `DELIMITER ;;` blocks for triggers/routines, which are
    mysql-CLI directives rather than SQL. Honors DELIMITER changes, skips
    blank and `--`/`#` comment lines between statements.

    Limitation: a line that ends with the active delimiter *inside a string
    literal* would be split early. Structure-only dumps do not contain that.
    """
    delimiter = ";"
    buf = []
    for line in sql.splitlines():
        stripped = line.strip()
        if not buf:
            if not stripped or stripped.startswith(("--", "#")):
                continue
            match = _DELIMITER.match(stripped)
            if match:
                delimiter = match.group(1)
                continue
        buf.append(line)
        if stripped.endswith(delimiter):
            statement = "\n".join(buf).strip()
            statement = statement[: -len(delimiter)].rstrip()
            if statement:
                yield statement
            buf = []
    tail = "\n".join(buf).strip()
    if tail:
        yield tail


def load_schema(conn, path) -> int:
    """Execute every statement in `path` on `conn`. Returns the statement count."""
    sql = Path(path).read_text(encoding="utf-8-sig")
    count = 0
    with conn.cursor() as cur:
        cur.execute("SET FOREIGN_KEY_CHECKS=0")
        for statement in split_sql_statements(sql):
            try:
                cur.execute(statement)
            except Exception as exc:
                snippet = " ".join(statement.split())[:200]
                raise RuntimeError(
                    f"Schema load failed at statement #{count + 1}: {snippet}\n{exc}"
                ) from exc
            count += 1
        cur.execute("SET FOREIGN_KEY_CHECKS=1")
    return count

_CREATE_TABLE = re.compile(
    r"^\s*CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"
    r"(?:`?[A-Za-z0-9_]+`?\.)?`?([A-Za-z0-9_]+)`?",
    re.IGNORECASE,
)

def tables_in_schema(sql: str) -> set:
    """Lower-cased names of every table that `sql` creates."""
    found = set()
    for statement in split_sql_statements(sql):
        match = _CREATE_TABLE.match(statement)
        if match:
            found.add(match.group(1).lower())
    return found