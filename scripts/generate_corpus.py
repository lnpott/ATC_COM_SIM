#!/usr/bin/env python3
"""Normaliza os chunks e gera, de uma vez, o corpus e seu indice BM25."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CHUNKS_PATH = ROOT / "atc-simulator-chunks.json"
INDEX_PATH = ROOT / "atc-simulator-index.json"
WORD_RE = re.compile(r"[^\W\d_]+", re.UNICODE)
SECTION_RE = re.compile(r"(?:^|\n)(?:Subse[cç][aã]o|Se[cç][aã]o)\s+([^\n]+)", re.IGNORECASE)


class ValidationError(ValueError):
    """Indica que corpus e indice violam o contrato de geracao."""


def structural_type(chunk: dict[str, Any], position: int) -> str:
    if chunk.get("tipo_segmento"):
        return str(chunk["tipo_segmento"])
    text = str(chunk.get("texto", "")).lstrip()
    # Os arquivos legados anexavam capa, portaria e sumario ao Art. 3.
    if position == 0 and (text.startswith("Esta Portaria") or "SUMÁRIO" in text[:2000]):
        return "preliminar"
    if text.upper().startswith("ANEXO"):
        return "anexo"
    if text.upper().startswith("TABELA"):
        return "tabela"
    return "artigo"


def normalize_chunks(raw_chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    counters: defaultdict[tuple[str, str, int], int] = defaultdict(int)
    doc_positions: Counter[str] = Counter()

    for absolute_position, source in enumerate(raw_chunks, 1):
        chunk = dict(source)
        documento = str(chunk.get("documento") or chunk.get("doc") or "").strip()
        position = doc_positions[documento]
        doc_positions[documento] += 1
        kind = structural_type(chunk, position)
        article_number = chunk.get("art_num")
        number = int(article_number or chunk.get("numero") or position + 1)
        if kind == "preliminar":
            number = int(chunk.get("numero") or 1)

        key = (documento, kind, number)
        counters[key] += 1
        segment = counters[key]
        match = SECTION_RE.search(str(chunk.get("texto", "")))

        chunk["id"] = f"{documento}-{kind}-{number:04d}-{segment:03d}"
        chunk["documento"] = documento
        # Mantido por compatibilidade com consumidores existentes.
        chunk["doc"] = documento
        chunk["tipo_segmento"] = kind
        chunk["numero"] = number
        chunk["segmento"] = segment
        chunk["secao"] = chunk.get("secao") or (match.group(1).strip() if match else None)
        chunk["posicao_original"] = int(chunk.get("posicao_original") or absolute_position)
        normalized.append(chunk)
    return normalized


def tokenize(chunk: dict[str, Any]) -> list[str]:
    searchable = " ".join(
        [str(chunk.get("artigo", "")), str(chunk.get("tipo", "")), *chunk.get("fases", []), str(chunk.get("texto", ""))]
    )
    return WORD_RE.findall(searchable.lower())


def build_index(chunks: list[dict[str, Any]]) -> dict[str, Any]:
    corpus = [tokenize(chunk) for chunk in chunks]
    document_frequency: Counter[str] = Counter()
    for tokens in corpus:
        document_frequency.update(set(tokens))
    total = len(chunks)
    idf = {
        term: math.log(1 + (total - frequency + 0.5) / (frequency + 0.5))
        for term, frequency in document_frequency.items()
    }
    docs: dict[str, dict[str, str]] = {}
    for chunk in chunks:
        docs.setdefault(chunk["documento"], {"titulo": chunk.get("titulo", ""), "versao": chunk["versao"]})
    return {
        "metadados": {
            "n_chunks": total,
            "avgdl": round(sum(map(len, corpus)) / total, 2) if total else 0,
            "docs": docs,
        },
        "idf": idf,
        "corpus": corpus,
        "chunks": chunks,
    }


def validate(chunks: list[dict[str, Any]], index: dict[str, Any]) -> None:
    ids = [chunk.get("id") for chunk in chunks]
    duplicates = sorted(identifier for identifier, count in Counter(ids).items() if count > 1)
    if duplicates:
        raise ValidationError(f"IDs duplicados: {', '.join(map(str, duplicates))}")
    if index.get("metadados", {}).get("n_chunks") != len(chunks):
        raise ValidationError("metadados.n_chunks difere da quantidade de chunks")
    known_ids = set(ids)
    missing_ids = [chunk.get("id") for chunk in index.get("chunks", []) if chunk.get("id") not in known_ids]
    if missing_ids:
        raise ValidationError(f"indice referencia IDs inexistentes: {', '.join(map(str, missing_ids))}")
    required = ("documento", "versao", "tipo", "idioma", "fases", "texto")
    for position, chunk in enumerate(chunks, 1):
        absent = [field for field in required if not chunk.get(field)]
        if absent:
            raise ValidationError(f"chunk {position} sem campos obrigatorios: {', '.join(absent)}")


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def write_json(path: Path, value: Any, *, indent: int | None = None) -> None:
    with path.open("w", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=indent)
        stream.write("\n")


def generate() -> None:
    chunks = normalize_chunks(load_json(CHUNKS_PATH))
    index = build_index(chunks)
    validate(chunks, index)

    # So substitui os artefatos depois que ambos foram construidos e validados.
    temporary: list[tuple[Path, Path]] = []
    try:
        for target, value, indent in ((CHUNKS_PATH, chunks, 2), (INDEX_PATH, index, None)):
            fd, name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
            os.close(fd)
            temp_path = Path(name)
            write_json(temp_path, value, indent=indent)
            temporary.append((temp_path, target))
        for temp_path, target in temporary:
            os.replace(temp_path, target)
    finally:
        for temp_path, _ in temporary:
            temp_path.unlink(missing_ok=True)


def validate_files() -> None:
    validate(load_json(CHUNKS_PATH), load_json(INDEX_PATH))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-only", action="store_true", help="valida os artefatos sem altera-los")
    args = parser.parse_args()
    validate_files() if args.validate_only else generate()


if __name__ == "__main__":
    main()
