# R8 shrinks the libraries; our own classes stay whole. MainActivity loads
# PlayBilling by name (Class.forName), Capacitor finds plugins and their
# @PluginMethod methods by reflection, and the widget and the ringer are named
# in the manifest — renaming any of them breaks the app only on a phone.
-keep class app.ontoplano.isolated.** { *; }

# Stack traces in Play's crash reports keep their line numbers.
-keepattributes SourceFile,LineNumberTable
