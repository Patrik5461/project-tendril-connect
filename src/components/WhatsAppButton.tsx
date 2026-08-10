import { useTranslation } from "react-i18next";
import { getWhatsAppUrl } from "@/lib/whatsapp";

export function WhatsAppIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.702h-.004c-3.969 0-7.201 3.232-7.201 7.201 0 1.42.415 2.747 1.127 3.87l-1.41 4.102 4.198-1.109A7.18 7.18 0 0 0 12 21.38c3.97 0 7.201-3.232 7.201-7.201 0-3.968-3.231-7.2-7.201-7.2M12 22.551a8.31 8.31 0 0 1-4.209-1.145l-3.023.795.805-2.335A8.305 8.305 0 0 1 3.7 12.35c0-4.578 3.721-8.301 8.301-8.301 4.578 0 8.3 3.723 8.3 8.301 0 4.579-3.722 8.3-8.3 8.3" />
    </svg>
  );
}

export function WhatsAppButton() {
  const { t } = useTranslation("public");
  const url = getWhatsAppUrl(t("whatsapp.message"));

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("whatsapp.label")}
      className="fixed bottom-5 left-5 z-40 h-14 w-14 rounded-md border-2 border-white shadow-[4px_4px_0_0_hsl(var(--foreground))] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_hsl(var(--foreground))] flex items-center justify-center"
      style={{ backgroundColor: "#25D366", color: "#ffffff" }}
    >
      <WhatsAppIcon className="h-7 w-7" />
    </a>
  );
}
