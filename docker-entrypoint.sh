#!/bin/sh
# ═══════════════════════════════════════════════════════════════════
# Entrypoint: sua quyen cua volume roi HA QUYEN xuong user thuong.
#
# Vi sao can: docker-compose bind-mount `./data:/data` tu host. Bind mount
# GHI DE thu muc trong image, ke ca quyen so huu da dat luc build. Neu nguoi
# dung chay `docker compose up` bang root (rat pho bien tren DietPi/Pi OS),
# Docker tao ./data thuoc root:root -> tien trinh chay bang uid 1000 khong
# ghi duoc -> SQLITE_CANTOPEN.
#
# Script nay chay bang root CHI de chown, roi `setpriv` ha quyen xuong
# PUID:PGID truoc khi exec node. Tien trinh ung dung KHONG chay bang root.
# ═══════════════════════════════════════════════════════════════════
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

# Chi chown khi that su sai — `chown -R` tren /media co hang tram video
# se rat cham neu chay moi lan khoi dong.
fix_perms() {
	dir="$1"
	mkdir -p "$dir"
	cur_u="$(stat -c %u "$dir" 2>/dev/null || echo -1)"
	cur_g="$(stat -c %g "$dir" 2>/dev/null || echo -1)"
	if [ "$cur_u" != "$PUID" ] || [ "$cur_g" != "$PGID" ]; then
		echo "entrypoint: dat quyen $PUID:$PGID cho $dir"
		chown -R "$PUID:$PGID" "$dir"
	fi
}

# Chi lam duoc khi dang la root. Neu nguoi dung tu dat `user:` trong compose
# thi bo qua — ho da chu dong quyet dinh quyen han.
if [ "$(id -u)" = "0" ]; then
	fix_perms "${DATA_DIR:-/data}"
	fix_perms "${MEDIA_DIR:-/media}"

	# --init-groups de lay ca supplementary group cua uid do.
	if command -v setpriv >/dev/null 2>&1; then
		exec setpriv --reuid="$PUID" --regid="$PGID" --init-groups -- "$@"
	fi

	# Khong nen xay ra (Dockerfile da cai util-linux va kiem tra luc build),
	# nhung tha chay duoc bang root con hon khong khoi dong duoc — day la app
	# trong nha. Bao that ro de nguoi dung biet.
	echo "entrypoint: CANH BAO — khong tim thay setpriv, dang chay bang ROOT." >&2
	exec "$@"
fi

echo "entrypoint: dang chay bang uid $(id -u), bo qua buoc chinh quyen"
exec "$@"
