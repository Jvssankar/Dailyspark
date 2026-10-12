"""Moods, quote categories and the small 'micro-actions' shown with each quote."""
from __future__ import annotations

CATEGORIES = [
    {"id": "motivation", "label": "Motivation"},
    {"id": "focus", "label": "Focus"},
    {"id": "calm", "label": "Calm"},
    {"id": "courage", "label": "Courage"},
    {"id": "success", "label": "Success"},
    {"id": "positivity", "label": "Positivity"},
    {"id": "resilience", "label": "Resilience"},
    {"id": "wisdom", "label": "Wisdom"},
]

CATEGORY_IDS = {c["id"] for c in CATEGORIES}

DEFAULT_MOOD = "energized"

MOODS = {
    "energized": {
        "label": "Ready to go",
        "emoji": "⚡",
        "description": "You have energy. Aim it somewhere.",
        "categories": ["success", "motivation", "courage"],
        "tips": [
            "Pick the one task that matters most and do it before checking messages.",
            "Write down a goal you can finish today, then start with the first 10 minutes.",
            "Do the thing you have been postponing. Set a timer for 25 minutes.",
            "Share one useful thing you know with someone who could use it.",
        ],
    },
    "tired": {
        "label": "Low on energy",
        "emoji": "😴",
        "description": "Be gentle, but keep moving.",
        "categories": ["resilience", "positivity", "calm"],
        "tips": [
            "Drink a glass of water and stretch for two minutes.",
            "Take a 10-minute walk outside. Daylight helps more than coffee.",
            "Choose one small win for today and let the rest wait.",
            "Take five slow breaths, then start the easiest task on your list.",
        ],
    },
    "anxious": {
        "label": "Anxious",
        "emoji": "😟",
        "description": "Slow down. One thing at a time.",
        "categories": ["calm", "courage", "wisdom"],
        "tips": [
            "Breathe in for 4 seconds, out for 6. Repeat five times.",
            "Write down what is worrying you, then circle only what you can control.",
            "Name five things you can see right now. It brings you back to the present.",
            "Break the biggest worry into one tiny next step and do just that.",
        ],
    },
    "unfocused": {
        "label": "Scattered",
        "emoji": "🌀",
        "description": "Too many tabs open in your head.",
        "categories": ["focus", "wisdom", "motivation"],
        "tips": [
            "Close every tab you do not need. Work on one thing for 25 minutes.",
            "Put your phone in another room for the next focus session.",
            "Write a three-item list for today. Nothing more.",
            "Set a timer, work until it rings, then take a 5-minute break.",
        ],
    },
    "down": {
        "label": "Feeling low",
        "emoji": "🌧️",
        "description": "Hard days count too. You showed up.",
        "categories": ["positivity", "resilience", "calm"],
        "tips": [
            "Message one person you trust. You do not need a reason.",
            "Write down three small things that went okay this week.",
            "Step outside for fresh air, even for five minutes.",
            "Do one kind thing for yourself today, like a good meal or a short rest.",
        ],
    },
    "stuck": {
        "label": "Stuck",
        "emoji": "🧱",
        "description": "You know where to go. Getting started is the hard part.",
        "categories": ["courage", "motivation", "resilience"],
        "tips": [
            "Make the task so small it feels silly, then do it for two minutes.",
            "Ask someone for a fresh opinion on the problem.",
            "Write the ugliest first draft you can. Fixing it is easier than starting.",
            "Change your setting. Move to a new room or take a short walk.",
        ],
    },
}


def public_moods() -> list[dict]:
    """Moods in the shape the frontend needs (no tip lists)."""
    return [
        {
            "id": mood_id,
            "label": m["label"],
            "emoji": m["emoji"],
            "description": m["description"],
        }
        for mood_id, m in MOODS.items()
    ]
