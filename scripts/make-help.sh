#!/bin/sh
# Every make target, read out of the makefiles rather than listed by hand.
#
# `make help` used to be a table somebody typed. It described about forty of
# the ninety-odd targets, which meant tab-completion offered a list twice the
# length of the documentation and no way to tell which half you were looking
# at. A table written by hand goes stale in one direction only.
#
# Three sources of a description, in order:
#
#   ## text          directly above the target — the explicit answer
#   # text           the first line of the comment block above it, which most
#                    targets already have, so most need no new line
#   (nothing)        the target is listed as undocumented, and
#                    `check-make-help.mjs` fails `make lint` over it
#
# Groups come from `### name` markers, in the order they appear. A target
# before any marker, or in a file with none, lands under the file's own name —
# which is how local.mk's targets get a heading without local.mk knowing about
# this script.
#
# Usage: make-help.sh <makefile> ...
set -eu

bold=$(printf '\033[1m'); dim=$(printf '\033[2m'); off=$(printf '\033[0m')
[ -t 1 ] || { bold=; dim=; off=; }

printf '%s — bare `make` only prints this.\n\n' "${bold}ontoplano${off}"

# One pass per file so a file with no `###` can be grouped under its own name.
for file in "$@"; do
	[ -f "$file" ] || continue
	case $file in *.env) continue ;; esac

	awk -v bold="$bold" -v off="$off" -v dim="$dim" -v file="$file" '
	function fit(text, n,   cut) {
		if (length(text) <= n) return text
		cut = substr(text, 1, n - 1)
		if (substr(text, n, 1) != " " && cut ~ / /) sub(/ [^ ]*$/, "", cut)
		return cut "…"
	}
	function flush(   i) {
		if (count == 0) return
		printf "%s%s%s\n", bold, group == "" ? fallback : group, off
		for (i = 1; i <= count; i++) printf "%s\n", rows[i]
		printf "\n"
		count = 0
	}

	BEGIN {
		# A file with no group markers still gets a heading: its own name,
		# without the extension, which reads well for local.mk and release.mk.
		fallback = file
		sub(/^.*\//, "", fallback)
		sub(/\.mk$/, "", fallback)
		if (fallback == "Makefile") fallback = "targets"
	}

	# ── Group headings ────────────────────────────────────────────────────
	/^###[ \t]/ {
		flush()
		group = $0
		sub(/^###[ \t]+/, "", group)
		next
	}

	# ── Descriptions ──────────────────────────────────────────────────────
	# `##` is the explicit one and wins. A plain `#` block is remembered so a
	# target with no `##` can borrow its first line, which is what most of
	# them already have above them.
	/^##[ \t]/ {
		# The first line only. A target can carry a paragraph of `##` above it
		# for whoever opens the makefile; help wants the sentence, not the
		# paragraph, and taking the last line would print its final clause.
		if (explicit == "") {
			explicit = $0
			sub(/^##[ \t]+/, "", explicit)
		}
		next
	}
	/^##$/ { next }
	/^#/ {
		line = $0
		sub(/^# ?/, "", line)
		# A rule of dashes is decoration, and an empty comment line ends
		# nothing — the first real sentence of the block is what is wanted.
		if (line ~ /^[-─=]+$|^──/) next
		if (line == "") next
		if (borrowed == "") borrowed = line
		next
	}

	# A blank line ends whatever was being collected: a comment three lines
	# above a target with a gap between them is not about that target.
	/^[ \t]*$/ { explicit = ""; borrowed = ""; next }

	# ── Targets ───────────────────────────────────────────────────────────
	# Real ones only: no pattern rules, no variable assignments, no paths.
	/^[a-zA-Z][a-zA-Z0-9_-]*[ \t]*:([^=]|$)/ {
		name = $0
		sub(/[ \t]*:.*$/, "", name)

		said = explicit != "" ? explicit : borrowed
		if (said == "") said = "(undocumented)"

		# `_private` targets are steps another target runs, not commands, and
		# `help` describing itself is noise.
		# A target can be declared more than once — a rule here, its
		# prerequisites added there — and it is still one command.
		if (name != "help" && !(name in seen)) {
			seen[name] = 1
			count++
			rows[count] = sprintf("  %-28s %s", fit(name, 28), fit(said, 47))
		}
		explicit = ""; borrowed = ""
		next
	}

	# Anything else is a recipe line or a variable, and does not clear the
	# comment block: a target can carry a `?=` between its prose and itself.
	END { flush() }
	' "$file"
done
