from http import HTTPStatus
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import json
import logging
import os
import shutil
from typing import Callable
from urllib.parse import urlparse, ParseResult
# from websocket_server import WebsocketServer

from encode import encodeJSON

SrcDir = os.path.join("site", "src")

PathFileMap = {
    "/": ("text/html", os.path.join(SrcDir, "html", "index.html")),
    "/favicon.png": ("image/png", os.path.join(SrcDir, "img", "favicon.png")),
    "/app.css": ("text/css", os.path.join("site", "dist", "app.css")),
    "/app.js": ("text/javascript", os.path.join("site", "dist", "app.js")),
}

class ApplicationRequestHandler(BaseHTTPRequestHandler):
    def __init__(self, req, addr, server):
        self.server = server
        super().__init__(req, addr, server)

    def setHeaders(self, code: int, headers: dict[str, str]):
        self.send_response(code)
        for k, v in headers.items():
            self.set_header(k, v)
        self.end_headers()

    def setSuccessHeaders(self, mimeType: str):
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-type", mimeType)
        self.end_headers()

    def sendJSON(self, d: any):
        self.setSuccessHeaders("application/json")
        self.wfile.write(encodeJSON(d).encode("utf-8"))

    def do_GET(self):
        url = urlparse(self.path)
        
        entry = PathFileMap.get(url.path)
        if entry:
            mimeType, path = entry
            self.setSuccessHeaders(mimeType)
            with open(path, 'rb') as f:
                shutil.copyfileobj(f, self.wfile)
            return

        handler: Callable[[ParseResult, any], None] = {
            # Define GET endpoints here. These methods will get a single
            # url: ParseResult argument.
            # "/user": self.handleUser,
        }.get(url.path)

        if handler:
            handler(url)
            return

        # You can add files to site/src/{img,audio} directories. Check that the
        # mimetype is listed below or add it.
        pathParts = str(url.path).strip("/").split("/")
        if len(pathParts) != 2:
            self.setHeaders(HTTPStatus.NOT_FOUND, {})
            return

        root, fileName = pathParts

        if root not in ["audio", "img"]:
            self.setHeaders(HTTPStatus.NOT_FOUND, {})
            return

        fileName, fileExtension = os.path.splitext(fileName)
        mimeType = {
            ".mp3": "audio/mpeg",
            ".wav": "audio/vnd.wav",
            ".png": "image/png",
        }.get(fileExtension)

        if not mimeType:
            self.setHeaders(HTTPStatus.NOT_FOUND, {})
            return

        fullPath = SrcDir + url.path
        if not pathIsParent(SrcDir, fullPath):
            print("FILE REQUESTED FROM WRONG DIRECTORY?", url.path, "->", fullPath)
            self.setHeaders(HTTPStatus.NOT_FOUND, {})
            return

        if not os.path.exists(fullPath):
            print("FILE DOESN'T EXIST", url.path, "->", fullPath)
            self.setHeaders(HTTPStatus.NOT_FOUND, {})
            return

        if not os.path.isfile(fullPath):
            print("FILE ISN'T FILE", url.path, "->", fullPath)
            self.setHeaders(HTTPStatus.NOT_FOUND, {})
            return

        self.setSuccessHeaders(mimeType)
        with open(fullPath, 'rb') as f:
            shutil.copyfileobj(f, self.wfile)


    def do_POST(self):
        url = urlparse(self.path)
        req = json.loads(self.rfile.read(int(self.headers['Content-Length'])))

        handler: Callable[[ParseResult, any], None] = {
            # Define POST handlers here. These methods will get two arguments, 
            # (url: ParseResult, req: any), where the req is some JSON-encodable
            # type.
            # "/info": self.handleInfo,
        }.get(url.path)
        
        if not handler:
            self.setHeaders(HTTPStatus.NOT_FOUND, {})
            return

        handler(url, req)

    def handleInfo(self, url: ParseResult, req: any):
        self.sendJSON(True)

    def handleUser(self, url: ParseResult):
        self.sendJSON(True)

    
def pathIsParent(parentPath: str, childPath: str):
    # Smooth out relative path names, note: if you are concerned about symbolic links, you should use os.path.realpath too
    parentPath = os.path.abspath(parentPath)
    childPath = os.path.abspath(childPath)

    # Compare the common path of the parent and child path with the common path of just the parent path. Using the commonpath method on just the parent path will regularise the path name in the same way as the comparison that deals with both paths, removing any trailing path separator
    return os.path.commonpath([parentPath]) == os.path.commonpath([parentPath, childPath])

if __name__ == "__main__":
    Port = 30198
    serverAddress = ('', Port)

    logging.basicConfig(level=logging.NOTSET, format="[%(asctime)s][%(name)s][%(levelname)s]: %(message)s")
    log = logging.getLogger("UNI")
    log.setLevel(logging.NOTSET)
    log.info(f"Starting server at http://localhost:{Port}")



    httpd = ThreadingHTTPServer(serverAddress, ApplicationRequestHandler)
    httpd.serve_forever()