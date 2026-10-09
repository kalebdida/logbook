"""Types shared across schemas."""

from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator


def _as_utc(value: datetime) -> datetime:
    # SQLite has no timezone column type, so timestamps come back naive.
    # Every timestamp this app stores is UTC, so a naive value is UTC.
    # Incoming aware values are converted to UTC before they're stored.
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


# Use for every datetime that crosses the API. Serializes with a trailing
# "Z", so browsers parse it as UTC instead of guessing local time.
UTCDateTime = Annotated[datetime, AfterValidator(_as_utc)]

# Life areas used by the density map, tasks, activities, and goals.
# Keep in sync with js/categories.js.
ActivityCategory = Literal[
    "coding", "learning", "fitness", "faith", "social", "work", "rest", "creativity", "reflection"
]

Mood = Literal["good", "okay", "rough"]
