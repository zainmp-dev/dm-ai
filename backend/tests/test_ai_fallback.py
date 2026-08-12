from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.blog_prompts import metadata_requirements
from services.ai.errors import ErrorType, classify_provider_error, public_failure_payload, ProviderOutcome
from services.ai.gemini_config import DEFAULT_GEMINI_MODEL, resolve_gemini_model
from services.ai.response_parse import extract_chat_completion_text, extract_gemini_text
from services.ai.ai_service import AIService, AIServiceError, AIResult, _ProviderAttempt


GROQ_TPD_BODY = json.dumps(
    {
        "error": {
            "message": "Rate limit reached for model llama-3.3-70b-versatile in organization org_x. Limit 100000, Used 97580, Requested 6731. Please try again in 1h2m. Need more tokens? Visit https://groq.com to upgrade. TPD (tokens per day)",
            "type": "tokens",
            "code": "rate_limit_exceeded",
        }
    }
)

OPENROUTER_402_BODY = json.dumps(
    {
        "error": {
            "message": "This request requires more credits, or fewer max_tokens. You requested up to 4096 tokens, but can only afford 124.",
            "code": 402,
        }
    }
)

GEMINI_404_BODY = json.dumps(
    {
        "error": {
            "message": "models/gemini-2.0-flash is not found for API version v1beta, or is not supported for generateContent. Call ListModels to see the list of available models and their supported methods.",
            "status": "NOT_FOUND",
        }
    }
)


class ClassifyErrorTests(unittest.TestCase):
    def test_groq_429_tpd_is_quota_not_retryable(self) -> None:
        classified = classify_provider_error(provider="groq", status_code=429, body=GROQ_TPD_BODY, model="llama-3.3-70b-versatile")
        self.assertEqual(classified.error_type, ErrorType.QUOTA_EXCEEDED)
        self.assertFalse(classified.retryable)

    def test_openrouter_402_is_insufficient_credits(self) -> None:
        classified = classify_provider_error(provider="openrouter_paid", status_code=402, body=OPENROUTER_402_BODY)
        self.assertEqual(classified.error_type, ErrorType.INSUFFICIENT_CREDITS)
        self.assertFalse(classified.retryable)

    def test_gemini_404_deprecated_model(self) -> None:
        classified = classify_provider_error(provider="gemini", status_code=404, body=GEMINI_404_BODY, model="gemini-2.0-flash")
        self.assertEqual(classified.error_type, ErrorType.MODEL_NOT_FOUND)
        self.assertFalse(classified.retryable)

    def test_rpm_429_is_retryable_rate_limit(self) -> None:
        body = json.dumps({"error": {"message": "Rate limit reached for model llama-3.3-70b-versatile. Limit 30 RPM. Please try again in 2s."}})
        classified = classify_provider_error(provider="groq", status_code=429, body=body)
        self.assertEqual(classified.error_type, ErrorType.RATE_LIMIT)
        self.assertTrue(classified.retryable)

    def test_timeout_is_retryable(self) -> None:
        classified = classify_provider_error(provider="groq", status_code=408, message="timed out")
        self.assertEqual(classified.error_type, ErrorType.TIMEOUT)
        self.assertTrue(classified.retryable)

    def test_5xx_is_retryable(self) -> None:
        classified = classify_provider_error(provider="openrouter_paid", status_code=502, body="bad gateway")
        self.assertEqual(classified.error_type, ErrorType.PROVIDER_ERROR)
        self.assertTrue(classified.retryable)


class ResponseParseTests(unittest.TestCase):
    def test_openai_string_content(self) -> None:
        data = {"choices": [{"message": {"content": '{"title":"Payroll"}'}}]}
        self.assertIn("Payroll", extract_chat_completion_text(data))

    def test_openai_content_array(self) -> None:
        data = {"choices": [{"message": {"content": [{"type": "text", "text": '{"title":"HR Compliance"}'}]}}]}
        self.assertIn("HR Compliance", extract_chat_completion_text(data))

    def test_embedded_error_object(self) -> None:
        with self.assertRaises(ValueError):
            extract_chat_completion_text({"error": {"message": "nope"}})

    def test_malformed_missing_choices(self) -> None:
        with self.assertRaises(ValueError):
            extract_chat_completion_text({"id": "x"})

    def test_openrouter_output_text_fallback(self) -> None:
        data = {"choices": [{"message": {"content": None}}], "output_text": '{"title":"Payroll & Salary"}'}
        self.assertIn("Payroll & Salary", extract_chat_completion_text(data))

    def test_gemini_parts(self) -> None:
        data = {"candidates": [{"content": {"parts": [{"text": "hello"}]}}]}
        self.assertEqual(extract_gemini_text(data), "hello")


class GeminiConfigTests(unittest.TestCase):
    def test_deprecated_2_0_is_remapped(self) -> None:
        self.assertEqual(resolve_gemini_model("gemini-2.0-flash"), DEFAULT_GEMINI_MODEL)
        self.assertEqual(resolve_gemini_model("models/gemini-2.0-flash"), DEFAULT_GEMINI_MODEL)

    def test_explicit_supported_model_is_kept(self) -> None:
        self.assertEqual(resolve_gemini_model("gemini-3.5-flash"), "gemini-3.5-flash")
        self.assertEqual(resolve_gemini_model("gemini-2.5-flash"), "gemini-2.5-flash")


class SequentialFallbackTests(unittest.TestCase):
    def setUp(self) -> None:
        self.svc = AIService()
        self.svc.retry_count = 0

    def test_skip_non_retryable_and_use_next_provider(self) -> None:
        calls: list[str] = []

        def groq_fail() -> AIResult:
            calls.append("groq")
            raise AIServiceError(
                "TPD",
                429,
                error_type=ErrorType.QUOTA_EXCEEDED,
                retryable=False,
                provider="groq",
                model="llama-3.3-70b-versatile",
            )

        def gemini_ok() -> AIResult:
            calls.append("gemini")
            return AIResult(text='{"title":"Indian Payroll Compliance","category":"HR Compliance"}', model_used="google/gemini-2.5-flash", latency_ms=1, usage={}, retries=0)

        attempts = [
            _ProviderAttempt("groq", "groq/llama", groq_fail),
            _ProviderAttempt("gemini", "google/gemini-2.5-flash", gemini_ok),
        ]
        result = self.svc._sequential_fallback(attempts=attempts, routed_task="content", response_format={"type": "json_object"})
        self.assertEqual(calls, ["groq", "gemini"])
        self.assertIn("HR Compliance", result.text)

    def test_openrouter_402_continues_to_next(self) -> None:
        def paid_fail() -> AIResult:
            raise AIServiceError("402", 402, error_type=ErrorType.INSUFFICIENT_CREDITS, retryable=False, provider="openrouter_paid")

        def free_ok() -> AIResult:
            return AIResult(text="Payroll & Salary article", model_used="free-model", latency_ms=1, usage={}, retries=0)

        result = self.svc._sequential_fallback(
            attempts=[
                _ProviderAttempt("openrouter_paid", "openai/gpt-5-mini", paid_fail),
                _ProviderAttempt("openrouter_free:x", "free-model", free_ok),
            ],
            routed_task="content",
            response_format=None,
        )
        self.assertEqual(result.text, "Payroll & Salary article")

    def test_all_providers_fail_clean_payload(self) -> None:
        def fail(provider: str, code: int, err: ErrorType) -> AIResult:
            raise AIServiceError(provider, code, error_type=err, retryable=False, provider=provider)

        with self.assertRaises(AIServiceError) as ctx:
            self.svc._sequential_fallback(
                attempts=[
                    _ProviderAttempt("groq", "g", lambda: fail("groq", 429, ErrorType.QUOTA_EXCEEDED)),
                    _ProviderAttempt("openrouter_paid", "o", lambda: fail("openrouter_paid", 402, ErrorType.INSUFFICIENT_CREDITS)),
                    _ProviderAttempt("gemini", "m", lambda: fail("gemini", 404, ErrorType.MODEL_NOT_FOUND)),
                ],
                routed_task="content",
                response_format=None,
            )
        exc = ctx.exception
        self.assertEqual(exc.status_code, 503)
        self.assertIsNotNone(exc.public_payload)
        assert exc.public_payload is not None
        self.assertEqual(exc.public_payload["message"], "AI generation is temporarily unavailable.")
        names = {row["name"] for row in exc.public_payload["providers"]}
        self.assertIn("Groq", names)
        self.assertIn("OpenRouter", names)
        self.assertIn("Gemini", names)
        joined = json.dumps(exc.public_payload)
        self.assertNotIn("All parallel AI providers failed", joined)

    def test_same_prompt_used_on_fallback(self) -> None:
        seen: list[str] = []
        prompt = "CATEGORY=Payroll & Salary TITLE=CTC Guide MODE=title"

        def groq() -> AIResult:
            seen.append("groq:" + prompt)
            raise AIServiceError("429 TPD", 429, error_type=ErrorType.QUOTA_EXCEEDED, retryable=False, provider="groq")

        def gemini() -> AIResult:
            seen.append("gemini:" + prompt)
            return AIResult(text=prompt, model_used="gemini", latency_ms=1, usage={}, retries=0)

        svc_prompt = prompt
        attempts = [
            _ProviderAttempt("groq", "g", groq),
            _ProviderAttempt("gemini", "m", gemini),
        ]
        result = self.svc._sequential_fallback(
            attempts=attempts,
            routed_task="content",
            response_format=None,
            context={"category": "Payroll & Salary", "title": "CTC Guide", "mode": "title"},
        )
        self.assertEqual(result.text, svc_prompt)
        self.assertEqual(seen[0].split(":", 1)[1], seen[1].split(":", 1)[1])

    def test_invalid_payload_does_not_retry_same_provider(self) -> None:
        calls = {"n": 0}

        def bad() -> AIResult:
            calls["n"] += 1
            return AIResult(text="not-json", model_used="free", latency_ms=1, usage={}, retries=0)

        def good() -> AIResult:
            return AIResult(text='{"title":"Ok"}', model_used="gemini", latency_ms=1, usage={}, retries=0)

        result = self.svc._sequential_fallback(
            attempts=[
                _ProviderAttempt("openrouter_free:x", "free", bad),
                _ProviderAttempt("gemini", "g", good),
            ],
            routed_task="content",
            response_format={"type": "json_object"},
        )
        self.assertEqual(calls["n"], 1)
        self.assertIn("Ok", result.text)

    def test_selected_category_is_pinned_in_prompt_contract(self) -> None:
        text = metadata_requirements(brand="Officekit", category_list="A, B", required_category="Payroll & Salary")
        self.assertIn("Payroll & Salary", text)
        self.assertIn("Do not substitute another category", text)
        text_hr = metadata_requirements(brand="Officekit", category_list="A, B", required_category="HR Compliance")
        self.assertIn("HR Compliance", text_hr)

    def test_public_payload_shape(self) -> None:
        payload = public_failure_payload(
            [
                ProviderOutcome("groq", "llama", status="Quota temporarily exceeded"),
                ProviderOutcome("openrouter_paid", "gpt", status="Insufficient credits"),
            ]
        )
        self.assertEqual(payload["action"], "Please try again later or contact the administrator.")


if __name__ == "__main__":
    unittest.main()
