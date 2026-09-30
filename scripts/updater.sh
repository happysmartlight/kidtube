#!/bin/sh
# ═══════════════════════════════════════════════════════════════════
# KidTube Home — updater sidecar
#
# Container KidTube khong the tu build lai chinh no: ben trong khong co
# git, khong co docker CLI, va cung khong co ma nguon. Nen viec cap nhat
# duoc giao cho container nay — no co docker socket va thu muc repo cua
# host, va quan trong nhat: no KHONG bi khoi dong lai khi kidtube bi
# recreate, nen chay tron ven duoc den cuoi.
#
# Giao tiep voi API bang FILE trong thu muc /data/update (bind mount chung):
#   request.json   API -> updater    (yeu cau "check" hoac "update")
#   state.json     updater -> API    (nhip tim + ket qua, ghi nguyen khoi)
#   last-run.log   updater -> API    (log tho cua lan chay gan nhat)
#
# Co y KHONG mo API mang nao o day: chi doc file. Be mat tan cong cang
# nho cang tot khi trong tay dang cam docker socket.
# ═══════════════════════════════════════════════════════════════════
set -u

REPO="${KIDTUBE_REPO_DIR:-/repo}"
STATE_DIR="${KIDTUBE_UPDATE_DIR:-/data/update}"
SERVICE="${KIDTUBE_SERVICE:-kidtube}"
POLL_SEC="${KIDTUBE_POLL_SEC:-3}"
AUTO_CHECK_SEC="${KIDTUBE_AUTO_CHECK_SEC:-21600}" # tu kiem tra moi 6 gio
# Nhip tim ghi ra the nho, nen thua hon vong lap: poll file yeu cau la thao
# tac doc, re; con ghi moi 3 giay ca ngay thi khong dang.
HEARTBEAT_SEC="${KIDTUBE_HEARTBEAT_SEC:-10}"
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

REQ="$STATE_DIR/request.json"
STATE="$STATE_DIR/state.json"
LOG="$STATE_DIR/last-run.log"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*" >>"$LOG"; }

# Thu muc /data thuoc uid cua kidtube (PUID). Updater chay bang root nen
# ghi de duoc, nhung thu muc phai de kidtube tao duoc file request.
mkdir -p "$STATE_DIR"
chown "$PUID:$PGID" "$STATE_DIR" 2>/dev/null || true

# Repo tren host thuoc user khac root -> git tu choi voi "dubious ownership".
git config --global --add safe.directory '*' 2>/dev/null || true

# ── Trang thai giu qua cac vong lap ────────────────────────────────
REPO_OK=false
REPO_ERROR=""
REPO_JSON=null
PHASE=idle
# Doc lai tu state cu: mat dien roi bat lai van nho lan cap nhat truoc.
DEPLOYED="$(jq -r '.deployedCommit // ""' "$STATE" 2>/dev/null || echo '')"
LAST_RUN="$(jq -c '.lastRun // null' "$STATE" 2>/dev/null || echo null)"
[ -n "$LAST_RUN" ] || LAST_RUN=null

emit_state() {
  jq -n \
    --arg hb "$(now)" \
    --arg phase "$PHASE" \
    --arg deployed "$DEPLOYED" \
    --arg repoError "$REPO_ERROR" \
    --arg repoDir "$REPO" \
    --argjson repoOk "$REPO_OK" \
    --argjson repo "$REPO_JSON" \
    --argjson lastRun "$LAST_RUN" \
    '{
       heartbeatAt: $hb,
       phase: $phase,
       repoOk: $repoOk,
       repoDir: $repoDir,
       repoError: (if $repoError == "" then null else $repoError end),
       repo: $repo,
       deployedCommit: (if $deployed == "" then null else $deployed end),
       lastRun: $lastRun
     }' >"$STATE.tmp" 2>/dev/null && mv "$STATE.tmp" "$STATE"
}

# ── Doc tinh trang repo ────────────────────────────────────────────
# `fetch` that bai (mat mang) khong phai loi chet nguoi: van bao cao duoc
# thong tin local, chi la so "behind" co the cu.
refresh_repo() {
  if [ ! -d "$REPO/.git" ]; then
    REPO_OK=false
    REPO_JSON=null
    REPO_ERROR="Không thấy kho git tại '$REPO'. Đặt KIDTUBE_REPO_DIR trong .env thành đường dẫn thư mục đã git clone, rồi chạy 'docker compose up -d'."
    return 1
  fi

  REPO_OK=true
  REPO_ERROR=""

  fetch_error=""
  if ! git -C "$REPO" fetch --prune --quiet 2>/tmp/fetch.err; then
    fetch_error="$(tr -d '\r' </tmp/fetch.err | tail -n 2 | tr '\n' ' ')"
  fi

  branch="$(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  upstream="$(git -C "$REPO" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo '')"
  head="$(git -C "$REPO" rev-parse HEAD 2>/dev/null || echo '')"
  head_short="$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo '')"
  head_subject="$(git -C "$REPO" log -1 --pretty=%s 2>/dev/null || echo '')"
  head_date="$(git -C "$REPO" log -1 --pretty=%cI 2>/dev/null || echo '')"

  # Co thay doi chua commit -> KHONG duoc pull de len. Nguoi dung co the da
  # sua tay gi do; xoa mat cua ho la khong the chap nhan.
  if [ -n "$(git -C "$REPO" status --porcelain 2>/dev/null)" ]; then
    dirty=true
  else
    dirty=false
  fi

  behind=0
  pending='[]'
  if [ -n "$upstream" ]; then
    behind="$(git -C "$REPO" rev-list --count "HEAD..$upstream" 2>/dev/null || echo 0)"
    pending="$(git -C "$REPO" log --max-count=25 --pretty=format:'%h%x1f%s' "HEAD..$upstream" 2>/dev/null \
      | jq -R -s -c 'split("\n") | map(select(length > 0) | split("\u001f") | {short: .[0], subject: (.[1] // "")})' \
      2>/dev/null || echo '[]')"
    [ -n "$pending" ] || pending='[]'
  fi

  REPO_JSON="$(jq -n \
    --arg branch "$branch" \
    --arg upstream "$upstream" \
    --arg head "$head" \
    --arg headShort "$head_short" \
    --arg headSubject "$head_subject" \
    --arg headDate "$head_date" \
    --arg fetchError "$fetch_error" \
    --arg checkedAt "$(now)" \
    --argjson dirty "$dirty" \
    --argjson behind "${behind:-0}" \
    --argjson pending "$pending" \
    '{branch: $branch,
      upstream: (if $upstream == "" then null else $upstream end),
      head: $head, headShort: $headShort, headSubject: $headSubject, headDate: $headDate,
      dirty: $dirty, behind: $behind, pending: $pending, checkedAt: $checkedAt,
      fetchError: (if $fetchError == "" then null else $fetchError end)}')"

  # jq that bai thi tha bao "khong biet" con hon lam hong ca state.json.
  [ -n "$REPO_JSON" ] || REPO_JSON=null

  # Lan dau chay: coi nhu ban dang chay chinh la HEAD hien tai — dung ngay
  # sau khi nguoi dung `docker compose up -d --build` thu cong.
  [ -n "$DEPLOYED" ] || DEPLOYED="$head"
  return 0
}

finish_run() {
  # Cua ra duy nhat cua do_update -> cung la cho dung nhip tim nen, truoc khi
  # ghi ket qua. Neu khong, tien trinh nen co the dap de len ket qua bang mot
  # ban chup cu (no giu ban sao bien tu luc PHASE con la "updating").
  heartbeat_stop
  ok="$1"; step="$2"; err="$3"; from="$4"; to="$5"; action="$6"; started="$7"
  LAST_RUN="$(jq -n \
    --arg action "$action" --arg startedAt "$started" --arg finishedAt "$(now)" \
    --arg step "$step" --arg error "$err" --arg from "$from" --arg to "$to" \
    --argjson ok "$ok" \
    '{action: $action, startedAt: $startedAt, finishedAt: $finishedAt, ok: $ok, step: $step,
      error: (if $error == "" then null else $error end),
      fromCommit: (if $from == "" then null else $from end),
      toCommit: (if $to == "" then null else $to end)}')"
  PHASE=idle
  emit_state
}

# `git pull` + `docker compose build` co the mat vai phut. Trong khoang do
# vong lap chinh khong chay, tuc la khong co nhip tim nao — va API se ket
# luan rang updater da chet, dung luc no dang lam viec cham chi nhat.
# Nen: mot tien trinh nen chi lam moi viec dap nhip.
HEARTBEAT_PID=""

heartbeat_start() {
  (
    while true; do
      sleep "$HEARTBEAT_SEC"
      emit_state
    done
  ) &
  HEARTBEAT_PID=$!
}

heartbeat_stop() {
  [ -n "$HEARTBEAT_PID" ] || return 0
  kill "$HEARTBEAT_PID" 2>/dev/null || true
  wait "$HEARTBEAT_PID" 2>/dev/null || true
  HEARTBEAT_PID=""
}

# Chinh container nay cung can duoc cap nhat, neu khong no se dong bang mai
# mai o phien ban dau tien. Chi lam khi ma nguon cua no that su doi — viec
# nay ket thuc bang cach TU GIET minh, nen cang it xay ra cang tot.
#
# Lenh duoc gui cho Docker daemon: daemon van chay tron ven du tien trinh
# goi no bi ket lieu giua chung. Va vi da `finish_run` o tren nen ket qua
# cap nhat da nam an toan trong state.json roi.
self_update_if_needed() {
  from="$1"; to="$2"
  if git -C "$REPO" diff --quiet "$from" "$to" -- scripts/updater.sh Dockerfile.updater 2>/dev/null; then
    return 0
  fi
  log "Dịch vụ cập nhật có bản mới — tự dựng lại và khởi động lại chính nó."
  docker compose --project-directory "$REPO" -f "$REPO/docker-compose.yml"     --profile updater build kidtube-updater >>"$LOG" 2>&1 || {
    log "Không dựng lại được kidtube-updater — bỏ qua, bản cũ vẫn chạy."
    return 0
  }
  docker compose --project-directory "$REPO" -f "$REPO/docker-compose.yml"     --profile updater up -d --force-recreate kidtube-updater >>"$LOG" 2>&1 &
}

# ── Chay cap nhat that ─────────────────────────────────────────────
do_update() {
  started="$(now)"
  : >"$LOG"
  PHASE=updating
  emit_state
  heartbeat_start

  log "=== Bắt đầu cập nhật ==="

  if [ ! -d "$REPO/.git" ]; then
    log "LỖI: $REPO_ERROR"
    finish_run false "kiểm tra repo" "$REPO_ERROR" "" "" update "$started"
    return
  fi

  if [ -n "$(git -C "$REPO" status --porcelain 2>/dev/null)" ]; then
    msg="Thư mục cài đặt có thay đổi chưa commit — dừng lại để không xoá mất. Xử lý trên Pi rồi thử lại: cd $REPO && git status"
    log "LỖI: $msg"
    finish_run false "kiểm tra repo" "$msg" "" "" update "$started"
    return
  fi

  from="$(git -C "$REPO" rev-parse HEAD)"

  log "--- git pull --ff-only ---"
  if ! git -C "$REPO" pull --ff-only >>"$LOG" 2>&1; then
    msg="$(tail -n 3 "$LOG" | tr '\n' ' ')"
    log "LỖI khi git pull"
    finish_run false "git pull" "${msg:-git pull thất bại}" "$from" "" update "$started"
    refresh_repo
    emit_state
    return
  fi

  to="$(git -C "$REPO" rev-parse HEAD)"
  log "HEAD: $from -> $to"

  if [ "$from" = "$to" ]; then
    log "Không có gì mới — bỏ qua bước build."
    DEPLOYED="$to"
    finish_run true "đã là bản mới nhất" "" "$from" "$to" update "$started"
    refresh_repo
    emit_state
    return
  fi

  log "--- docker compose up -d --build $SERVICE ---"
  # `--project-directory` tro toi duong dan HOST (repo duoc bind mount vao
  # dung duong dan cu) -> moi bind mount tuong doi trong compose van giai
  # ra dung cho tren host, va build context doc duoc tu trong container.
  # GIT_COMMIT di vao build arg de ban dang chay biet no dung tu commit nao.
  if GIT_COMMIT="$to" BUILD_TIME="$(now)" docker compose \
    --project-directory "$REPO" -f "$REPO/docker-compose.yml" \
    up -d --build "$SERVICE" >>"$LOG" 2>&1; then
    log "=== Cập nhật xong ==="
    DEPLOYED="$to"
    finish_run true "hoàn tất" "" "$from" "$to" update "$started"
    self_update_if_needed "$from" "$to"
  else
    msg="$(tail -n 5 "$LOG" | tr '\n' ' ')"
    log "=== Build thất bại ==="
    finish_run false "docker compose build" "${msg:-docker compose thất bại}" "$from" "$to" update "$started"
  fi

  refresh_repo
  emit_state
}

# ── Vong lap chinh ─────────────────────────────────────────────────
refresh_repo
emit_state
last_auto_check="$(date +%s)"
last_beat="$(date +%s)"

while true; do
  if [ -f "$REQ" ]; then
    action="$(jq -r '.action // "check"' "$REQ" 2>/dev/null || echo check)"
    # Xoa TRUOC khi chay: lo co chet giua chung thi cung khong lap vo han.
    rm -f "$REQ"

    case "$action" in
      update)
        do_update
        heartbeat_stop
        # Ghi lai lan cuoi: tien trinh nen co the da dap de mot state cu.
        emit_state
        ;;
      *)
        PHASE=checking
        emit_state
        refresh_repo
        PHASE=idle
        emit_state
        ;;
    esac
    last_auto_check="$(date +%s)"
    last_beat="$last_auto_check"
  else
    nowsec="$(date +%s)"
    if [ "$((nowsec - last_auto_check))" -ge "$AUTO_CHECK_SEC" ]; then
      refresh_repo
      last_auto_check="$nowsec"
      last_beat=0 # co tin moi thi dang ngay
    fi
    # Nhip tim: API dua vao day de biet updater con song hay khong.
    if [ "$((nowsec - last_beat))" -ge "$HEARTBEAT_SEC" ]; then
      emit_state
      last_beat="$nowsec"
    fi
  fi
  sleep "$POLL_SEC"
done
