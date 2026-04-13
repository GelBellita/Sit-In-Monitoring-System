from flask import Flask, render_template, redirect, url_for, request, flash, session, jsonify
import sqlite3
import os
from datetime import datetime, timedelta

app = Flask(__name__)
app.secret_key = "gel119870"

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "images", "uploads")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

ADMIN_EMAIL    = "admin@ccs.edu"
ADMIN_PASSWORD = "admin123"

FOUL_WORDS = [
    "bogo", "tangina", "tang ina", "gago", "puta", "putangina",
    "putang ina", "nigga", "nigger", "dumbass", "dumb ass", "fuck",
    "fuck you", "fucker", "fucking", "shit", "asshole", "bastard",
    "bobo", "tanga", "inutil", "leche", "putcha", "yawa", "buang",
    "pakyu", "pakyo", "bwisit", "ulol", "tarantado", "giatay",
    "piste", "pisti", "boang", "lintik", "letse", "syet", "shet",
    "animal", "hayop", "demonyo", "hudas", "hinayupak", "pucha"
]

# ── Time slot → (start, end) in 24h for overlap checks ───────────────────────
SLOT_TIMES = {
    "7:00 AM – 9:00 AM":   ("07:00", "09:00"),
    "9:00 AM – 11:00 AM":  ("09:00", "11:00"),
    "11:00 AM – 1:00 PM":  ("11:00", "13:00"),
    "1:00 PM – 3:00 PM":   ("13:00", "15:00"),
    "3:00 PM – 5:00 PM":   ("15:00", "17:00"),
    "5:00 PM – 7:00 PM":   ("17:00", "19:00"),
}

def slot_overlaps_schedule(slot_label, sched_start, sched_end):
    """Return True if the named time slot overlaps with [sched_start, sched_end] (HH:MM strings)."""
    times = SLOT_TIMES.get(slot_label)
    if not times:
        return False
    s1, e1 = times
    # overlap iff s1 < sched_end AND e1 > sched_start
    return s1 < sched_end and e1 > sched_start


def get_db_connection():
    conn = sqlite3.connect("SitIn.db")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def create_table():
    conn = get_db_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            idNumber      TEXT PRIMARY KEY,
            firstName     TEXT,
            middleName    TEXT,
            lastName      TEXT,
            email         TEXT UNIQUE,
            yearLevel     TEXT,
            course        TEXT,
            address       TEXT,
            password      TEXT,
            profileImage  TEXT,
            sessions      INTEGER DEFAULT 30
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS announcements (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            title     TEXT,
            content   TEXT,
            createdBy TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sit_in_history (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            studentId     TEXT,
            labRoom       TEXT,
            purpose       TEXT,
            pcNumber      INTEGER,
            timeIn        DATETIME DEFAULT CURRENT_TIMESTAMP,
            timeOut       DATETIME,
            status        TEXT DEFAULT 'Active',
            feedback      TEXT,
            feedbackRating INTEGER DEFAULT 0,
            adminRating   INTEGER DEFAULT 0,
            taskCompleted INTEGER DEFAULT 0,
            totalMinutes  INTEGER DEFAULT 0,
            FOREIGN KEY (studentId) REFERENCES users(idNumber)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS reservations (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            studentId    TEXT,
            labRoom      TEXT,
            pcNumber     INTEGER,
            reserveDate  TEXT,
            timeSlot     TEXT,
            purpose      TEXT,
            status       TEXT DEFAULT 'Pending',
            rejectReason TEXT,
            isNew        INTEGER DEFAULT 1,
            createdAt    DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (studentId) REFERENCES users(idNumber)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS lab_schedules (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            labRoom     TEXT,
            schedDate   TEXT,
            timeSlot    TEXT,
            description TEXT,
            createdAt   DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS schedule_pc_overrides (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            scheduleId  INTEGER,
            pcNumber    INTEGER,
            status      TEXT DEFAULT 'available',
            FOREIGN KEY (scheduleId) REFERENCES lab_schedules(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            userId      TEXT,
            message     TEXT,
            isRead      INTEGER DEFAULT 0,
            type        TEXT DEFAULT 'info',
            createdAt   DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS reservation_logs (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            reservationId INTEGER,
            studentId     TEXT,
            firstName     TEXT,
            lastName      TEXT,
            action        TEXT,
            details       TEXT,
            createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()

    # ── Migrations ─────────────────────────────────────────────────────────────
    existing_users = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
    if "profileImage" not in existing_users:
        conn.execute("ALTER TABLE users ADD COLUMN profileImage TEXT")
    if "sessions" not in existing_users:
        conn.execute("ALTER TABLE users ADD COLUMN sessions INTEGER DEFAULT 30")

    existing_history = [r[1] for r in conn.execute("PRAGMA table_info(sit_in_history)").fetchall()]
    if "feedback" not in existing_history:
        conn.execute("ALTER TABLE sit_in_history ADD COLUMN feedback TEXT")
    if "feedbackRating" not in existing_history:
        conn.execute("ALTER TABLE sit_in_history ADD COLUMN feedbackRating INTEGER DEFAULT 0")
    if "adminRating" not in existing_history:
        conn.execute("ALTER TABLE sit_in_history ADD COLUMN adminRating INTEGER DEFAULT 0")
    if "taskCompleted" not in existing_history:
        conn.execute("ALTER TABLE sit_in_history ADD COLUMN taskCompleted INTEGER DEFAULT 0")
    if "totalMinutes" not in existing_history:
        conn.execute("ALTER TABLE sit_in_history ADD COLUMN totalMinutes INTEGER DEFAULT 0")
    if "feedbackSeen" not in existing_history:
        conn.execute("ALTER TABLE sit_in_history ADD COLUMN feedbackSeen INTEGER DEFAULT 1")
        conn.execute("UPDATE sit_in_history SET feedbackSeen = 1 WHERE feedback IS NOT NULL")
    if "pcNumber" not in existing_history:
        conn.execute("ALTER TABLE sit_in_history ADD COLUMN pcNumber INTEGER")
    

    existing_reservations = [r[1] for r in conn.execute("PRAGMA table_info(reservations)").fetchall()]
    if "isNew" not in existing_reservations:
        conn.execute("ALTER TABLE reservations ADD COLUMN isNew INTEGER DEFAULT 1")
    if "sitInId" not in existing_reservations:
        conn.execute("ALTER TABLE reservations ADD COLUMN sitInId INTEGER")

    existing_logs = [r[1] for r in conn.execute("PRAGMA table_info(reservation_logs)").fetchall()]
    if "firstName" not in existing_logs:
        conn.execute("ALTER TABLE reservation_logs ADD COLUMN firstName TEXT")
    if "lastName" not in existing_logs:
        conn.execute("ALTER TABLE reservation_logs ADD COLUMN lastName TEXT")

    # ── Migrate lab_schedules: replace timeStart/timeEnd with timeSlot if needed ──
    existing_schedules = [r[1] for r in conn.execute("PRAGMA table_info(lab_schedules)").fetchall()]
    if "timeSlot" not in existing_schedules:
        conn.execute("ALTER TABLE lab_schedules ADD COLUMN timeSlot TEXT")
        # Migrate old rows: convert timeStart/timeEnd back to nearest slot label if possible
        if "timeStart" in existing_schedules:
            conn.execute("""
                UPDATE lab_schedules SET timeSlot = CASE
                    WHEN timeStart = '07:00' THEN '7:00 AM – 9:00 AM'
                    WHEN timeStart = '09:00' THEN '9:00 AM – 11:00 AM'
                    WHEN timeStart = '11:00' THEN '11:00 AM – 1:00 PM'
                    WHEN timeStart = '13:00' THEN '1:00 PM – 3:00 PM'
                    WHEN timeStart = '15:00' THEN '3:00 PM – 5:00 PM'
                    WHEN timeStart = '17:00' THEN '5:00 PM – 7:00 PM'
                    ELSE '7:00 AM – 9:00 AM'
                END
                WHERE timeSlot IS NULL
            """)

    conn.commit()
    conn.close()


create_table()


# ── Decorators ────────────────────────────────────────────────────────────────
def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            flash("Please log in to continue.", "error")
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("is_admin"):
            flash("Admin access required.", "error")
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated


# ── Notification helpers ──────────────────────────────────────────────────────
def get_admin_notification_counts():
    conn = get_db_connection()
    new_reservations = conn.execute(
        "SELECT COUNT(*) FROM reservations WHERE isNew = 1 AND status = 'Pending'"
    ).fetchone()[0]
    new_feedbacks = conn.execute(
        """SELECT COUNT(*) FROM sit_in_history
           WHERE feedback IS NOT NULL AND feedback != '' AND feedbackSeen = 0"""
    ).fetchone()[0]
    conn.close()
    return {"new_reservations": new_reservations, "new_feedbacks": new_feedbacks}


def add_notification(user_id, message, notif_type="info"):
    conn = get_db_connection()
    conn.execute(
        "INSERT INTO notifications (userId, message, type) VALUES (?, ?, ?)",
        (user_id, message, notif_type)
    )
    conn.commit()
    conn.close()


# ── Public routes ─────────────────────────────────────────────────────────────
@app.route("/")
def landing():
    return render_template("landing_page/landingPage.html")


@app.route("/landing_page/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        idNumber        = request.form.get("idNumber", "")
        yearLevel       = request.form.get("yearLevel", "")
        lastName        = request.form.get("lastName", "")
        firstName       = request.form.get("firstName", "")
        middleName      = request.form.get("middleName", "")
        email           = request.form.get("email", "")
        course          = request.form.get("course", "")
        address         = request.form.get("address", "")
        password        = request.form.get("password", "")
        confirmPassword = request.form.get("confirmPassword", "")

        if password != confirmPassword:
            flash("Passwords do not match.", "error")
            return render_template("landing_page/registrationPage.html")

        conn = get_db_connection()
        if conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone():
            flash("That email is already registered.", "error")
            conn.close()
            return render_template("landing_page/registrationPage.html")

        if conn.execute("SELECT * FROM users WHERE idNumber = ?", (idNumber,)).fetchone():
            flash("That ID number is already in use.", "error")
            conn.close()
            return render_template("landing_page/registrationPage.html")

        default_sessions = 30 if course in ('BSIT', 'BSCS') else 20
        conn.execute("""
            INSERT INTO users
            (idNumber, firstName, middleName, lastName, email, yearLevel, course, address, password, sessions)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (idNumber, firstName, middleName, lastName, email, yearLevel, course, address, password, default_sessions))
        conn.commit()
        conn.close()
        flash(f"Account created successfully! Welcome, {firstName}.", "success")
        return redirect(url_for("login"))

    return render_template("landing_page/registrationPage.html")


@app.route("/landing_page/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email    = request.form.get("email", "")
        password = request.form.get("password", "")

        if email == ADMIN_EMAIL and password == ADMIN_PASSWORD:
            session["is_admin"]   = True
            session["admin_name"] = "CCS Admin"
            flash("Logged in as Administrator.", "success")
            return redirect(url_for("admin_home"))

        conn = get_db_connection()
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        conn.close()

        if user is None:
            flash("No account found with that email.", "error")
        elif user["password"] != password:
            flash("Incorrect password.", "error")
        else:
            session["user_id"]   = user["idNumber"]
            session["user_name"] = user["firstName"]
            flash(f"Welcome back, {user['firstName']}!", "success")
            return redirect(url_for("dashboard"))

    return render_template("landing_page/login.html")


@app.route("/landing_page/logout")
def logout():
    name = session.get("user_name") or session.get("admin_name", "")
    session.clear()
    flash(f"Logged out successfully. See you soon, {name}!" if name else "Logged out.", "success")
    return redirect(url_for("login"))


# ── Student routes ────────────────────────────────────────────────────────────
@app.route("/student/dashboard")
@login_required
def dashboard():
    conn          = get_db_connection()
    user          = conn.execute("SELECT * FROM users WHERE idNumber = ?", (session["user_id"],)).fetchone()
    announcements = conn.execute("SELECT * FROM announcements ORDER BY createdAt DESC").fetchall()
    notifications = conn.execute(
        "SELECT * FROM notifications WHERE userId = ? AND isRead = 0 ORDER BY createdAt DESC",
        (session["user_id"],)
    ).fetchall()
    conn.close()
    return render_template("student/dashboard.html", user=user, announcements=announcements,
                           notifications=notifications)


@app.route("/student/notifications")
@login_required
def get_student_notifications():
    conn = get_db_connection()
    notifs = conn.execute(
        """SELECT id, userId, message, isRead, type,
                  strftime('%Y-%m-%d %H:%M:%S', createdAt) as createdAt
           FROM notifications
           WHERE userId = ?
           ORDER BY createdAt DESC
           LIMIT 50""",
        (session["user_id"],)
    ).fetchall()
    unread = conn.execute(
        "SELECT COUNT(*) FROM notifications WHERE userId = ? AND isRead = 0",
        (session["user_id"],)
    ).fetchone()[0]
    conn.close()
    return jsonify({
        "notifications": [dict(n) for n in notifs],
        "unread_count":  unread
    })


@app.route("/student/notifications/mark-read", methods=["POST"])
@login_required
def mark_notifications_read():
    conn = get_db_connection()
    conn.execute("UPDATE notifications SET isRead = 1 WHERE userId = ?", (session["user_id"],))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/student/reservations/clear", methods=["POST"])
@login_required
def student_clear_reservations():
    conn = get_db_connection()
    conn.execute("DELETE FROM reservations WHERE studentId = ?", (session["user_id"],))
    conn.commit()
    conn.close()
    flash("All your reservations have been cleared.", "success")
    return redirect(url_for("reservation"))


@app.route("/student/edit-profile", methods=["GET", "POST"])
@login_required
def edit_profile():
    if request.method == "POST":
        conn       = get_db_connection()
        user       = conn.execute("SELECT * FROM users WHERE idNumber = ?", (session["user_id"],)).fetchone()
        firstName  = request.form.get("firstName", "")
        middleName = request.form.get("middleName", "")
        lastName   = request.form.get("lastName", "")
        email      = request.form.get("email", "")
        yearLevel  = request.form.get("yearLevel", "")
        course     = request.form.get("course", "")
        address    = request.form.get("address", "")
        profile_image = user["profileImage"]
        file = request.files.get("profileImage")
        if file and file.filename != "":
            filename = f"{session['user_id']}.jpg"
            file.save(os.path.join(app.config["UPLOAD_FOLDER"], filename))
            profile_image = filename
        conn.execute("""
            UPDATE users SET firstName=?, middleName=?, lastName=?, email=?,
                yearLevel=?, course=?, address=?, profileImage=? WHERE idNumber=?
        """, (firstName, middleName, lastName, email, yearLevel, course, address, profile_image, session["user_id"]))
        conn.commit()
        conn.close()
        session["user_name"] = firstName
        flash("Profile updated successfully!", "success")
        return redirect(url_for("dashboard"))

    conn  = get_db_connection()
    user  = conn.execute("SELECT * FROM users WHERE idNumber = ?", (session["user_id"],)).fetchone()
    conn.close()
    return render_template("student/editProfile.html", user=user)


@app.route("/student/history")
@login_required
def history():
    conn    = get_db_connection()
    user    = conn.execute("SELECT * FROM users WHERE idNumber = ?", (session["user_id"],)).fetchone()
    records = conn.execute(
        "SELECT * FROM sit_in_history WHERE studentId = ? ORDER BY timeIn DESC",
        (session["user_id"],)
    ).fetchall()
    conn.close()
    return render_template("student/history.html", user=user, records=records)


@app.route("/student/history/feedback/<int:record_id>", methods=["POST"])
@login_required
def submit_feedback(record_id):
    feedback = request.form.get("feedback", "").strip()
    rating   = request.form.get("rating", "3")
    try:
        rating = int(rating)
        if rating < 1 or rating > 5:
            rating = 3
    except Exception:
        rating = 3

    if not feedback:
        flash("Feedback cannot be empty.", "error")
        return redirect(url_for("history"))

    feedback_lower = feedback.lower()
    for word in sorted(FOUL_WORDS, key=len, reverse=True):
        if word.lower() in feedback_lower:
            flash("Your feedback contains inappropriate language and could not be submitted. "
                  "Please revise it and try again.", "error")
            return redirect(url_for("history"))

    conn   = get_db_connection()
    record = conn.execute(
        "SELECT * FROM sit_in_history WHERE id = ? AND studentId = ?",
        (record_id, session["user_id"])
    ).fetchone()

    if not record:
        flash("Session record not found.", "error")
        conn.close()
        return redirect(url_for("history"))

    if record["feedback"]:
        flash("Already submitted feedback for this session.", "error")
        conn.close()
        return redirect(url_for("history"))

    if record["status"] != "Done":
        flash("Can only submit feedback for completed sessions.", "error")
        conn.close()
        return redirect(url_for("history"))

    user = conn.execute(
        "SELECT firstName, lastName FROM users WHERE idNumber = ?",
        (session["user_id"],)
    ).fetchone()
    student_name = f"{user['firstName']} {user['lastName']}" if user else session["user_id"]
    lab_room     = record["labRoom"] or "Unknown Lab"

    conn.execute(
        "UPDATE sit_in_history SET feedback = ?, feedbackRating = ?, feedbackSeen = 0 WHERE id = ?",
        (feedback, rating, record_id)
    )
    conn.commit()
    conn.close()

    add_notification(
        "ADMIN",
        f"📝 New feedback from {student_name} for {lab_room} (Rating: {'★' * rating}{'☆' * (5 - rating)}): \"{feedback[:80]}{'...' if len(feedback) > 80 else ''}\"",
        "info"
    )

    flash("Feedback submitted! Thank you.", "success")
    return redirect(url_for("history"))


@app.route("/student/task-complete/<int:sit_id>", methods=["POST"])
@login_required
def student_task_complete(sit_id):
    conn = get_db_connection()
    conn.execute(
        "UPDATE sit_in_history SET taskCompleted = 1 WHERE id = ? AND studentId = ?",
        (sit_id, session["user_id"])
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/student/reservation", methods=["GET"])
@login_required
def reservation():
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE idNumber = ?", (session["user_id"],)).fetchone()
    my_reservations = conn.execute(
        "SELECT * FROM reservations WHERE studentId = ? ORDER BY createdAt DESC",
        (session["user_id"],)
    ).fetchall()
    notifications = conn.execute(
        "SELECT * FROM notifications WHERE userId = ? AND isRead = 0 ORDER BY createdAt DESC",
        (session["user_id"],)
    ).fetchall()
    active_sitin = conn.execute(
        """SELECT id, labRoom, timeIn FROM sit_in_history
           WHERE studentId = ? AND status = 'Active' LIMIT 1""",
        (session["user_id"],)
    ).fetchone()
    conn.close()
    occupied_pcs = []
    return render_template("student/reservation.html",
                           user=user,
                           my_reservations=my_reservations,
                           occupied_pcs=occupied_pcs,
                           notifications=notifications,
                           active_sitin=active_sitin)


@app.route("/student/reserve", methods=["POST"])
@login_required
def student_reserve():
    lab_room     = request.form.get("labRoom", "").strip()
    reserve_date = request.form.get("reserveDate", "").strip()
    time_slot    = request.form.get("timeSlot", "").strip()
    pc_number    = request.form.get("pcNumber", "").strip()
    purpose      = request.form.get("purpose", "").strip()

    if not all([lab_room, reserve_date, time_slot, pc_number, purpose]):
        flash("All fields are required.", "error")
        return redirect(url_for("reservation"))

    conn = get_db_connection()

    active_sitin = conn.execute(
        "SELECT id FROM sit_in_history WHERE studentId = ? AND status = 'Active'",
        (session["user_id"],)
    ).fetchone()
    if active_sitin:
        conn.close()
        flash("You cannot make a reservation while you have an active sit-in session.", "error")
        return redirect(url_for("reservation"))

    conflict = conn.execute("""
        SELECT id FROM reservations
        WHERE labRoom=? AND reserveDate=? AND timeSlot=? AND pcNumber=? AND status != 'Rejected'
    """, (lab_room, reserve_date, time_slot, pc_number)).fetchone()

    if conflict:
        flash("That PC is already reserved for the selected time slot.", "error")
        conn.close()
        return redirect(url_for("reservation"))

    conn.execute("""
        INSERT INTO reservations (studentId, labRoom, pcNumber, reserveDate, timeSlot, purpose, isNew)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    """, (session["user_id"], lab_room, int(pc_number), reserve_date, time_slot, purpose))
    conn.commit()
    conn.close()

    flash("Reservation submitted! Pending admin approval.", "success")
    return redirect(url_for("reservation"))


@app.route("/student/check-availability")
def check_availability():
    # Allow both logged-in students and admin
    if not session.get("user_id") and not session.get("is_admin"):
        return jsonify({"error": "Unauthorized"}), 401

    lab   = request.args.get("lab", "")
    date  = request.args.get("date", "")
    slot  = request.args.get("slot", "")
    qtype = request.args.get("type", "pcs")

    conn = get_db_connection()

    if qtype == "slots":
        # Slots blocked by lab schedule with no override PCs
        sched_blocked = []
        sched_rows = conn.execute("""
            SELECT id, timeSlot FROM lab_schedules
            WHERE labRoom = ? AND schedDate = ?
        """, (lab, date)).fetchall()
        for sched in sched_rows:
            if not sched["timeSlot"]:
                continue
            override_count = conn.execute(
                "SELECT COUNT(*) FROM schedule_pc_overrides WHERE scheduleId = ?",
                (sched["id"],)
            ).fetchone()[0]
            if override_count == 0:
                sched_blocked.append(sched["timeSlot"])

        # Slots fully booked via reservations (all 40 PCs taken)
        resv_rows = conn.execute("""
            SELECT timeSlot, COUNT(DISTINCT pcNumber) as cnt
            FROM reservations
            WHERE labRoom=? AND reserveDate=? AND status != 'Rejected'
            GROUP BY timeSlot
        """, (lab, date)).fetchall()
        resv_blocked = [r["timeSlot"] for r in resv_rows if r["cnt"] >= 40]

        conn.close()
        blocked = list(set(sched_blocked + resv_blocked))
        return jsonify({"blocked_slots": blocked})

    else:
        # ── type=pcs ──────────────────────────────────────────────────────────

        # 1. ALL active sit-ins for this lab right now (direct admin sit-ins)
        #    No date filter — these are LIVE sessions happening right now
        direct_sitin_rows = conn.execute("""
            SELECT pcNumber FROM sit_in_history
            WHERE labRoom = ? AND status = 'Active' AND pcNumber IS NOT NULL
        """, (lab,)).fetchall()
        direct_sitin_pcs = [r["pcNumber"] for r in direct_sitin_rows]

        # 2. Active sit-ins that came FROM an approved reservation for this slot
        resv_sitin_rows = conn.execute("""
            SELECT r.pcNumber
            FROM reservations r
            JOIN sit_in_history s ON s.id = r.sitInId
            WHERE r.labRoom = ? AND r.reserveDate = ? AND r.timeSlot = ?
              AND r.status = 'Approved' AND s.status = 'Active'
        """, (lab, date, slot)).fetchall()
        resv_sitin_pcs = [r["pcNumber"] for r in resv_sitin_rows]

        all_inuse_pcs = list(set(direct_sitin_pcs + resv_sitin_pcs))

        # 3. Approved reservations not yet sitting in
        reserved_rows = conn.execute("""
            SELECT pcNumber FROM reservations
            WHERE labRoom=? AND reserveDate=? AND timeSlot=?
              AND status='Approved' AND sitInId IS NULL
        """, (lab, date, slot)).fetchall()
        reserved_pcs = [r["pcNumber"] for r in reserved_rows
                        if r["pcNumber"] not in all_inuse_pcs]

        # 4. Pending reservations
        pending_rows = conn.execute("""
            SELECT pcNumber FROM reservations
            WHERE labRoom=? AND reserveDate=? AND timeSlot=? AND status='Pending'
        """, (lab, date, slot)).fetchall()
        pending_pcs = [r["pcNumber"] for r in pending_rows
                       if r["pcNumber"] not in all_inuse_pcs
                       and r["pcNumber"] not in reserved_pcs]

        # 5. Schedule-blocked PCs (in-class, minus override PCs)
        sched_rows = conn.execute("""
            SELECT id, timeSlot as schedSlot FROM lab_schedules
            WHERE labRoom = ? AND schedDate = ?
        """, (lab, date)).fetchall()

        sched_inuse = []
        for sched in sched_rows:
            if sched["schedSlot"] != slot:
                continue
            overrides = conn.execute("""
                SELECT pcNumber FROM schedule_pc_overrides
                WHERE scheduleId = ? AND status = 'available'
            """, (sched["id"],)).fetchall()
            available_set = {r["pcNumber"] for r in overrides}
            for pc in range(1, 41):
                if pc not in available_set and pc not in all_inuse_pcs:
                    sched_inuse.append(pc)

        conn.close()
        return jsonify({
            "inuse":    list(set(all_inuse_pcs + sched_inuse)),
            "reserved": reserved_pcs,
            "pending":  pending_pcs,
        })

# ── Admin context processor ───────────────────────────────────────────────────
@app.context_processor
def inject_admin_notifs():
    if session.get("is_admin"):
        return get_admin_notification_counts()
    return {"new_reservations": 0, "new_feedbacks": 0}


# ── Admin routes ──────────────────────────────────────────────────────────────
@app.route("/admin")
@admin_required
def admin_home():
    conn = get_db_connection()
    total_registered = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    currently_sitin  = conn.execute("SELECT COUNT(*) FROM sit_in_history WHERE status='Active'").fetchone()[0]
    total_sitin      = conn.execute("SELECT COUNT(*) FROM sit_in_history").fetchone()[0]
    announcements    = conn.execute("SELECT * FROM announcements ORDER BY createdAt DESC").fetchall()
    conn.close()
    return render_template("admin/home.html",
                           total_registered=total_registered,
                           currently_sitin=currently_sitin,
                           total_sitin=total_sitin,
                           announcements=announcements)


@app.route("/admin/announcement", methods=["POST"])
@admin_required
def admin_announcement():
    title   = request.form.get("title", "").strip()
    content = request.form.get("content", "").strip()

    if not content:
        flash("Content cannot be empty.", "error")
        return redirect(url_for("admin_home"))

    conn = get_db_connection()
    conn.execute(
        "INSERT INTO announcements (title, content, createdBy) VALUES (?, ?, ?)",
        (title, content, "CCS Admin")
    )
    conn.commit()
    students = conn.execute("SELECT idNumber FROM users").fetchall()
    conn.close()

    headline = title if title else content[:60]
    for s in students:
        add_notification(s["idNumber"], f"📢 New Announcement: {headline}", "info")

    flash("Announcement posted!", "success")
    return redirect(url_for("admin_home"))


@app.route("/admin/announcement/delete/<int:ann_id>", methods=["POST"])
@admin_required
def admin_delete_announcement(ann_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM announcements WHERE id = ?", (ann_id,))
    conn.commit()
    conn.close()
    flash("Announcement deleted.", "success")
    return redirect(url_for("admin_home"))


@app.route("/admin/search-api", methods=["POST"])
@admin_required
def admin_search_api():
    query   = request.form.get("query", "").strip()
    conn    = get_db_connection()
    student = conn.execute(
        "SELECT * FROM users WHERE idNumber LIKE ? OR firstName LIKE ? OR lastName LIKE ?",
        (f"%{query}%", f"%{query}%", f"%{query}%")
    ).fetchone()
    conn.close()

    if not student:
        return jsonify({"found": False})

    return jsonify({
        "found":     True,
        "idNumber":  student["idNumber"],
        "firstName": student["firstName"],
        "lastName":  student["lastName"],
        "course":    student["course"],
        "yearLevel": student["yearLevel"],
        "sessions":  student["sessions"] if student["sessions"] is not None else (30 if student["course"] in ('BSIT', 'BSCS') else 20),
    })

@app.route("/admin/sitin", methods=["POST"])
@admin_required
def admin_sitin():
    student_id = request.form.get("student_id")
    purpose    = request.form.get("purpose")
    lab        = request.form.get("lab")
    pc_number  = request.form.get("pc_number", "").strip()   # NEW — optional

    conn    = get_db_connection()
    student = conn.execute("SELECT * FROM users WHERE idNumber = ?", (student_id,)).fetchone()

    if not student:
        flash("Student not found.", "error")
        conn.close()
        return redirect(url_for("admin_home"))

    if student["sessions"] is not None and student["sessions"] <= 0:
        flash(f"{student['firstName']} {student['lastName']} has no remaining sessions.", "error")
        conn.close()
        return redirect(url_for("admin_home"))

    # Store pcNumber if provided
    pc_val = int(pc_number) if pc_number.isdigit() else None

    conn.execute(
        "INSERT INTO sit_in_history (studentId, labRoom, purpose, pcNumber) VALUES (?, ?, ?, ?)",
        (student_id, lab, purpose, pc_val)
    )
    conn.commit()
    conn.close()

    pc_info = f" at PC {pc_val}" if pc_val else ""
    flash(
        f"Sit-in recorded for {student['firstName']} {student['lastName']} "
        f"in Lab {lab}{pc_info}.",
        "success"
    )
    return redirect(url_for("admin_home"))

@app.route("/admin/students")
@admin_required
def admin_students():
    conn     = get_db_connection()
    students = conn.execute("SELECT * FROM users ORDER BY rowid DESC").fetchall()
    conn.close()
    return render_template("admin/students.html", students=students)


@app.route("/admin/students/edit/<string:student_id>", methods=["GET", "POST"])
@admin_required
def admin_edit_student(student_id):
    conn    = get_db_connection()
    student = conn.execute("SELECT * FROM users WHERE idNumber = ?", (student_id,)).fetchone()
    if request.method == "POST":
        firstName  = request.form.get("firstName", "")
        middleName = request.form.get("middleName", "")
        lastName   = request.form.get("lastName", "")
        email      = request.form.get("email", "")
        yearLevel  = request.form.get("yearLevel", "")
        course     = request.form.get("course", "")
        sessions   = request.form.get("sessions") or (30 if student["course"] in ('BSIT', 'BSCS') else 20)
        conn.execute("""
            UPDATE users SET firstName=?, middleName=?, lastName=?, email=?,
            yearLevel=?, course=?, sessions=? WHERE idNumber=?
        """, (firstName, middleName, lastName, email, yearLevel, course, sessions, student_id))
        conn.commit()
        conn.close()
        flash("Student record updated successfully.", "success")
        return redirect(url_for("admin_students"))
    conn.close()
    return render_template("admin/edit_student.html", student=student)


@app.route("/admin/students/delete/<string:student_id>", methods=["POST"])
@admin_required
def admin_delete_student(student_id):
    conn    = get_db_connection()
    student = conn.execute("SELECT * FROM users WHERE idNumber = ?", (student_id,)).fetchone()
    name    = f"{student['firstName']} {student['lastName']}" if student else "Student"
    conn.execute("DELETE FROM users WHERE idNumber = ?", (student_id,))
    conn.commit()
    conn.close()
    flash(f"{name} removed from the system.", "success")
    return redirect(url_for("admin_students"))


@app.route("/admin/students/reset_sessions", methods=["POST"])
@admin_required
def admin_reset_sessions():
    conn = get_db_connection()
    conn.execute("UPDATE users SET sessions = CASE WHEN course IN ('BSIT', 'BSCS') THEN 30 ELSE 20 END")
    conn.commit()
    conn.close()
    flash("All student sessions reset.", "success")
    return redirect(url_for("admin_students"))


@app.route("/admin/students/add", methods=["POST"])
@admin_required
def admin_add_student():
    idNumber        = request.form.get("idNumber", "").strip()
    yearLevel       = request.form.get("yearLevel", "")
    lastName        = request.form.get("lastName", "").strip()
    firstName       = request.form.get("firstName", "").strip()
    middleName      = request.form.get("middleName", "").strip()
    email           = request.form.get("email", "").strip()
    course          = request.form.get("course", "")
    address         = request.form.get("address", "").strip()
    password        = request.form.get("password", "")
    confirmPassword = request.form.get("confirmPassword", "")

    if password != confirmPassword:
        flash("Passwords do not match.", "error")
        return redirect(url_for("admin_students"))

    conn = get_db_connection()
    if conn.execute("SELECT 1 FROM users WHERE idNumber = ?", (idNumber,)).fetchone():
        flash("That ID number is already registered.", "error")
        conn.close()
        return redirect(url_for("admin_students"))
    if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        flash("That email is already registered.", "error")
        conn.close()
        return redirect(url_for("admin_students"))

    default_sessions = 30 if course in ('BSIT', 'BSCS') else 20
    conn.execute("""
        INSERT INTO users
        (idNumber, firstName, middleName, lastName, email, yearLevel, course, address, password, sessions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (idNumber, firstName, middleName, lastName, email, yearLevel, course, address, password, default_sessions))
    conn.commit()
    conn.close()
    flash(f"Student {firstName} {lastName} added.", "success")
    return redirect(url_for("admin_students"))


@app.route("/admin/current-sitin")
@admin_required
def admin_current_sitin():
    conn    = get_db_connection()
    records = conn.execute("""
        SELECT s.*, u.firstName, u.lastName
        FROM sit_in_history s
        JOIN users u ON s.studentId = u.idNumber
        WHERE s.status = 'Active'
        ORDER BY s.timeIn DESC
    """).fetchall()
    conn.close()
    return render_template("admin/current_sitin.html", records=records)


@app.route("/admin/logout-sitin/<int:sit_id>", methods=["POST"])
@admin_required
def admin_logout_sitin(sit_id):
    admin_rating  = request.form.get("adminRating", "0")
    task_complete = request.form.get("taskCompleted", "0")
    try:
        admin_rating  = int(admin_rating)
        task_complete = int(task_complete)
    except Exception:
        admin_rating  = 0
        task_complete = 0

    conn   = get_db_connection()
    record = conn.execute(
        """SELECT s.*, u.firstName, u.lastName
           FROM sit_in_history s JOIN users u ON s.studentId = u.idNumber
           WHERE s.id = ?""",
        (sit_id,)
    ).fetchone()

    if record:
        time_in = record["timeIn"]
        try:
            dt_in      = datetime.strptime(time_in, "%Y-%m-%d %H:%M:%S")
            dt_out     = datetime.now()
            total_mins = int((dt_out - dt_in).total_seconds() / 60)
        except Exception:
            total_mins = 0

        conn.execute("""
            UPDATE sit_in_history
            SET status='Done', timeOut=CURRENT_TIMESTAMP,
                adminRating=?, taskCompleted=?, totalMinutes=?
            WHERE id=?
        """, (admin_rating, task_complete, total_mins, sit_id))
        conn.execute("UPDATE users SET sessions = MAX(0, sessions - 1) WHERE idNumber = ?",
                     (record["studentId"],))
        conn.commit()
        flash(f"{record['firstName']} {record['lastName']} logged out. 1 session deducted.", "success")
    else:
        flash("Sit-in record not found.", "error")
    conn.close()
    return redirect(url_for("admin_current_sitin"))


@app.route("/admin/sitin-records")
@admin_required
def admin_sitin_records():
    conn = get_db_connection()
    records = conn.execute("""
        SELECT s.*, u.firstName, u.lastName, u.course, u.yearLevel
        FROM sit_in_history s
        JOIN users u ON s.studentId = u.idNumber
        ORDER BY s.timeIn DESC
    """).fetchall()
    top_students = conn.execute("""
        SELECT s.studentId, u.firstName, u.lastName, u.course,
               COUNT(*) AS total_sessions
        FROM sit_in_history s
        JOIN users u ON s.studentId = u.idNumber
        GROUP BY s.studentId
        ORDER BY total_sessions DESC
        LIMIT 5
    """).fetchall()
    conn.close()
    return render_template("admin/sitin_records.html",
                           records=records,
                           top_students=top_students)


@app.route("/admin/sitin-reports")
@admin_required
def admin_sitin_reports():
    conn = get_db_connection()
    records = conn.execute("""
        SELECT s.*, u.firstName, u.lastName, u.course, u.yearLevel
        FROM sit_in_history s
        JOIN users u ON s.studentId = u.idNumber
        ORDER BY s.timeIn DESC
    """).fetchall()
    conn.close()
    return render_template("admin/sitin_reports.html", records=records)


@app.route("/admin/feedback-reports")
@admin_required
def admin_feedback_reports():
    conn = get_db_connection()
    feedbacks = conn.execute("""
        SELECT s.id, s.studentId, s.labRoom, s.timeIn, s.feedback, s.feedbackRating,
               u.firstName, u.lastName
        FROM sit_in_history s
        JOIN users u ON s.studentId = u.idNumber
        WHERE s.feedback IS NOT NULL AND s.feedback != ''
        ORDER BY s.timeIn DESC
    """).fetchall()
    conn.execute(
        "UPDATE sit_in_history SET feedbackSeen = 1 WHERE feedback IS NOT NULL AND feedbackSeen = 0"
    )
    conn.commit()
    conn.close()
    return render_template("admin/feedback_reports.html", feedbacks=feedbacks)


# ── Admin Reservation ─────────────────────────────────────────────────────────
@app.route("/admin/reservation")
@admin_required
def admin_reservation():
    conn = get_db_connection()
    conn.execute("UPDATE reservations SET isNew = 0 WHERE status = 'Pending'")
    conn.commit()

    reservations = conn.execute("""
        SELECT r.*, u.firstName, u.lastName, u.course,
               sih.status as sitInStatus
        FROM reservations r
        JOIN users u ON r.studentId = u.idNumber
        LEFT JOIN sit_in_history sih ON sih.id = r.sitInId
        ORDER BY r.createdAt DESC
    """).fetchall()

    logs = conn.execute("""
        SELECT * FROM reservation_logs ORDER BY createdAt DESC LIMIT 50
    """).fetchall()

    schedules = conn.execute("""
        SELECT ls.*, COUNT(spo.id) as override_count
        FROM lab_schedules ls
        LEFT JOIN schedule_pc_overrides spo ON spo.scheduleId = ls.id
        GROUP BY ls.id
        ORDER BY ls.schedDate DESC, ls.timeSlot
    """).fetchall()

    conn.close()
    return render_template("admin/reservation.html",
                           reservations=reservations,
                           logs=logs,
                           schedules=schedules)


@app.route("/admin/reservation/action/<int:resv_id>", methods=["POST"])
@admin_required
def admin_reservation_action(resv_id):
    action        = request.form.get("action", "")
    reject_reason = request.form.get("rejectReason", "").strip()

    conn = get_db_connection()
    resv = conn.execute(
        """SELECT r.*, u.firstName, u.lastName
           FROM reservations r JOIN users u ON r.studentId = u.idNumber
           WHERE r.id = ?""",
        (resv_id,)
    ).fetchone()

    if not resv:
        conn.close()
        flash("Reservation not found.", "error")
        return redirect(url_for("admin_reservation"))

    if action == "approve":
        conn.execute("UPDATE reservations SET status = 'Approved' WHERE id = ?", (resv_id,))
        conn.execute("""
            INSERT INTO reservation_logs
            (reservationId, studentId, firstName, lastName, action, details)
            VALUES (?, ?, ?, ?, 'Approved', ?)
        """, (resv_id, resv["studentId"], resv["firstName"], resv["lastName"],
              f"Lab {resv['labRoom']} · PC {resv['pcNumber']} · {resv['reserveDate']} · {resv['timeSlot']}"))
        conn.commit()
        add_notification(
            resv["studentId"],
            f"✅ Your reservation for Lab {resv['labRoom']} PC {resv['pcNumber']} "
            f"on {resv['reserveDate']} ({resv['timeSlot']}) has been approved!",
            "success"
        )
        flash(f"Reservation approved for {resv['firstName']} {resv['lastName']}.", "success")

    elif action == "reject":
        if not reject_reason:
            conn.close()
            flash("A reason is required to reject a reservation.", "error")
            return redirect(url_for("admin_reservation"))
        conn.execute(
            "UPDATE reservations SET status = 'Rejected', rejectReason = ? WHERE id = ?",
            (reject_reason, resv_id)
        )
        conn.execute("""
            INSERT INTO reservation_logs
            (reservationId, studentId, firstName, lastName, action, details)
            VALUES (?, ?, ?, ?, 'Rejected', ?)
        """, (resv_id, resv["studentId"], resv["firstName"], resv["lastName"],
              f"Reason: {reject_reason}"))
        conn.commit()
        add_notification(
            resv["studentId"],
            f"❌ Your reservation for Lab {resv['labRoom']} PC {resv['pcNumber']} "
            f"on {resv['reserveDate']} was rejected. Reason: {reject_reason}",
            "error"
        )
        flash(f"Reservation rejected for {resv['firstName']} {resv['lastName']}.", "success")
    else:
        flash("Invalid action.", "error")

    conn.close()
    return redirect(url_for("admin_reservation"))


@app.route("/admin/reservation/sitin/<int:resv_id>", methods=["POST"])
@admin_required
def admin_reservation_sitin(resv_id):
    conn = get_db_connection()
    resv = conn.execute(
        """SELECT r.*, u.firstName, u.lastName, u.sessions
           FROM reservations r JOIN users u ON r.studentId = u.idNumber
           WHERE r.id = ? AND r.status = 'Approved'""",
        (resv_id,)
    ).fetchone()

    if not resv:
        conn.close()
        flash("Reservation not found or not approved.", "error")
        return redirect(url_for("admin_reservation"))

    if resv["sitInId"]:
        conn.close()
        flash("Student is already sitting in for this reservation.", "error")
        return redirect(url_for("admin_reservation"))

    if resv["sessions"] is not None and resv["sessions"] <= 0:
        conn.close()
        flash(f"{resv['firstName']} {resv['lastName']} has no remaining sessions.", "error")
        return redirect(url_for("admin_reservation"))

    cur = conn.execute(
        "INSERT INTO sit_in_history (studentId, labRoom, purpose) VALUES (?, ?, ?)",
        (resv["studentId"], resv["labRoom"], resv["purpose"])
    )
    sit_in_id = cur.lastrowid
    conn.execute("UPDATE reservations SET sitInId = ? WHERE id = ?", (sit_in_id, resv_id))
    conn.commit()
    conn.close()

    flash(
        f"{resv['firstName']} {resv['lastName']} is now sitting in at Lab {resv['labRoom']}, "
        f"PC {resv['pcNumber']}.",
        "success"
    )
    return redirect(url_for("admin_reservation"))


# ── Lab Schedule management ───────────────────────────────────────────────────
@app.route("/admin/lab-schedule/add", methods=["POST"])
@admin_required
def admin_add_schedule():
    lab_room    = request.form.get("labRoom", "").strip()
    sched_date  = request.form.get("schedDate", "").strip()
    time_slot   = request.form.get("timeSlot", "").strip()   # now a slot label
    description = request.form.get("description", "").strip()

    if not all([lab_room, sched_date, time_slot]):
        flash("All schedule fields are required.", "error")
        return redirect(url_for("admin_reservation"))

    if time_slot not in SLOT_TIMES:
        flash("Invalid time slot selected.", "error")
        return redirect(url_for("admin_reservation"))

    conn = get_db_connection()
    conn.execute("""
        INSERT INTO lab_schedules (labRoom, schedDate, timeSlot, description)
        VALUES (?, ?, ?, ?)
    """, (lab_room, sched_date, time_slot, description))
    conn.commit()
    conn.close()
    flash(f"Schedule added for Lab {lab_room} on {sched_date} ({time_slot}).", "success")
    return redirect(url_for("admin_reservation"))


@app.route("/admin/lab-schedule/delete/<int:sched_id>", methods=["POST"])
@admin_required
def admin_delete_schedule(sched_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM schedule_pc_overrides WHERE scheduleId = ?", (sched_id,))
    conn.execute("DELETE FROM lab_schedules WHERE id = ?", (sched_id,))
    conn.commit()
    conn.close()
    flash("Schedule deleted.", "success")
    return redirect(url_for("admin_reservation"))


@app.route("/admin/lab-schedule/<int:sched_id>/pcs")
@admin_required
def admin_schedule_pcs(sched_id):
    conn     = get_db_connection()
    schedule = conn.execute("SELECT * FROM lab_schedules WHERE id = ?", (sched_id,)).fetchone()
    overrides = conn.execute(
        "SELECT * FROM schedule_pc_overrides WHERE scheduleId = ?", (sched_id,)
    ).fetchall()
    conn.close()
    if not schedule:
        return jsonify({"error": "Not found"}), 404
    available_pcs = [r["pcNumber"] for r in overrides if r["status"] == "available"]
    return jsonify({
        "scheduleId":   sched_id,
        "labRoom":      schedule["labRoom"],
        "schedDate":    schedule["schedDate"],
        "timeSlot":     schedule["timeSlot"] or "",
        "description":  schedule["description"],
        "availablePcs": available_pcs
    })


@app.route("/admin/lab-schedule/<int:sched_id>/pcs/save", methods=["POST"])
@admin_required
def admin_save_schedule_pcs(sched_id):
    data          = request.get_json()
    available_pcs = data.get("availablePcs", [])

    conn = get_db_connection()
    conn.execute("DELETE FROM schedule_pc_overrides WHERE scheduleId = ?", (sched_id,))
    for pc in available_pcs:
        conn.execute("""
            INSERT INTO schedule_pc_overrides (scheduleId, pcNumber, status)
            VALUES (?, ?, 'available')
        """, (sched_id, int(pc)))
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "saved": len(available_pcs)})


# ── Analytics ─────────────────────────────────────────────────────────────────
HOURS_TARGET = 30

@app.route("/admin/analytics")
@admin_required
def admin_analytics():
    conn = get_db_connection()

    purpose_per_lab = [dict(r) for r in conn.execute("""
        SELECT labRoom, purpose, COUNT(*) as cnt
        FROM sit_in_history
        WHERE purpose IS NOT NULL AND purpose != ''
        GROUP BY labRoom, purpose
        ORDER BY labRoom, cnt DESC
    """).fetchall()]

    lab_visits = [dict(r) for r in conn.execute("""
        SELECT labRoom,
               COUNT(*)                       AS total_visits,
               COALESCE(SUM(totalMinutes), 0) AS total_minutes
        FROM sit_in_history
        GROUP BY labRoom
        ORDER BY total_visits DESC
    """).fetchall()]

    for row in lab_visits:
        row['total_visits']  = int(row['total_visits']  or 0)
        row['total_minutes'] = int(row['total_minutes'] or 0)
    for row in purpose_per_lab:
        row['cnt'] = int(row['cnt'] or 0)

    leaderboard_raw = conn.execute("""
        SELECT
            s.studentId,
            u.firstName, u.lastName, u.course, u.yearLevel,
            COUNT(*)                                              AS total_sessions,
            COALESCE(SUM(s.adminRating),  0)                     AS total_admin_rating,
            COALESCE(SUM(s.totalMinutes), 0)                     AS total_minutes,
            SUM(CASE WHEN s.taskCompleted = 1 THEN 1 ELSE 0 END) AS tasks_done
        FROM sit_in_history s
        JOIN users u ON s.studentId = u.idNumber
        GROUP BY s.studentId
        ORDER BY total_sessions DESC
    """).fetchall()

    conn.close()

    leaderboard = []
    for r in leaderboard_raw:
        total_sessions     = int(r["total_sessions"]     or 0)
        total_admin_rating = int(r["total_admin_rating"] or 0)
        total_minutes      = int(r["total_minutes"]      or 0)
        tasks_done         = int(r["tasks_done"]         or 0)

        hours_logged = total_minutes / 60.0
        rating_norm  = total_admin_rating / 3.0
        hours_norm   = min((hours_logged / HOURS_TARGET) * 100, 100)
        task_norm    = (tasks_done / total_sessions * 100) if total_sessions > 0 else 0
        composite    = (rating_norm * 0.50) + (hours_norm * 0.30) + (task_norm * 0.20)

        leaderboard.append({
            "studentId":          r["studentId"],
            "firstName":          r["firstName"],
            "lastName":           r["lastName"],
            "course":             r["course"],
            "yearLevel":          r["yearLevel"],
            "total_sessions":     total_sessions,
            "total_admin_rating": total_admin_rating,
            "total_minutes":      total_minutes,
            "tasks_done":         tasks_done,
            "task_rate":          round(task_norm,   1),
            "hours_norm":         round(hours_norm,  1),
            "rating_norm":        round(rating_norm, 2),
            "composite":          round(composite,   2),
        })

    leaderboard.sort(key=lambda x: x["composite"], reverse=True)
    leaderboard = leaderboard[:10]

    return render_template("admin/analytics.html",
                           purpose_per_lab=purpose_per_lab,
                           lab_visits=lab_visits,
                           leaderboard=leaderboard,
                           hours_target=HOURS_TARGET)


if __name__ == "__main__":
    app.run(debug=True)