from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel

from app.auth import auth_required, check_password, is_authenticated, make_token

router = APIRouter(prefix="/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    password: str


@router.get("/status")
def auth_status(authorization: str | None = Header(default=None)):
    return {"required": auth_required(), "authenticated": is_authenticated(authorization)}


@router.post("/login")
def login(body: LoginRequest, request: Request):
    if not auth_required():
        return {"token": "", "expires_at": None, "required": False}
    if not check_password(request, body.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="wrong password")
    token, expires = make_token()
    return {"token": token, "expires_at": expires, "required": True}
