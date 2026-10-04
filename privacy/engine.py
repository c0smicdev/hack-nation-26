"""Local DE/EN detection. No provider calls, raw persistence or match logging."""

import base64
import hashlib
import hmac
import io
import json
import os
import re
import unicodedata

from PIL import Image, ImageDraw, ImageStat
from presidio_analyzer import AnalyzerEngine, RecognizerResult
from presidio_analyzer.nlp_engine import NlpEngineProvider
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig
from presidio_image_redactor import ImageAnalyzerEngine, ImageRedactorEngine, TesseractOCR

POLICY_VERSION = "socrates-pii-v1"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 8_500_000
ENTITIES = ["PERSON", "PHONE_NUMBER", "IBAN_CODE", "CREDIT_CARD", "IP_ADDRESS"]
ALIAS = re.compile(r"\[(?:PERSON|EMAIL_ADDRESS|PHONE_NUMBER|IBAN_CODE|CREDIT_CARD|IP_ADDRESS|ADDRESS|BUSINESS|SECRET)(?::[a-f0-9]{16})?\]")
FIELD_RULES = [
    # Includes reserved/sandbox domains; no public suffix downloads during detection.
    ("EMAIL_ADDRESS", re.compile(r"(?P<value>[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})")),
    ("SECRET", re.compile(r"(?i)\b(?:password|passwort|api[_ -]?key|access[_ -]?token|secret)\s*[:=]\s*[\"']?(?P<value>[^\s\"',;]+)")),
    ("SECRET", re.compile(r"\b(?P<value>(?:sk-ant-|sk_live_|ghp_|github_pat_)[A-Za-z0-9_-]{12,})\b")),
    ("PERSON", re.compile(r"(?m)\b(?i:contact|kontakt|customer name|kundenname|employee|mitarbeiter)\s*:\s*(?P<value>[A-Z\u00c4\u00d6\u00dc][a-z\u00e4\u00f6\u00fc\u00df]+(?: [A-Z\u00c4\u00d6\u00dc][a-z\u00e4\u00f6\u00fc\u00df]+){0,3})")),
    ("ADDRESS", re.compile(r"(?im)\b(?:address|anschrift|adresse)\s*:\s*(?P<value>[^\n;]{5,120}?)(?=\s+(?:Amount|Betrag|Category|Kategorie|Invoice|Rechnung|Contact|Kontakt|Email|IBAN|Account|Konto)\b|\n|;|$)")),
    ("BUSINESS", re.compile(r"(?im)\b(?:supplier|lieferant|customer|kunde)\s*:\s*(?P<value>[^\n,;]{3,100}?)(?=\s+(?:Amount|Betrag|Category|Kategorie|Invoice|Rechnung|Contact|Kontakt|Email|IBAN|Account|Konto|Cost center|Kostenstelle)\b|\n|[,;]|$)")),
]
MONTHS = r"January|February|March|April|May|June|July|August|September|October|November|December|Januar|Februar|Maerz|M\u00e4rz|Mai|Juni|Juli|Oktober|Dezember"
FIELD_LABEL = re.compile(r"(?i)\b(?:supplier|lieferant|customer|kunde|contact|kontakt|customer name|kundenname|employee|mitarbeiter|email|iban|address|anschrift|adresse|amount|betrag|cost center|kostenstelle|approval limit|limit|month|monat|subsidiary|tochtergesellschaft)\s*:")
BUSINESS_CONTEXT = [
    re.compile(rf"(?i)\b(?:month|monat)\s*:\s*(?P<value>{MONTHS})\b"),
    re.compile(rf"(?im)^\s*(?P<value>{MONTHS})(?=\s*[,.;]|\s+\d)"),
    re.compile(r"(?i)\b(?P<value>Czech|German|French|Austrian|Swiss|Polish|Dutch|Belgian|Italian|Spanish|British|tschechische[nrms]?|deutsche[nrms]?)\s+(?:subsidiary|branch|Tochtergesellschaft|Niederlassung)\b"),
]


class PrivacyBlocked(Exception):
    def __init__(self, code: str):
        self.code = code


class CheckedOCR(TesseractOCR):
    def perform_ocr(self, image, **kwargs):
        allow_empty = kwargs.pop("allow_empty", False)
        data = super().perform_ocr(image, **kwargs)
        words = [(word, float(conf)) for word, conf in zip(data["text"], data["conf"]) if word.strip()]
        relevant = [conf for word, conf in words if len(word) >= 3]
        if not words:
            if not allow_empty and max(ImageStat.Stat(image.convert("L")).stddev) > 5:
                raise PrivacyBlocked("ocr_unreadable")
        elif relevant and (sum(relevant) / len(relevant) < 50 or sum(c < 30 for c in relevant) / len(relevant) > 0.3):
            raise PrivacyBlocked("ocr_unreadable")
        return data


class PrivacyEngine:
    def __init__(self, alias_key: str):
        if len(alias_key) < 32:
            raise ValueError("A strong alias key is required")
        self.alias_key = alias_key.encode()
        nlp = NlpEngineProvider(nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [
                {"lang_code": "en", "model_name": "en_core_web_sm"},
                {"lang_code": "de", "model_name": "de_core_news_sm"},
            ],
        }).create_engine()
        self.analyzer = AnalyzerEngine(nlp_engine=nlp, supported_languages=["en", "de"])
        self.anonymizer = AnonymizerEngine()
        self.known_values = json.loads(os.environ.get("SOCRATES_PRIVACY_KNOWN_VALUES", "[]"))
        # ImageAnalyzer invokes this facade once; detection covers both languages.
        self.image_redactor = ImageRedactorEngine(ImageAnalyzerEngine(analyzer_engine=self, ocr=CheckedOCR()))

    def alias(self, kind: str, value: str) -> str:
        if kind == "SECRET":
            return "[SECRET]"
        normalized = unicodedata.normalize("NFKC", value).casefold().strip()
        digest = hmac.new(self.alias_key, f"{POLICY_VERSION}:{kind}:{normalized}".encode(), hashlib.sha256).hexdigest()[:16]
        return f"[{kind}:{digest}]"

    def analyze(self, text: str, **_kwargs):
        if not text:
            return []
        protected = [m.span() for m in ALIAS.finditer(text)]
        # OCR flattens field labels into a sentence. Cross-language NER can mistake
        # those labels and explicit month/country qualifiers for people's names.
        neutral = [m.span() for m in FIELD_LABEL.finditer(text)]
        neutral.extend(m.span("value") for pattern in BUSINESS_CONTEXT for m in pattern.finditer(text))
        results = []
        for language in ("en", "de"):
            results.extend(self.analyzer.analyze(text=text, language=language, entities=ENTITIES, score_threshold=0.5))
        for kind, pattern in FIELD_RULES:
            for match in pattern.finditer(text):
                start, end = match.span("value")
                results.append(RecognizerResult(kind, start, end, 1.0))
        for value in self.known_values:
            if isinstance(value, str) and len(value) >= 3:
                for match in re.finditer(re.escape(value), text, re.IGNORECASE):
                    results.append(RecognizerResult("BUSINESS", match.start(), match.end(), 1.0))
        trimmed = []
        for result in results:
            fragments = [(result.start, result.end)]
            if result.entity_type == "PERSON":
                for left, right in neutral:
                    remaining = []
                    for start, end in fragments:
                        if left >= end or right <= start:
                            remaining.append((start, end))
                        else:
                            if start < left:
                                remaining.append((start, left))
                            if right < end:
                                remaining.append((right, end))
                    fragments = remaining
            for start, end in fragments:
                while start < end and text[start].isspace():
                    start += 1
                while end > start and text[end - 1].isspace():
                    end -= 1
                if start < end:
                    trimmed.append(RecognizerResult(result.entity_type, start, end, result.score))
        # Resolve bilingual/regex overlaps before passing spans to the image mapper.
        selected = []
        for result in sorted(trimmed, key=lambda r: (-r.score, -(r.end - r.start), r.start)):
            if result.entity_type == "PHONE_NUMBER" and len(re.sub(r"\D", "", text[result.start:result.end])) < 8:
                continue
            if any(result.start < end and result.end > start for start, end in protected):
                continue
            if any(result.start < r.end and result.end > r.start for r in selected):
                continue
            selected.append(result)
        return sorted(selected, key=lambda r: r.start)

    def text(self, value: str):
        results = self.analyze(value)
        operators = {kind: OperatorConfig("custom", {"lambda": lambda v, k=kind: self.alias(k, v)}) for kind in {r.entity_type for r in results}}
        redacted = self.anonymizer.anonymize(text=value, analyzer_results=results, operators=operators).text if results else value
        return {"text": redacted, "policyVersion": POLICY_VERSION, "redactedCount": len(results) + len(ALIAS.findall(value))}

    def image(self, encoded: str, mime: str, masks: list[dict]):
        try:
            raw = base64.b64decode(encoded, validate=True)
            if len(raw) > MAX_IMAGE_BYTES:
                raise PrivacyBlocked("image_too_large")
            with Image.open(io.BytesIO(raw)) as source:
                if source.format not in ("PNG", "JPEG") or Image.MIME[source.format] != mime:
                    raise PrivacyBlocked("invalid_image")
                if source.width * source.height > MAX_PIXELS or source.width < 1 or source.height < 1:
                    raise PrivacyBlocked("image_too_large")
                source.load()
                image = source.convert("RGB")
        except PrivacyBlocked:
            raise
        except Exception:
            raise PrivacyBlocked("invalid_image") from None
        width, height = image.size
        allow_empty = max(ImageStat.Stat(image.convert("L")).stddev) <= 5
        draw = ImageDraw.Draw(image)
        rects = []
        for mask in masks:
            box = (int(mask["x"] * width), int(mask["y"] * height), min(width, int((mask["x"] + mask["width"]) * width + 1)), min(height, int((mask["y"] + mask["height"]) * height + 1)))
            draw.rectangle(box, fill=(0, 0, 0))
            rects.append(mask)
        redacted, boxes = self.image_redactor.redact_and_return_bbox(image, fill=(0, 0, 0), ocr_kwargs={"lang": "deu+eng", "timeout": 8, "allow_empty": allow_empty}, language="en")
        draw = ImageDraw.Draw(redacted)
        for box in boxes:
            left, top = max(0, box.left - 3), max(0, box.top - 3)
            right, bottom = min(width, box.left + box.width + 3), min(height, box.top + box.height + 3)
            draw.rectangle((left, top, right, bottom), fill=(0, 0, 0))
            rects.append({"x": left / width, "y": top / height, "width": (right - left) / width, "height": (bottom - top) / height})
        # Fresh RGB image strips source metadata; PNG keeps masks fully opaque.
        clean = Image.new("RGB", redacted.size)
        clean.paste(redacted)
        output = io.BytesIO()
        clean.save(output, format="PNG")
        return {"image": base64.b64encode(output.getvalue()).decode(), "mime": "image/png", "width": width, "height": height, "redactions": rects, "policyVersion": POLICY_VERSION, "redactedCount": len(rects)}
