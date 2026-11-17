from hermes_mobile.core import normalize_models


def test_normalize_models_keeps_configured_rows_and_ids():
    out = normalize_models({"model": "claude-fable-5", "provider": "anthropic", "providers": [
        {"slug": "anthropic", "name": "Anthropic", "models": ["claude-fable-5", {"id": "claude-opus-5-5"}, "claude-fable-5"]},
        {"slug": "empty", "name": "Empty", "models": []},
        "junk"]})
    assert out["current"] == {"model": "claude-fable-5", "provider": "anthropic"}
    assert out["providers"] == [{"slug": "anthropic", "name": "Anthropic", "models": ["claude-fable-5", "claude-opus-5-5"]}]
