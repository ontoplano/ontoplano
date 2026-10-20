# Capacitor reads plugin annotations and calls plugin methods by reflection.
# Our own classes stay whole: loaded by name (PlayBilling) or named in the manifest (widget, ringer).
-keep class app.ontoplano.isolated.** { *; }
-keepattributes *Annotation*, InnerClasses, Signature, EnclosingMethod, SourceFile, LineNumberTable

-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class * extends com.getcapacitor.Plugin
