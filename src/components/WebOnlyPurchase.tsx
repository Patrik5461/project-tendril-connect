import type { ReactNode } from "react";
import { useIsNative } from "@/lib/native";

/**
 * Predplatné sa nakupuje výhradne na webe.
 * V natívnej appke skryjeme nákupné CTA a ukážeme len informačný text bez odkazu.
 */
export function WebOnlyPurchase({
  children,
  note = "Predplatné spravuješ na tendrik.sk",
  className,
}: {
  children: ReactNode;
  note?: string;
  className?: string;
}) {
  const native = useIsNative();
  if (native) {
    return <p className={`text-sm text-muted-foreground ${className ?? ""}`}>{note}</p>;
  }
  return <>{children}</>;
}

export default WebOnlyPurchase;
