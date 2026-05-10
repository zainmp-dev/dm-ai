"""Bootstrap / promote / demote admin users.

Usage examples (from the repo root, with the backend's venv active):

    # Create a brand-new admin (or update password + role if the email already exists)
    python backend/promote_admin.py --email admin@flowpilot.local \\
        --password 'Strong@Pass1' --name 'Admin' --create

    # Promote an existing user to admin (no password change)
    python backend/promote_admin.py --email user@example.com --promote

    # Demote an admin back to a regular user
    python backend/promote_admin.py --email someone@example.com --demote

    # Drop the row entirely (e.g. recreate from scratch)
    python backend/promote_admin.py --email admin@flowpilot.local --delete

This script intentionally lives outside the HTTP layer so admin promotion can
NEVER be triggered from the public API surface. Run it from a trusted shell.
"""

from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path

# Allow `python backend/promote_admin.py ...` from the repo root by making the
# `backend/` package importable regardless of CWD.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import text  # noqa: E402

from database import SessionLocal  # noqa: E402


def _require_session():
    if SessionLocal is None:
        raise SystemExit("DATABASE_URL is not configured — cannot connect to the DB.")
    return SessionLocal()


def _find_user(session, email_norm: str):
    return session.execute(
        text("select id, name, email, role from flowpilot_users where lower(email) = :email"),
        {"email": email_norm},
    ).mappings().first()


def cmd_create(email: str, password: str, name: str) -> None:
    email_norm = email.strip().lower()
    if not email_norm or not password:
        raise SystemExit("--email and --password are required for --create")
    session = _require_session()
    try:
        existing = _find_user(session, email_norm)
        if existing is not None:
            session.execute(
                text(
                    "update flowpilot_users "
                    "set name = :name, password = :password, role = 'admin' "
                    "where id = :id"
                ),
                {"id": existing["id"], "name": name, "password": password},
            )
            session.commit()
            print(f"Updated existing user '{email_norm}' → role=admin (id={existing['id']}).")
            return

        user_id = f"usr-{uuid.uuid4().hex[:10]}"
        session.execute(
            text(
                "insert into flowpilot_users (id, name, email, password, role, created_at) "
                "values (:id, :name, :email, :password, 'admin', now())"
            ),
            {"id": user_id, "name": name, "email": email_norm, "password": password},
        )
        session.commit()
        print(f"Created admin '{email_norm}' (id={user_id}).")
    finally:
        session.close()


def cmd_promote(email: str) -> None:
    email_norm = email.strip().lower()
    session = _require_session()
    try:
        existing = _find_user(session, email_norm)
        if existing is None:
            raise SystemExit(f"No user found with email '{email_norm}'.")
        session.execute(
            text("update flowpilot_users set role = 'admin' where id = :id"),
            {"id": existing["id"]},
        )
        session.commit()
        print(f"Promoted '{email_norm}' → role=admin (id={existing['id']}).")
    finally:
        session.close()


def cmd_demote(email: str) -> None:
    email_norm = email.strip().lower()
    session = _require_session()
    try:
        existing = _find_user(session, email_norm)
        if existing is None:
            raise SystemExit(f"No user found with email '{email_norm}'.")
        session.execute(
            text("update flowpilot_users set role = 'user' where id = :id"),
            {"id": existing["id"]},
        )
        session.commit()
        print(f"Demoted '{email_norm}' → role=user (id={existing['id']}).")
    finally:
        session.close()


def cmd_delete(email: str) -> None:
    email_norm = email.strip().lower()
    session = _require_session()
    try:
        result = session.execute(
            text("delete from flowpilot_users where lower(email) = :email"),
            {"email": email_norm},
        )
        session.commit()
        print(f"Deleted {result.rowcount} row(s) for '{email_norm}'.")
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage FlowPilot admin users.")
    parser.add_argument("--email", required=True, help="Target user email.")
    parser.add_argument("--password", default="", help="Password (only used with --create).")
    parser.add_argument("--name", default="Admin", help="Display name (only used with --create).")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--create", action="store_true", help="Create or upsert as admin.")
    group.add_argument("--promote", action="store_true", help="Promote existing user to admin.")
    group.add_argument("--demote", action="store_true", help="Demote admin back to regular user.")
    group.add_argument("--delete", action="store_true", help="Delete the user row entirely.")
    args = parser.parse_args()

    if args.create:
        cmd_create(args.email, args.password, args.name)
    elif args.promote:
        cmd_promote(args.email)
    elif args.demote:
        cmd_demote(args.email)
    elif args.delete:
        cmd_delete(args.email)


if __name__ == "__main__":
    main()
