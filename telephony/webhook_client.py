"""
Webhook client for posting call outcomes to admin-ui and Acengage.

Sends completion notifications when calls end with:
- Call status (answered, completed, no_answer, etc.)
- Extracted callback date/time
- Candidate insights (concerns, queries, sentiment)
- Transcript reference
"""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

import aiohttp

from transcript_analyzer import AnalyzedOutcome, TranscriptEntry, analyze_transcript_async


@dataclass
class WebhookConfig:
    """Configuration for webhook endpoints."""
    admin_ui_base_url: str
    voice_agent_id: str
    timeout_seconds: int = 30
    
    @classmethod
    def from_env(cls) -> "WebhookConfig":
        """Load webhook config from environment variables."""
        return cls(
            admin_ui_base_url=os.getenv("ADMIN_UI_URL", "http://localhost:3101"),
            voice_agent_id=os.getenv("VOICE_AGENT_ID", ""),
            timeout_seconds=int(os.getenv("WEBHOOK_TIMEOUT", "30")),
        )


@dataclass
class CallCompletionPayload:
    """Payload for call completion webhook."""
    phone_number: str
    call_sid: str
    status: str  # answered, completed, no_answer, busy, failed
    duration_sec: Optional[int] = None
    answered_at: Optional[str] = None
    completed_at: Optional[str] = None
    transcript_id: Optional[str] = None
    callback_date: Optional[str] = None
    callback_time: Optional[str] = None
    notes: Optional[str] = None
    # Extended analysis fields
    candidate_concerns: Optional[List[str]] = None
    candidate_queries: Optional[List[str]] = None
    sentiment: Optional[str] = None
    cooperation_level: Optional[str] = None
    language_preference: Optional[str] = None
    language_issues: Optional[str] = None
    reschedule_requested: bool = False
    special_notes: Optional[str] = None
    analysis_json: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            "phoneNumber": self.phone_number,
            "callSid": self.call_sid,
            "status": self.status,
        }
        if self.duration_sec is not None:
            result["durationSec"] = self.duration_sec
        if self.answered_at:
            result["answeredAt"] = self.answered_at
        if self.completed_at:
            result["completedAt"] = self.completed_at
        if self.transcript_id:
            result["transcriptId"] = self.transcript_id
        if self.callback_date:
            result["callbackDate"] = self.callback_date
        if self.callback_time:
            result["callbackTime"] = self.callback_time
        if self.notes:
            result["notes"] = self.notes
        # Extended analysis fields
        if self.candidate_concerns:
            result["candidateConcerns"] = self.candidate_concerns
        if self.candidate_queries:
            result["candidateQueries"] = self.candidate_queries
        if self.sentiment:
            result["sentiment"] = self.sentiment
        if self.cooperation_level:
            result["cooperationLevel"] = self.cooperation_level
        if self.language_preference:
            result["languagePreference"] = self.language_preference
        if self.language_issues:
            result["languageIssues"] = self.language_issues
        if self.reschedule_requested:
            result["rescheduleRequested"] = self.reschedule_requested
        if self.special_notes:
            result["specialNotes"] = self.special_notes
        if self.analysis_json:
            result["analysisJson"] = self.analysis_json
        return result


class WebhookClient:
    """Client for posting webhooks to admin-ui."""
    
    def __init__(self, config: WebhookConfig):
        self.config = config
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session."""
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=self.config.timeout_seconds)
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session
    
    async def close(self) -> None:
        """Close the HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
    
    async def post_call_completion(
        self,
        payload: CallCompletionPayload
    ) -> Dict[str, Any]:
        """
        Post call completion to admin-ui.
        
        Endpoint: POST /api/voiceagents/{voiceAgentId}/callouts/complete
        """
        if not self.config.voice_agent_id:
            print("[webhook] ⚠️ No VOICE_AGENT_ID configured, skipping webhook")
            return {"error": "No voice_agent_id configured"}
        
        url = f"{self.config.admin_ui_base_url}/api/voiceagents/{self.config.voice_agent_id}/callouts/complete"
        
        try:
            session = await self._get_session()
            data = payload.to_dict()
            
            print(f"[webhook] 📤 Posting completion to {url}")
            print(f"[webhook] 📋 Payload: {json.dumps(data, indent=2)}")
            
            async with session.post(url, json=data) as response:
                response_text = await response.text()
                
                if response.status == 200:
                    result = json.loads(response_text)
                    print(f"[webhook] ✅ Completion posted successfully: {result}")
                    return result
                else:
                    print(f"[webhook] ❌ Completion failed ({response.status}): {response_text}")
                    return {"error": response_text, "status": response.status}
                    
        except asyncio.TimeoutError:
            print(f"[webhook] ⏰ Timeout posting to {url}")
            return {"error": "timeout"}
        except aiohttp.ClientError as e:
            print(f"[webhook] ❌ HTTP error: {e}")
            return {"error": str(e)}
        except Exception as e:
            print(f"[webhook] ❌ Unexpected error: {e}")
            return {"error": str(e)}
    
    async def log_call_session(
        self,
        call_id: str,
        direction: str,
        from_number: Optional[str],
        to_number: Optional[str],
        started_at: Optional[datetime],
        ended_at: Optional[datetime],
        duration_sec: Optional[int] = None,
        transcript_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Log a call session to admin-ui for usage tracking.
        
        Endpoint: POST /api/sessions
        """
        url = f"{self.config.admin_ui_base_url}/api/sessions"
        
        # Calculate duration if not provided
        if duration_sec is None and started_at and ended_at:
            duration_sec = int((ended_at - started_at).total_seconds())
        
        data = {
            "voiceAgentId": self.config.voice_agent_id or None,
            "direction": direction,
            "fromNumber": from_number,
            "toNumber": to_number,
            "startedAt": started_at.isoformat() if started_at else None,
            "endedAt": ended_at.isoformat() if ended_at else None,
            "durationSec": duration_sec,
            "callId": call_id,
            "transcriptPath": transcript_path,
        }
        
        try:
            session = await self._get_session()
            
            print(f"[webhook] 📊 Logging call session to {url}")
            
            async with session.post(url, json=data) as response:
                response_text = await response.text()
                
                if response.status == 200:
                    result = json.loads(response_text)
                    print(f"[webhook] ✅ Call session logged: {result.get('sessionId', 'unknown')}")
                    return result
                else:
                    print(f"[webhook] ⚠️ Session log failed ({response.status}): {response_text}")
                    return {"error": response_text, "status": response.status}
                    
        except asyncio.TimeoutError:
            print(f"[webhook] ⏰ Timeout logging session")
            return {"error": "timeout"}
        except aiohttp.ClientError as e:
            print(f"[webhook] ⚠️ HTTP error logging session: {e}")
            return {"error": str(e)}
        except Exception as e:
            print(f"[webhook] ⚠️ Error logging session: {e}")
            return {"error": str(e)}

    async def post_outcome(
        self,
        job_id: str,
        callback_date: Optional[str] = None,
        callback_time: Optional[str] = None,
        non_contactable_status_node_id: Optional[int] = None,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Post call outcome to admin-ui (which then posts to Acengage).
        
        Endpoint: POST /api/voiceagents/{voiceAgentId}/callouts/jobs/{jobId}/outcome
        """
        if not self.config.voice_agent_id:
            print("[webhook] ⚠️ No VOICE_AGENT_ID configured, skipping outcome post")
            return {"error": "No voice_agent_id configured"}
        
        url = (
            f"{self.config.admin_ui_base_url}/api/voiceagents/"
            f"{self.config.voice_agent_id}/callouts/jobs/{job_id}/outcome"
        )
        
        data = {}
        if callback_date:
            data["callbackDate"] = callback_date
        if callback_time:
            data["callbackTime"] = callback_time
        if non_contactable_status_node_id is not None:
            data["nonContactableStatusNodeId"] = non_contactable_status_node_id
        if notes:
            data["notes"] = notes
        
        try:
            session = await self._get_session()
            
            print(f"[webhook] 📤 Posting outcome to {url}")
            print(f"[webhook] 📋 Payload: {json.dumps(data, indent=2)}")
            
            async with session.post(url, json=data) as response:
                response_text = await response.text()
                
                if response.status == 200:
                    result = json.loads(response_text)
                    print(f"[webhook] ✅ Outcome posted to Acengage: {result}")
                    return result
                else:
                    print(f"[webhook] ❌ Outcome post failed ({response.status}): {response_text}")
                    return {"error": response_text, "status": response.status}
                    
        except asyncio.TimeoutError:
            print(f"[webhook] ⏰ Timeout posting outcome to {url}")
            return {"error": "timeout"}
        except aiohttp.ClientError as e:
            print(f"[webhook] ❌ HTTP error posting outcome: {e}")
            return {"error": str(e)}
        except Exception as e:
            print(f"[webhook] ❌ Unexpected error posting outcome: {e}")
            return {"error": str(e)}


async def process_and_post_completion(
    webhook_client: WebhookClient,
    call_sid: str,
    phone_number: str,
    transcripts: List[TranscriptEntry],
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    transcript_filepath: Optional[str] = None
) -> Dict[str, Any]:
    """
    Process transcripts with Gemini AI and post completion webhook.
    
    1. Analyze transcript with Gemini 2.0 Flash
    2. Extract scheduling info, concerns, queries, sentiment
    3. Post completion to admin-ui
    4. Return result
    """
    # Analyze transcript with Gemini 2.0 Flash
    print(f"[webhook] 🔍 Analyzing transcript with VoiceAgent AI...")
    print(f"[webhook] 📋 Transcripts count: {len(transcripts)}")
    
    try:
        outcome = await analyze_transcript_async(transcripts, start_time)
    except Exception as analyze_err:
        print(f"[webhook] ❌ AI analysis failed: {type(analyze_err).__name__}: {analyze_err}")
        # Return a minimal outcome so we can still post the completion
        from transcript_analyzer import AnalyzedOutcome
        outcome = AnalyzedOutcome(outcome="analysis_error", confidence=0.0)
    
    print(f"[webhook] 📊 Analysis result:")
    print(f"         outcome={outcome.outcome}, date={outcome.callback_date}, time={outcome.callback_time}")
    print(f"         sentiment={outcome.sentiment}, cooperation={outcome.cooperation_level}")
    if outcome.candidate_concerns:
        print(f"         concerns={outcome.candidate_concerns}")
    if outcome.candidate_queries:
        print(f"         queries={outcome.candidate_queries}")
    
    # Calculate duration
    duration_sec = None
    if start_time and end_time:
        duration_sec = int((end_time - start_time).total_seconds())
    
    # Determine status based on outcome
    status = "completed"
    if outcome.outcome == "scheduled":
        status = "completed"
    elif outcome.outcome == "not_interested":
        status = "completed"
    elif outcome.outcome in ("unknown", "no_conversation", "no_clear_outcome"):
        status = "no_answer"
    elif outcome.outcome in ("analysis_failed", "error", "timeout"):
        status = "completed"  # Still mark as completed even if analysis failed
    
    # Build comprehensive notes for HR counsellor
    notes_parts = []
    if outcome.special_notes:
        notes_parts.append(outcome.special_notes)
    if outcome.availability_notes:
        notes_parts.append(f"Availability: {outcome.availability_notes}")
    if outcome.language_issues:
        notes_parts.append(f"Language: {outcome.language_issues}")
    notes = " | ".join(notes_parts) if notes_parts else None
    
    # Build payload with full analysis
    payload = CallCompletionPayload(
        phone_number=phone_number,
        call_sid=call_sid,
        status=status,
        duration_sec=duration_sec,
        answered_at=start_time.isoformat() if start_time else None,
        completed_at=end_time.isoformat() if end_time else datetime.now().isoformat(),
        transcript_id=transcript_filepath,
        callback_date=outcome.callback_date,
        callback_time=outcome.callback_time,
        notes=notes,
        candidate_concerns=outcome.candidate_concerns if outcome.candidate_concerns else None,
        candidate_queries=outcome.candidate_queries if outcome.candidate_queries else None,
        sentiment=outcome.sentiment,
        cooperation_level=outcome.cooperation_level,
        language_preference=outcome.language_preference,
        language_issues=outcome.language_issues,
        reschedule_requested=outcome.reschedule_requested,
        special_notes=outcome.special_notes,
        analysis_json=outcome.to_dict(),
    )
    
    # Post completion
    result = await webhook_client.post_call_completion(payload)
    
    return {
        "outcome": outcome,
        "webhook_result": result,
        "counsellor_brief": outcome.get_counsellor_brief(),
    }


# Singleton client instance
_webhook_client: Optional[WebhookClient] = None


def get_webhook_client() -> WebhookClient:
    """Get or create singleton webhook client."""
    global _webhook_client
    if _webhook_client is None:
        config = WebhookConfig.from_env()
        _webhook_client = WebhookClient(config)
    return _webhook_client


async def close_webhook_client() -> None:
    """Close the singleton webhook client."""
    global _webhook_client
    if _webhook_client:
        await _webhook_client.close()
        _webhook_client = None


# For testing
if __name__ == "__main__":
    async def test():
        # Set test environment
        os.environ["ADMIN_UI_URL"] = "http://localhost:3101"
        os.environ["VOICE_AGENT_ID"] = "test-agent-id"
        os.environ["GCP_PROJECT_ID"] = "voiceagentprojects"
        
        client = get_webhook_client()
        
        # Test with sample data - more realistic conversation
        transcripts = [
            TranscriptEntry("agent", "Hello. This call is from AceNgage on behalf of USV. We would like to schedule your exit interview with an HR counsellor. May I take a few moments to find a convenient time for you?", "2026-01-28T09:52:16"),
            TranscriptEntry("user", "Hello, yes I have been expecting this call.", "2026-01-28T09:52:20"),
            TranscriptEntry("agent", "Great! What date and time would work best for you?", "2026-01-28T09:52:25"),
            TranscriptEntry("user", "I'm quite busy this week. Can we do tomorrow around 4 pm?", "2026-01-28T09:52:30"),
            TranscriptEntry("agent", "You are all set for January 29th at 4 pm. Thanks!", "2026-01-28T09:52:38"),
            TranscriptEntry("user", "Actually, can we change to day after at 5 pm? I just remembered I have a meeting.", "2026-01-28T09:52:43"),
            TranscriptEntry("agent", "Of course! So January 30th at 5 pm works for you?", "2026-01-28T09:52:48"),
            TranscriptEntry("user", "Yes, that's perfect. Will the call be in English or Hindi?", "2026-01-28T09:52:52"),
            TranscriptEntry("agent", "The counsellor will speak in your preferred language. You will receive a call on January 30th at 5 pm. Thank you!", "2026-01-28T09:52:58"),
        ]
        
        result = await process_and_post_completion(
            client,
            call_sid="test_sid_123",
            phone_number="9999984076",
            transcripts=transcripts,
            start_time=datetime(2026, 1, 28, 9, 52, 0),
            end_time=datetime(2026, 1, 28, 9, 53, 0),
        )
        
        print(f"\n{'='*60}")
        print("WEBHOOK RESULT")
        print(f"{'='*60}")
        print(f"Outcome: {result['outcome'].outcome}")
        print(f"Date: {result['outcome'].callback_date}")
        print(f"Time: {result['outcome'].callback_time}")
        print(f"\n📋 Counsellor Brief:")
        print(result['counsellor_brief'])
        
        await close_webhook_client()
    
    asyncio.run(test())
