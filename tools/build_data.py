#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把四级词汇 docx 解析成 ui/data/words.json。

只做确定性清洗：去 BOM、去重、拆音标/词性/释义，不补写任何原稿没有的内容。

用法：
    python tools/build_data.py 词汇1.docx 词汇2.docx
    python tools/build_data.py 词汇1.docx 词汇2.docx --out ui/data/words.json

依赖（仅构建时需要，运行软件不需要）：
    python -m pip install python-docx
"""
import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "ui" / "data" / "words.json"

LINE_RE = re.compile(r"^([A-Za-z][A-Za-z'’\-\s\.]*?)\s*\[([^\]]*)\]\s*(.+)$")
POS_RE = re.compile(
    r"^(n|v|vt|vi|a|ad|adv|prep|conj|pron|num|int|art|aux|abbr)\.(?:\s*&\s*(?:vi|vt)\.)?\s*"
)
BRACKET_RE = re.compile(r"\[[^\]]*\]")
POS_ANY_RE = re.compile(
    r"(?<![A-Za-z])(n|v|vt|vi|a|ad|adv|prep|conj|pron|num|int|art|aux|abbr)\.(?:\s*&\s*(?:vi|vt)\.)?"
)

POS_GROUP = {
    "n": "名词",
    "v": "动词", "vt": "动词", "vi": "动词",
    "a": "形容词",
    "ad": "副词", "adv": "副词",
    "prep": "介词",
    "conj": "连词",
    "pron": "代词",
    "num": "数词",
    "int": "感叹词",
    "art": "冠词",
    "aux": "助动词",
    "abbr": "缩略语",
}


def parse_file(path: Path):
    try:
        import docx
    except ImportError:
        raise SystemExit(
            "缺少构建依赖 python-docx。请先运行：python -m pip install python-docx"
        )

    doc = docx.Document(str(path))
    text = "\n".join(p.text.replace("\ufeff", "") for p in doc.paragraphs)
    rows = []
    for line in text.split("\n"):
        line = line.strip().replace("\ufeff", "")
        if not line:
            continue
        m = LINE_RE.match(line)
        if not m:
            continue
        word = re.sub(r"\s+", " ", m.group(1).strip())
        phonetic = m.group(2).strip()
        definition = m.group(3).strip()
        rows.append({
            "word": word,
            "phonetic": phonetic,
            "definition": definition,
            "raw": line,
        })
    return rows


def pos_info(definition: str):
    m = POS_RE.match(definition)
    if not m:
        all_tokens = POS_ANY_RE.findall(definition)
        token = all_tokens[0] if all_tokens else ""
        group = POS_GROUP.get(token, "其他")
        return (token + "." if token else "其他"), group
    token = m.group(1)
    # vt.&vi. 这类组合原样保留
    raw = definition[:m.end()].strip()
    return raw, POS_GROUP.get(token, "其他")


def brief(definition: str, limit: int = 48) -> str:
    text = BRACKET_RE.sub("", definition)
    text = POS_ANY_RE.sub("", text)
    text = re.sub(r"^[\s,，;；:：]+", "", text)
    parts = [p.strip(" ，,;；") for p in re.split(r"[；;]", text) if p.strip(" ，,;；")]
    selected = parts[:2] if parts else [text.strip()]
    out = "；".join(selected)
    out = re.sub(r"\s+", " ", out).strip()
    if len(out) > limit:
        out = out[:limit].rstrip("，,；; ") + "…"
    return out or definition


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="把四六级词汇 docx 解析为 JHELIX 可用的 words.json。",
    )
    parser.add_argument(
        "sources",
        nargs="+",
        type=Path,
        help="一个或多个源 docx；每个非空行需形如 word [phonetic] pos. definition",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="输出 JSON 路径（默认 ui/data/words.json）",
    )
    parser.add_argument(
        "--name",
        default="四级高频词汇",
        help="词库名称（默认：四级高频词汇）",
    )
    args = parser.parse_args(argv)

    parsed = []
    for index, path in enumerate(args.sources, start=1):
        if not path.is_file():
            raise SystemExit(f"找不到源文件：{path}")
        rows = parse_file(path)
        print(f"[{index}] {path.name}: {len(rows)} 条")
        for row in rows:
            row["source"] = index
            parsed.append(row)

    seen = set()
    words = []
    duplicates = 0
    for row in parsed:
        key = row["word"].lower()
        if key in seen:
            duplicates += 1
            continue
        seen.add(key)
        pos, pos_group = pos_info(row["definition"])
        words.append({
            "id": f"w{len(words) + 1:04d}",
            "word": row["word"],
            "phonetic": row["phonetic"],
            "definition": row["definition"],
            "brief": brief(row["definition"]),
            "pos": pos,
            "posGroup": pos_group,
            "letter": row["word"][0].upper(),
            "source": row["source"],
            "order": len(words) + 1,
        })

    if not words:
        raise SystemExit("没有解析到任何词条，请检查 docx 的行格式。")

    payload = {
        "name": args.name,
        "version": "1.0.0",
        "builtAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "sources": [p.name for p in args.sources],
        "totalParsed": len(parsed),
        "total": len(words),
        "words": words,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(payload, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    print(f"解析 {len(parsed)} 条，去重 {duplicates} 条，保留 {len(words)} 词")
    print(f"输出：{args.out.resolve()}")
    letters = {ch: sum(1 for w in words if w["letter"] == ch) for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"}
    pos_groups = sorted({w["posGroup"] for w in words})
    print("字母分布：", {k: v for k, v in letters.items() if v})
    print("词性分布：", {g: sum(1 for w in words if w["posGroup"] == g) for g in pos_groups})
    return 0


if __name__ == "__main__":
    sys.exit(main())
