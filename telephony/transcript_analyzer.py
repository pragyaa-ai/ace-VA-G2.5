"""
Transcript Analyzer using Gemini 2.0 Flash API.

Extracts structured data from call transcripts for exit interview scheduling:
- Scheduled callback date/time
- Candidate concerns and queries
- Language preferences
- Sentiment and cooperation level
- Other insights useful for HR counsellors
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

import google.auth
import google.auth.transport.requests
from google.oauth2 import service_account

# Try to import aiohttp for async, fall back to requests for sync
try:
    import aiohttp
    HAS_AIOHTTP = True
except ImportError:
    HAS_AIOHTTP = False

import requests


@dataclass
class TranscriptEntry:
    """Single transcript entry."""
    role: str  # "agent" or "user"
    text: str
    timestamp: str


@dataclass
class AnalyzedOutcome:
    """Comprehensive analysis of call transcript."""
    # Primary scheduling outcome
    callback_date: Optional[str] = None  # ISO format: "2026-01-30"
    callback_time: Optional[str] = None  # 24hr format: "17:00"
    outcome: str = "unknown"  # scheduled, not_interested, callback_later, no_answer, incomplete
    
    # Candidate insights for HR counsellor
    candidate_concerns: List[str] = field(default_factory=list)  # Any worries/concerns mentioned
    candidate_queries: List[str] = field(default_factory=list)   # Questions asked by candidate
    
    # Communication analysis
    language_preference: Optional[str] = None  # English, Hindi, or detected preference
    language_issues: Optional[str] = None      # Any communication difficulties noted
    
    # Behavioral indicators
    sentiment: str = "neutral"        # positive, neutral, negative, hesitant
    cooperation_level: str = "normal" # cooperative, hesitant, reluctant, uncooperative
    urgency: Optional[str] = None     # flexible, busy, urgent
    
    # Scheduling context
    availability_notes: Optional[str] = None   # Any time constraints mentioned
    reschedule_requested: bool = False         # Did they change time during call
    preferred_contact_method: Optional[str] = None  # phone, video, any preference
    
    # Additional insights
    key_topics_discussed: List[str] = field(default_factory=list)
    special_notes: Optional[str] = None  # Any other important observations
    
    # Metadata
    confidence: float = 0.0
    raw_analysis: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "callback_date": self.callback_date,
            "callback_time": self.callback_time,
            "outcome": self.outcome,
            "candidate_concerns": self.candidate_concerns,
            "candidate_queries": self.candidate_queries,
            "language_preference": self.language_preference,
            "language_issues": self.language_issues,
            "sentiment": self.sentiment,
            "cooperation_level": self.cooperation_level,
            "urgency": self.urgency,
            "availability_notes": self.availability_notes,
            "reschedule_requested": self.reschedule_requested,
            "preferred_contact_method": self.preferred_contact_method,
            "key_topics_discussed": self.key_topics_discussed,
            "special_notes": self.special_notes,
            "confidence": self.confidence,
        }
    
    def get_counsellor_brief(self) -> str:
        """Generate a brief summary for HR counsellor."""
        parts = []
        
        if self.callback_date and self.callback_time:
            parts.append(f"📅 Scheduled: {self.callback_date} at {self.callback_time}")
        
        if self.sentiment != "neutral":
            emoji = {"positive": "😊", "negative": "😟", "hesitant": "🤔"}.get(self.sentiment, "")
            parts.append(f"{emoji} Sentiment: {self.sentiment}")
        
        if self.candidate_concerns:
            parts.append(f"⚠️ Concerns: {', '.join(self.candidate_concerns)}")
        
        if self.candidate_queries:
            parts.append(f"❓ Questions: {', '.join(self.candidate_queries)}")
        
        if self.language_issues:
            parts.append(f"🗣️ Language note: {self.language_issues}")
        
        if self.special_notes:
            parts.append(f"📝 Notes: {self.special_notes}")
        
        return "\n".join(parts) if parts else "No special notes"


# Gemini API configuration
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

ANALYSIS_PROMPT = """You are an expert HR analyst reviewing a voice call transcript between an AI scheduling assistant and a candidate for an exit interview.

Analyze the conversation and extract the following information in JSON format:

{{
  "callback_date": "YYYY-MM-DD format or null if not scheduled",
  "callback_time": "HH:MM in 24-hour format or null if not scheduled", 
  "outcome": "scheduled | not_interested | callback_later | incomplete | no_clear_outcome",
  
  "candidate_concerns": ["list of any concerns, worries, or hesitations expressed by the candidate"],
  "candidate_queries": ["list of questions or clarifications asked by the candidate"],
  
  "language_preference": "English | Hindi | null if not indicated",
  "language_issues": "description of any communication difficulties, accent issues, or language barriers, or null",
  
  "sentiment": "positive | neutral | negative | hesitant",
  "cooperation_level": "cooperative | hesitant | reluctant | uncooperative",
  "urgency": "flexible | busy | urgent | null",
  
  "availability_notes": "any specific time constraints or preferences mentioned, or null",
  "reschedule_requested": true/false (did they change the time during the call?),
  "preferred_contact_method": "phone | video | null if not mentioned",
  
  "key_topics_discussed": ["main topics covered in the conversation"],
  "special_notes": "any other important observations for the HR counsellor, or null",
  
  "confidence": 0.0-1.0 (how confident you are in this analysis)
}}

Important:
- For dates, convert relative dates to absolute dates based on the call date: {call_date}
- "tomorrow" means {tomorrow_date}
- "day after tomorrow" means {day_after_date}
- Extract only what is explicitly stated or clearly implied
- Be thorough in capturing candidate concerns - these are valuable for the HR counsellor
- Note any hesitation or reluctance even if they agreed to schedule

TRANSCRIPT:
{transcript}

Respond with ONLY the JSON object, no other text."""


def _get_gcp_access_token() -> str:
    """Get GCP access token for Gemini API."""
    credentials, project = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    auth_req = google.auth.transport.requests.Request()
    credentials.refresh(auth_req)
    return credentials.token


def _format_transcript(transcripts: List[TranscriptEntry]) -> str:
    """Format transcript entries for the prompt."""
    lines = []
    for entry in transcripts:
        role_label = "Agent" if entry.role == "agent" else "Candidate"
        lines.append(f"{role_label}: {entry.text}")
    return "\n".join(lines)


def _build_prompt(transcripts: List[TranscriptEntry], reference_date: datetime) -> str:
    """Build the analysis prompt with transcript and date context."""
    from datetime import timedelta
    
    transcript_text = _format_transcript(transcripts)
    call_date = reference_date.strftime("%Y-%m-%d")
    tomorrow = (reference_date + timedelta(days=1)).strftime("%Y-%m-%d")
    day_after = (reference_date + timedelta(days=2)).strftime("%Y-%m-%d")
    
    return ANALYSIS_PROMPT.format(
        call_date=call_date,
        tomorrow_date=tomorrow,
        day_after_date=day_after,
        transcript=transcript_text,
    )


def _parse_gemini_response(response_text: str) -> Dict[str, Any]:
    """Parse JSON from Gemini response, handling markdown code blocks."""
    text = response_text.strip()
    
    # Remove markdown code blocks if present
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```json or ```)
        lines = lines[1:]
        # Remove last line (```)
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)
    
    # Also try to extract JSON from within the text if it contains other content
    # Look for { ... } pattern
    if not text.startswith("{"):
        start_idx = text.find("{")
        if start_idx != -1:
            # Find matching closing brace
            brace_count = 0
            end_idx = start_idx
            for i, char in enumerate(text[start_idx:], start_idx):
                if char == "{":
                    brace_count += 1
                elif char == "}":
                    brace_count -= 1
                    if brace_count == 0:
                        end_idx = i + 1
                        break
            text = text[start_idx:end_idx]
    
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        print(f"[analyzer] ⚠️ JSON parse error: {e}")
        print(f"[analyzer] Raw response (first 500 chars): {response_text[:500]}")
        
        # Try a more aggressive extraction - find the JSON object
        try:
            import re
            # Match JSON object pattern
            match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response_text, re.DOTALL)
            if match:
                return json.loads(match.group())
        except Exception:
            pass
        
        return {}


def analyze_transcript_sync(
    transcripts: List[TranscriptEntry],
    reference_date: Optional[datetime] = None,
    api_key: Optional[str] = None,
) -> AnalyzedOutcome:
    """
    Analyze transcript using Gemini 2.0 Flash API (synchronous).
    
    Args:
        transcripts: List of transcript entries
        reference_date: Reference date for relative date parsing
        api_key: Optional Gemini API key (uses GCP auth if not provided)
    
    Returns:
        AnalyzedOutcome with extracted information
    """
    if not transcripts:
        return AnalyzedOutcome(outcome="no_conversation", confidence=0.0)
    
    if reference_date is None:
        reference_date = datetime.now()
    
    prompt = _build_prompt(transcripts, reference_date)
    
    # Prepare request
    headers = {"Content-Type": "application/json"}
    
    if api_key:
        url = f"{GEMINI_API_URL}?key={api_key}"
    else:
        # Use GCP authentication
        token = _get_gcp_access_token()
        headers["Authorization"] = f"Bearer {token}"
        # Use Vertex AI endpoint for GCP auth
        project_id = os.getenv("GCP_PROJECT_ID", "voiceagentprojects")
        location = os.getenv("GEMINI_LOCATION", "us-central1")
        url = (
            f"https://{location}-aiplatform.googleapis.com/v1/projects/{project_id}"
            f"/locations/{location}/publishers/google/models/gemini-2.0-flash:generateContent"
        )
    
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,  # Low temperature for consistent structured output
            "maxOutputTokens": 2048,
        },
    }
    
    try:
        print("[analyzer] 🔍 Analyzing transcript with Gemini 2.0 Flash...")
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        if response.status_code != 200:
            print(f"[analyzer] ❌ Gemini API error ({response.status_code}): {response.text[:500]}")
            return AnalyzedOutcome(outcome="analysis_failed", confidence=0.0)
        
        result = response.json()
        
        # Extract text from response
        candidates = result.get("candidates", [])
        if not candidates:
            print("[analyzer] ⚠️ No candidates in Gemini response")
            return AnalyzedOutcome(outcome="analysis_failed", confidence=0.0)
        
        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            print("[analyzer] ⚠️ No parts in Gemini response")
            return AnalyzedOutcome(outcome="analysis_failed", confidence=0.0)
        
        response_text = parts[0].get("text", "")
        analysis = _parse_gemini_response(response_text)
        
        if not analysis:
            return AnalyzedOutcome(outcome="parse_failed", confidence=0.0)
        
        # Build AnalyzedOutcome from parsed JSON
        outcome = AnalyzedOutcome(
            callback_date=analysis.get("callback_date"),
            callback_time=analysis.get("callback_time"),
            outcome=analysis.get("outcome", "unknown"),
            candidate_concerns=analysis.get("candidate_concerns", []),
            candidate_queries=analysis.get("candidate_queries", []),
            language_preference=analysis.get("language_preference"),
            language_issues=analysis.get("language_issues"),
            sentiment=analysis.get("sentiment", "neutral"),
            cooperation_level=analysis.get("cooperation_level", "normal"),
            urgency=analysis.get("urgency"),
            availability_notes=analysis.get("availability_notes"),
            reschedule_requested=analysis.get("reschedule_requested", False),
            preferred_contact_method=analysis.get("preferred_contact_method"),
            key_topics_discussed=analysis.get("key_topics_discussed", []),
            special_notes=analysis.get("special_notes"),
            confidence=analysis.get("confidence", 0.8),
            raw_analysis=analysis,
        )
        
        print(f"[analyzer] ✅ Analysis complete: outcome={outcome.outcome}, date={outcome.callback_date}, time={outcome.callback_time}")
        
        return outcome
        
    except requests.Timeout:
        print("[analyzer] ⏰ Gemini API timeout")
        return AnalyzedOutcome(outcome="timeout", confidence=0.0)
    except Exception as e:
        print(f"[analyzer] ❌ Analysis error: {e}")
        return AnalyzedOutcome(outcome="error", confidence=0.0)


async def analyze_transcript_async(
    transcripts: List[TranscriptEntry],
    reference_date: Optional[datetime] = None,
    api_key: Optional[str] = None,
) -> AnalyzedOutcome:
    """
    Analyze transcript using Gemini 2.0 Flash API (asynchronous).
    
    Args:
        transcripts: List of transcript entries
        reference_date: Reference date for relative date parsing
        api_key: Optional Gemini API key (uses GCP auth if not provided)
    
    Returns:
        AnalyzedOutcome with extracted information
    """
    if not HAS_AIOHTTP:
        # Fall back to sync version
        return analyze_transcript_sync(transcripts, reference_date, api_key)
    
    if not transcripts:
        return AnalyzedOutcome(outcome="no_conversation", confidence=0.0)
    
    if reference_date is None:
        reference_date = datetime.now()
    
    prompt = _build_prompt(transcripts, reference_date)
    
    # Prepare request
    headers = {"Content-Type": "application/json"}
    
    if api_key:
        url = f"{GEMINI_API_URL}?key={api_key}"
    else:
        # Use GCP authentication
        token = _get_gcp_access_token()
        headers["Authorization"] = f"Bearer {token}"
        project_id = os.getenv("GCP_PROJECT_ID", "voiceagentprojects")
        location = os.getenv("GEMINI_LOCATION", "us-central1")
        url = (
            f"https://{location}-aiplatform.googleapis.com/v1/projects/{project_id}"
            f"/locations/{location}/publishers/google/models/gemini-2.0-flash:generateContent"
        )
    
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 2048,
        },
    }
    
    try:
        print(f"[analyzer] 🔍 Analyzing transcript with Gemini 2.0 Flash (async)...")
        print(f"[analyzer] 📡 Transcripts: {len(transcripts)} entries")
        print(f"[analyzer] 📡 URL: {url[:100]}...")
        
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, headers=headers, json=payload) as response:
                response_text_raw = await response.text()
                
                if response.status != 200:
                    print(f"[analyzer] ❌ Gemini API error ({response.status}): {response_text_raw[:500]}")
                    return AnalyzedOutcome(outcome="analysis_failed", confidence=0.0)
                
                try:
                    result = json.loads(response_text_raw)
                except json.JSONDecodeError as e:
                    print(f"[analyzer] ❌ Failed to parse API response as JSON: {e}")
                    print(f"[analyzer] Raw response: {response_text_raw[:500]}")
                    return AnalyzedOutcome(outcome="analysis_failed", confidence=0.0)
        
        # Extract text from response
        candidates = result.get("candidates", [])
        if not candidates:
            print(f"[analyzer] ⚠️ No candidates in Gemini response. Keys: {list(result.keys())}")
            if "error" in result:
                print(f"[analyzer] ❌ API Error: {result['error']}")
            return AnalyzedOutcome(outcome="analysis_failed", confidence=0.0)
        
        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            print(f"[analyzer] ⚠️ No parts in Gemini response. Content keys: {list(content.keys())}")
            return AnalyzedOutcome(outcome="analysis_failed", confidence=0.0)
        
        response_text = parts[0].get("text", "")
        print(f"[analyzer] 📝 Gemini response length: {len(response_text)} chars")
        
        analysis = _parse_gemini_response(response_text)
        
        if not analysis:
            return AnalyzedOutcome(outcome="parse_failed", confidence=0.0)
        
        # Build AnalyzedOutcome from parsed JSON
        outcome = AnalyzedOutcome(
            callback_date=analysis.get("callback_date"),
            callback_time=analysis.get("callback_time"),
            outcome=analysis.get("outcome", "unknown"),
            candidate_concerns=analysis.get("candidate_concerns", []),
            candidate_queries=analysis.get("candidate_queries", []),
            language_preference=analysis.get("language_preference"),
            language_issues=analysis.get("language_issues"),
            sentiment=analysis.get("sentiment", "neutral"),
            cooperation_level=analysis.get("cooperation_level", "normal"),
            urgency=analysis.get("urgency"),
            availability_notes=analysis.get("availability_notes"),
            reschedule_requested=analysis.get("reschedule_requested", False),
            preferred_contact_method=analysis.get("preferred_contact_method"),
            key_topics_discussed=analysis.get("key_topics_discussed", []),
            special_notes=analysis.get("special_notes"),
            confidence=analysis.get("confidence", 0.8),
            raw_analysis=analysis,
        )
        
        print(f"[analyzer] ✅ Analysis complete: outcome={outcome.outcome}, date={outcome.callback_date}, time={outcome.callback_time}")
        
        return outcome
        
    except Exception as e:
        print(f"[analyzer] ❌ Async analysis error: {e}")
        return AnalyzedOutcome(outcome="error", confidence=0.0)


# For testing
if __name__ == "__main__":
    # Test with sample transcript
    sample_transcripts = [
        TranscriptEntry("agent", "Hello. This call is from AceNgage on behalf of USV. We would like to schedule your exit interview with an HR counsellor. May I take a few moments to find a convenient time for you?", "2026-01-28T09:52:16"),
        TranscriptEntry("user", "Hello", "2026-01-28T09:52:17"),
        TranscriptEntry("agent", "What date and time would work best for you for the exit interview?", "2026-01-28T09:52:27"),
        TranscriptEntry("user", "tomorrow 4:00 p.m.", "2026-01-28T09:52:34"),
        TranscriptEntry("agent", "Wonderful! You are all set. You will get a call on January 29th at 4 pm. Please be in a quiet area and ensure good coverage. Thanks!", "2026-01-28T09:52:38"),
        TranscriptEntry("user", "Okay, can we rather change it to day after 5 pm?", "2026-01-28T09:52:43"),
        TranscriptEntry("agent", "Yes, of course. So, that would be on January 30th at 5 pm?", "2026-01-28T09:52:45"),
        TranscriptEntry("user", "Yes.", "2026-01-28T09:52:51"),
        TranscriptEntry("agent", "Perfect! You are all set then. You will get a call on January 30th at 5 pm. Thanks!", "2026-01-28T09:52:53"),
    ]
    
    result = analyze_transcript_sync(sample_transcripts, datetime(2026, 1, 28))
    
    print("\n" + "=" * 60)
    print("ANALYSIS RESULT")
    print("=" * 60)
    print(f"Outcome: {result.outcome}")
    print(f"Date: {result.callback_date}")
    print(f"Time: {result.callback_time}")
    print(f"Sentiment: {result.sentiment}")
    print(f"Cooperation: {result.cooperation_level}")
    print(f"Reschedule requested: {result.reschedule_requested}")
    print(f"Concerns: {result.candidate_concerns}")
    print(f"Queries: {result.candidate_queries}")
    print(f"Special notes: {result.special_notes}")
    print(f"Confidence: {result.confidence}")
    print("\n📋 Counsellor Brief:")
    print(result.get_counsellor_brief())
