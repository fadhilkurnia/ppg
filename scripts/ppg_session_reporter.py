#!/usr/bin/env python3
"""
PPG Session Activity Auto-Reporter to WhatsApp Group
(Hermes Profile: PPG)

Monitors the SQLite database `attendances` table in the `ppg_ppg-data` volume.
When teachers insert new session records via Portal Guru, this daemon
automatically formats and sends a cumulative daily recap report to the
WhatsApp group: "Pengajar PPG Desa Amerika" (6281225113337-1474276782@g.us).
"""

import argparse
import json
import logging
import os
import re
import signal
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

# ---------------------------------------------------------------------------
# Configuration & Constants
# ---------------------------------------------------------------------------
HERMES_HOME = os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes/profiles/ppg"))
DEFAULT_DB_PATH = "/home/anchor/.local/share/containers/storage/volumes/ppg_ppg-data/_data/app.db"
DB_PATH = os.environ.get("PPG_DB_PATH", DEFAULT_DB_PATH)
BRIDGE_URL = os.environ.get("WA_BRIDGE_URL", "http://127.0.0.1:3005")
TARGET_CHAT_ID = os.environ.get("WA_SESSION_REPORT_CHAT_ID", "6281225113337-1474276782@g.us")
STATE_FILE = os.environ.get(
    "SESSION_REPORT_STATE_FILE",
    os.path.join(HERMES_HOME, "cron", "session-report-seen.json")
)
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "5.0"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("ppg_session_reporter")

# ---------------------------------------------------------------------------
# Name & Regional Abbreviation Mappings
# ---------------------------------------------------------------------------
STUDENT_CITY_MAP = {
    "Raleigh": "RLG",
    "Chicago": "CH",
    "Washington DC": "DC",
    "Portsmouth": "PTM",
    "Los Angeles": "LA",
    "Toronto": "TOR",
    "Philadelphia": "PHL",
    "Buffalo": "BFL",
    "Atlanta": "ATL",
    "Indianapolis": "IN",
    "Milton": "MLT",
}

STUDENT_KELOMPOK_MAP = {
    "California": "CA",
    "Chicago": "CH",
    "New Hampshire": "NH",
    "Canada": "CND",
    "Other": "OTH",
}

TEACHER_LOC_MAP = {
    "Aghnia Rahma": "JMB",
    "Amrin Isnan": "jg 1",
    "Arth Lestari": "jg 1",
    "Ayu Fuji Lestari": "CKP",
    "Aza Noer Fadillah": "PWD",
    "Erma Fatimah": "MLG",
    "Erma Fitria Hidayati": "BKS",
    "Evan Anom Choirrizqi": "CKR",
    "Fadillah Sitta Ashari": "PBT",
    "Fadli Amar Makruf": "KLT",
    "Ilham Nanda Pratama": "SKH",
    "Irma Rahmawati": "SRG",
    "Kyra Nedha": "GSK",
    "Millati Abikum Awalin": "PWD",
    "Muhamad Abdul Aziz": "SLT",
    "Muhammad Akhyar Shobari": "LWT",
    "Muhammad Ammar Maruf": "SKG",
    "Musa Birru Abidullah": "CLP 1",
    "Naely Fauzya": "BDG",
    "Nurul Azkiyyati Abdatillah": "MDN 2",
    "Rahmad Fauzan": "SLT",
    "Rika Anjani": "KDR 2",
    "Royan Wanda Auliya": "SLT",
    "Salsabila Vi Firdausa": "PWD",
    "Sofia Madu Ratu Anjani": "PWD",
    "Sofia Nur Asyifa": "SLT",
    "Sulkifli": "LWT",
    "Wulan Rizki Yuliani": "NJK",
    "Yasril Andyka Hitho": "MDN",
}

# ---------------------------------------------------------------------------
# Formatting Helpers
# ---------------------------------------------------------------------------
def format_ordinal(n: int) -> str:
    """Returns day with ordinal suffix, e.g. 1st, 2nd, 3rd, 16th."""
    if 11 <= (n % 100) <= 13:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"

def format_date_header(date_str: str) -> str:
    """Returns date formatted as: Wednesday, 16th September 2026."""
    date_part = date_str[:10]
    dt = datetime.strptime(date_part, "%Y-%m-%d")
    day_name = dt.strftime("%A")
    day_ordinal = format_ordinal(dt.day)
    month_name = dt.strftime("%B")
    year = dt.strftime("%Y")
    return f"{day_name}, {day_ordinal} {month_name} {year}"

def format_duration(min_val) -> str:
    """Converts duration in minutes to (HH:MM), e.g. 80 -> 01:20."""
    if not min_val or min_val <= 0:
        return "00:00"
    try:
        total_min = int(min_val)
        hours = total_min // 60
        minutes = total_min % 60
        return f"{hours:02d}:{minutes:02d}"
    except (ValueError, TypeError):
        return "00:00"

def get_student_label(name: str, nickname: str, city: str, kelompok: str) -> str:
    """Generates <NamaSantri>-<KelompokSantri>, e.g. Dinda-RLG."""
    s_name = (nickname or "").strip()
    if "/" in s_name:
        s_name = s_name.split("/")[0].strip()
    if not s_name:
        s_name = (name or "").strip().split()[0] if name else "Santri"

    loc = ""
    if city and city.strip() in STUDENT_CITY_MAP:
        loc = STUDENT_CITY_MAP[city.strip()]
    elif kelompok and kelompok.strip() in STUDENT_KELOMPOK_MAP:
        loc = STUDENT_KELOMPOK_MAP[kelompok.strip()]
    elif city and city.strip():
        loc = city.strip()[:3].upper()
    elif kelompok and kelompok.strip():
        loc = kelompok.strip()[:3].upper()

    return f"{s_name}-{loc}" if loc else s_name

def get_teacher_label(name: str, nickname: str, kelompok: str, daerah: str, db_path: str = None) -> str:
    """Generates <NamaGuru>-<DaerahGuru>, e.g. Erma-BKS, Evan-CKR, Artha-jg 1."""
    t_name = (nickname or "").strip()
    if "/" in t_name:
        t_name = t_name.split("/")[0].strip()
    if not t_name:
        t_name = (name or "").strip().split()[0] if name else "Guru"

    loc = None
    # 1. Cek dari database daerah_abbreviations jika ada daerah
    if daerah and db_path:
        try:
            import sqlite3
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            cursor = conn.cursor()
            cursor.execute("SELECT abbreviation FROM daerah_abbreviations WHERE LOWER(daerah) = LOWER(?) LIMIT 1;", (daerah.strip(),))
            row = cursor.fetchone()
            conn.close()
            if row and row[0]:
                loc = row[0]
        except Exception:
            pass

    # 2. Cek static TEACHER_LOC_MAP
    if not loc:
        loc = TEACHER_LOC_MAP.get(name)

    # 3. Fallback ke daerah atau kelompok
    if not loc:
        loc = (daerah or kelompok or "").strip()
        if not loc:
            loc = "Guru"
    return f"{t_name}-{loc}"

def clean_reason_for_izin(selected: str) -> str:
    if not selected:
        return ""
    # Strip redundant leading 'izin / ijin / mohon izin' prefixes
    cleaned = re.sub(r"^(?:mohon\s+)?(?:izin|ijin)(?:\s+(?:murid|guru))?[\s,:-]+", "", selected, flags=re.IGNORECASE).strip()
    return cleaned if cleaned else selected

def extract_izin_reason(materi: str) -> str:
    """Extracts a short, concise reason for absence from the materi field if available."""
    if not materi:
        return ""
    raw = materi.strip()
    if not raw or raw == "-":
        return ""

    lower_raw = raw.lower()
    is_lesson_block = any(k in lower_raw for k in ("bacaan", "tilawati", "tilawaty", "surat al-", "asmaul husna", "murojaah", "homework"))
    has_absence_word = any(k in lower_raw for k in ("izin", "ijin", "sakit", "halangan", "libur", "acara", "ujian", "lupa", "tidak", "kurang", "demam", "flu", "rawat", "perjalanan", "asrama", "sambung", "trouble", "sinyal", "rehat", "cancel", "ngedrop", "keperluan", "bentrok", "telat", "terlambat"))

    if is_lesson_block and not has_absence_word:
        return ""

    LESSON_KEYWORDS = ("bacaan", "tilawati", "surat", "hafalan", "pr", "makna", "📚", "• tilawaty", "iqro", "juz", "ayat", "asmaul husna", "homework", "murojaah", "🏡")

    lines = [line.strip().strip("*").strip("-").strip() for line in raw.splitlines() if line.strip()]
    if not lines:
        return ""

    selected = None
    for line in lines:
        lower = line.lower()
        if any(lower.startswith(k) for k in LESSON_KEYWORDS):
            continue
        if lower.startswith("report"):
            remainder = line[6:].strip().lstrip(":").strip()
            if remainder and not any(k in remainder.lower() for k in ("bacaan", "ayat", "surat", "tilawati")):
                selected = remainder
                break
            continue
        if any(w in lower for w in ("ayat", "surat al-", "surat al ", "tilawati", "halaman", "hal.")):
            continue
        selected = line
        break

    if not selected or selected == "-":
        return ""

    cleaned = clean_reason_for_izin(selected)
    if not cleaned:
        return ""

    if len(cleaned) > 40:
        cleaned = cleaned[:37] + "..."
    return cleaned

def build_report_message(date_str: str, sessions: list, db_path: str = None) -> str:
    """
    Constructs the exact report string:
    https://journal-ppg.us
    ====================
    Laporan Ngaji Generus
    ======================
    <Hari>, <Tanggal> <Bulan> <Tahun>
    =================
    1. <NamaSantri>-<KelompokSantri> 📚 <NamaGuru>-<KelompokGuru> (<DurasiJam:Menit>)
    2. <NamaSantri>-<KelompokSantri> 🎙️ <NamaGuru>-<KelompokGuru> (<DurasiJam:Menit>)
    3. <NamaSantri>-<KelompokSantri> 📌  <NamaGuru>-<KelompokGuru> (Izin Murid, <Alasan>)
    4. <NamaSantri>-<KelompokSantri> 📌  <NamaGuru>-<KelompokGuru> (Izin Guru, <Alasan>)
    """
    header_date = format_date_header(date_str)
    lines = [
        "https://journal-ppg.us",
        "====================",
        "Laporan Ngaji Generus",
        "======================",
        header_date,
        "=================",
    ]
    for idx, s in enumerate(sessions, start=1):
        s_label = get_student_label(s["s_name"], s["s_nick"], s["s_city"], s["s_kel"])
        t_label = get_teacher_label(s["t_name"], s["t_nick"], s["t_kel"], s["t_daerah"], db_path)
        status = s.get("status")
        if status in ("izin_murid", "izin_guru"):
            label = "Izin Murid" if status == "izin_murid" else "Izin Guru"
            reason = extract_izin_reason(s.get("materi"))
            detail = f"{label}, {reason}" if reason else label
            lines.append(f"{idx}. {s_label} 📌  {t_label} ({detail})")
        elif status == "by_vn":
            d_label = format_duration(s["duration_min"])
            lines.append(f"{idx}. {s_label} 🎙️ {t_label} ({d_label}) (voice note)")
        else:
            d_label = format_duration(s["duration_min"])
            lines.append(f"{idx}. {s_label} 📚 {t_label} ({d_label})")

    return "\n".join(lines)

# ---------------------------------------------------------------------------
# Database Access
# ---------------------------------------------------------------------------
def get_db_connection():
    """Opens read-only SQLite connection to app.db."""
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"Database not found at {DB_PATH}")
    uri = f"file:{os.path.abspath(DB_PATH)}?mode=ro"
    conn = sqlite3.connect(uri, uri=True, timeout=10.0)
    conn.execute("PRAGMA query_only = ON;")
    return conn

def query_sessions_for_date(date_str: str) -> list:
    """Queries all active sessions for a specific date (YYYY-MM-DD)."""
    date_part = date_str[:10]
    conn = get_db_connection()
    try:
        c = conn.cursor()
        query = """
            SELECT a.id, a.date, a.duration_min, a.status, a.materi, a.created_at,
                   s.name AS s_name, s.nickname AS s_nick, s.kelompok AS s_kel, s.city AS s_city,
                   t.name AS t_name, t.nickname AS t_nick, t.kelompok AS t_kel, t.daerah AS t_daerah
            FROM attendances a
            JOIN students s ON a.student_id = s.id
            JOIN teachers t ON a.teacher_id = t.id
            WHERE (SUBSTR(a.date, 1, 10) = ? OR a.date LIKE ?)
              AND (a.status IN ('hadir', 'by_vn', 'izin_murid', 'izin_guru') OR (a.duration_min IS NOT NULL AND a.duration_min > 0))
            ORDER BY a.created_at ASC, a.id ASC
        """
        c.execute(query, (date_part, f"{date_part}%"))
        cols = [col[0] for col in c.description]
        return [dict(zip(cols, r)) for r in c.fetchall()]
    finally:
        conn.close()

# ---------------------------------------------------------------------------
# State Management
# ---------------------------------------------------------------------------
def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed reading state from {STATE_FILE}: {e}")
    return {"seen_ids": [], "last_run": 0}

def save_state(state: dict):
    try:
        os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
        # Keep seen_ids bounded to last 10000 IDs
        if len(state.get("seen_ids", [])) > 15000:
            state["seen_ids"] = state["seen_ids"][-10000:]
        tmp_file = f"{STATE_FILE}.tmp"
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
        os.replace(tmp_file, STATE_FILE)
    except Exception as e:
        logger.error(f"Failed writing state to {STATE_FILE}: {e}")

def init_seen_if_empty(state: dict):
    """
    On cold start without an existing state file, marks all current DB
    records as seen to avoid blasting historical messages into WhatsApp group.
    """
    seen = state.get("seen_ids", [])
    if not seen:
        logger.info("Initializing seen state with all current database records...")
        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute("SELECT id FROM attendances ORDER BY created_at ASC")
            all_ids = [r[0] for r in c.fetchall()]
            state["seen_ids"] = all_ids
            state["last_run"] = int(time.time())
            save_state(state)
            logger.info(f"Initialized state with {len(all_ids)} existing attendance IDs.")
        finally:
            conn.close()

# ---------------------------------------------------------------------------
# WhatsApp Bridge Communication
# ---------------------------------------------------------------------------
def send_whatsapp_message(chat_id: str, message: str, timeout: int = 15) -> bool:
    """Dispatches a message payload to the local Baileys bridge."""
    payload = {
        "chatId": chat_id,
        "message": message,
    }
    url = f"{BRIDGE_URL.rstrip('/')}/send"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "PPG-SessionReporter/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = resp.getcode()
            if 200 <= status < 300:
                logger.info(f"Successfully posted update to {chat_id} via {url}")
                return True
            logger.error(f"Unexpected status code from bridge: {status}")
            return False
    except Exception as e:
        logger.error(f"Failed connecting to WhatsApp bridge ({url}): {e}")
        return False

# ---------------------------------------------------------------------------
# Polling Logic
# ---------------------------------------------------------------------------
def poll_step(state: dict, dry_run: bool = False) -> int:
    """Checks for newly created records in `attendances` and handles updates."""
    seen_list = state.get("seen_ids", [])
    seen_set = set(seen_list)

    try:
        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute("""
                SELECT id, date, created_at, status, duration_min
                FROM attendances
                ORDER BY created_at DESC
                LIMIT 50
            """)
            recent_rows = c.fetchall()
        finally:
            conn.close()
    except sqlite3.OperationalError as e:
        logger.warning(f"Database unavailable or busy during poll: {e}")
        return 0

    new_items = [r for r in recent_rows if r[0] not in seen_set]
    if not new_items:
        return 0

    logger.info(f"Detected {len(new_items)} new attendance record(s). Debouncing...")
    # Debounce short interval to catch multi-session simultaneous saves
    time.sleep(2.0)

    # Re-fetch recent rows to capture all in-flight inserts
    try:
        conn = get_db_connection()
        try:
            c = conn.cursor()
            c.execute("""
                SELECT id, date, created_at, status, duration_min
                FROM attendances
                ORDER BY created_at DESC
                LIMIT 100
            """)
            recent_rows = c.fetchall()
        finally:
            conn.close()
    except sqlite3.OperationalError as e:
        logger.warning(f"Database unavailable or busy during debounce re-fetch: {e}")
        return 0

    new_items = [r for r in recent_rows if r[0] not in seen_set]
    dates_to_report = {}
    non_reportable_ids = []

    for item in new_items:
        att_id, att_date, _, att_status, att_dur = item
        is_reportable = (att_status in ("hadir", "by_vn", "izin_murid", "izin_guru")) or (att_dur is not None and att_dur > 0)
        date_part = (att_date or "")[:10]
        if is_reportable and date_part:
            dates_to_report.setdefault(date_part, []).append(att_id)
        else:
            non_reportable_ids.append(att_id)

    # Track successfully processed IDs
    processed_ids = []

    # Process cumulative report for each date
    for d_str, ids in dates_to_report.items():
        sessions = query_sessions_for_date(d_str)
        if not sessions:
            logger.warning(f"No active sessions found for date {d_str}")
            processed_ids.extend(ids)
            continue

        msg = build_report_message(d_str, sessions, DB_PATH)
        logger.info(f"Generated cumulative report for {d_str} ({len(sessions)} session(s)):\n{msg}")

        if dry_run:
            logger.info("[DRY RUN] Message will not be dispatched.")
            processed_ids.extend(ids)
        else:
            success = send_whatsapp_message(TARGET_CHAT_ID, msg)
            if success:
                logger.info(f"Dispatched report for {d_str} with {len(sessions)} total session(s).")
                processed_ids.extend(ids)
            else:
                logger.error(f"Could not send report for {d_str}. Will retry next poll.")

    processed_ids.extend(non_reportable_ids)
    for p_id in processed_ids:
        if p_id not in seen_set:
            seen_list.append(p_id)
            seen_set.add(p_id)

    state["seen_ids"] = seen_list
    state["last_run"] = int(time.time())
    save_state(state)
    return len(new_items)

# ---------------------------------------------------------------------------
# Daemon Runner
# ---------------------------------------------------------------------------
def run_daemon(dry_run: bool = False):
    logger.info("Starting PPG Session Auto-Reporter Daemon...")
    logger.info(f"Database: {DB_PATH}")
    logger.info(f"Bridge URL: {BRIDGE_URL}")
    logger.info(f"Target WhatsApp Group: {TARGET_CHAT_ID}")
    logger.info(f"Polling Interval: {POLL_INTERVAL}s | Dry Run: {dry_run}")

    state = load_state()
    init_seen_if_empty(state)

    running = True

    def handle_sig(sig, frame):
        nonlocal running
        logger.info("Received termination signal. Shutting down cleanly...")
        running = False

    signal.signal(signal.SIGINT, handle_sig)
    signal.signal(signal.SIGTERM, handle_sig)

    while running:
        try:
            poll_step(state, dry_run=dry_run)
        except Exception as e:
            logger.error(f"Unexpected error during poll cycle: {e}", exc_info=True)

        time.sleep(POLL_INTERVAL)

    logger.info("PPG Session Auto-Reporter Daemon stopped.")

# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="PPG Session Auto-Reporter Daemon")
    parser.add_argument("--daemon", action="store_true", help="Run as continuous background daemon")
    parser.add_argument("--dry-run", action="store_true", help="Monitor and format without sending WA messages")
    parser.add_argument("--send-date", type=str, metavar="YYYY-MM-DD", help="Generate and send report for specific date")
    parser.add_argument("--preview-date", type=str, metavar="YYYY-MM-DD", help="Print report message preview for date")

    args = parser.parse_args()

    if args.preview_date:
        sessions = query_sessions_for_date(args.preview_date)
        if not sessions:
            print(f"No sessions found for date {args.preview_date}")
            return
        print(build_report_message(args.preview_date, sessions))
        return

    if args.send_date:
        sessions = query_sessions_for_date(args.send_date)
        if not sessions:
            print(f"No sessions found for date {args.send_date}")
            return
        msg = build_report_message(args.send_date, sessions)
        print(f"Dispatching report for {args.send_date}:\n{msg}")
        if args.dry_run:
            print("[DRY RUN] Not sending.")
        else:
            success = send_whatsapp_message(TARGET_CHAT_ID, msg)
            print("Send Result:", "SUCCESS" if success else "FAILED")
        return

    run_daemon(dry_run=args.dry_run)

if __name__ == "__main__":
    main()
