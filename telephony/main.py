"""
Waybeo Telephony WebSocket service (Gemini Live backend) - MVP.

Protocol assumption matches the working singleinterface telephony service:
Client sends JSON messages with:
- event: "start" | "media" | "stop"
- ucid: string (call/session id)
- data.samples: number[] (int16 PCM samples at 8kHz)

This service bridges telephony audio to Gemini Live:
- Waybeo 8kHz -> resample -> Gemini 16kHz PCM16 base64
- Gemini audio output (assumed 24kHz PCM16 base64) -> resample -> Waybeo 8kHz samples
"""

from __future__ import annotations

import asyncio
import audioop
import base64
import json
import os
import struct
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import websockets
from websockets.exceptions import ConnectionClosed

from config import Config
from audio_processor import AudioProcessor, AudioRates
from gemini_live import GeminiLiveSession, GeminiSessionConfig
from transcript_analyzer import TranscriptEntry as AnalyzerTranscriptEntry
from webhook_client import (
    get_webhook_client,
    process_and_post_completion,
    close_webhook_client,
)


@dataclass
class TranscriptEntry:
    """Single transcript entry (either input or output)."""
    role: str  # "agent" or "user"
    text: str
    timestamp: str


@dataclass
class TelephonySession:
    ucid: str
    client_ws: websockets.WebSocketServerProtocol
    gemini: GeminiLiveSession
    input_buffer: list[int]
    output_buffer: list[int]
    closed: bool = False
    end_after_turn: bool = False
    # Transcript collection
    transcripts: List[TranscriptEntry] = field(default_factory=list)
    current_agent_transcript: List[str] = field(default_factory=list)  # Accumulates words in current turn
    call_start_time: Optional[datetime] = None
    phone_number: Optional[str] = None


def _read_prompt_text() -> str:
    prompt_file = os.getenv(
        "PROMPT_FILE", os.path.join(os.path.dirname(__file__), "acengage_prompt.txt")
    )
    try:
        with open(prompt_file, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        # fallback: minimal prompt if file missing
        return "You are a helpful AceNgage scheduling assistant. Be concise and friendly."


def _extract_audio_b64_from_gemini_message(msg: Dict[str, Any]) -> Optional[str]:
    parts = msg.get("serverContent", {}).get("modelTurn", {}).get("parts") or []
    if not parts:
        return None
    inline = parts[0].get("inlineData") if isinstance(parts[0], dict) else None
    if inline and isinstance(inline, dict):
        return inline.get("data")
    return None


def _is_interrupted(msg: Dict[str, Any]) -> bool:
    return bool(msg.get("serverContent", {}).get("interrupted"))


def _extract_transcripts(msg: Dict[str, Any]) -> list[str]:
    """Extract transcript text from Gemini message."""
    transcripts: list[str] = []
    sc = msg.get("serverContent", {})
    
    # Check modelTurn.parts for text
    model_turn = sc.get("modelTurn", {})
    parts = model_turn.get("parts", [])
    for part in parts:
        if isinstance(part, dict) and part.get("text"):
            transcripts.append(str(part.get("text")))

    # Check outputTranscription (native audio model format)
    output_trans = sc.get("outputTranscription")
    if isinstance(output_trans, dict):
        text = output_trans.get("text")
        if text:
            transcripts.append(str(text))

    # Check inputTranscription (user speech)
    input_trans = sc.get("inputTranscription")
    if isinstance(input_trans, dict):
        text = input_trans.get("text")
        if text:
            transcripts.append(str(text))

    # Legacy format: outputAudioTranscription, inputAudioTranscription
    for key in ("outputAudioTranscription", "inputAudioTranscription"):
        blob = sc.get(key) or msg.get(key)
        if isinstance(blob, dict):
            value = blob.get("transcript") or blob.get("text")
            if value:
                transcripts.append(str(value))
        elif isinstance(blob, list):
            for item in blob:
                if isinstance(item, dict):
                    value = item.get("transcript") or item.get("text")
                    if value:
                        transcripts.append(str(value))
    return transcripts


def _should_end_call(texts: list[str], phrases: list[str]) -> bool:
    """
    Check if agent response indicates end of call.
    Only triggers for SHORT responses containing farewell phrases.
    This prevents false positives like "thank you for confirming your details".
    """
    if not texts:
        return False
    combined = " ".join(texts).lower().strip()
    
    # Only consider short responses (< 100 chars) as potential farewells
    # Long responses with "thank you" are likely mid-conversation
    if len(combined) > 100:
        return False
    
    # Check if any end phrase is present
    return any(phrase for phrase in phrases if phrase and phrase in combined)


async def _end_call_monitor(session: TelephonySession, cfg: Config) -> None:
    """
    Monitor for end_after_turn flag and close the websocket.
    This runs as a separate task to ensure call ends even if Gemini stops sending messages.
    Waits for audio to finish playing before closing.
    """
    try:
        while not session.closed:
            if session.end_after_turn:
                # Wait for audio to finish - the confirmation message can be 10+ seconds
                # We wait until the output buffer has been empty for a while
                print(f"[{session.ucid}] ⏳ End requested, waiting for audio to finish...")
                
                # Wait at least 1 second, then check if buffer is still being filled
                await asyncio.sleep(1.0)
                
                # Keep waiting while there's audio in the buffer or recent activity
                empty_count = 0
                max_wait = 15  # Maximum 15 seconds wait
                waited = 0
                
                while waited < max_wait:
                    if session.closed:
                        return
                    
                    if not session.output_buffer:
                        empty_count += 1
                        # Buffer empty for 1.5 seconds (3 checks) = audio done
                        if empty_count >= 3:
                            break
                    else:
                        empty_count = 0  # Reset if buffer has data
                    
                    await asyncio.sleep(0.5)
                    waited += 0.5
                
                if session.closed:
                    return
                
                print(f"[{session.ucid}] 📴 Closing call - audio complete, waited {waited:.1f}s")
                session.closed = True
                
                try:
                    # Close Gemini connection
                    await session.gemini.close()
                except Exception:
                    pass
                
                try:
                    # Close Elision websocket
                    await session.client_ws.close(code=1000, reason="Call completed")
                except Exception:
                    pass
                
                return
            
            # Check every 500ms
            await asyncio.sleep(0.5)
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"[{session.ucid}] ⚠️ End call monitor error: {e}")


async def _process_media_message(
    session: TelephonySession, 
    msg: Dict[str, Any], 
    audio_processor: AudioProcessor, 
    cfg: Config
) -> None:
    """Process a media message from Elision."""
    payload_b64 = msg.get("media", {}).get("payload")
    if not payload_b64:
        return

    try:
        # Decode base64 to bytes (A-law encoded audio)
        alaw_bytes = base64.b64decode(payload_b64)
        # Convert A-law to linear PCM (16-bit signed)
        pcm_bytes = audioop.alaw2lin(alaw_bytes, 2)
        # Convert bytes to samples
        samples = list(struct.unpack(f'<{len(pcm_bytes)//2}h', pcm_bytes))
    except Exception as e:
        if cfg.DEBUG:
            print(f"[{session.ucid}] ⚠️ Audio decode error: {e}")
        return

    session.input_buffer.extend(samples)

    # Send chunks to Gemini
    while len(session.input_buffer) >= cfg.AUDIO_BUFFER_SAMPLES_INPUT:
        chunk = session.input_buffer[: cfg.AUDIO_BUFFER_SAMPLES_INPUT]
        session.input_buffer = session.input_buffer[cfg.AUDIO_BUFFER_SAMPLES_INPUT :]

        samples_np = audio_processor.waybeo_samples_to_np(chunk)
        audio_b64 = audio_processor.process_input_8k_to_gemini_16k_b64(samples_np)
        await session.gemini.send_audio_b64_pcm16(audio_b64)


def _save_transcript(session: TelephonySession, cfg: Config) -> Optional[str]:
    """Save call transcript to JSON file. Returns the filepath if saved."""
    if not cfg.SAVE_TRANSCRIPTS or not session.transcripts:
        return None

    try:
        # Get the transcript directory (relative to telephony service or absolute)
        transcript_dir = Path(cfg.TRANSCRIPTS_DIR)
        if not transcript_dir.is_absolute():
            transcript_dir = Path(__file__).parent / transcript_dir
        transcript_dir.mkdir(parents=True, exist_ok=True)

        # Generate filename with timestamp and ucid
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_ucid = "".join(c if c.isalnum() else "_" for c in session.ucid)
        filename = f"{timestamp}_{safe_ucid}.json"
        filepath = transcript_dir / filename

        # Build transcript data
        call_data = {
            "callId": session.ucid,
            "phoneNumber": session.phone_number,
            "startTime": session.call_start_time.isoformat() if session.call_start_time else None,
            "endTime": datetime.now().isoformat(),
            "transcript": [
                {"role": t.role, "text": t.text, "timestamp": t.timestamp}
                for t in session.transcripts
            ],
        }

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(call_data, f, indent=2, ensure_ascii=False)

        print(f"[{session.ucid}] 💾 Transcript saved: {filepath}")
        return str(filepath)
    except Exception as e:
        print(f"[{session.ucid}] ❌ Failed to save transcript: {e}")
        return None


async def _gemini_reader(
    session: TelephonySession, audio_processor: AudioProcessor, cfg: Config
) -> None:
    try:
        async for msg in session.gemini.messages():
            # Handle setupComplete - trigger immediate greeting
            if msg.get("setupComplete"):
                if cfg.DEBUG:
                    print(f"[{session.ucid}] 🏁 VoiceAgent setupComplete")
                # Send prompt to trigger greeting immediately
                try:
                    await session.gemini.send_text_prompt("[CALL_CONNECTED] A new call has started. Greet the user now.")
                    if cfg.DEBUG:
                        print(f"[{session.ucid}] 🎬 Sent greeting trigger")
                except Exception as e:
                    print(f"[{session.ucid}] ⚠️ Failed to send greeting trigger: {e}")

            # Handle tool/function calls from Gemini (e.g., end_call)
            tool_call = msg.get("toolCall")
            if tool_call:
                function_calls = tool_call.get("functionCalls", [])
                for fc in function_calls:
                    func_name = fc.get("name")
                    if func_name == "end_call":
                        print(f"[{session.ucid}] 📴 Gemini called end_call() - conversation complete")
                        session.end_after_turn = True
                        # Send function response to acknowledge
                        try:
                            await session.gemini.send_json({
                                "toolResponse": {
                                    "functionResponses": [{
                                        "id": fc.get("id"),
                                        "name": "end_call",
                                        "response": {"status": "ok", "message": "Call will be ended"}
                                    }]
                                }
                            })
                        except Exception:
                            pass

            if cfg.DEBUG or cfg.LOG_TRANSCRIPTS:
                    
                if msg.get("serverContent"):
                    # Log what type of content we're getting
                    sc = msg.get("serverContent", {})
                    model_turn = sc.get("modelTurn", {})
                    parts = model_turn.get("parts", [])
                    has_audio = any(p.get("inlineData") for p in parts if isinstance(p, dict))
                    has_text = any(p.get("text") for p in parts if isinstance(p, dict))
                    if has_audio and cfg.DEBUG and cfg.LOG_MEDIA:
                        print(f"[{session.ucid}] 🎵 VoiceAgent sent audio response")
                    if cfg.LOG_TRANSCRIPTS or cfg.SAVE_TRANSCRIPTS:
                        sc = msg.get("serverContent", {})
                        
                        # Handle outputTranscription (native audio model)
                        output_trans = sc.get("outputTranscription", {})
                        if output_trans:
                            text = output_trans.get("text")
                            finished = output_trans.get("finished", False)
                            
                            if text:
                                # Accumulate words
                                session.current_agent_transcript.append(text)
                            
                            if finished and session.current_agent_transcript:
                                # Save complete transcript
                                full_text = "".join(session.current_agent_transcript).strip()
                                if full_text:
                                    if cfg.LOG_TRANSCRIPTS:
                                        print(f"[{session.ucid}] 💬 Agent: {full_text}")
                                    if cfg.SAVE_TRANSCRIPTS:
                                        session.transcripts.append(TranscriptEntry(
                                            role="agent",
                                            text=full_text,
                                            timestamp=datetime.now().isoformat()
                                        ))
                                    if cfg.AUTO_END_CALL:
                                        phrases = [p.strip().lower() for p in cfg.END_CALL_PHRASES.split(",")]
                                        if _should_end_call([full_text], phrases):
                                            session.end_after_turn = True
                                            if cfg.DEBUG:
                                                print(f"[{session.ucid}] 🔚 End phrase detected: '{full_text[:50]}...' - will close after audio")
                                session.current_agent_transcript.clear()
                        
                        # Handle inputTranscription (user speech) - if enabled
                        input_trans = sc.get("inputTranscription", {})
                        if input_trans:
                            user_text = input_trans.get("text")
                            if user_text and cfg.SAVE_TRANSCRIPTS:
                                if cfg.LOG_TRANSCRIPTS:
                                    print(f"[{session.ucid}] 🎤 User: {user_text}")
                                session.transcripts.append(TranscriptEntry(
                                    role="user",
                                    text=user_text.strip(),
                                    timestamp=datetime.now().isoformat()
                                ))
                        
                        # Debug logging for turn complete
                        if cfg.DEBUG and sc.get("turnComplete"):
                            sc_keys = list(sc.keys())
                            if not output_trans:
                                print(f"[{session.ucid}] 🔍 Turn complete but no text, serverContent keys: {sc_keys}")
                    if sc.get("turnComplete") and cfg.DEBUG:
                        print(f"[{session.ucid}] ✅ VoiceAgent turn complete")
                elif cfg.DEBUG:
                    # Log unknown message types
                    keys = list(msg.keys())
                    print(f"[{session.ucid}] 📩 VoiceAgent msg keys: {keys}")

            if _is_interrupted(msg):
                # Barge-in: clear any queued audio to telephony
                if cfg.DEBUG:
                    print(f"[{session.ucid}] 🛑 VoiceAgent interrupted → clearing output buffer")
                session.output_buffer.clear()
                
                # Send clear command to Elision to stop audio playback immediately
                try:
                    clear_payload = {
                        "event": "clear",
                        "stream_sid": session.ucid
                    }
                    await session.client_ws.send(json.dumps(clear_payload))
                    if cfg.DEBUG:
                        print(f"[{session.ucid}] 🔇 Sent clear event to Elision")
                except Exception as e:
                    if cfg.DEBUG:
                        print(f"[{session.ucid}] ⚠️ Failed to send clear: {e}")
                
                # Clear current transcript buffer on interrupt
                session.current_agent_transcript.clear()
                continue

            audio_b64 = _extract_audio_b64_from_gemini_message(msg)
            if audio_b64:
                samples_8k = audio_processor.process_output_gemini_b64_to_8k_samples(audio_b64)
                session.output_buffer.extend(samples_8k)

                # send consistent chunks
                while len(session.output_buffer) >= cfg.AUDIO_BUFFER_SAMPLES_OUTPUT:
                    chunk = session.output_buffer[: cfg.AUDIO_BUFFER_SAMPLES_OUTPUT]
                    session.output_buffer = session.output_buffer[cfg.AUDIO_BUFFER_SAMPLES_OUTPUT :]

                    # Convert PCM samples to A-law and base64 for Elision
                    pcm_bytes = struct.pack(f'<{len(chunk)}h', *chunk)
                    alaw_bytes = audioop.lin2alaw(pcm_bytes, 2)
                    payload_b64 = base64.b64encode(alaw_bytes).decode('ascii')

                    # Send in Elision format
                    payload = {
                        "event": "media",
                        "stream_sid": session.ucid,
                        "media": {
                            "payload": payload_b64
                        }
                    }
                    try:
                        await session.client_ws.send(json.dumps(payload))
                        if cfg.DEBUG and cfg.LOG_MEDIA:
                            print(f"[{session.ucid}] 🔊 Sent {len(chunk)} samples to telephony (A-law)")
                    except Exception as send_err:
                        if cfg.DEBUG:
                            print(f"[{session.ucid}] ❌ Telephony send failed: {send_err}")
                        break

            # End-of-call is handled by _end_call_monitor task running in parallel
            # This allows closing even when Gemini stops sending messages
    except Exception as e:
        if cfg.DEBUG:
            print(f"[{session.ucid}] ❌ VoiceAgent reader error: {e}")


async def handle_client(client_ws):
    cfg = Config()
    Config.validate(cfg)

    # Get path from the websocket request (works with websockets 11+)
    # For older versions, path was passed as second argument
    try:
        path = client_ws.request.path if hasattr(client_ws, 'request') else client_ws.path
    except AttributeError:
        path = cfg.WS_PATH  # fallback to configured path

    if cfg.DEBUG:
        print(f"[telephony] 🔌 New WebSocket connection on path={path!r}")

    # websockets passes the request path including querystring (e.g. "/wsAcengage?phone=elision").
    # Accept those as long as the base path matches.
    base_path = (path or "").split("?", 1)[0]

    # Only accept configured base path (e.g. /ws or /wsNew1)
    if base_path != cfg.WS_PATH:
        if cfg.DEBUG:
            print(
                f"[telephony] ❌ Rejecting connection: path={path!r} base_path={base_path!r} expected={cfg.WS_PATH!r}"
            )
        await client_ws.close(code=1008, reason="Invalid path")
        return
    
    if cfg.DEBUG:
        print(f"[telephony] ✅ Path accepted, waiting for start event...")

    rates = AudioRates(
        telephony_sr=cfg.TELEPHONY_SR,
        gemini_input_sr=cfg.GEMINI_INPUT_SR,
        gemini_output_sr=cfg.GEMINI_OUTPUT_SR,
    )
    audio_processor = AudioProcessor(rates)

    prompt = _read_prompt_text()

    service_url = (
        "wss://us-central1-aiplatform.googleapis.com/ws/"
        "google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"
    )
    gemini_cfg = GeminiSessionConfig(
        service_url=service_url,
        model_uri=cfg.model_uri,
        voice=cfg.GEMINI_VOICE,
        system_instructions=prompt,
        temperature=0.7,  # Lower temperature for faster, more consistent responses
        enable_affective_dialog=True,
        enable_input_transcription=True,  # Capture user speech
        enable_output_transcription=True,
        # Lower VAD timings to reduce response delay.
        vad_silence_ms=150,
        vad_prefix_ms=200,
        activity_handling="START_OF_ACTIVITY_INTERRUPTS",
    )

    # Create session with temporary ucid until 'start' arrives
    ucid = "UNKNOWN"
    gemini = GeminiLiveSession(gemini_cfg)

    session = TelephonySession(
        ucid=ucid,
        client_ws=client_ws,
        gemini=gemini,
        input_buffer=[],
        output_buffer=[],
    )

    try:
        # Start Gemini connection EARLY (while waiting for start event)
        # This reduces latency by ~4 seconds as Gemini warms up in parallel
        import time
        connect_start = time.time()
        if cfg.DEBUG:
            print(f"[telephony] 🚀 Starting Gemini connection early...")
        gemini_connect_task = asyncio.create_task(session.gemini.connect())
        
        # Wait for start event to get real UCID
        # Elision may sometimes send media before start, so we handle that
        if cfg.DEBUG:
            print(f"[telephony] ⏳ Waiting for start event (timeout=10s)...")
        
        start_msg = None
        buffered_media = []
        
        # Try to get the start event, buffering any media that arrives first
        for _ in range(50):  # Max 50 messages to find start
            raw = await asyncio.wait_for(client_ws.recv(), timeout=10.0)
            if cfg.DEBUG and start_msg is None:
                preview = raw[:300] if isinstance(raw, str) else f"<binary {len(raw)} bytes>"
                print(f"[telephony] 📨 Message received: {preview[:200]}...")
            
            try:
                msg = json.loads(raw) if isinstance(raw, str) else None
            except json.JSONDecodeError:
                continue
                
            if msg is None:
                continue
            
            event_type = msg.get("event")
            
            if event_type == "start":
                start_msg = msg
                if cfg.DEBUG:
                    print(f"[telephony] 📋 Got start event, keys: {list(msg.keys())}")
                break
            elif event_type == "media":
                # Buffer media events that arrive before start
                buffered_media.append(msg)
                # Extract stream_sid from media if we don't have it yet
                if session.ucid == "UNKNOWN" and msg.get("stream_sid"):
                    session.ucid = msg.get("stream_sid")
                    if cfg.DEBUG:
                        print(f"[telephony] 📋 Got stream_sid from media: {session.ucid}")
            elif event_type in ("stop", "end", "close"):
                if cfg.DEBUG:
                    print(f"[telephony] 📋 Got {event_type} before start - closing")
                return
        
        if start_msg is None:
            # If we got stream_sid from media, we can proceed
            if session.ucid != "UNKNOWN":
                if cfg.DEBUG:
                    print(f"[{session.ucid}] ⚠️ No start event received, but got stream_sid from media - proceeding")
            else:
                if cfg.DEBUG:
                    print(f"[telephony] ❌ No start event received within timeout")
                await client_ws.close(code=1008, reason="Expected start event")
                return

        # Extract UCID - support multiple formats (Waybeo, Elision, etc.)
        if start_msg:
            start_data = start_msg.get("start", {})
            session.ucid = (
                start_msg.get("ucid")
                or start_data.get("ucid")
                or start_msg.get("stream_sid")  # Elision format
                or start_data.get("stream_sid")
                or start_data.get("call_sid")   # Elision call ID
                or start_msg.get("data", {}).get("ucid")
                or session.ucid  # Keep what we got from media
            )
            
            # Extract phone number from start message
            session.phone_number = (
                start_msg.get("phone")
                or start_data.get("phone")
                or start_data.get("from")       # Elision uses "from" for caller number
                or start_msg.get("callerNumber")
                or start_data.get("callerNumber")
            )
        
        session.call_start_time = datetime.now()

        # Extract phone number from URL query params if not found
        from urllib.parse import parse_qs, urlparse
        parsed = urlparse(path)
        qs = parse_qs(parsed.query)
        if not session.phone_number:
            session.phone_number = qs.get("phone", [None])[0]
        
        if cfg.DEBUG:
            print(f"[{session.ucid}] 📱 Extracted phone: {session.phone_number}")
            print(f"[{session.ucid}] 🎬 Start processing, buffered {len(buffered_media)} media packets")

        # Wait for Gemini connection (started earlier for speed)
        await gemini_connect_task
        connect_elapsed = time.time() - connect_start
        if cfg.DEBUG:
            print(f"[{session.ucid}] ✅ Connected to VoiceAgent AI ({connect_elapsed:.1f}s)")

        # Start reader task
        gemini_task = asyncio.create_task(_gemini_reader(session, audio_processor, cfg))
        
        # Start end-call monitor task (runs independently to ensure call closes)
        end_monitor_task = asyncio.create_task(_end_call_monitor(session, cfg))
        
        # Process any buffered media that arrived before start
        for buffered_msg in buffered_media:
            await _process_media_message(session, buffered_msg, audio_processor, cfg)

        # Process remaining messages
        async for raw in client_ws:
            # Debug: log raw message type
            if cfg.DEBUG and cfg.LOG_MEDIA:
                if isinstance(raw, bytes):
                    print(f"[{session.ucid}] 📨 Received binary data: {len(raw)} bytes")
                else:
                    preview = raw[:200] if len(raw) > 200 else raw
                    print(f"[{session.ucid}] 📨 Received: {preview}")

            try:
                msg = json.loads(raw) if isinstance(raw, str) else None
            except json.JSONDecodeError:
                msg = None

            # Handle binary audio data directly (Elision may send raw PCM)
            if isinstance(raw, bytes):
                # Assume 8kHz 16-bit PCM from Elision
                samples = list(struct.unpack(f'<{len(raw)//2}h', raw))
                session.input_buffer.extend(samples)
                
                chunks_sent = 0
                while len(session.input_buffer) >= cfg.AUDIO_BUFFER_SAMPLES_INPUT:
                    chunk = session.input_buffer[: cfg.AUDIO_BUFFER_SAMPLES_INPUT]
                    session.input_buffer = session.input_buffer[cfg.AUDIO_BUFFER_SAMPLES_INPUT :]
                    
                    samples_np = audio_processor.waybeo_samples_to_np(chunk)
                    audio_b64 = audio_processor.process_input_8k_to_gemini_16k_b64(samples_np)
                    await session.gemini.send_audio_b64_pcm16(audio_b64)
                    chunks_sent += 1
                
                if cfg.DEBUG and chunks_sent > 0:
                    print(f"[{session.ucid}] 🎤 Sent {chunks_sent} binary audio chunk(s) to VoiceAgent")
                continue

            if msg is None:
                continue

            event = msg.get("event")
            if event in {"stop", "end", "close"}:
                if cfg.DEBUG:
                    print(f"[{session.ucid}] 📞 stop event received")
                break

            # Handle Elision format: {"event":"media","media":{"payload":"BASE64"}}
            if event == "media" and msg.get("media"):
                await _process_media_message(session, msg, audio_processor, cfg)

            # Handle old Waybeo format: {"event":"media","data":{"samples":[...]}}
            elif event == "media" and msg.get("data"):
                samples = msg["data"].get("samples", [])
                if not samples:
                    continue

                session.input_buffer.extend(samples)

                chunks_sent = 0
                while len(session.input_buffer) >= cfg.AUDIO_BUFFER_SAMPLES_INPUT:
                    chunk = session.input_buffer[: cfg.AUDIO_BUFFER_SAMPLES_INPUT]
                    session.input_buffer = session.input_buffer[cfg.AUDIO_BUFFER_SAMPLES_INPUT :]

                    samples_np = audio_processor.waybeo_samples_to_np(chunk)
                    audio_b64 = audio_processor.process_input_8k_to_gemini_16k_b64(samples_np)
                    await session.gemini.send_audio_b64_pcm16(audio_b64)
                    chunks_sent += 1

                if cfg.DEBUG and cfg.LOG_MEDIA and chunks_sent > 0:
                    print(f"[{session.ucid}] 🎤 Sent {chunks_sent} audio chunk(s) to VoiceAgent ({len(samples)} samples received)")

        gemini_task.cancel()
        end_monitor_task.cancel()
        try:
            await gemini_task
        except asyncio.CancelledError:
            pass
        try:
            await end_monitor_task
        except asyncio.CancelledError:
            pass

    except asyncio.TimeoutError:
        print(f"[{session.ucid}] ⏰ Timeout waiting for start event - closing connection")
        await client_ws.close(code=1008, reason="Timeout waiting for start event")
    except ConnectionClosed as cc:
        print(f"[{session.ucid}] 🔌 Connection closed: code={cc.code}, reason={cc.reason}")
    except json.JSONDecodeError as je:
        print(f"[{session.ucid}] ❌ JSON parse error: {je}")
    except Exception as e:
        print(f"[{session.ucid}] ❌ Telephony handler error: {type(e).__name__}: {e}")
    finally:
        # Save transcript before closing
        transcript_filepath = None
        if cfg.SAVE_TRANSCRIPTS and session.transcripts:
            transcript_filepath = _save_transcript(session, cfg)
        
        # Post completion webhook if enabled and we have transcripts
        if cfg.WEBHOOK_ENABLED and session.transcripts and session.phone_number:
            try:
                # Convert to analyzer format for Gemini processing
                analyzer_transcripts = [
                    AnalyzerTranscriptEntry(
                        role=t.role,
                        text=t.text,
                        timestamp=t.timestamp
                    )
                    for t in session.transcripts
                ]
                
                webhook_client = get_webhook_client()
                result = await process_and_post_completion(
                    webhook_client,
                    call_sid=session.ucid,
                    phone_number=session.phone_number,
                    transcripts=analyzer_transcripts,
                    start_time=session.call_start_time,
                    end_time=datetime.now(),
                    transcript_filepath=transcript_filepath,
                )
                
                if cfg.DEBUG:
                    outcome = result.get("outcome")
                    if outcome:
                        print(f"[{session.ucid}] 📊 VoiceAgent Analysis:")
                        print(f"         outcome={outcome.outcome}, date={outcome.callback_date}, time={outcome.callback_time}")
                        print(f"         sentiment={outcome.sentiment}, cooperation={outcome.cooperation_level}")
                        if outcome.candidate_concerns:
                            print(f"         concerns={outcome.candidate_concerns}")
                    # Print counsellor brief
                    brief = result.get("counsellor_brief")
                    if brief:
                        print(f"[{session.ucid}] 📋 Counsellor Brief:\n{brief}")
            except Exception as e:
                print(f"[{session.ucid}] ⚠️ Webhook error: {e}")
        elif cfg.WEBHOOK_ENABLED and not session.phone_number:
            if cfg.DEBUG:
                print(f"[{session.ucid}] ⚠️ No phone number, skipping webhook")
        
        try:
            await session.gemini.close()
        except Exception:
            pass
        
        if cfg.DEBUG:
            print(f"[{session.ucid}] 📞 Call ended. Transcripts collected: {len(session.transcripts)}")


async def main() -> None:
    cfg = Config()
    Config.validate(cfg)
    cfg.print_config()

    # websockets.serve passes (websocket, path) for the legacy API; handler accepts both.
    async with websockets.serve(handle_client, cfg.HOST, cfg.PORT):
        print(f"✅ Telephony WS listening on ws://{cfg.HOST}:{cfg.PORT}{cfg.WS_PATH}")
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Telephony service stopped")


