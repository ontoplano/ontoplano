#!/bin/sh
# Every variable a make command line can carry, read out of the makefiles.
#
# The prompt for this was not being able to remember whether the switch that
# skips the build was BUILD=0 or SKIP_BUILD=1 — a list nobody can recall is a
# list that has to be printed. It is generated rather than written, so it
# cannot describe a switch that no longer exists or miss one that was added
# yesterday, which is the failure mode of a hand-kept table.
#
# Two sources, because there are two kinds of variable:
#
#   defaults.env    values with a default, changed for good in local.mk
#   `#:` markers    per-invocation switches, which have no default because
#                   they only mean anything on the command line
#
# A marker sits next to the code that reads the variable:
#
#   #: DEPLOY_YES=1  ship without the confirmation
#
# Usage: make-vars.sh <defaults.env|makefile> ...
set -eu

bold=$(printf '\033[1m'); dim=$(printf '\033[2m'); off=$(printf '\033[0m')
[ -t 1 ] || { bold=; dim=; off=; }

printf '%s\n\n' "${bold}variables you can set on a make command line${off}"

# ── Per-invocation switches ────────────────────────────────────────────────
# `#: NAME=example  what it does`, anywhere in a makefile.
# Cutting mid-word reads as a typo, so both columns end on a space.
FIT='
  function fit(text, n,   cut) {
    if (length(text) <= n) return text
    cut = substr(text, 1, n - 1)
    if (substr(text, n, 1) != " " && cut ~ / /) sub(/ [^ ]*$/, "", cut)
    return cut "…"
  }'

switches=$(awk "$FIT"'
  /^[ \t]*#:[ \t]/ {
    sub(/^[ \t]*#:[ \t]+/, "")
    split($0, part, "  +")               # two spaces or more separate the two
    if (part[2] == "") next
    printf "  %-34s %s\n", fit(part[1], 34), part[2]
  }
' "$@" | sort -u)

if [ -n "$switches" ]; then
  printf '%s\n' "${bold}for one command${off}"
  printf '%s\n\n' "$switches"
fi

# ── Defaults ───────────────────────────────────────────────────────────────
# KEY=value in a defaults.env, described by the comment block above it. Only
# the block's first line is shown; the file itself has the reasoning.
for file in "$@"; do
  case $file in *defaults.env) ;; *) continue ;; esac

  body=$(awk "$FIT"'
    function clean(t) { sub(/^# ?/, "", t); return t }
    # A block of comment lines describes the keys under it. Only the first
    # line is shown — the file itself carries the reasoning — and a decorative
    # rule is not a description.
    /^#/ {
      line = clean($0)
      if (line ~ /^[-─=]+$|^──/) next
      if (said == "" || blank) said = line
      blank = 0; next
    }
    /^[ \t]*$/ { blank = 1; said = ""; next }
    /^[A-Z_][A-Z0-9_]*=/ {
      # Keys that share a block are printed under the one that carries the
      # sentence, so a group reads as a group instead of as blanks.
      printf "  %-34s %s\n", fit($0, 34), fit(said, 43)
      said = ""
    }
  ' "$file")

  [ -n "$body" ] || continue
  printf '%s\n' "${bold}defaults${off} ${dim}($file — override in local.mk)${off}"
  printf '%s\n\n' "$body"
done
