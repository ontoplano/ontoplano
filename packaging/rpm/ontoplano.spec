# The spec is filled in by scripts/package.mjs: @VERSION@ and @ARCH@ come from
# package.json and the machine. Nothing is compiled here — the files are staged
# exactly as they will be installed, and rpmbuild is only asked to wrap them.

Name:           ontoplano
Version:        @VERSION@
Release:        1
Summary:        Life management on your own machine — planner, diary, cookbook, habits and more
License:        AGPL-3.0-or-later
URL:            https://ontoplano.com
BuildArch:      @ARCH@

Requires:       systemd
Requires(post): systemd
Requires(preun): systemd
Requires(postun): systemd
# No nodejs: the runtime is inside the package, compiled against the same ABI
# as the native module beside it. See scripts/package.mjs for why.
AutoReqProv:    no

%description
A planner, a diary, a cookbook, a shopping list, goals, habits and the people
in your life — those are some of the rooms, not all of them. Life management in
one place, kept in one SQLite file that belongs to you: one process, no database
server, nothing that phones anywhere.

The service listens on 127.0.0.1:1493 and is not started until you have set
ORIGIN in /etc/ontoplano/ontoplano.env.

%files
%dir /usr/lib/ontoplano
/usr/lib/ontoplano/*
/usr/bin/ontoplano
/usr/lib/systemd/system/ontoplano.service
/usr/lib/systemd/system/ontoplano-reminders.service
/usr/lib/systemd/system/ontoplano-reminders.timer
/usr/lib/systemd/system/ontoplano-weekly-review.service
/usr/lib/systemd/system/ontoplano-weekly-review.timer
/usr/lib/sysusers.d/ontoplano.conf
/usr/lib/tmpfiles.d/ontoplano.conf
%dir %attr(0750, root, root) /etc/ontoplano
# noreplace: an upgrade leaves an edited file alone and writes the new one
# beside it as .rpmnew, rather than replacing what the operator wrote.
%config(noreplace) %attr(0640, root, root) /etc/ontoplano/ontoplano.env
%doc /usr/share/doc/ontoplano/CHANGELOG.md
%license /usr/share/doc/ontoplano/LICENSE

%post
# The service account and its directory, through systemd's own tools.
systemd-sysusers /usr/lib/sysusers.d/ontoplano.conf >/dev/null 2>&1 || :
systemd-tmpfiles --create /usr/lib/tmpfiles.d/ontoplano.conf >/dev/null 2>&1 || :

# The session secret: made once, never regenerated. Changing it signs everybody
# out, so an upgrade that rewrote this would look like the app losing every
# login for no reason.
if [ ! -s /etc/ontoplano/secret.env ]; then
	umask 077
	printf 'BETTER_AUTH_SECRET=%s\n' "$(head -c 32 /dev/urandom | base64 | tr -d '\n')" \
		> /etc/ontoplano/secret.env
fi
chown root:ontoplano /etc/ontoplano/secret.env /etc/ontoplano/ontoplano.env 2>/dev/null || :
chmod 640 /etc/ontoplano/secret.env /etc/ontoplano/ontoplano.env

# The database, brought to this version before the service that opens it starts.
if ! /usr/lib/ontoplano/migrate >/dev/null; then
	echo "ontoplano: the database could not be migrated — the service was not started." >&2
	echo "  sudo ontoplano migrate     to see why" >&2
fi
chown -R ontoplano:ontoplano /var/lib/ontoplano 2>/dev/null || :

# The health token, for the companion timers that ask the app's job endpoints.
if ! grep -q '^ONTOPLANO_HEALTH_TOKEN=' /etc/ontoplano/secret.env 2>/dev/null; then
	umask 077
	printf 'ONTOPLANO_HEALTH_TOKEN=%s\n' "$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')" >> /etc/ontoplano/secret.env
fi

%systemd_post ontoplano.service ontoplano-reminders.timer ontoplano-weekly-review.timer

%preun
%systemd_preun ontoplano.service ontoplano-reminders.timer ontoplano-weekly-review.timer

%postun
%systemd_postun_with_restart ontoplano.service ontoplano-reminders.timer ontoplano-weekly-review.timer
# The database and the secret stay: they are the person's, not the package's.
# Removing them is `rm -rf /var/lib/ontoplano`, typed on purpose.

%changelog
* Wed Sep 02 2026 Estevão <contact@ontoplano.com> - @VERSION@-1
- See /usr/share/doc/ontoplano/CHANGELOG.md
