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
      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.08L2 22l5.04-1.36C8.49 21.46 10.2 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm4.64 14.3c-.18.5-.93.97-1.29 1.03-.34.06-.66.18-2.23-.46-1.88-.75-3.07-2.72-3.16-2.85-.09-.12-.75-.99-.75-1.89s.48-1.34.65-1.52c.18-.18.39-.22.52-.22l.37.01c.12 0 .28-.04.44.34.16.37.56 1.28.61 1.38.05.09.08.2 0 .31-.09.12-.12.18-.25.29-.12.12-.26.25-.37.34-.12.09-.25.19-.11.37.14.18.51.84 1.09 1.36.75.67 1.38.88 1.58.98.2.09.32.08.44-.05.12-.12.51-.59.65-.79.14-.2.28-.17.46-.1.18.09 1.14.54 1.34.64.2.09.33.14.38.22.05.08.05.46-.13.96z" />
    </svg>
  );
}

export function WhatsAppButton() {
  const { t } = useTranslation("public");
  const url = getWhatsAppUrl(t("whatsapp.message"));

  return (
    <div className="fixed bottom-5 right-5 z-40 group flex flex-col items-end">
      <span className="mb-2 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
        {t("whatsapp.label")}
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("whatsapp.label")}
        className="h-14 w-14 rounded-full bg-[#25D366] text-white shadow-lg flex items-center justify-center transition-transform hover:scale-110 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2"
      >
        <WhatsAppIcon className="h-7 w-7" />
      </a>
    </div>
  );
}
