"""
Transcript processor for extracting scheduled dates/times from conversation.

Parses the conversation to extract:
- Callback date (e.g., "January 30th" -> "2026-01-30")
- Callback time (e.g., "5 pm" -> "17:00")
- Call outcome (scheduled, not_interested, callback_later, etc.)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Optional, Tuple


@dataclass
class TranscriptEntry:
    """Single transcript entry (either input or output)."""
    role: str  # "agent" or "user"
    text: str
    timestamp: str


@dataclass
class ExtractedOutcome:
    """Extracted scheduling outcome from conversation."""
    callback_date: Optional[str] = None  # ISO format: "2026-01-30"
    callback_time: Optional[str] = None  # 24hr format: "17:00"
    outcome: str = "unknown"  # scheduled, not_interested, callback_later, no_answer, etc.
    notes: Optional[str] = None
    confidence: float = 0.0


# Month name to number mapping
MONTHS = {
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}

# Relative day mappings
RELATIVE_DAYS = {
    "today": 0,
    "tomorrow": 1,
    "day after": 2,
    "day after tomorrow": 2,
}


def _parse_time(time_str: str) -> Optional[str]:
    """
    Parse time string to 24hr format (HH:MM).
    
    Examples:
    - "5 pm" -> "17:00"
    - "5:30 pm" -> "17:30"
    - "10 am" -> "10:00"
    - "10:30 a.m." -> "10:30"
    - "4 o'clock" -> "16:00" (assumed PM for business hours)
    """
    time_str = time_str.lower().strip()
    
    # Remove punctuation from am/pm
    time_str = time_str.replace(".", "").replace("'", "")
    
    # Pattern: "5 pm", "5pm", "5:30 pm", "10 am", etc.
    match = re.search(r'(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\s*m|p\s*m)?', time_str)
    if not match:
        return None
    
    hour = int(match.group(1))
    minute = int(match.group(2)) if match.group(2) else 0
    meridiem = match.group(3).replace(" ", "") if match.group(3) else None
    
    # If no meridiem, assume PM for typical business hours (9-6)
    if meridiem is None:
        if hour < 8:
            hour += 12  # 5 -> 17:00 (5 pm)
    elif meridiem == "pm" and hour != 12:
        hour += 12
    elif meridiem == "am" and hour == 12:
        hour = 0
    
    return f"{hour:02d}:{minute:02d}"


def _parse_date(date_str: str, reference_date: datetime) -> Optional[str]:
    """
    Parse date string to ISO format (YYYY-MM-DD).
    
    Examples:
    - "January 30th" -> "2026-01-30"
    - "30th January" -> "2026-01-30"
    - "tomorrow" -> calculated from reference_date
    - "day after" -> 2 days from reference_date
    """
    date_str = date_str.lower().strip()
    
    # Check for relative dates
    for rel_name, days_offset in RELATIVE_DAYS.items():
        if rel_name in date_str:
            target_date = reference_date + timedelta(days=days_offset)
            return target_date.strftime("%Y-%m-%d")
    
    # Pattern: "January 30th", "January 30", "30th January", "30 January"
    # Also handles: "Jan 30", "30 Jan"
    month_pattern = '|'.join(MONTHS.keys())
    
    # Try "Month Day" format
    match = re.search(rf'({month_pattern})\s+(\d{{1,2}})(?:st|nd|rd|th)?', date_str)
    if match:
        month = MONTHS[match.group(1)]
        day = int(match.group(2))
        year = reference_date.year
        # If the date is in the past, assume next year
        target_date = datetime(year, month, day)
        if target_date < reference_date:
            target_date = datetime(year + 1, month, day)
        return target_date.strftime("%Y-%m-%d")
    
    # Try "Day Month" format
    match = re.search(rf'(\d{{1,2}})(?:st|nd|rd|th)?\s+({month_pattern})', date_str)
    if match:
        day = int(match.group(1))
        month = MONTHS[match.group(2)]
        year = reference_date.year
        target_date = datetime(year, month, day)
        if target_date < reference_date:
            target_date = datetime(year + 1, month, day)
        return target_date.strftime("%Y-%m-%d")
    
    return None


def _extract_date_time_from_text(text: str, reference_date: datetime) -> Tuple[Optional[str], Optional[str]]:
    """
    Extract date and time from a single text string.
    
    Examples:
    - "January 30th at 5 pm" -> ("2026-01-30", "17:00")
    - "tomorrow 4:00 p.m." -> ("2026-01-29", "16:00")
    """
    text_lower = text.lower()
    
    date_result = _parse_date(text_lower, reference_date)
    time_result = _parse_time(text_lower)
    
    return date_result, time_result


def _check_confirmation_patterns(transcripts: List[TranscriptEntry]) -> bool:
    """
    Check if the conversation contains confirmation patterns.
    
    Look for patterns like:
    - Agent: "...January 30th at 5 pm..."
    - User: "Yes" or "Okay" or "That works"
    """
    confirmation_words = {
        "yes", "yeah", "yep", "okay", "ok", "sure", "perfect", 
        "great", "fine", "sounds good", "that works", "confirmed"
    }
    
    for i, entry in enumerate(transcripts):
        if entry.role == "user":
            text_lower = entry.text.lower().strip()
            # Remove punctuation for matching
            text_clean = re.sub(r'[^\w\s]', '', text_lower)
            words = set(text_clean.split())
            
            if words & confirmation_words:
                return True
    
    return False


def _check_not_interested_patterns(transcripts: List[TranscriptEntry]) -> bool:
    """Check if user expressed disinterest."""
    not_interested_patterns = [
        r'\b(not interested|don\'?t want|no thanks|no thank you)\b',
        r'\b(don\'?t call|stop calling|remove me)\b',
        r'\b(busy|can\'?t talk|bad time)\b',
    ]
    
    for entry in transcripts:
        if entry.role == "user":
            text_lower = entry.text.lower()
            for pattern in not_interested_patterns:
                if re.search(pattern, text_lower):
                    return True
    
    return False


def extract_outcome_from_transcripts(
    transcripts: List[TranscriptEntry],
    reference_date: Optional[datetime] = None
) -> ExtractedOutcome:
    """
    Extract scheduling outcome from conversation transcripts.
    
    Args:
        transcripts: List of TranscriptEntry objects
        reference_date: Reference date for relative date parsing (defaults to now)
    
    Returns:
        ExtractedOutcome with callback_date, callback_time, outcome, notes
    """
    if reference_date is None:
        reference_date = datetime.now()
    
    if not transcripts:
        return ExtractedOutcome(outcome="no_conversation", confidence=0.0)
    
    # Check for not interested first
    if _check_not_interested_patterns(transcripts):
        return ExtractedOutcome(
            outcome="not_interested",
            confidence=0.8,
            notes="User expressed disinterest"
        )
    
    # Extract date/time from conversation
    # Strategy: Look for agent confirmation messages that contain date/time,
    # then check if user confirmed
    
    best_date: Optional[str] = None
    best_time: Optional[str] = None
    best_confidence = 0.0
    
    # Look at agent messages in reverse (most recent first) for final scheduled time
    agent_entries = [e for e in transcripts if e.role == "agent"]
    
    for entry in reversed(agent_entries):
        text = entry.text
        
        # Keywords indicating scheduling confirmation
        schedule_keywords = [
            "you are all set", "you're all set", "scheduled",
            "get a call", "will call", "callback", "interview",
            "appointment", "confirmed", "booked"
        ]
        
        text_lower = text.lower()
        has_schedule_keyword = any(kw in text_lower for kw in schedule_keywords)
        
        date_found, time_found = _extract_date_time_from_text(text, reference_date)
        
        if date_found or time_found:
            # Calculate confidence based on context
            confidence = 0.5
            if has_schedule_keyword:
                confidence += 0.3
            if _check_confirmation_patterns(transcripts):
                confidence += 0.2
            
            if confidence > best_confidence:
                best_date = date_found or best_date
                best_time = time_found or best_time
                best_confidence = confidence
    
    # Also check user messages for stated preferences
    user_entries = [e for e in transcripts if e.role == "user"]
    for entry in user_entries:
        date_found, time_found = _extract_date_time_from_text(entry.text, reference_date)
        if date_found and not best_date:
            best_date = date_found
        if time_found and not best_time:
            best_time = time_found
    
    # Determine outcome
    if best_date and best_time and best_confidence >= 0.7:
        outcome = "scheduled"
    elif best_date or best_time:
        outcome = "partially_scheduled"
    else:
        outcome = "unknown"
    
    # Build notes
    notes_parts = []
    if best_date:
        notes_parts.append(f"Date: {best_date}")
    if best_time:
        notes_parts.append(f"Time: {best_time}")
    notes = ", ".join(notes_parts) if notes_parts else None
    
    return ExtractedOutcome(
        callback_date=best_date,
        callback_time=best_time,
        outcome=outcome,
        notes=notes,
        confidence=best_confidence
    )


def process_transcript_file(transcript_data: dict) -> ExtractedOutcome:
    """
    Process a transcript JSON file and extract outcome.
    
    Args:
        transcript_data: Dict with keys: callId, phoneNumber, startTime, endTime, transcript
    
    Returns:
        ExtractedOutcome with extracted scheduling info
    """
    raw_transcripts = transcript_data.get("transcript", [])
    start_time_str = transcript_data.get("startTime")
    
    # Parse reference date from transcript
    reference_date = datetime.now()
    if start_time_str:
        try:
            reference_date = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            pass
    
    # Convert to TranscriptEntry objects
    transcripts = []
    for entry in raw_transcripts:
        if isinstance(entry, dict):
            transcripts.append(TranscriptEntry(
                role=entry.get("role", "unknown"),
                text=entry.get("text", ""),
                timestamp=entry.get("timestamp", "")
            ))
    
    return extract_outcome_from_transcripts(transcripts, reference_date)


# For testing
if __name__ == "__main__":
    # Test with sample transcript
    sample_transcripts = [
        TranscriptEntry("agent", "Hello. This call is from AceNgage...", "2026-01-28T09:52:16"),
        TranscriptEntry("user", "Hello", "2026-01-28T09:52:17"),
        TranscriptEntry("agent", "What date and time would work best for you?", "2026-01-28T09:52:27"),
        TranscriptEntry("user", "tomorrow 4:00 p.m.", "2026-01-28T09:52:34"),
        TranscriptEntry("agent", "Wonderful! You are all set. You will get a call on January 29th at 4 pm.", "2026-01-28T09:52:38"),
        TranscriptEntry("user", "Okay, can we change it to day after 5 pm?", "2026-01-28T09:52:43"),
        TranscriptEntry("agent", "Yes, of course. So, that would be on January 30th at 5 pm?", "2026-01-28T09:52:45"),
        TranscriptEntry("user", "Yes.", "2026-01-28T09:52:51"),
        TranscriptEntry("agent", "Perfect! You are all set then. You will get a call on January 30th at 5 pm. Thanks!", "2026-01-28T09:52:53"),
    ]
    
    result = extract_outcome_from_transcripts(sample_transcripts, datetime(2026, 1, 28))
    print(f"Outcome: {result.outcome}")
    print(f"Date: {result.callback_date}")
    print(f"Time: {result.callback_time}")
    print(f"Confidence: {result.confidence}")
    print(f"Notes: {result.notes}")
