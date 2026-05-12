"""
LinkedIn Marketing API — boost-from-existing-post flow.

Full campaign creation requires Marketing Developer Platform access, ad accounts,
and several REST calls (adAccount, campaignGroup, campaign, creative, ad).
This module exposes a clear extension point; in-app creation returns a structured
not-implemented response until LinkedIn credentials and account URNs are wired.
"""

from __future__ import annotations

from typing import Any


class LinkedInAdsNotConfiguredError(RuntimeError):
    """Raised when LinkedIn sponsored campaigns are not enabled for this deployment."""


def create_boost_from_share_stub(
    *,
    share_urn: str,
    daily_budget_units: float,
    objective: str,
) -> dict[str, Any]:
    raise LinkedInAdsNotConfiguredError(
        "LinkedIn sponsored campaigns require ad account URN, developer token scopes, "
        "and campaign APIs. Use network boost URLs or Meta for in-app boosts."
    )
