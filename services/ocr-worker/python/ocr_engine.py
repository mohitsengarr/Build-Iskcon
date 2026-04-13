#!/usr/bin/env python3
"""
PaddleOCR wrapper — supports both single-image CLI and persistent HTTP server modes.

CLI mode (default):
    python3 ocr_engine.py <image_path>
    → JSON array to stdout

Server mode (avoids reloading models per page):
    python3 ocr_engine.py --serve [--port 8765]
    → HTTP POST /ocr with {"image_path": "/path/to/image.png"}
    → JSON response with OCR results

Server mode is strongly recommended — it keeps the model in memory
and avoids 10-15 second startup overhead per page.
"""

import sys
import json
import os

# Resource controls to prevent Mac crashes
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
os.environ["FLAGS_allocator_strategy"] = "naive_best_fit"
os.environ["OMP_NUM_THREADS"] = "2"  # limit CPU threads
os.environ["MKL_NUM_THREADS"] = "2"
os.environ["OPENBLAS_NUM_THREADS"] = "2"
os.environ["FLAGS_use_cuda"] = "0"  # force CPU
os.environ["CUDA_VISIBLE_DEVICES"] = ""  # no GPU


def run_ocr(ocr_engine, image_path):
    """Run OCR on a single image and return structured results."""
    if not os.path.exists(image_path):
        return {"error": f"Image not found: {image_path}"}

    result = ocr_engine.predict(image_path)
    output = []

    for page_result in result:
        rec_texts = page_result.get("rec_texts", [])
        rec_scores = page_result.get("rec_scores", [])
        rec_polys = page_result.get("rec_polys", [])
        dt_polys = page_result.get("dt_polys", [])

        polys = rec_polys if len(rec_polys) > 0 else dt_polys

        for i in range(len(rec_texts)):
            text = rec_texts[i] if i < len(rec_texts) else ""
            score = float(rec_scores[i]) if i < len(rec_scores) else 0.0
            bbox = polys[i].tolist() if i < len(polys) else [[0, 0]] * 4

            if not text.strip():
                continue

            output.append({
                "bbox": [[round(float(p[0]), 1), round(float(p[1]), 1)] for p in bbox],
                "text": text,
                "confidence": round(score, 4),
            })

    return output


def init_ocr():
    """Initialize PaddleOCR engine once."""
    try:
        from paddleocr import PaddleOCR
    except ImportError:
        print(json.dumps({"error": "PaddleOCR not installed. Run: pip install paddleocr paddlepaddle"}), file=sys.stderr)
        sys.exit(1)

    return PaddleOCR(
        lang='hi',
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=True,
    )


def serve_mode(port=8765):
    """Run as persistent HTTP server — keeps model in memory."""
    from http.server import HTTPServer, BaseHTTPRequestHandler

    print(f"Loading PaddleOCR model...", file=sys.stderr)
    ocr_engine = init_ocr()
    print(f"Model loaded. Starting server on port {port}...", file=sys.stderr)

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/ocr":
                self.send_response(404)
                self.end_headers()
                return

            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length > 0 else {}
            image_path = body.get("image_path", "")

            if not image_path:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "image_path required"}).encode())
                return

            try:
                result = run_ocr(ocr_engine, image_path)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())

        def do_GET(self):
            if self.path == "/health":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok"}).encode())
                return
            self.send_response(404)
            self.end_headers()

        def log_message(self, format, *args):
            # Suppress default logging
            pass

    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"PaddleOCR server ready on http://127.0.0.1:{port}/ocr", file=sys.stderr)
    server.serve_forever()


def main():
    # Server mode
    if "--serve" in sys.argv:
        port = 8765
        if "--port" in sys.argv:
            idx = sys.argv.index("--port")
            port = int(sys.argv[idx + 1]) if idx + 1 < len(sys.argv) else 8765
        serve_mode(port)
        return

    # CLI mode (single image)
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: ocr_engine.py <image_path> | --serve [--port 8765]"}), file=sys.stderr)
        sys.exit(1)

    image_path = sys.argv[1]
    ocr_engine = init_ocr()
    result = run_ocr(ocr_engine, image_path)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
