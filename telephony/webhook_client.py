"""
Webhook client for posting call outcomes to admin-ui and Acengage.

Sends completion notifications when calls end with:
- Call status (answered, completed, no_answer, etc.)
- Extracted callback date/time
- Transcript reference
"""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Optional

import aiohttp

from transcript_processor import ExtractedOutcome, TranscriptEntry, extract_outcome_from_transcripts


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
    transcripts: list[TranscriptEntry],
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    transcript_filepath: Optional[str] = None
) -> Dict[str, Any]:
    """
    Process transcripts and post completion webhook.
    
    1. Extract outcome from transcripts
    2. Post completion to admin-ui
    3. Return result
    """
    # Extract outcome from transcripts
    outcome = extract_outcome_from_transcripts(transcripts, start_time)
    
    print(f"[webhook] 🔍 Extracted outcome: {outcome}")
    
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
    elif outcome.outcome == "unknown" or outcome.outcome == "no_conversation":
        status = "no_answer"
    
    # Build payload
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
        notes=outcome.notes,
    )
    
    # Post completion
    result = await webhook_client.post_call_completion(payload)
    
    return {
        "outcome": outcome,
        "webhook_result": result,
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
    import sys
    
    async def test():
        # Set test environment
        os.environ["ADMIN_UI_URL"] = "http://localhost:3101"
        os.environ["VOICE_AGENT_ID"] = "test-agent-id"
        
        client = get_webhook_client()
        
        # Test with sample data
        transcripts = [
            TranscriptEntry("agent", "Hello, scheduling exit interview.", "2026-01-28T09:52:16"),
            TranscriptEntry("user", "Tomorrow 4 pm please", "2026-01-28T09:52:30"),
            TranscriptEntry("agent", "You are all set for January 29th at 4 pm. Thanks!", "2026-01-28T09:52:38"),
            TranscriptEntry("user", "Yes, thank you", "2026-01-28T09:52:45"),
        ]
        
        result = await process_and_post_completion(
            client,
            call_sid="test_sid_123",
            phone_number="9999984076",
            transcripts=transcripts,
            start_time=datetime(2026, 1, 28, 9, 52, 0),
            end_time=datetime(2026, 1, 28, 9, 53, 0),
        )
        
        print(f"\nResult: {result}")
        
        await close_webhook_client()
    
    asyncio.run(test())
