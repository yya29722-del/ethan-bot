import urllib.request, json, os, sys

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]


def fetch_all(table, select="*", order="created_at.asc", page_size=1000):
    rows = []
    start = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}&order={order}"
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Range": f"{start}-{start + page_size - 1}",
        })
        with urllib.request.urlopen(req) as r:
            batch = json.loads(r.read())
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    return rows


if __name__ == "__main__":
    table = sys.argv[1] if len(sys.argv) > 1 else "memories"
    data = fetch_all(table)

    out_json = f"{table}_export.json"
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"exported {len(data)} rows from {table} -> {out_json}")

    if data and "content" in data[0]:
        out_txt = f"{table}_export.txt"
        with open(out_txt, "w", encoding="utf-8") as f:
            for row in data:
                tag = row.get("role") or row.get("category") or ""
                f.write(f"[{row.get('created_at', '')}] {tag}: {row.get('content', '')}\n")
        print(f"also wrote readable transcript -> {out_txt}")
