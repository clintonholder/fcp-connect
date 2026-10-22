"""Run:  cd factory && python -m unittest test_serve -v"""
import json
import tempfile
import unittest
from pathlib import Path

from serve import origin_allowed, validate_models, write_models

OK = {"model": "opus", "effort": "high"}


class ValidateModels(unittest.TestCase):
    def test_valid_full_map(self):
        data = {a: dict(OK) for a in (
            "spec-writer", "builder", "reviewer-security", "reviewer-ux",
            "reviewer-ui", "reviewer-code", "approver")}
        self.assertEqual(validate_models(data), data)

    def test_empty_map(self):
        self.assertEqual(validate_models({}), {})

    def test_all_models_and_efforts(self):
        for m in ("haiku", "sonnet", "opus", "fable"):
            for e in ("low", "medium", "high", "xhigh", "max"):
                validate_models({"builder": {"model": m, "effort": e}})

    def test_unknown_agent(self):
        with self.assertRaises(ValueError):
            validate_models({"hacker": OK})

    def test_unknown_model(self):
        with self.assertRaises(ValueError):
            validate_models({"builder": {"model": "gpt", "effort": "low"}})

    def test_unknown_effort(self):
        with self.assertRaises(ValueError):
            validate_models({"builder": {"model": "opus", "effort": "ultra"}})

    def test_uppercase_rejected(self):
        with self.assertRaises(ValueError):
            validate_models({"builder": {"model": "Opus", "effort": "low"}})

    def test_extra_key(self):
        with self.assertRaises(ValueError):
            validate_models({"builder": {**OK, "extra": 1}})

    def test_missing_key(self):
        with self.assertRaises(ValueError):
            validate_models({"builder": {"model": "opus"}})

    def test_non_object_body(self):
        for body in ([], "x", 1, None):
            with self.assertRaises(ValueError):
                validate_models(body)

    def test_non_object_value(self):
        for value in ("opus", None, [OK], 3):
            with self.assertRaises(ValueError):
                validate_models({"builder": value})

    def test_non_string_values(self):
        with self.assertRaises(ValueError):
            validate_models({"builder": {"model": ["opus"], "effort": "low"}})


class OriginAllowed(unittest.TestCase):
    def test_accepted(self):
        self.assertTrue(origin_allowed("http://localhost:8730", 8730))
        self.assertTrue(origin_allowed("http://127.0.0.1:8730", 8730))

    def test_rejected(self):
        for origin in (
            None, "", "http://localhost:8731", "http://localhost", "https://localhost:8730",
            "http://evil.example:8730", "http://localhost.evil.com:8730",
            "http://evil.com/http://localhost:8730", "http://localhost:8730.evil.com",
            "http://127.0.0.1.evil.com:8730", "null",
        ):
            self.assertFalse(origin_allowed(origin, 8730), origin)


class WriteModels(unittest.TestCase):
    def test_atomic_write_replaces_file_and_leaves_no_temp(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_models({"builder": OK}, tmp)
            write_models({}, tmp)
            self.assertEqual(json.loads((Path(tmp) / "models.json").read_text()), {})
            self.assertEqual([p.name for p in Path(tmp).iterdir()], ["models.json"])


if __name__ == "__main__":
    unittest.main()
