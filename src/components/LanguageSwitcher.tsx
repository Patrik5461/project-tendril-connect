import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS, LANG_LABELS, DEFAULT_LANG, type Lang } from "@/i18n/config";
import { changeLang } from "@/i18n/I18nProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? ((i18n.language as Lang) || DEFAULT_LANG) : DEFAULT_LANG;
  const label = LANG_LABELS[current] ?? LANG_LABELS.sk;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("language.switch")}
          className="gap-1.5"
        >
          <span className="text-base leading-none" aria-hidden="true">
            {label.flag}
          </span>
          {!compact && <span className="text-xs font-semibold">{label.label}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {SUPPORTED_LANGS.map((lang) => {
          const meta = LANG_LABELS[lang];
          const active = lang === current;
          return (
            <DropdownMenuItem
              key={lang}
              onClick={() => changeLang(lang)}
              className={active ? "font-semibold" : ""}
            >
              <span className="mr-2 text-base leading-none">{meta.flag}</span>
              <span>{meta.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{meta.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
