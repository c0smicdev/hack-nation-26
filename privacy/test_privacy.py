import base64
import io
import os
import time

import pytest
import pytesseract
from PIL import Image, ImageDraw, ImageFont
from PIL.PngImagePlugin import PngInfo
from fastapi.testclient import TestClient

from engine import POLICY_VERSION, PrivacyBlocked, PrivacyEngine

os.environ.setdefault("SOCRATES_PRIVACY_TOKEN", "synthetic-test-service-token-not-a-real-secret")
os.environ.setdefault("SOCRATES_PRIVACY_ALIAS_KEY", "synthetic-test-alias-key-not-a-real-secret")


@pytest.fixture(scope="session")
def engine():
    return PrivacyEngine(os.environ["SOCRATES_PRIVACY_ALIAS_KEY"])


def invoice(language="en", font_size=28):
    image = Image.new("RGB", (1400, 850), "white")
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size)
    rows = [
        "Supplier: Nordstern Devices" if language == "en" else "Lieferant: Nordstern Maschinen",
        "Contact: Claudia Winter" if language == "en" else "Kontakt: Erika Mustermann",
        "Email: privacy.canary@example.test",
        "IBAN: DE89 3704 0044 0532 0130 00",
        "Amount: EUR 7200.00",
        "Cost center: 0400",
        "Approval limit: EUR 5000",
        "Month: December",
        "Subsidiary: Czech subsidiary",
    ]
    draw = ImageDraw.Draw(image)
    for i, text in enumerate(rows):
        draw.text((36, 24 + i * 80), text, fill="black", font=font)
    output = io.BytesIO()
    image.save(output, "PNG")
    return image, base64.b64encode(output.getvalue()).decode(), rows


@pytest.mark.parametrize("language", ["en", "de"])
@pytest.mark.parametrize("font_size", [18, 28])
def test_actual_ocr_masks_pixels_and_preserves_decisions(engine, language, font_size):
    original, encoded, _rows = invoice(language, font_size)
    before = pytesseract.image_to_string(original, lang="deu+eng")
    assert "privacy.canary@example.test" in before
    started = time.monotonic()
    result = engine.image(encoded, "image/png", [])
    duration = time.monotonic() - started
    redacted = Image.open(io.BytesIO(base64.b64decode(result["image"])))
    after = pytesseract.image_to_string(redacted, lang="deu+eng")
    assert "privacy.canary" not in after
    assert "3704" not in after
    assert "Claudia" not in after and "Mustermann" not in after
    assert "Nordstern" not in after
    assert "7200" in after and "5000" in after and "0400" in after
    assert "December" in after and "Czech" in after
    assert result["policyVersion"] == POLICY_VERSION
    assert result["redactions"]
    for r in result["redactions"]:
        x = min(redacted.width - 1, int((r["x"] + r["width"] / 2) * redacted.width))
        y = min(redacted.height - 1, int((r["y"] + r["height"] / 2) * redacted.height))
        assert redacted.getpixel((x, y)) == (0, 0, 0)
    print(f"{language} font={font_size}: OCR/redaction {duration:.2f}s, {len(result['redactions'])} masks")


def test_text_entities_and_stable_business_aliases(engine):
    text = "Supplier: Nordstern Devices\nContact: Claudia Winter\nEmail: privacy.canary@example.test\nIBAN: DE89 3704 0044 0532 0130 00\nAmount: EUR 7200.00\nCost center: 0400\nLimit: EUR 5000\nDecember, Czech subsidiary\napi_key: sk-ant-synthetic-test-secret123456"
    first = engine.text(text)
    second = engine.text(text)
    assert first["text"] == second["text"]
    for sensitive in ["Nordstern", "Claudia", "privacy.canary", "3704", "synthetic-test-secret"]:
        assert sensitive not in first["text"]
    for decision in ["7200", "0400", "5000", "December", "Czech"]:
        assert decision in first["text"]
    assert engine.text(first["text"])["text"] == first["text"]


def test_context_exceptions_do_not_allow_person_names(engine):
    result = engine.text("Contact: June Winter\nMonth: December\nCzech subsidiary")
    assert "June Winter" not in result["text"]
    assert "December" in result["text"] and "Czech" in result["text"]


def test_manual_mask_and_metadata_stripping(engine):
    image = Image.new("RGB", (200, 100), "white")
    metadata = PngInfo()
    metadata.add_text("secret", "synthetic-metadata-canary")
    encoded = io.BytesIO()
    image.save(encoded, "PNG", pnginfo=metadata)
    result = engine.image(base64.b64encode(encoded.getvalue()).decode(), "image/png", [{"x": 0, "y": 0, "width": .2, "height": .2}])
    clean = Image.open(io.BytesIO(base64.b64decode(result["image"])))
    assert clean.getpixel((10, 10)) == (0, 0, 0)
    assert not clean.info


def test_invalid_images_fail_closed(engine):
    with pytest.raises(PrivacyBlocked):
        engine.image(base64.b64encode(b"not an image").decode(), "image/png", [])


def test_http_auth_and_validation_do_not_echo_inputs():
    from app import app
    with TestClient(app) as client:
        response = client.get("/ready")
        assert response.status_code == 200 and response.json() == {"ready": True}
        assert client.get("/health").status_code == 401
        assert client.post("/redact/text", json={"texts": ["canary@example.test"]}).status_code == 401
        headers = {"Authorization": "Bearer " + os.environ["SOCRATES_PRIVACY_TOKEN"]}
        assert client.get("/health", headers=headers).json()["ready"]
        response = client.post("/redact/text", headers=headers, json={"texts": ["canary@example.test"], "secret": "do-not-echo-this"})
        assert response.status_code == 400
        assert "do-not-echo-this" not in response.text
        response = client.post("/redact/text", headers=headers, json={"texts": ["canary@example.test"]})
        assert "canary@example.test" not in response.text
