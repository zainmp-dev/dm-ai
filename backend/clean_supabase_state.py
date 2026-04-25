import psycopg2

import main


def run() -> None:
    with psycopg2.connect(main.DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("delete from flowpilot_state where key = %s", ("global",))
            for table in (
                "flowpilot_users",
                "flowpilot_strategy",
                "flowpilot_competitors",
                "flowpilot_content",
                "flowpilot_leads",
                "flowpilot_activities",
                "flowpilot_publishing_log",
                "flowpilot_integrations",
                "flowpilot_profile",
                "flowpilot_preferences",
                "flowpilot_campaigns",
                "flowpilot_engagement_series",
                "flowpilot_leads_growth",
                "flowpilot_workspace",
            ):
                cur.execute(f"delete from {table}")
        conn.commit()
    print("Supabase state cleared.")


if __name__ == "__main__":
    run()
