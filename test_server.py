import unittest
from http.server import SimpleHTTPRequestHandler
from io import BytesIO
import server

class TestServer(unittest.TestCase):

    def setUp(self):
        self.handler = SimpleHTTPRequestHandler

    def test_routes(self):
        self.assertEqual(server.route('/hardpoint-panel/'), './hardpoint-panel')
        self.assertEqual(server.route('/'), './public')
        self.assertEqual(server.route('/unknown'), './public')

    def test_port(self):
        self.assertEqual(server.get_port(['9000']), 9000)
        self.assertEqual(server.get_port([]), 8080)

if __name__ == '__main__':
    unittest.main()