import { isNative } from "./native";

export const WHATSAPP_PHONE = "+421 902 067 956";
export const WHATSAPP_PHONE_CLEAN = "421902067956";

export function getWhatsAppUrl(message: string): string {
  const encoded = encodeURIComponent(message);
  if (isNative()) {
    return `whatsapp://send?phone=${WHATSAPP_PHONE_CLEAN}&text=${encoded}`;
  }
  return `https://wa.me/${WHATSAPP_PHONE_CLEAN}?text=${encoded}`;
}
