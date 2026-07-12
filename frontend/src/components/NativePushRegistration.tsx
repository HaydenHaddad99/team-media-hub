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
      const { PushNotifications } = await import("@capacitor/push-notifications");

      const permStatus = await PushNotifications.checkPermissions();
      let granted = permStatus.receive === "granted";
      if (!granted && permStatus.receive !== "denied") {
        const req = await PushNotifications.requestPermissions();
        granted = req.receive === "granted";
      }
      if (!granted || cancelled) return;

      await PushNotifications.register();

      PushNotifications.addListener("registration", (token) => {
        const platform = getNativePlatform();
        if (platform !== "ios" && platform !== "android") return;
        registerDevice(token.value, platform).catch((err) => {
          console.error("[push] Failed to register device:", err);
        });
      });

      PushNotifications.addListener("registrationError", (err) => {
        console.error("[push] Registration error:", err);
      });
    }

    register();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
