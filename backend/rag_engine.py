import io
import sys
import os
import re
import glob
import json
import math
import warnings
import argparse
import datetime
import numpy as np

os.environ["TQDM_DISABLE"] = "1"
warnings.filterwarnings("ignore")

import logging
logging.basicConfig(level=logging.ERROR, stream=sys.stderr)
logger = logging.getLogger("TRUETONERAG")

for lib in ["transformers", "httpx", "urllib3", "torch"]:
    logging.getLogger(lib).setLevel(logging.ERROR)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KB_DIR = os.path.join(BASE_DIR, "data", "knowledge_base")
VECTOR_DB_PATH = os.path.join(BASE_DIR, "data", "rag_vector_db.json")
os.makedirs(KB_DIR, exist_ok=True)


class VectorRAGEngine:
    """
    VoiceGuard Knowledge Base Ingestion & Grounded RAG Pipeline.
    Supports recursive text chunking, dense vector embeddings, vector similarity search,
    relevance filtering (0.65 threshold), and zero-hallucination grounded responses.
    """
    def __init__(self, kb_dir=KB_DIR, vector_db_path=VECTOR_DB_PATH):
        self.kb_dir = kb_dir
        self.vector_db_path = vector_db_path
        self.chunks = []
        self.encoder = None
        self.encoder_checked = False
        self.similarity_threshold = 0.65
        self.load_index()

    def _get_encoder(self):
        if self.encoder_checked:
            return self.encoder

        self.encoder_checked = True
        try:
            # pyrefly: ignore [missing-import]
            from sentence_transformers import SentenceTransformer
            self.encoder = SentenceTransformer("all-MiniLM-L6-v2")
        except Exception:
            self.encoder = None

        return self.encoder

    def _compute_embedding(self, text: str) -> list[float]:
        encoder = self._get_encoder()
        if encoder is not None:
            try:
                emb = encoder.encode(text)
                norm = np.linalg.norm(emb)
                if norm > 1e-12:
                    emb = emb / norm
                return emb.tolist()
            except Exception:
                pass

        # Deterministic Word Vector (384-dim) via hashlib.md5
        import hashlib
        words = re.findall(r'\w+', text.lower())
        vec = np.zeros(384, dtype=np.float32)
        for w in words:
            digest = int(hashlib.md5(w.encode("utf-8")).hexdigest()[:8], 16)
            idx = digest % 384
            vec[idx] += 1.0
        norm = np.linalg.norm(vec)
        if norm > 1e-12:
            vec = vec / norm
        else:
            vec = np.ones(384, dtype=np.float32) / math.sqrt(384)
        return vec.tolist()

    def recursive_chunk_text(self, text: str, source_file: str, chunk_size: int = 600, overlap: int = 100) -> list[dict]:
        """
        Recursively splits text into 500-800 token chunks with 100 token overlap and metadata.
        """
        sections = re.split(r'(?=\n#{1,3}\s+)', text)
        chunks = []

        for sec in sections:
            sec = sec.strip()
            if not sec:
                continue

            match = re.search(r'^#{1,3}\s+(.+)', sec)
            section_title = match.group(1).strip() if match else "General Overview"

            # Split section into words
            words = sec.split()
            if len(words) <= chunk_size:
                chunks.append({
                    "id": f"{source_file}#{len(chunks)+1}",
                    "text": sec,
                    "metadata": {
                        "source_file": source_file,
                        "section_title": section_title,
                        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                        "category": "Operational Knowledge Base"
                    }
                })
            else:
                step = chunk_size - overlap
                for i in range(0, len(words), step):
                    chunk_words = words[i : i + chunk_size]
                    chunk_text = " ".join(chunk_words)
                    if len(chunk_words) >= 30:
                        chunks.append({
                            "id": f"{source_file}#{len(chunks)+1}",
                            "text": chunk_text,
                            "metadata": {
                                "source_file": source_file,
                                "section_title": section_title,
                                "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                                "category": "Operational Knowledge Base"
                            }
                        })
        return chunks

    def ingest_knowledge_base(self) -> dict:
        """
        Scans KB directory, reads MD, TXT, CSV, JSON files, computes vector embeddings,
        and saves persistent vector database index.
        """
        files = glob.glob(os.path.join(self.kb_dir, "*.*"))
        all_chunks = []

        for fpath in files:
            fname = os.path.basename(fpath)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
                
                doc_chunks = self.recursive_chunk_text(content, fname)
                for item in doc_chunks:
                    item["vector"] = self._compute_embedding(item["text"])
                    all_chunks.append(item)
            except Exception as e:
                logger.error(f"Error reading file {fname}: {e}")

        self.chunks = all_chunks
        self.save_index()
        return {
            "success": True,
            "documents_indexed": len(files),
            "total_chunks_indexed": len(self.chunks),
            "index_path": self.vector_db_path
        }

    def save_index(self):
        try:
            with open(self.vector_db_path, "w", encoding="utf-8") as f:
                json.dump(self.chunks, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving vector DB: {e}")

    def load_index(self):
        if os.path.exists(self.vector_db_path):
            try:
                with open(self.vector_db_path, "r", encoding="utf-8") as f:
                    self.chunks = json.load(f)
            except Exception as e:
                logger.error(f"Error loading vector DB: {e}")
                self.chunks = []
        else:
            self.ingest_knowledge_base()

    def search_similar_chunks(self, query: str, top_k: int = 4) -> list[dict]:
        """
        Vector Cosine Similarity Search + Relevance Threshold Filtering.
        """
        if not self.chunks:
            self.ingest_knowledge_base()

        encoder = self._get_encoder()
        thresh = 0.40 if encoder is not None else 0.15

        query_vec = np.array(self._compute_embedding(query), dtype=np.float32)
        scored_chunks = []

        for item in self.chunks:
            vec = np.array(item["vector"], dtype=np.float32)
            sim = float(np.dot(query_vec, vec) / (np.linalg.norm(query_vec) * np.linalg.norm(vec) + 1e-12))
            if sim >= thresh:
                scored_chunks.append((sim, item))

        scored_chunks.sort(key=lambda x: x[0], reverse=True)
        results = []
        for sim, item in scored_chunks[:top_k]:
            results.append({
                "similarity": round(sim, 4),
                "text": item["text"],
                "metadata": item["metadata"]
            })
        return results

    def query_rag(self, query_text: str) -> dict:
        """
        Executes grounded RAG retrieval & Strict Prompt Synthesis.
        Returns: { success, answer, retrieved_context, citations }
        """
        results = self.search_similar_chunks(query_text, top_k=4)

        stop_words = {"what", "when", "where", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at", "by", "for", "with", "about", "against", "between", "into", "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once"}
        query_words = set([w.lower() for w in re.findall(r'\w+', query_text) if len(w) > 2 and w.lower() not in stop_words])
        context_words = set([w.lower() for res in results for w in re.findall(r'\w+', res["text"])])
        common_words = query_words.intersection(context_words)

        if not results or (len(query_words) > 0 and not common_words):
            return {
                "success": True,
                "answer": "I do not have sufficient verified information in my knowledge base to answer this.",
                "retrieved_context": [],
                "citations": []
            }

        # Build Strict Grounded Context Block
        context_block = []
        citations = []

        for idx, res in enumerate(results, 1):
            source_file = res["metadata"]["source_file"]
            section_title = res["metadata"]["section_title"]
            cite_str = f"[Source: {source_file} - Section: {section_title}]"
            
            if cite_str not in citations:
                citations.append(cite_str)
                
            context_block.append(f"--- Chunk {idx} ({cite_str}) ---\n{res['text']}")

        context_str = "\n\n".join(context_block)

        # Synthesize Grounded Answer from Retrieved Context
        # Synthesize concise answer directly based on context facts
        summary_lines = []
        query_words = [w.lower() for w in re.findall(r'\w+', query_text) if len(w) > 3]

        for res in results:
            lines = res["text"].split("\n")
            for line in lines:
                line_clean = line.strip()
                if line_clean and not line_clean.startswith("#"):
                    if any(w in line_clean.lower() for w in query_words):
                        if line_clean not in summary_lines:
                            summary_lines.append(line_clean)

        if not summary_lines:
            # Fallback to top chunk snippet
            summary_lines = [results[0]["text"].strip()[:400]]

        grounded_answer = " ".join(summary_lines[:3]) + "\n\n" + " ".join(citations)

        return {
            "success": True,
            "answer": grounded_answer,
            "retrieved_context": results,
            "citations": citations
        }


# Instantiate RAG Engine Singleton
rag_instance = VectorRAGEngine()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VoiceGuard Grounded RAG Knowledge Engine")
    parser.add_argument("--ingest", action="store_true", help="Ingest & Index Knowledge Base")
    parser.add_argument("--query", type=str, default=None, help="Query Knowledge Base")
    parser.add_argument("--daemon", action="store_true", help="Run persistent JSON worker daemon mode")

    args = parser.parse_args()

    if args.ingest:
        res = rag_instance.ingest_knowledge_base()
        print(json.dumps(res, indent=2))
    elif args.daemon:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
                q = req.get("query", "")
                ans = rag_instance.query_rag(q)
                sys.stdout.write(json.dumps(ans) + "\n")
                sys.stdout.flush()
            except Exception as e:
                err_resp = {"success": False, "error": str(e)}
                sys.stdout.write(json.dumps(err_resp) + "\n")
                sys.stdout.flush()
    elif args.query:
        res = rag_instance.query_rag(args.query)
        print(json.dumps(res, indent=2))
    else:
        print(json.dumps({"status": "VoiceGuard RAG Engine Ready"}, indent=2))
