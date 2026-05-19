export function microphoneUnsupportedMessage(): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "تسجيل الصوت يحتاج فتح النظام عبر HTTPS حتى يظهر طلب السماح بالمايكروفون.";
  }
  return "متصفحك لا يدعم تسجيل الصوت";
}

export async function microphoneErrorMessage(error: unknown): Promise<string> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "تسجيل الصوت يحتاج فتح النظام عبر HTTPS حتى يظهر طلب السماح بالمايكروفون.";
  }

  const name =
    error instanceof DOMException
      ? error.name
      : error && typeof error === "object" && "name" in error
        ? String((error as { name?: unknown }).name)
        : "";

  let permissionState: PermissionState | null = null;
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      permissionState = status.state;
    }
  } catch {
    permissionState = null;
  }

  if (permissionState === "denied" || name === "NotAllowedError" || name === "SecurityError") {
    return "إذن المايكروفون مرفوض من المتصفح أو إعدادات الموقع. افتح إعدادات الموقع وفعّل المايكروفون ثم جرّب مرة ثانية.";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "لم يتم العثور على مايكروفون في هذا الجهاز.";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "تعذّر تشغيل المايكروفون. تأكد أنه غير مستخدم من تطبيق آخر.";
  }

  return "تعذّر تشغيل المايكروفون. راجع إذن الموقع من إعدادات المتصفح ثم جرّب مرة ثانية.";
}
