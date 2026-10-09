"""
Aggregates every data router into one api_router. main.py protects it
with the login dependency; /auth and /health stay public.
"""

from fastapi import APIRouter

from app.routers import activities, ai, backup, day_records, entries, goals, habits, pomodoro, tasks

api_router = APIRouter()
for module in (entries, day_records, tasks, activities, goals, pomodoro, habits, backup, ai):
    api_router.include_router(module.router)
