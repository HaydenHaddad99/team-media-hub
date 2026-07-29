import { useEffect } from "react";
import { isNativePlatform, getNativePlatform } from "../lib/platform";
import { registerDevice } from "../lib/api";

/**
 * Requests push permission and registers this device for native push
 * (APNs on iOS, FCM on Android) once the user is signed in. No-ops on web
 * — native push notifications only make sense inside the Capacitor shell.
 */
export function NativePushRegistration() {
  useEffect(() => {
    if (!isNativePlatform()) return;

    let cancelled = false;

    async function register() {
      console.log("[push] init, platform:", getNativePlatform());
      const { PushNotifications } = await import("@capacitor/push-notifications");

      const permStatus = await PushNotifications.checkPermissions();
      console.log("[push] checkPermissions:", permStatus.receive);
      let granted = permStatus.receive === "granted";
      if (!granted && permStatus.receive !== "denied") {
        const req = await PushNotifications.requestPermissions();
        console.log("[push] requestPermissions result:", req.receive);
        granted = req.receive === "granted";
      }
      if (!granted || cancelled) {
        console.log("[push] not granted or cancelled, stopping. granted:", granted, "cancelled:", cancelled);
        return;
      }

      // Listeners must be set up BEFORE calling register() — the native side
      // can fire the registration event as soon as register() is called.
      await PushNotifications.addListener("registration", (token) => {
        console.log("[push] registration event, token:", token.value.slice(0, 12) + "...");
        const platform = getNativePlatform();
        if (platform !== "ios" && platform !== "android") return;
        registerDevice(token.value, platform)
          .then(() => console.log("[push] registerDevice succeeded"))
          .catch((err) => {
            console.error("[push] Failed to register device:", err);
          });
      });

      await PushNotifications.addListener("registrationError", (err) => {
        console.error("[push] registrationError event:", JSON.stringify(err));
      });

      console.log("[push] calling PushNotifications.register()");
      await PushNotifications.register();
      console.log("[push] register() call completed");
    }

    register();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
