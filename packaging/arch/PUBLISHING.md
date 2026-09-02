.SRCINFO is generated, not written: in the directory holding the PKGBUILD,

    makepkg --printsrcinfo > .SRCINFO

and commit both to the AUR repository. It is regenerated on every version
bump, because the AUR reads it rather than the PKGBUILD and a stale one
advertises a version nobody can install.

Publishing a new version:

    git clone ssh://aur@aur.archlinux.org/ontoplano.git
    cp PKGBUILD ontoplano.install ontoplano/
    cd ontoplano && makepkg --printsrcinfo > .SRCINFO
    git commit -am "0.40.0" && git push
