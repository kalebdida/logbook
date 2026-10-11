from datetime import date as date_type

from pydantic import BaseModel, Field


class ProfileUpdate(BaseModel):
    birthday: date_type | None = None
    pet_name: str | None = Field(None, max_length=24)


class ProfileResponse(BaseModel):
    birthday: date_type | None = None
    pet_name: str = ""
