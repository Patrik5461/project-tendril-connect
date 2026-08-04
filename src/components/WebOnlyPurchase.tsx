import type { ReactNode } from "react";
import { useIsNative } from "@/lib/native";
import { useTranslation } from "react-i18next";

/**
 * Predplatné sa nakupuje výhradne na webe.
 * V natívnej appke skryjeme nákupné CTA a ukážeme len informačný text bez odkazu.
 */
export function WebOnlyPurchase({
  children,
  note,
  className,
}: {
  children: ReactNode;
  note?: string;
  className?: string;
}) {
  const { t } = useTranslation("public");
  const native = useIsNative();
  if (native) {
    return <p className={`text-sm text-muted-foreground ${className ?? ""}`}>{note ?? t("webOnlyPurchase.defaultNote")}</p>;
  }
  return <>{children}</>;
}

export default WebOnlyPurchase;
