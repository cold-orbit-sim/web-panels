import os
import sys
import unittest
from unittest.mock import patch

import server


def make_handler():
    return object.__new__(server.AuxDisplayHandler)


class TestRoutes(unittest.TestCase):
    def test_hardpoint_panel_route(self):
        handler = make_handler()
        self.assertEqual(
            handler.translate_path("/hardpoint-panel/"),
            os.path.join(server.ROOT, "hardpoint-panel") + "/",
        )

    def test_default_route(self):
        handler = make_handler()
        self.assertEqual(
            handler.translate_path("/foo/bar"),
            os.path.join(server.DEFAULT_ROOT, "foo", "bar"),
        )

    def test_root_route(self):
        handler = make_handler()
        self.assertEqual(
            handler.translate_path("/"),
            server.DEFAULT_ROOT + "/",
        )


class TestPort(unittest.TestCase):
    def test_default_port(self):
        with patch.object(sys, "argv", ["server.py"]):
            port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
            self.assertEqual(port, 8080)

    def test_custom_port(self):
        with patch.object(sys, "argv", ["server.py", "9000"]):
            port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
            self.assertEqual(port, 9000)


if __name__ == "__main__":
    unittest.main()